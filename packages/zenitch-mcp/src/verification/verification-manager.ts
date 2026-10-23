import path from 'node:path';
import { StorageEngine } from '../memory/storage-engine.js';
import {
  VerifyInput,
  InspectVerificationInput,
  VerificationRecord,
  VerificationFileSchema,
  RequirementsFileSchema,
  RequirementRecord
} from '../schemas/memory.schema.js';
import { StaticVerifier } from './static-verifier.js';
import { RuntimeVerifier } from './runtime-verifier.js';
import { VerificationCache } from './verification-cache.js';

export interface VerifyOutput {
  status: 'PASSED' | 'FAILED' | 'BLOCKED';
  verificationId: string;
  criterionId?: string;
  requirementId?: string;
  summary: string;
  evidenceCount: number;
  durationMs: number;
  reusedCachedEvidence: boolean;
  mode: string;
}

export class VerificationManager {
  /**
   * Main entry point for zenitch_verify.
   * Follows progressive verification: Static -> Runtime / Responsive.
   * Incorporates caching, deterministic invalidation, and bounded evidence.
   */
  public static async verify(input: VerifyInput): Promise<VerifyOutput> {
    const projectRoot = path.resolve(input.projectRoot || process.cwd());
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
    const mode = input.mode || 'static';
    const route = input.route || '/';
    const viewport = input.viewport || (mode === 'responsive' ? 'mobile' : 'desktop');

    // 1. Check cache first (unless forceReverify requested)
    if (!input.forceReverify) {
      const cached = await VerificationCache.findValidCachedVerification(projectRoot, {
        requirementId: input.requirementId,
        acceptanceCriterionId: input.acceptanceCriterionId,
        mode,
        route,
        viewport,
        forceReverify: input.forceReverify
      });

      if (cached) {
        return {
          status: 'PASSED',
          verificationId: cached.id,
          criterionId: cached.acceptanceCriterionId,
          requirementId: cached.requirementId,
          summary: cached.evidenceSummary + ' (reused cached evidence)',
          evidenceCount: cached.evidence?.length || 0,
          durationMs: cached.durationMs || 0,
          reusedCachedEvidence: true,
          mode
        };
      }
    }

    const startTime = performance.now();
    let passed = false;
    let blocked = false;
    let summary = '';
    let evidence: any[] = [];

    // 2. Progressive verification execution
    if (mode === 'static') {
      const staticResult = await StaticVerifier.execute(projectRoot, {
        requirementId: input.requirementId,
        criterionId: input.acceptanceCriterionId,
        staticChecks: input.staticChecks,
        route: input.route
      });
      passed = staticResult.passed;
      summary = staticResult.summary;
      evidence = staticResult.evidence;
    } else {
      // Runtime or responsive mode
      const runtimeResult = await RuntimeVerifier.execute({
        projectRoot,
        route,
        viewport: viewport as any,
        actions: input.actions || [],
        devServerUrl: input.devServerUrl
      });
      passed = runtimeResult.verdict === 'PASSED';
      blocked = runtimeResult.verdict === 'BLOCKED';
      summary = runtimeResult.summary;
      evidence = runtimeResult.evidence;
    }

    const durationMs = Math.round(performance.now() - startTime);
    const status: 'PASSED' | 'FAILED' | 'BLOCKED' = blocked
      ? 'BLOCKED'
      : passed
      ? 'PASSED'
      : 'FAILED';

    const verifId = `verif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const record: VerificationRecord = {
      id: verifId,
      requirementId: input.requirementId,
      acceptanceCriterionId: input.acceptanceCriterionId,
      verificationType: mode === 'static' ? 'STATIC' : mode === 'responsive' ? 'RESPONSIVE' : 'RUNTIME',
      verificationMethod: mode === 'static' ? 'STATIC_ANALYSIS' : mode === 'responsive' ? 'RESPONSIVE_CHECK' : 'RUNTIME_VERIFICATION',
      verdict: status,
      evidenceSummary: summary,
      evidence: evidence || [],
      durationMs,
      reusedCachedEvidence: false,
      environment: {
        mode,
        viewport,
        route,
        devServerUrl: input.devServerUrl
      },
      provenance: {
        source: 'SYSTEM',
        verificationLevel: 'TEST_VERIFIED',
        confidence: 1.0,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    // 3. Persist verification record
    await StorageEngine.withLock(zenitchDir, async () => {
      let verifDoc = StorageEngine.readDocument<any>(
        zenitchDir,
        'verification.json',
        VerificationFileSchema,
        () => ({
          schemaVersion: '1.2.0',
          projectId: 'zenitch-project',
          _version: 0,
          updatedAt: new Date().toISOString(),
          items: {}
        })
      );
      if (!verifDoc.items) {
        verifDoc.items = {};
      }
      verifDoc.items[verifId] = record;
      verifDoc.updatedAt = new Date().toISOString();
      verifDoc._version = (verifDoc._version || 0) + 1;
      StorageEngine.writeDocument(zenitchDir, 'verification.json', verifDoc);
    });

    // 4. Update Acceptance Criteria in requirements.json (if criterionId provided)
    // NOTE: Verification evidence can move an acceptance criterion to PASSED/FAILED.
    // However, requirement lifecycle and criterion verification remain strictly separate:
    // A runtime verification must NEVER automatically mark a requirement as ACCEPTED!
    if (input.requirementId || input.acceptanceCriterionId) {
      await StorageEngine.withLock(zenitchDir, async () => {
        const reqDoc = StorageEngine.readDocument<any>(
          zenitchDir,
          'requirements.json',
          RequirementsFileSchema,
          () => null
        );
        if (reqDoc && reqDoc.items) {
          for (const req of Object.values<RequirementRecord>(reqDoc.items)) {
            let reqModified = false;

            if (input.acceptanceCriterionId && Array.isArray(req.acceptanceCriteria)) {
              for (const criterion of req.acceptanceCriteria) {
                if (typeof criterion === 'object' && criterion.id === input.acceptanceCriterionId) {
                  criterion.status = status === 'PASSED' ? 'PASSED' : status === 'BLOCKED' ? 'BLOCKED' : 'FAILED';
                  if (!Array.isArray(criterion.verificationIds)) {
                    criterion.verificationIds = [];
                  }
                  criterion.verificationIds.push(verifId);
                  criterion.updatedAt = new Date().toISOString();
                  reqModified = true;
                }
              }
            }

            if (input.requirementId && req.id === input.requirementId) {
              if (!Array.isArray(req.linkedVerificationIds)) {
                req.linkedVerificationIds = [];
              }
              req.linkedVerificationIds.push(verifId);
              reqModified = true;
            }

            if (reqModified) {
              req.updatedAt = new Date().toISOString();
              reqDoc.updatedAt = new Date().toISOString();
              reqDoc._version = (reqDoc._version || 0) + 1;
              StorageEngine.writeDocument(zenitchDir, 'requirements.json', reqDoc);
              break;
            }
          }
        }
      });
    }

    return {
      status,
      verificationId: verifId,
      criterionId: input.acceptanceCriterionId,
      requirementId: input.requirementId,
      summary,
      evidenceCount: evidence ? evidence.length : 0,
      durationMs,
      reusedCachedEvidence: false,
      mode
    };
  }

  /**
   * Main entry point for zenitch_inspect_verification.
   * Returns concise, standard, or detailed verification history.
   */
  public static async inspectVerification(input: InspectVerificationInput): Promise<any> {
    const projectRoot = path.resolve(input.projectRoot || process.cwd());
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
    const mode = input.mode || 'concise';

    const verifDoc = StorageEngine.readDocument<any>(
      zenitchDir,
      'verification.json',
      VerificationFileSchema,
      () => null
    );
    if (!verifDoc || !verifDoc.items) {
      return {
        count: 0,
        mode,
        verifications: []
      };
    }

    let records = Object.values<VerificationRecord>(verifDoc.items);

    if (input.requirementId) {
      records = records.filter(r => r.requirementId === input.requirementId);
    }
    if (input.acceptanceCriterionId) {
      records = records.filter(r => r.acceptanceCriterionId === input.acceptanceCriterionId);
    }
    if (!input.includeOutdated) {
      records = records.filter(r => r.verdict !== 'OUTDATED');
    }

    // Sort newest first
    records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    let formatted: any[];
    if (mode === 'concise') {
      formatted = records.map(r => ({
        id: r.id,
        verdict: r.verdict,
        type: r.verificationType,
        summary: r.evidenceSummary,
        evidenceCount: r.evidence?.length || 0,
        reusedCachedEvidence: r.reusedCachedEvidence || false,
        timestamp: r.timestamp
      }));
    } else if (mode === 'standard') {
      formatted = records.map(r => ({
        id: r.id,
        verdict: r.verdict,
        type: r.verificationType,
        method: r.verificationMethod,
        summary: r.evidenceSummary,
        durationMs: r.durationMs,
        environment: r.environment,
        evidenceSummaries: (r.evidence || []).map(e => `[${e.type}] ${e.summary}`),
        reusedCachedEvidence: r.reusedCachedEvidence || false,
        timestamp: r.timestamp
      }));
    } else {
      // Detailed
      formatted = records;
    }

    return {
      count: records.length,
      mode,
      verifications: formatted
    };
  }
}
