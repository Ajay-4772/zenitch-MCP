import path from 'node:path';
import { z } from 'zod';
import {
  ManageChangeInputSchema,
  InspectChangesInputSchema,
  ManageChangeInput,
  InspectChangesInput,
  ChangeRecord,
  ChangesFileSchema,
  RequirementsFileSchema,
  DecisionsFileSchema,
  VerificationFileSchema
} from '../schemas/memory.schema.js';
import { StorageEngine } from './storage-engine.js';
import { resolveProjectIdentity } from './project-identity.js';
import { generateId, isValidId } from './id-generator.js';
import { GitInspector } from './git-inspector.js';
import { CheckpointEngine } from './checkpoint-engine.js';
import {
  ChangesFile,
  RequirementsContainerFile,
  DecisionsFile,
  VerificationFile
} from './types.js';

export class ChangeManager {
  public static resolveRoot(projectRoot?: string): string {
    return projectRoot ? path.resolve(projectRoot) : process.cwd();
  }

  public static async manageChange(rawInput: z.input<typeof ManageChangeInputSchema>): Promise<any> {
    const input = ManageChangeInputSchema.parse(rawInput);
    const root = this.resolveRoot(input.projectRoot);
    const zenitchDir = StorageEngine.getZenitchDir(root);
    const identity = resolveProjectIdentity(root);

    return StorageEngine.withLock(zenitchDir, async () => {
      // 1. Load changes.json
      const changesDoc = StorageEngine.readDocument<ChangesFile>(
        zenitchDir,
        'changes.json',
        ChangesFileSchema,
        () => ({
          schemaVersion: '1.1.0',
          projectId: identity.projectId,
          _version: 0,
          updatedAt: new Date().toISOString(),
          items: {}
        })
      );

      // Load requirements.json for relationship validation
      const reqDoc = StorageEngine.readDocument<RequirementsContainerFile>(
        zenitchDir,
        'requirements.json',
        RequirementsFileSchema,
        () => ({
          schemaVersion: '1.1.0',
          projectId: identity.projectId,
          _version: 0,
          updatedAt: new Date().toISOString(),
          items: {},
          tickets: {}
        })
      );

      // Load decisions.json for relationship validation
      const decDoc = StorageEngine.readDocument<DecisionsFile>(
        zenitchDir,
        'decisions.json',
        DecisionsFileSchema,
        () => ({
          schemaVersion: '1.1.0',
          projectId: identity.projectId,
          _version: 0,
          updatedAt: new Date().toISOString(),
          items: {}
        })
      );

      // Load verification.json for relationship validation
      const verDoc = StorageEngine.readDocument<VerificationFile>(
        zenitchDir,
        'verification.json',
        VerificationFileSchema,
        () => ({
          schemaVersion: '1.1.0',
          projectId: identity.projectId,
          _version: 0,
          updatedAt: new Date().toISOString(),
          items: {}
        })
      );

      if (input.action === 'CREATE') {
        if (!input.summary || input.summary.trim().length < 3) {
          throw new Error('Summary must be at least 3 characters for CREATE change.');
        }

        const changeId = generateId('CHG');
        const reqIds: string[] = [];
        if (input.requirementId) reqIds.push(input.requirementId);
        if (input.requirementIds) {
          for (const rid of input.requirementIds) {
            if (!reqIds.includes(rid)) reqIds.push(rid);
          }
        }

        // Validate that linked requirements exist
        for (const rid of reqIds) {
          if (!reqDoc.items[rid]) {
            throw new Error(`Linked requirement ${rid} not found in project memory.`);
          }
        }

        // Validate linked decisions
        const decIds: string[] = [];
        if (input.decisionId) decIds.push(input.decisionId);
        if (input.decisionIds) {
          for (const did of input.decisionIds) {
            if (!decIds.includes(did)) decIds.push(did);
          }
        }
        for (const did of decIds) {
          if (!decDoc.items[did]) {
            throw new Error(`Linked decision ${did} not found in project memory.`);
          }
        }

        // Validate linked verifications
        const verIds: string[] = [];
        if (input.verificationId) verIds.push(input.verificationId);
        if (input.verificationIds) {
          for (const vid of input.verificationIds) {
            if (!verIds.includes(vid)) verIds.push(vid);
          }
        }
        for (const vid of verIds) {
          if (!verDoc.items[vid]) {
            throw new Error(`Linked verification evidence ${vid} not found in project memory.`);
          }
        }

        const files = input.files || [];
        const actor = input.actor || 'AI';
        const source = input.source || (actor === 'AI' ? 'AI_REPORTED' : 'HUMAN_REPORTED');
        const isUnlinked = input.unlinkedChange ?? (reqIds.length === 0);

        const newChange: ChangeRecord = {
          id: changeId,
          projectId: identity.projectId,
          type: input.type || 'FEATURE',
          summary: input.summary,
          reason: input.reason,
          source,
          actor,
          files,
          affectedFiles: files,
          requirementIds: reqIds,
          linkedRequirementId: reqIds.length > 0 ? reqIds[0] : undefined,
          decisionIds: decIds,
          verificationIds: verIds,
          verificationStatus: verIds.length > 0 ? 'PASSED' : 'PENDING',
          gitCommit: input.gitCommit,
          unlinkedChange: isUnlinked,
          provenance: {
            source: actor === 'AI' ? 'AI_INFERENCE' : 'USER',
            verificationLevel: source === 'GIT_OBSERVED' ? 'CODE_OBSERVED' : 'UNVERIFIED',
            confidence: 1.0,
            timestamp: new Date().toISOString()
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // Bidirectional linking: update linked requirements' linkedChangeIds
        let reqUpdated = false;
        for (const rid of reqIds) {
          const req = reqDoc.items[rid];
          if (req) {
            if (!req.linkedChangeIds) req.linkedChangeIds = [];
            if (!req.linkedChangeIds.includes(changeId)) {
              req.linkedChangeIds.push(changeId);
              req.updatedAt = new Date().toISOString();
              reqUpdated = true;
            }
          }
        }

        const redactedChange = StorageEngine.redactSecrets(newChange);
        changesDoc.items[changeId] = redactedChange;
        StorageEngine.writeDocument(zenitchDir, 'changes.json', changesDoc, changesDoc._version);
        if (reqUpdated) {
          StorageEngine.writeDocument(zenitchDir, 'requirements.json', reqDoc, reqDoc._version);
        }

        return {
          action: 'CREATE',
          change: redactedChange,
          message: `Recorded change ${changeId} (${newChange.type}): "${newChange.summary}". Linked to ${reqIds.length} requirements.`
        };
      }

      if (input.action === 'UPDATE') {
        if (!input.changeId) throw new Error('changeId is required for UPDATE change.');
        const change = changesDoc.items[input.changeId];
        if (!change) throw new Error(`Change ${input.changeId} not found.`);

        if (input.summary) change.summary = input.summary;
        if (input.reason) change.reason = input.reason;
        if (input.type) change.type = input.type;
        if (input.files) {
          change.files = input.files;
          change.affectedFiles = input.files;
        }
        if (input.gitCommit) change.gitCommit = input.gitCommit;
        if (input.source) change.source = input.source;
        change.updatedAt = new Date().toISOString();

        StorageEngine.writeDocument(zenitchDir, 'changes.json', changesDoc, changesDoc._version);

        return {
          action: 'UPDATE',
          change,
          message: `Updated change ${change.id}.`
        };
      }

      if (input.action === 'LINK_REQUIREMENT') {
        if (!input.changeId) throw new Error('changeId is required for LINK_REQUIREMENT.');
        const rid = input.requirementId || (input.requirementIds && input.requirementIds[0]);
        if (!rid) throw new Error('requirementId is required for LINK_REQUIREMENT.');

        const change = changesDoc.items[input.changeId];
        if (!change) throw new Error(`Change ${input.changeId} not found.`);

        const req = reqDoc.items[rid];
        if (!req) throw new Error(`Requirement ${rid} not found.`);

        if (!change.requirementIds.includes(rid)) {
          change.requirementIds.push(rid);
        }
        change.unlinkedChange = false;
        change.updatedAt = new Date().toISOString();

        if (!req.linkedChangeIds) req.linkedChangeIds = [];
        if (!req.linkedChangeIds.includes(change.id)) {
          req.linkedChangeIds.push(change.id);
          req.updatedAt = new Date().toISOString();
        }

        StorageEngine.writeDocument(zenitchDir, 'changes.json', changesDoc, changesDoc._version);
        StorageEngine.writeDocument(zenitchDir, 'requirements.json', reqDoc, reqDoc._version);

        return {
          action: 'LINK_REQUIREMENT',
          change,
          linkedRequirementId: rid,
          message: `Linked change ${change.id} to requirement ${rid}.`
        };
      }

      if (input.action === 'LINK_DECISION') {
        if (!input.changeId) throw new Error('changeId is required for LINK_DECISION.');
        const did = input.decisionId || (input.decisionIds && input.decisionIds[0]);
        if (!did) throw new Error('decisionId is required for LINK_DECISION.');

        const change = changesDoc.items[input.changeId];
        if (!change) throw new Error(`Change ${input.changeId} not found.`);

        const dec = decDoc.items[did];
        if (!dec) throw new Error(`Decision ${did} not found.`);

        if (!change.decisionIds.includes(did)) {
          change.decisionIds.push(did);
        }
        change.updatedAt = new Date().toISOString();

        StorageEngine.writeDocument(zenitchDir, 'changes.json', changesDoc, changesDoc._version);

        return {
          action: 'LINK_DECISION',
          change,
          linkedDecisionId: did,
          message: `Linked change ${change.id} to decision ${did}.`
        };
      }

      if (input.action === 'LINK_VERIFICATION') {
        if (!input.changeId) throw new Error('changeId is required for LINK_VERIFICATION.');
        const vid = input.verificationId || (input.verificationIds && input.verificationIds[0]);
        if (!vid) throw new Error('verificationId is required for LINK_VERIFICATION.');

        const change = changesDoc.items[input.changeId];
        if (!change) throw new Error(`Change ${input.changeId} not found.`);

        const ver = verDoc.items[vid];
        if (!ver) throw new Error(`Verification ${vid} not found.`);

        if (!change.verificationIds.includes(vid)) {
          change.verificationIds.push(vid);
        }
        if (ver.verdict === 'PASSED') {
          change.verificationStatus = 'PASSED';
        }
        change.updatedAt = new Date().toISOString();

        StorageEngine.writeDocument(zenitchDir, 'changes.json', changesDoc, changesDoc._version);

        return {
          action: 'LINK_VERIFICATION',
          change,
          linkedVerificationId: vid,
          message: `Linked change ${change.id} to verification ${vid}.`
        };
      }

      throw new Error(`Unsupported change action: ${input.action}`);
    });
  }

  public static async inspectChanges(rawInput: z.input<typeof InspectChangesInputSchema>): Promise<any> {
    const input = InspectChangesInputSchema.parse(rawInput);
    const root = this.resolveRoot(input.projectRoot);
    const zenitchDir = StorageEngine.getZenitchDir(root);
    const identity = resolveProjectIdentity(root);

    return StorageEngine.withLock(zenitchDir, async () => {
      // 1. Inspect Git state safely (read-only)
      const gitResult = GitInspector.inspect(root, input.maxFiles, input.includeDiff);

      // 2. Checkpoint fast-path check
      const fastPath = CheckpointEngine.checkFastPath(
        zenitchDir,
        gitResult.headCommit,
        gitResult.modified,
        gitResult.added,
        gitResult.deleted
      );

      // Update checkpoint with current inspection
      const checkpoint = CheckpointEngine.updateCheckpoint(
        zenitchDir,
        identity.projectId,
        gitResult.headCommit,
        gitResult.modified,
        gitResult.added,
        gitResult.deleted,
        gitResult.commitSummary
      );

      // 3. Load known changes and requirements
      const changesDoc = StorageEngine.readDocument<ChangesFile>(
        zenitchDir,
        'changes.json',
        ChangesFileSchema,
        () => ({
          schemaVersion: '1.1.0',
          projectId: identity.projectId,
          _version: 0,
          updatedAt: new Date().toISOString(),
          items: {}
        })
      );

      const reqDoc = StorageEngine.readDocument<RequirementsContainerFile>(
        zenitchDir,
        'requirements.json',
        RequirementsFileSchema,
        () => ({
          schemaVersion: '1.1.0',
          projectId: identity.projectId,
          _version: 0,
          updatedAt: new Date().toISOString(),
          items: {},
          tickets: {}
        })
      );

      const allChangedFiles = [
        ...gitResult.modified,
        ...gitResult.added,
        ...gitResult.deleted,
        ...gitResult.untracked
      ];

      // Cross-reference changed files against known requirements
      const potentiallyAffectedRequirements: Array<{ id: string; title: string; status: string; matchedFiles: string[] }> = [];
      for (const req of Object.values(reqDoc.items)) {
        const matched = req.relatedFiles.filter(f => allChangedFiles.some(cf => cf.includes(f) || f.includes(cf)));
        if (matched.length > 0) {
          potentiallyAffectedRequirements.push({
            id: req.id,
            title: req.title,
            status: req.status,
            matchedFiles: matched
          });
        }
      }

      // Cross-reference changed files against recorded changes
      const accountedFiles = new Set<string>();
      const relevantKnownChanges: Array<{ id: string; type: string; summary: string; files: string[]; requirementIds: string[] }> = [];

      for (const chg of Object.values(changesDoc.items)) {
        const chgFiles = chg.files || chg.affectedFiles || [];
        const hasOverlap = chgFiles.some(f => allChangedFiles.some(cf => cf.includes(f) || f.includes(cf)));
        if (hasOverlap) {
          relevantKnownChanges.push({
            id: chg.id,
            type: chg.type,
            summary: chg.summary,
            files: chgFiles,
            requirementIds: chg.requirementIds
          });
          for (const f of chgFiles) {
            accountedFiles.add(f);
          }
        }
      }

      // Unlinked modifications: git modified files not covered by any recorded change
      const unlinkedModifications = allChangedFiles.filter(f => !accountedFiles.has(f));

      const mode = input.mode || 'concise';

      // 4. Compact retrieval by default (concise)
      if (mode === 'concise') {
        return {
          mode: 'concise',
          projectId: identity.projectId,
          gitAvailable: gitResult.gitAvailable,
          headCommit: gitResult.headCommit,
          branch: gitResult.branch,
          changedFilesCount: {
            modified: gitResult.modified.length,
            added: gitResult.added.length,
            deleted: gitResult.deleted.length,
            untracked: gitResult.untracked.length,
            total: gitResult.totalChanges
          },
          fastPath: {
            changedSinceLastInspection: fastPath.hasChanged,
            inspectedAt: checkpoint.timestamp
          },
          potentiallyAffectedRequirements: potentiallyAffectedRequirements.map(r => r.id),
          knownChanges: relevantKnownChanges.map(c => c.id),
          unlinkedModifications: unlinkedModifications.slice(0, 15),
          unlinkedCount: unlinkedModifications.length
        };
      }

      if (mode === 'standard') {
        return {
          mode: 'standard',
          projectId: identity.projectId,
          gitAvailable: gitResult.gitAvailable,
          headCommit: gitResult.headCommit,
          commitSummary: gitResult.commitSummary,
          branch: gitResult.branch,
          changes: {
            modified: gitResult.modified,
            added: gitResult.added,
            deleted: gitResult.deleted,
            untracked: gitResult.untracked
          },
          potentiallyAffectedRequirements,
          knownChanges: relevantKnownChanges,
          unlinkedModifications,
          checkpoint: {
            lastCommit: checkpoint.gitCommit,
            timestamp: checkpoint.timestamp,
            hasChanged: fastPath.hasChanged
          }
        };
      }

      // Detailed mode
      return {
        mode: 'detailed',
        projectId: identity.projectId,
        gitStatus: gitResult,
        potentiallyAffectedRequirements,
        knownChanges: relevantKnownChanges,
        allRecordedChangesCount: Object.keys(changesDoc.items).length,
        unlinkedModifications,
        checkpoint,
        fastPath
      };
    });
  }
}
