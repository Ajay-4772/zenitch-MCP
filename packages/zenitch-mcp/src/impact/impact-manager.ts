import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { StorageEngine } from '../memory/storage-engine.js';
import { resolveProjectIdentity } from '../memory/project-identity.js';
import {
  AnalyzeChangeImpactInput,
  InspectImpactInput,
  ImpactRecord,
  ImpactFileSchema,
  ChangesFileSchema,
  RequirementsFileSchema
} from '../schemas/memory.schema.js';
import { ImpactEvaluator } from './impact-evaluator.js';

export class ImpactManager {
  /**
   * Compute a deterministic cache fingerprint for a change impact analysis.
   */
  public static computeFingerprint(
    projectRoot: string,
    changeId: string,
    depth: number
  ): string {
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
    const hash = crypto.createHash('sha256');

    hash.update(changeId);
    hash.update(String(depth));

    // Incorporate change record updatedAt
    const changesDoc = StorageEngine.readDocument<any>(
      zenitchDir,
      'changes.json',
      ChangesFileSchema,
      () => null
    );

    if (changesDoc?.items?.[changeId]) {
      const chg = changesDoc.items[changeId];
      hash.update(chg.updatedAt || chg.createdAt || '');
      const files: string[] = chg.files || chg.affectedFiles || [];
      for (const f of files) {
        hash.update(f);
        const fullPath = path.resolve(projectRoot, f);
        if (fs.existsSync(fullPath)) {
          try {
            const stat = fs.statSync(fullPath);
            hash.update(String(stat.mtimeMs));
            hash.update(String(stat.size));
          } catch {
            // ignore
          }
        }
      }
    }

    // Incorporate requirements updatedAt
    const reqDoc = StorageEngine.readDocument<any>(
      zenitchDir,
      'requirements.json',
      RequirementsFileSchema,
      () => null
    );
    if (reqDoc) {
      hash.update(reqDoc.updatedAt || '');
      hash.update(String(reqDoc._version || 0));
    }

    return hash.digest('hex');
  }

  /**
   * Main entry point for zenitch_analyze_change_impact tool.
   */
  public static async analyzeChangeImpact(input: { projectRoot?: string; changeId: string; depth?: number; forceRefresh?: boolean }): Promise<any> {
    const projectRoot = path.resolve(input.projectRoot || process.cwd());
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
    const identity = resolveProjectIdentity(projectRoot);
    const depth = input.depth ?? 1;

    // 1. Fast-Path Cache Check
    const fingerprint = this.computeFingerprint(projectRoot, input.changeId, depth);

    if (!input.forceRefresh) {
      try {
        const fileDoc = StorageEngine.readDocument<any>(
          zenitchDir,
          'impact.json',
          ImpactFileSchema,
          () => null
        );

        if (fileDoc?.items) {
          // Look for an existing impact record for this changeId with matching fingerprint
          const existing = Object.values<ImpactRecord>(fileDoc.items).find(
            rec => rec.changeId === input.changeId && rec.fingerprint === fingerprint && rec.traversalDepth === depth
          );

          if (existing) {
            return {
              ...existing,
              reusedEvidence: true
            };
          }
        }
      } catch {
        // Fall back to fresh evaluation
      }
    }

    // 2. Perform Fresh Evaluation
    const record = await ImpactEvaluator.evaluateChangeImpact({
      projectRoot,
      changeId: input.changeId,
      depth
    });

    record.fingerprint = fingerprint;

    // 3. Persist atomically to .zenitch/impact.json
    await StorageEngine.withLock(zenitchDir, async () => {
      let fileDoc = StorageEngine.readDocument<any>(
        zenitchDir,
        'impact.json',
        ImpactFileSchema,
        () => ({
          schemaVersion: '1.4.0',
          projectId: identity.projectId,
          _version: 0,
          updatedAt: new Date().toISOString(),
          items: {}
        })
      );

      if (!fileDoc.items) fileDoc.items = {};
      fileDoc.items[record.id] = record;
      fileDoc.updatedAt = new Date().toISOString();
      fileDoc._version = (fileDoc._version || 0) + 1;

      StorageEngine.writeDocument(zenitchDir, 'impact.json', fileDoc);
    });

    return record;
  }

