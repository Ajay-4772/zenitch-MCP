import { MemoryCorruptionReport, MemoryCorruptionError } from './types.js';

export const CURRENT_SCHEMA_VERSION = '1.0.0';
export const PHASE2_SCHEMA_VERSION = '1.1.0';
export const PHASE3_SCHEMA_VERSION = '1.2.0';
export const PHASE4_SCHEMA_VERSION = '1.3.0';
export const PHASE5_SCHEMA_VERSION = '1.4.0';
export const PHASE6_SCHEMA_VERSION = '1.5.0';

export interface MigrationStep {
  fromVersion: string;
  toVersion: string;
  migrate: (doc: any) => any;
}

export const MIGRATION_PIPELINE: MigrationStep[] = [
  {
    fromVersion: '0.9.0',
    toVersion: '1.0.0',
    migrate: (doc: any) => {
      const migratedItems: Record<string, any> = {};
      if (doc.items && typeof doc.items === 'object') {
        for (const [id, item] of Object.entries<any>(doc.items)) {
          migratedItems[id] = {
            id: item.id || id,
            title: item.title || item.req_title || 'Untitled Requirement',
            description: item.description || item.req_description || '',
            category: (item.category || 'functional').toLowerCase(),
            status: item.status || item.state || 'REQUESTED',
            priority: item.priority === 'HIGH' ? 'must_have' : item.priority === 'LOW' ? 'nice_to_have' : 'should_have',
            provenance: item.provenance || {
              source: 'USER',
              verificationLevel: 'USER_CONFIRMED',
              confidence: 1.0,
              timestamp: new Date().toISOString()
            },
            acceptanceCriteria: item.acceptanceCriteria || [],
            relatedFiles: item.relatedFiles || [],
            relatedDecisions: item.relatedDecisions || [],
            verificationEvidenceIds: item.verificationEvidenceIds || [],
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
      }
      return {
        schemaVersion: '1.0.0',
        projectId: doc.projectId || 'legacy-project',
        _version: doc._version || 0,
        updatedAt: new Date().toISOString(),
        items: migratedItems,
        tickets: doc.tickets || {}
      };
    }
  },
  {
    fromVersion: '1.0.0',
    toVersion: '1.1.0',
    migrate: (doc: any) => {
      const migratedItems: Record<string, any> = {};
      if (doc.items && typeof doc.items === 'object') {
        for (const [id, item] of Object.entries<any>(doc.items)) {
          if (item.category !== undefined || item.title !== undefined) {
            const validStatuses = ['REQUESTED', 'PLANNED', 'IMPLEMENTED', 'TESTED', 'VERIFIED', 'PENDING_APPROVAL', 'ACCEPTED', 'REJECTED', 'BLOCKED', 'UNVERIFIED'];
            const status = validStatuses.includes(item.status) ? item.status : 'REQUESTED';

            const structuredCriteria = Array.isArray(item.acceptanceCriteria)
              ? item.acceptanceCriteria.map((c: any, index: number) => {
                  if (typeof c === 'string') {
                    return {
                      id: 'AC-LEGACY-' + (index + 1),
                      requirementId: item.id || id,
                      description: c,
                      type: 'FUNCTIONAL',
                      status: 'NOT_TESTED',
                      verificationIds: [],
                      createdAt: item.createdAt || new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    };
                  }
                  return c;
                })
              : [];

            migratedItems[id] = {
              ...item,
              id: item.id || id,
              title: item.title || 'Untitled Requirement',
              description: item.description || '',
              category: item.category || 'FUNCTIONAL',
              status,
              priority: item.priority || 'SHOULD_HAVE',
              source: item.source || 'USER',
              authority: item.authority || 'AUTHORITATIVE',
              dependsOn: item.dependsOn || [],
              parentRequirementId: item.parentRequirementId || undefined,
              acceptanceCriteria: structuredCriteria,
              linkedChangeIds: item.linkedChangeIds || [],
              linkedDecisionIds: item.linkedDecisionIds || item.relatedDecisions || [],
              linkedVerificationIds: item.linkedVerificationIds || item.verificationEvidenceIds || [],
              relatedFiles: item.relatedFiles || [],
              relatedDecisions: item.relatedDecisions || [],
              verificationEvidenceIds: item.verificationEvidenceIds || [],
              provenance: item.provenance || {
                source: 'USER',
                verificationLevel: 'USER_CONFIRMED',
                confidence: 1.0,
                timestamp: new Date().toISOString()
              },
              createdAt: item.createdAt || new Date().toISOString(),
              updatedAt: item.updatedAt || new Date().toISOString()
            };
          } else if (item.summary !== undefined && (item.files !== undefined || item.affectedFiles !== undefined)) {
            const files = item.files || item.affectedFiles || [];
            const reqIds = item.requirementIds || (item.linkedRequirementId ? [item.linkedRequirementId] : []);
            migratedItems[id] = {
              ...item,
              id: item.id || id,
              type: item.type || 'FEATURE',
              source: item.source || 'AI_REPORTED',
              actor: item.actor || 'AI',
              files,
              affectedFiles: files,
              requirementIds: reqIds,
              linkedRequirementId: item.linkedRequirementId || (reqIds.length > 0 ? reqIds[0] : undefined),
              decisionIds: item.decisionIds || [],
              verificationIds: item.verificationIds || [],
              unlinkedChange: item.unlinkedChange ?? (reqIds.length === 0)
            };
          } else {
            migratedItems[id] = { ...item };
          }
        }
      }

      return {
        ...doc,
        schemaVersion: '1.1.0',
        projectId: doc.projectId || 'migrated-project',
        _version: doc._version || 0,
        updatedAt: new Date().toISOString(),
        items: migratedItems,
        tickets: doc.tickets || {}
      };
    }
  },
  {
    fromVersion: '1.1.0',
    toVersion: '1.2.0',
    migrate: (doc: any) => {
      const migratedItems: Record<string, any> = {};
      if (doc.items && typeof doc.items === 'object') {
        for (const [id, item] of Object.entries<any>(doc.items)) {
          if (item.verdict !== undefined || item.verificationMethod !== undefined) {
            migratedItems[id] = {
              ...item,
              id: item.id || id,
              verificationType: item.verificationType || 'STATIC',
              verificationMethod: item.verificationMethod || 'STATIC_ANALYSIS',
              verdict: item.verdict || 'INCONCLUSIVE',
              evidenceSummary: item.evidenceSummary || 'Migrated verification evidence',
              evidence: Array.isArray(item.evidence) ? item.evidence : [],
              durationMs: item.durationMs ?? 0,
              reusedCachedEvidence: item.reusedCachedEvidence ?? false,
              environment: item.environment || {},
              provenance: item.provenance || {
                source: 'SYSTEM',
                verificationLevel: 'AUTOMATED_VERIFIED',
                confidence: 1.0,
                timestamp: new Date().toISOString()
              },
              timestamp: item.timestamp || new Date().toISOString()
            };
          } else {
            migratedItems[id] = { ...item };
          }
        }
      }

      return {
        ...doc,
        schemaVersion: '1.2.0',
        projectId: doc.projectId || 'migrated-project',
        _version: doc._version || 0,
        updatedAt: new Date().toISOString(),
        items: migratedItems,
        tickets: doc.tickets || {}
      };
    }
  },
  {
    fromVersion: '1.2.0',
    toVersion: '1.3.0',
    migrate: (doc: any) => {
      return {
        ...doc,
        version: '1.3.0',
        schemaVersion: '1.3.0',
        updatedAt: new Date().toISOString()
      };
    }
  },
  {
    fromVersion: '1.3.0',
    toVersion: '1.4.0',
    migrate: (doc: any) => {
      return {
        ...doc,
        version: '1.4.0',
        schemaVersion: '1.4.0',
        updatedAt: new Date().toISOString()
      };
    }
  },
  {
    fromVersion: '1.4.0',
    toVersion: '1.5.0',
    migrate: (doc: any) => {
      return {
        ...doc,
        version: '1.5.0',
        schemaVersion: '1.5.0',
        updatedAt: new Date().toISOString()
      };
    }
  }
];

export class MigrationEngine {
  public static migrateDocument<T extends { schemaVersion: string }>(
    filename: string,
    doc: any,
    targetVersion: string = '1.0.0'
  ): T {
    if (!doc || typeof doc !== 'object') {
      const report: MemoryCorruptionReport = {
        status: 'DEGRADED_CORRUPTION_DETECTED',
        file: filename,
        corruptPath: filename,
        errorDetails: 'Cannot migrate non-object document',
        detectedAt: new Date().toISOString()
      };
      throw new MemoryCorruptionError(report);
    }

    const version = doc.schemaVersion || '1.0.0';
    if (version === targetVersion) {
      return doc as T;
    }

    let currentDoc = { ...doc };
    let currentVersion = version;

    for (const step of MIGRATION_PIPELINE) {
      if (step.fromVersion === currentVersion) {
        try {
          currentDoc = step.migrate(currentDoc);
          currentVersion = step.toVersion;
          if (currentVersion === targetVersion) {
            break;
          }
        } catch (err: any) {
          const report: MemoryCorruptionReport = {
            status: 'DEGRADED_CORRUPTION_DETECTED',
            file: filename,
            corruptPath: filename,
            errorDetails: 'Schema migration from ' + step.fromVersion + ' to ' + step.toVersion + ' failed: ' + err.message,
            detectedAt: new Date().toISOString()
          };
          throw new MemoryCorruptionError(report);
        }
      }
    }

    currentDoc.schemaVersion = currentVersion;
    return currentDoc as T;
  }
}
