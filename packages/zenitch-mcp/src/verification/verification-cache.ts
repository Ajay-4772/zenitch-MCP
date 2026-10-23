import fs from 'node:fs';
import path from 'node:path';
import { StorageEngine } from '../memory/storage-engine.js';
import {
  VerificationRecord,
  VerificationFileSchema,
  RequirementsFileSchema,
  ChangesFileSchema
} from '../schemas/memory.schema.js';

export interface CacheLookupParams {
  requirementId?: string;
  acceptanceCriterionId?: string;
  mode: 'static' | 'runtime' | 'responsive';
  route?: string;
  viewport?: string;
  forceReverify?: boolean;
}

export class VerificationCache {
  /**
   * Look up a valid, fresh verification record from verification.json.
   * Returns null if not found, if forceReverify is true, or if invalidated by code/requirement changes.
   */
  public static async findValidCachedVerification(
    projectRoot: string,
    params: CacheLookupParams
  ): Promise<VerificationRecord | null> {
    if (params.forceReverify) {
      return null;
    }

    try {
      const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
      const verifDoc = StorageEngine.readDocument<any>(
        zenitchDir,
        'verification.json',
        VerificationFileSchema,
        () => null
      );
      if (!verifDoc || !verifDoc.items) {
        return null;
      }

      const records = Object.values<VerificationRecord>(verifDoc.items);
      const expectedType = params.mode === 'static' ? 'STATIC' : params.mode === 'responsive' ? 'RESPONSIVE' : 'RUNTIME';

      // Find candidates matching IDs and parameters
      const candidates = records.filter(r => {
        if (r.verdict !== 'PASSED') return false;
        if (r.verificationType !== expectedType) return false;

        if (params.acceptanceCriterionId && r.acceptanceCriterionId !== params.acceptanceCriterionId) {
          return false;
        }
        if (params.requirementId && r.requirementId !== params.requirementId) {
          return false;
        }
        if (params.route && r.environment?.route && r.environment.route !== params.route) {
          return false;
        }
        if (params.viewport && r.environment?.viewport && r.environment.viewport !== params.viewport) {
          return false;
        }

        return true;
      });

      if (candidates.length === 0) {
        return null;
      }

      // Sort newest first
      candidates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      for (const candidate of candidates) {
        const isFresh = await this.isRecordFresh(projectRoot, candidate);
        if (isFresh) {
          return {
            ...candidate,
            reusedCachedEvidence: true
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Determine whether a verification record is still fresh or has been invalidated
   * by subsequent requirement changes, criterion changes, change logs, or file modifications.
   */
  public static async isRecordFresh(
    projectRoot: string,
    record: VerificationRecord
  ): Promise<boolean> {
    const verifTime = new Date(record.timestamp).getTime();
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);

    // 1. Check requirements.json
    try {
      const reqDoc = StorageEngine.readDocument<any>(
        zenitchDir,
        'requirements.json',
        RequirementsFileSchema,
        () => null
      );
      if (reqDoc && reqDoc.items) {
        if (record.requirementId && reqDoc.items[record.requirementId]) {
          const req = reqDoc.items[record.requirementId];
          if (req.updatedAt && new Date(req.updatedAt).getTime() > verifTime) {
            return false;
          }

          if (record.acceptanceCriterionId && Array.isArray(req.acceptanceCriteria)) {
            const criterion = req.acceptanceCriteria.find((c: any) => c.id === record.acceptanceCriterionId);
            if (criterion && criterion.updatedAt && new Date(criterion.updatedAt).getTime() > verifTime) {
              return false;
            }
          }

          // Check related files mtime
          if (Array.isArray(req.relatedFiles)) {
            for (const relFile of req.relatedFiles) {
              const fullPath = path.isAbsolute(relFile) ? relFile : path.join(projectRoot, relFile);
              if (fs.existsSync(fullPath)) {
                const stat = fs.statSync(fullPath);
                if (Math.floor(stat.mtimeMs) > verifTime) {
                  return false;
                }
              }
            }
          }
        }
      }
    } catch {
      // Continue checks
    }

    // 2. Check changes.json
    try {
      const changeDoc = StorageEngine.readDocument<any>(
        zenitchDir,
        'changes.json',
        ChangesFileSchema,
        () => null
      );
      if (changeDoc && changeDoc.items) {
        for (const change of Object.values<any>(changeDoc.items)) {
          const changeTime = new Date(change.updatedAt || change.timestamp || 0).getTime();
          if (changeTime > verifTime) {
            // If this change links to the requirement
            if (record.requirementId && Array.isArray(change.requirementIds) && change.requirementIds.includes(record.requirementId)) {
              return false;
            }
            if (record.changeId && change.id === record.changeId) {
              return false;
            }
          }
        }
      }
    } catch {
      // Continue checks
    }

    // 3. Check environment recorded files
    if (record.environment?.targetFiles && Array.isArray(record.environment.targetFiles)) {
      for (const f of record.environment.targetFiles) {
        const fullPath = path.isAbsolute(f) ? f : path.join(projectRoot, f);
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          if (Math.floor(stat.mtimeMs) > verifTime) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Deterministically invalidate affected verifications when code or requirements change.
   * Marks them OUTDATED without deleting history.
   */
  public static async invalidateAffected(
    projectRoot: string,
    options: {
      requirementId?: string;
      criterionId?: string;
      changeId?: string;
      affectedFiles?: string[];
    }
  ): Promise<number> {
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);

    return await StorageEngine.withLock(zenitchDir, async () => {
      const verifDoc = StorageEngine.readDocument<any>(
        zenitchDir,
        'verification.json',
        VerificationFileSchema,
        () => null
      );
      if (!verifDoc || !verifDoc.items) return 0;

      let invalidatedCount = 0;
      const normalizedFiles = (options.affectedFiles || []).map(f => f.replace(/\\/g, '/').toLowerCase());

      for (const [id, record] of Object.entries<VerificationRecord>(verifDoc.items)) {
        if (record.verdict === 'OUTDATED') continue;

        let shouldInvalidate = false;

        if (options.criterionId && record.acceptanceCriterionId === options.criterionId) {
          shouldInvalidate = true;
        } else if (options.requirementId && record.requirementId === options.requirementId) {
          shouldInvalidate = true;
        } else if (options.changeId && record.changeId === options.changeId) {
          shouldInvalidate = true;
        } else if (normalizedFiles.length > 0 && record.environment?.targetFiles) {
          const recFiles = (record.environment.targetFiles as string[]).map(f => f.replace(/\\/g, '/').toLowerCase());
          if (recFiles.some(f => normalizedFiles.some(af => f.includes(af) || af.includes(f)))) {
            shouldInvalidate = true;
          }
        }

        if (shouldInvalidate) {
          verifDoc.items[id] = {
            ...record,
            verdict: 'OUTDATED',
            evidenceSummary: record.evidenceSummary + ' [INVALIDATED: Affected by subsequent changes]'
          };
          invalidatedCount++;
        }
      }

      if (invalidatedCount > 0) {
        verifDoc.updatedAt = new Date().toISOString();
        verifDoc._version = (verifDoc._version || 0) + 1;
        StorageEngine.writeDocument(zenitchDir, 'verification.json', verifDoc);
      }

      return invalidatedCount;
    });
  }
}
