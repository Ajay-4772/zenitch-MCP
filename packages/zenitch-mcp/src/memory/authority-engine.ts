import { ProjectConstraintRecord, UserPreferenceRecord, ProvenanceRecord } from '../schemas/memory.schema.js';
import { ConstraintsFile, PreferencesFile } from './types.js';
import { StorageEngine } from './storage-engine.js';
import { ConstraintsFileSchema, PreferencesFileSchema } from '../schemas/memory.schema.js';

export interface ConstraintViolationCheckResult {
  hasConflict: boolean;
  conflictingConstraint?: ProjectConstraintRecord;
  reason?: string;
}

export class AuthorityEngine {
  public static checkProposalAgainstConstraints(
    zenitchDir: string,
    proposedActionOrDecision: string
  ): ConstraintViolationCheckResult {
    const doc = StorageEngine.readDocument<ConstraintsFile>(
      zenitchDir,
      'constraints.json',
      ConstraintsFileSchema,
      () => ({
        schemaVersion: '1.0.0',
        projectId: 'unknown',
        _version: 0,
        updatedAt: new Date().toISOString(),
        items: {}
      })
    );

    const normalizedProposal = proposedActionOrDecision.toLowerCase();

    for (const constraint of Object.values(doc.items)) {
      if (constraint.enforcementLevel === 'STRICT_BLOCK') {
        const ruleLower = constraint.rule.toLowerCase();
        // Check for direct contradiction / prohibited keywords
        const keywords = constraint.rule.toLowerCase().replace(/^(no|do not use|never|avoid)\s+/i, '').split(/\s*,\s*|\s+and\s+|\s+/);
        const prohibitedMatched = keywords.some(k => k.length > 3 && normalizedProposal.includes(k));

        if (prohibitedMatched || normalizedProposal.includes(ruleLower)) {
          return {
            hasConflict: true,
            conflictingConstraint: constraint,
            reason: `Violates project-specific STRICT_BLOCK constraint ${constraint.id} ("${constraint.title}"): ${constraint.rule}. Rationale: ${constraint.rationale}`
          };
        }
      }
    }

    return { hasConflict: false };
  }

  public static getUserPreferences(zenitchDir: string): UserPreferenceRecord[] {
    const doc = StorageEngine.readDocument<PreferencesFile>(
      zenitchDir,
      'preferences.json',
      PreferencesFileSchema,
      () => ({
        schemaVersion: '1.0.0',
        projectId: 'unknown',
        _version: 0,
        updatedAt: new Date().toISOString(),
        items: {}
      })
    );

    return Object.values(doc.items);
  }
}