  /**
   * Main entry point for zenitch_inspect_impact tool.
   */
  public static async inspectImpact(input: { projectRoot?: string; changeId?: string; requirementId?: string; route?: string; component?: string; riskLevel?: any; mode?: "concise" | "standard" | "detailed" }): Promise<any> {
    const projectRoot = path.resolve(input.projectRoot || process.cwd());
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
    const mode = input.mode || 'standard';

    const fileDoc = StorageEngine.readDocument<any>(
      zenitchDir,
      'impact.json',
      ImpactFileSchema,
      () => null
    );

    if (!fileDoc || !fileDoc.items || Object.keys(fileDoc.items).length === 0) {
      return {
        hasImpacts: false,
        summary: 'No engineering impact assessments found. Run zenitch_analyze_change_impact first.',
        impacts: []
      };
    }

    let impacts: ImpactRecord[] = Object.values<ImpactRecord>(fileDoc.items);

    // Apply deterministic filters
    if (input.changeId) {
      impacts = impacts.filter(imp => imp.changeId === input.changeId);
    }
    if (input.requirementId) {
      impacts = impacts.filter(imp => imp.affectedRequirements.includes(input.requirementId!));
    }
    if (input.route) {
      impacts = impacts.filter(imp => imp.affectedRoutes.includes(input.route!));
    }
    if (input.component) {
      impacts = impacts.filter(imp => imp.affectedComponents.includes(input.component!));
    }
    if (input.riskLevel) {
      impacts = impacts.filter(imp => imp.riskLevel === input.riskLevel);
    }

    if (mode === 'concise') {
      return {
        totalEvaluations: impacts.length,
        highestRiskLevel: impacts.some(i => i.riskLevel === 'CRITICAL')
          ? 'CRITICAL'
          : impacts.some(i => i.riskLevel === 'HIGH')
          ? 'HIGH'
          : impacts.some(i => i.riskLevel === 'MEDIUM')
          ? 'MEDIUM'
          : 'LOW',
        changesAssessed: Array.from(new Set(impacts.map(i => i.changeId))),
        affectedFilesCount: new Set(impacts.flatMap(i => i.affectedFiles)).size,
        affectedRoutesCount: new Set(impacts.flatMap(i => i.affectedRoutes)).size,
        affectedComponentsCount: new Set(impacts.flatMap(i => i.affectedComponents)).size,
        affectedRequirementsCount: new Set(impacts.flatMap(i => i.affectedRequirements)).size
      };
    }

    if (mode === 'detailed') {
      return {
        totalEvaluations: impacts.length,
        impacts
      };
    }

    // Standard mode (default)
    return {
      totalEvaluations: impacts.length,
      impacts: impacts.map(imp => ({
        id: imp.id,
        changeId: imp.changeId,
        riskLevel: imp.riskLevel,
        analysisStatus: imp.analysisStatus,
        partialReason: imp.partialReason,
        affectedFilesCount: imp.affectedFiles.length,
        affectedFiles: imp.affectedFiles,
        affectedComponents: imp.affectedComponents,
        affectedRoutes: imp.affectedRoutes,
        affectedRequirements: imp.affectedRequirements,
        affectedCriteria: imp.affectedCriteria,
        affectedDependencies: imp.affectedDependencies,
        recommendedVerificationsCount: imp.recommendedVerifications.length,
        recommendedVerifications: imp.recommendedVerifications,
        reusedEvidence: imp.reusedEvidence ?? false,
        timestamp: imp.updatedAt
      }))
    };
  }
}
