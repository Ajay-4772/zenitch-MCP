import path from 'node:path';
import { z } from 'zod';
import {
  GetProjectContextInputSchema,
  RecordDecisionInputSchema,
  ManageRequirementInputSchema,
  ManageChangeInputSchema,
  InspectChangesInputSchema,
  ProjectContextRecord,
  ProjectContextSchema,
  RequirementRecord,
  DecisionRecord,
  ProjectConstraintRecord,
  UserPreferenceRecord,
  ProvenanceRecord,
  AcceptanceCriterion,
  PreferencesFileSchema,
  ConstraintsFileSchema,
  DecisionsFileSchema,
  RequirementsFileSchema,
  VerificationFileSchema
} from '../schemas/memory.schema.js';
import { StorageEngine } from './storage-engine.js';
import { resolveProjectIdentity } from './project-identity.js';
import { generateId, isValidId } from './id-generator.js';
import { RequirementStateMachine } from './state-machine.js';
import { ApprovalManager } from './approval-manager.js';
import { AuthorityEngine } from './authority-engine.js';
import { ChangeManager } from './change-manager.js';
import {
  PreferencesFile,
  ConstraintsFile,
  DecisionsFile,
  RequirementsContainerFile,
  VerificationFile
} from './types.js';

export class MemoryManager {
  public static resolveRoot(projectRoot?: string): string {
    return projectRoot ? path.resolve(projectRoot) : process.cwd();
  }

  public static computeDependencyStatus(
    req: RequirementRecord,
    allReqs: Record<string, RequirementRecord>
  ): 'RESOLVED' | 'BLOCKED' | 'UNMET' | 'NONE' {
    if (!req.dependsOn || req.dependsOn.length === 0) {
      return 'NONE';
    }

    let allResolved = true;
    for (const depId of req.dependsOn) {
      const dep = allReqs[depId];
      if (!dep) {
        return 'BLOCKED'; // Missing dependency blocks execution
      }
      if (dep.status === 'BLOCKED' || dep.status === 'REJECTED') {
        return 'BLOCKED';
      }
      if (dep.status !== 'ACCEPTED' && dep.status !== 'VERIFIED') {
        allResolved = false;
      }
    }

    return allResolved ? 'RESOLVED' : 'UNMET';
  }

  public static async getProjectContext(rawInput: z.input<typeof GetProjectContextInputSchema>): Promise<any> {
    const input = GetProjectContextInputSchema.parse(rawInput);
    const root = this.resolveRoot(input.projectRoot);
    const zenitchDir = StorageEngine.getZenitchDir(root);

    return StorageEngine.withLock(zenitchDir, async () => {
      // 1. Load or initialize project.json
      const identity = resolveProjectIdentity(root);
      const projectDoc = StorageEngine.readDocument<ProjectContextRecord>(
        zenitchDir,
        'project.json',
        ProjectContextSchema,
        () => {
          const initDoc: ProjectContextRecord = {
            schemaVersion: '1.1.0',
            projectId: identity.projectId,
            projectName: identity.projectName,
            projectRoot: root,
            identityHierarchy: identity.identityHierarchy,
            domain: 'enterprise_saas',
            primaryUserGoal: 'Build high-quality verified interface',
            targetAudience: 'general_users',
            stylingSystem: 'tailwind',
            detectedFramework: 'react',
            activeThemePolicy: 'adaptive_system',
            _version: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          StorageEngine.writeDocument(zenitchDir, 'project.json', initDoc, 0);
          return initDoc;
        }
      );

      // 2. Load constraints & rejected decisions
      const constraintsDoc = StorageEngine.readDocument<ConstraintsFile>(
        zenitchDir,
        'constraints.json',
        ConstraintsFileSchema,
        () => ({
          schemaVersion: '1.1.0',
          projectId: identity.projectId,
          _version: 0,
          updatedAt: new Date().toISOString(),
          items: {}
        })
      );

      const decisionsDoc = StorageEngine.readDocument<DecisionsFile>(
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

      const requirementsDoc = StorageEngine.readDocument<RequirementsContainerFile>(
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

      const preferencesDoc = StorageEngine.readDocument<PreferencesFile>(
        zenitchDir,
        'preferences.json',
        PreferencesFileSchema,
        () => ({
          schemaVersion: '1.1.0',
          projectId: identity.projectId,
          _version: 0,
          updatedAt: new Date().toISOString(),
          items: {}
        })
      );

      // Filter negative constraints & rejected decisions
      const activeConstraints = Object.values(constraintsDoc.items);
      const rejectedDecisions = Object.values(decisionsDoc.items).filter(d => d.disposition === 'REJECTED');
      const acceptedDecisions = Object.values(decisionsDoc.items).filter(d => d.disposition === 'ACCEPTED');
      const preferences = Object.values(preferencesDoc.items);

      // Filter requirements
      let requirements = Object.values(requirementsDoc.items);
      if (input.statusFilter && input.statusFilter.length > 0) {
        requirements = requirements.filter(r => input.statusFilter!.includes(r.status));
      }

      if (input.scope) {
        const targetScope = input.scope.toLowerCase();
        requirements = requirements.filter(r => r.category.toLowerCase().includes(targetScope) || r.title.toLowerCase().includes(targetScope));
      }

      if (input.query) {
        const q = input.query.toLowerCase();
        requirements = requirements.filter(r => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
      }

      // Build output based on mode
      const mode = input.mode || 'concise';

      if (mode === 'concise') {
        return {
          mode: 'concise',
          projectId: projectDoc.projectId,
          projectName: projectDoc.projectName,
          domain: projectDoc.domain,
          activeNegativeConstraints: input.includeNegativeConstraints !== false
            ? activeConstraints.map(c => '[' + c.id + '] ' + c.title + ': ' + c.rule)
            : [],
          rejectedPatterns: input.includeNegativeConstraints !== false
            ? rejectedDecisions.map(d => '[' + d.id + '] REJECTED: ' + d.title + ' (Reason: ' + d.rationale + ')')
            : [],
          generalUserPreferences: preferences.map(p => '[' + p.id + '] ' + p.preference),
          activeRequirements: requirements.map(r => {
            const criteriaList = Array.isArray(r.acceptanceCriteria) ? r.acceptanceCriteria : [];
            const passedCount = criteriaList.filter(c => typeof c === 'object' && c.status === 'PASSED').length;
            const waivedCount = criteriaList.filter(c => typeof c === 'object' && c.status === 'WAIVED').length;
            const depStatus = MemoryManager.computeDependencyStatus(r, requirementsDoc.items);

            return {
              id: r.id,
              title: r.title,
              status: r.status,
              priority: r.priority,
              authority: r.authority || 'AUTHORITATIVE',
              dependencyStatus: depStatus,
              criteriaSummary: passedCount + ' passed, ' + waivedCount + ' waived, ' + criteriaList.length + ' total',
              linkedChangesCount: (r.linkedChangeIds || []).length
            };
          })
        };
      }

      if (mode === 'standard') {
        return {
          mode: 'standard',
          project: projectDoc,
          activeNegativeConstraints: input.includeNegativeConstraints !== false ? activeConstraints : [],
          rejectedDecisions: input.includeNegativeConstraints !== false ? rejectedDecisions : [],
          acceptedDecisions,
          generalUserPreferences: preferences,
          requirements: requirements.map(r => ({
            id: r.id,
            title: r.title,
            description: r.description,
            category: r.category,
            status: r.status,
            priority: r.priority,
            source: r.source || 'USER',
            authority: r.authority || 'AUTHORITATIVE',
            dependencyStatus: MemoryManager.computeDependencyStatus(r, requirementsDoc.items),
            parentRequirementId: r.parentRequirementId,
            dependsOn: r.dependsOn || [],
            acceptanceCriteria: r.acceptanceCriteria,
            relatedFiles: r.relatedFiles,
            linkedChangeIds: r.linkedChangeIds || [],
            linkedDecisionIds: r.linkedDecisionIds || r.relatedDecisions || [],
            activeApprovalTicketId: r.activeApprovalTicketId
          }))
        };
      }

      // Detailed mode
      return {
        mode: 'detailed',
        project: projectDoc,
        constraints: activeConstraints,
        rejectedDecisions,
        acceptedDecisions,
        preferences,
        requirements: requirements.map(r => ({
          ...r,
          dependencyStatus: MemoryManager.computeDependencyStatus(r, requirementsDoc.items)
        }))
      };
    });
  }

  public static async recordDecision(rawInput: z.input<typeof RecordDecisionInputSchema>): Promise<any> {
    const input = RecordDecisionInputSchema.parse(rawInput);
    const root = this.resolveRoot(input.projectRoot);
    const zenitchDir = StorageEngine.getZenitchDir(root);
    const identity = resolveProjectIdentity(root);

    return StorageEngine.withLock(zenitchDir, async () => {
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

      const decId = generateId('DEC');
      const verificationLevel: 'USER_CONFIRMED' | 'UNVERIFIED' = input.sourceType === 'USER' ? 'USER_CONFIRMED' : 'UNVERIFIED';
      const provenance: ProvenanceRecord = {
        source: input.sourceType,
        verificationLevel,
        confidence: 1.0,
        externalReferenceUrl: input.externalReferenceUrl,
        timestamp: new Date().toISOString()
      };

      // Handle general user preferences
      if (input.isGeneralPreference) {
        const prefDoc = StorageEngine.readDocument<PreferencesFile>(
          zenitchDir,
          'preferences.json',
          PreferencesFileSchema,
          () => ({
            schemaVersion: '1.1.0',
            projectId: identity.projectId,
            _version: 0,
            updatedAt: new Date().toISOString(),
            items: {}
          })
        );

        const prefId = generateId('PRF');
        const newPref: UserPreferenceRecord = {
          id: prefId,
          category: 'visual_style',
          preference: input.decision,
          rationale: input.rationale,
          scope: 'global_user',
          provenance,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        prefDoc.items[prefId] = newPref;
        StorageEngine.writeDocument(zenitchDir, 'preferences.json', prefDoc, prefDoc._version);
      }

      // If REJECTED, automatically derive STRICT_BLOCK project constraint
      let generatedConstraint: ProjectConstraintRecord | undefined;
      if (input.disposition === 'REJECTED') {
        const constDoc = StorageEngine.readDocument<ConstraintsFile>(
          zenitchDir,
          'constraints.json',
          ConstraintsFileSchema,
          () => ({
            schemaVersion: '1.1.0',
            projectId: identity.projectId,
            _version: 0,
            updatedAt: new Date().toISOString(),
            items: {}
          })
        );

        const cstId = generateId('CST');
        const cstRecord: ProjectConstraintRecord = {
          id: cstId,
          title: 'Forbidden: ' + input.title,
          rule: 'Do not use or introduce: ' + input.decision + '.',
          rationale: input.rationale,
          enforcementLevel: 'STRICT_BLOCK',
          linkedDecisionId: decId,
          applicableSubsystems: ['policy', 'tokens', 'components'],
          provenance,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        generatedConstraint = cstRecord;
        constDoc.items[cstId] = cstRecord;
        StorageEngine.writeDocument(zenitchDir, 'constraints.json', constDoc, constDoc._version);
      }

      const newDecision: DecisionRecord = {
        id: decId,
        title: input.title,
        decision: input.decision,
        rationale: input.rationale,
        disposition: input.disposition,
        scope: input.scope,
        targetComponentOrArea: input.targetComponentOrArea,
        rejectedAlternatives: input.rejectedAlternatives || [],
        generatedConstraintId: generatedConstraint ? generatedConstraint.id : undefined,
        provenance,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      decDoc.items[decId] = newDecision;
      StorageEngine.writeDocument(zenitchDir, 'decisions.json', decDoc, decDoc._version);

      return {
        type: 'PROJECT_DECISION',
        decision: newDecision,
        generatedConstraint,
        message: input.disposition === 'REJECTED'
          ? 'Recorded REJECTED decision and created associated STRICT_BLOCK project constraint.'
          : 'Recorded ACCEPTED project decision.'
      };
    });
  }

  public static async manageRequirement(rawInput: z.input<typeof ManageRequirementInputSchema>): Promise<any> {
    const input = ManageRequirementInputSchema.parse(rawInput);
    const root = this.resolveRoot(input.projectRoot);
    const zenitchDir = StorageEngine.getZenitchDir(root);
    const identity = resolveProjectIdentity(root);

    // Handle ticket creation / resolution
    if (input.action === 'REQUEST_APPROVAL') {
      if (!input.requirementId) throw new Error('requirementId is required for REQUEST_APPROVAL.');
      const ticket = await ApprovalManager.createTicket(zenitchDir, input.requirementId);
      const safeTicket = ApprovalManager.sanitizeTicketForAI(ticket);
      return {
        action: 'REQUEST_APPROVAL',
        ticket: safeTicket,
        requiresHumanAction: true,
        hostApprovalChannel: '.zenitch/.approval_tokens/' + ticket.ticketId + '.token',
        message: 'Approval ticket ' + ticket.ticketId + ' created. The secret human approval token is isolated on the host channel (.zenitch/.approval_tokens/' + ticket.ticketId + '.token) and cannot be accessed by AI callers. Human user confirmation is strictly required to resolve this ticket.'
      };
    }

    if (input.action === 'RESOLVE_APPROVAL') {
      if (!input.approvalTicketId) throw new Error('approvalTicketId is required for RESOLVE_APPROVAL.');
      if (!input.approvalAction) throw new Error('approvalAction ("APPROVE" | "REJECT") is required for RESOLVE_APPROVAL.');

      const result = await ApprovalManager.resolveTicket(zenitchDir, input.approvalTicketId, input.approvalAction, input.approvalFeedback, input.humanApprovalToken);
      const safeTicket = ApprovalManager.sanitizeTicketForAI(result.ticket);
      return {
        action: 'RESOLVE_APPROVAL',
        resolvedTicket: safeTicket,
        requirement: result.requirement,
        message: input.approvalAction === 'APPROVE'
          ? 'Ticket ' + result.ticket.ticketId + ' approved by human user. Requirement is now ACCEPTED.'
          : 'Ticket ' + result.ticket.ticketId + ' rejected. Requirement reverted to IMPLEMENTED for revision.'
      };
    }

    return StorageEngine.withLock(zenitchDir, async () => {
      const doc = StorageEngine.readDocument<RequirementsContainerFile>(
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

      // CREATE ACTION
      if (input.action === 'CREATE') {
        if (!input.title || input.title.trim().length < 3) {
          throw new Error('Title must be at least 3 characters for CREATE requirement.');
        }

        const reqId = generateId('REQ');
        const criteria: AcceptanceCriterion[] = [];
        if (input.acceptanceCriteria && Array.isArray(input.acceptanceCriteria)) {
          for (let i = 0; i < input.acceptanceCriteria.length; i++) {
            const item = input.acceptanceCriteria[i];
            if (typeof item === 'string') {
              criteria.push({
                id: generateId('AC'),
                requirementId: reqId,
                description: item,
                type: 'FUNCTIONAL',
                status: 'NOT_TESTED',
                verificationIds: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
            } else {
              criteria.push({
                ...item,
                id: item.id || generateId('AC'),
                requirementId: reqId,
                createdAt: item.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
            }
          }
        }

        const newReq: RequirementRecord = {
          id: reqId,
          projectId: identity.projectId,
          title: input.title,
          description: input.description || input.title,
          category: input.category || 'functional',
          status: 'REQUESTED',
          source: input.source || 'USER',
          authority: 'AUTHORITATIVE',
          priority: input.priority || 'must_have',
          parentRequirementId: input.parentRequirementId,
          dependsOn: input.dependsOn || [],
          provenance: {
            source: input.source || 'USER',
            verificationLevel: 'USER_CONFIRMED',
            confidence: 1.0,
            timestamp: new Date().toISOString()
          },
          acceptanceCriteria: criteria,
          relatedFiles: input.relatedFiles || [],
          relatedDecisions: [],
          linkedDecisionIds: [],
          linkedChangeIds: [],
          linkedVerificationIds: [],
          verificationEvidenceIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        doc.items[reqId] = newReq;
        StorageEngine.writeDocument(zenitchDir, 'requirements.json', doc, doc._version);

        return {
          action: 'CREATE',
          requirement: newReq,
          message: 'Created requirement ' + reqId + ' with status REQUESTED.'
        };
      }

      // PROPOSE ACTION (AI Proposal workflow)
      if (input.action === 'PROPOSE') {
        if (!input.title || input.title.trim().length < 3) {
          throw new Error('Title must be at least 3 characters for PROPOSE requirement.');
        }

        const reqId = generateId('REQ');
        const criteria: AcceptanceCriterion[] = [];
        if (input.acceptanceCriteria && Array.isArray(input.acceptanceCriteria)) {
          for (let i = 0; i < input.acceptanceCriteria.length; i++) {
            const item = input.acceptanceCriteria[i];
            if (typeof item === 'string') {
              criteria.push({
                id: generateId('AC'),
                requirementId: reqId,
                description: item,
                type: 'FUNCTIONAL',
                status: 'NOT_TESTED',
                verificationIds: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
            } else {
              criteria.push({
                ...item,
                id: item.id || generateId('AC'),
                requirementId: reqId,
                createdAt: item.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
            }
          }
        }

        const proposedReq: RequirementRecord = {
          id: reqId,
          projectId: identity.projectId,
          title: input.title,
          description: input.description || input.title,
          category: input.category || 'functional',
          status: 'REQUESTED',
          source: 'AI_PROPOSAL',
          authority: 'PROPOSED',
          priority: input.priority || 'should_have',
          parentRequirementId: input.parentRequirementId,
          dependsOn: input.dependsOn || [],
          provenance: {
            source: 'AI_PROPOSAL',
            verificationLevel: 'UNVERIFIED',
            confidence: 0.8,
            timestamp: new Date().toISOString()
          },
          acceptanceCriteria: criteria,
          relatedFiles: input.relatedFiles || [],
          relatedDecisions: [],
          linkedDecisionIds: [],
          linkedChangeIds: [],
          linkedVerificationIds: [],
          verificationEvidenceIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        doc.items[reqId] = proposedReq;
        StorageEngine.writeDocument(zenitchDir, 'requirements.json', doc, doc._version);

        return {
          action: 'PROPOSE',
          requirement: proposedReq,
          message: 'Proposed requirement ' + reqId + ' created with authority PROPOSED. Awaiting human confirmation before it can become authoritative.'
        };
      }

      // CONFIRM_PROPOSAL ACTION
      if (input.action === 'CONFIRM_PROPOSAL') {
        if (!input.requirementId) throw new Error('requirementId is required for CONFIRM_PROPOSAL.');
        const req = doc.items[input.requirementId];
        if (!req) throw new Error('Requirement ' + input.requirementId + ' not found.');

        req.authority = 'AUTHORITATIVE';
        req.provenance = {
          ...req.provenance,
          source: 'USER',
          verificationLevel: 'USER_CONFIRMED',
          confidence: 1.0,
          timestamp: new Date().toISOString()
        };
        req.updatedAt = new Date().toISOString();

        StorageEngine.writeDocument(zenitchDir, 'requirements.json', doc, doc._version);

        return {
          action: 'CONFIRM_PROPOSAL',
          requirement: req,
          message: 'Requirement ' + req.id + ' confirmed by human user. Now AUTHORITATIVE.'
        };
      }

      // ADD_CRITERION ACTION
      if (input.action === 'ADD_CRITERION') {
        if (!input.requirementId) throw new Error('requirementId is required for ADD_CRITERION.');
        if (!input.criterionDescription || input.criterionDescription.trim().length < 3) {
          throw new Error('criterionDescription must be at least 3 characters for ADD_CRITERION.');
        }

        const req = doc.items[input.requirementId];
        if (!req) throw new Error('Requirement ' + input.requirementId + ' not found.');

        const acId = generateId('AC');
        const newCriterion: AcceptanceCriterion = {
          id: acId,
          requirementId: req.id,
          description: input.criterionDescription,
          type: input.criterionType || 'FUNCTIONAL',
          status: input.criterionStatus || 'NOT_TESTED',
          verificationIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (!Array.isArray(req.acceptanceCriteria)) {
          req.acceptanceCriteria = [];
        }
        req.acceptanceCriteria.push(newCriterion);
        req.updatedAt = new Date().toISOString();

        StorageEngine.writeDocument(zenitchDir, 'requirements.json', doc, doc._version);

        return {
          action: 'ADD_CRITERION',
          criterion: newCriterion,
          requirementId: req.id,
          message: 'Added criterion ' + acId + ' to requirement ' + req.id + '.'
        };
      }

      // UPDATE_CRITERION ACTION
      if (input.action === 'UPDATE_CRITERION') {
        if (!input.requirementId) throw new Error('requirementId is required for UPDATE_CRITERION.');
        if (!input.criterionId) throw new Error('criterionId is required for UPDATE_CRITERION.');
        if (!input.criterionStatus) throw new Error('criterionStatus is required for UPDATE_CRITERION.');

        const req = doc.items[input.requirementId];
        if (!req) throw new Error('Requirement ' + input.requirementId + ' not found.');

        const criteriaList = Array.isArray(req.acceptanceCriteria) ? req.acceptanceCriteria : [];
        const criterion = criteriaList.find(c => typeof c === 'object' && c.id === input.criterionId) as AcceptanceCriterion | undefined;

        if (!criterion) {
          throw new Error('Criterion ' + input.criterionId + ' not found on requirement ' + req.id + '.');
        }

        // WAIVED requires explicit human authority and a reason
        if (input.criterionStatus === 'WAIVED') {
          if (!input.waivedReason || input.waivedReason.trim().length < 5) {
            throw new Error('Waiving an acceptance criterion strictly requires providing a non-empty waivedReason (at least 5 characters).');
          }
          if (input.actorIsUser !== true) {
            throw new Error('Waiving an acceptance criterion requires explicit human authority (actorIsUser: true). AI self-waiver is blocked.');
          }
          criterion.waivedReason = input.waivedReason;
          criterion.waivedBy = input.waivedBy || 'human_user';
        }

        if (input.criterionStatus === 'PASSED' && input.verificationEvidenceId) {
          if (!criterion.verificationIds) criterion.verificationIds = [];
          if (!criterion.verificationIds.includes(input.verificationEvidenceId)) {
            criterion.verificationIds.push(input.verificationEvidenceId);
          }
          if (!req.verificationEvidenceIds.includes(input.verificationEvidenceId)) {
            req.verificationEvidenceIds.push(input.verificationEvidenceId);
          }
        }

        criterion.status = input.criterionStatus;
        criterion.updatedAt = new Date().toISOString();
        req.updatedAt = new Date().toISOString();

        StorageEngine.writeDocument(zenitchDir, 'requirements.json', doc, doc._version);

        return {
          action: 'UPDATE_CRITERION',
          criterion,
          requirementId: req.id,
          message: 'Criterion ' + criterion.id + ' status updated to ' + criterion.status + '.'
        };
      }

      // SET_DEPENDENCIES ACTION
      if (input.action === 'SET_DEPENDENCIES') {
        if (!input.requirementId) throw new Error('requirementId is required for SET_DEPENDENCIES.');
        const req = doc.items[input.requirementId];
        if (!req) throw new Error('Requirement ' + input.requirementId + ' not found.');

        if (input.dependsOn !== undefined) {
          // Validate that all dependency IDs exist
          for (const depId of input.dependsOn) {
            if (!doc.items[depId]) {
              throw new Error('Dependency requirement ' + depId + ' does not exist in project memory.');
            }
          }
          req.dependsOn = input.dependsOn;
        }

        if (input.parentRequirementId !== undefined) {
          if (input.parentRequirementId && !doc.items[input.parentRequirementId]) {
            throw new Error('Parent requirement ' + input.parentRequirementId + ' does not exist in project memory.');
          }
          req.parentRequirementId = input.parentRequirementId;
        }

        req.updatedAt = new Date().toISOString();
        StorageEngine.writeDocument(zenitchDir, 'requirements.json', doc, doc._version);

        const depStatus = MemoryManager.computeDependencyStatus(req, doc.items);

        return {
          action: 'SET_DEPENDENCIES',
          requirementId: req.id,
          dependsOn: req.dependsOn,
          parentRequirementId: req.parentRequirementId,
          dependencyStatus: depStatus,
          message: 'Updated dependencies for requirement ' + req.id + '. Computed dependency status: ' + depStatus + '.'
        };
      }

      // LINK_CHANGE ACTION
      if (input.action === 'LINK_CHANGE') {
        if (!input.requirementId) throw new Error('requirementId is required for LINK_CHANGE.');
        if (!input.changeId) throw new Error('changeId is required for LINK_CHANGE.');

        const req = doc.items[input.requirementId];
        if (!req) throw new Error('Requirement ' + input.requirementId + ' not found.');

        if (!req.linkedChangeIds) req.linkedChangeIds = [];
        if (!req.linkedChangeIds.includes(input.changeId)) {
          req.linkedChangeIds.push(input.changeId);
        }
        req.updatedAt = new Date().toISOString();

        StorageEngine.writeDocument(zenitchDir, 'requirements.json', doc, doc._version);

        return {
          action: 'LINK_CHANGE',
          requirement: req,
          message: 'Linked change ' + input.changeId + ' to requirement ' + req.id + '.'
        };
      }

      // LINK_DECISION ACTION
      if (input.action === 'LINK_DECISION') {
        if (!input.requirementId) throw new Error('requirementId is required for LINK_DECISION.');
        if (!input.decisionId) throw new Error('decisionId is required for LINK_DECISION.');

        const req = doc.items[input.requirementId];
        if (!req) throw new Error('Requirement ' + input.requirementId + ' not found.');

        if (!req.linkedDecisionIds) req.linkedDecisionIds = [];
        if (!req.linkedDecisionIds.includes(input.decisionId)) {
          req.linkedDecisionIds.push(input.decisionId);
        }
        if (!req.relatedDecisions.includes(input.decisionId)) {
          req.relatedDecisions.push(input.decisionId);
        }
        req.updatedAt = new Date().toISOString();

        StorageEngine.writeDocument(zenitchDir, 'requirements.json', doc, doc._version);

        return {
          action: 'LINK_DECISION',
          requirement: req,
          message: 'Linked decision ' + input.decisionId + ' to requirement ' + req.id + '.'
        };
      }

      // UPDATE_STATUS ACTION
      if (input.action === 'UPDATE_STATUS') {
        if (!input.requirementId) throw new Error('requirementId is required for UPDATE_STATUS.');
        if (!input.newStatus) throw new Error('newStatus is required for UPDATE_STATUS.');

        const req = doc.items[input.requirementId];
        if (!req) throw new Error('Requirement ' + input.requirementId + ' not found.');

        // AI proposals cannot silently transition without human confirmation
        if (req.authority === 'PROPOSED' && input.newStatus !== 'REQUESTED' && input.newStatus !== 'REJECTED') {
          throw new Error('Cannot transition proposed requirement ' + req.id + ' before explicit human confirmation (CONFIRM_PROPOSAL).');
        }

        // Check if objective verification evidence exists in verification.json if transitioning to VERIFIED
        let hasVerificationEvidence = false;
        if (input.newStatus === 'VERIFIED') {
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

          if (input.verificationEvidenceId && verDoc.items[input.verificationEvidenceId]) {
            const ver = verDoc.items[input.verificationEvidenceId];
            if (ver.verdict === 'PASSED') {
              hasVerificationEvidence = true;
              if (!req.verificationEvidenceIds.includes(input.verificationEvidenceId)) {
                req.verificationEvidenceIds.push(input.verificationEvidenceId);
              }
              if (!req.linkedVerificationIds) req.linkedVerificationIds = [];
              if (!req.linkedVerificationIds.includes(input.verificationEvidenceId)) {
                req.linkedVerificationIds.push(input.verificationEvidenceId);
              }
            }
          } else if (req.verificationEvidenceIds.length > 0) {
            hasVerificationEvidence = req.verificationEvidenceIds.some(id => verDoc.items[id] && verDoc.items[id].verdict === 'PASSED');
          }
        }

        const relatedFiles = input.relatedFiles || req.relatedFiles;

        // Validate state transition through strict state machine
        RequirementStateMachine.validateTransition({
          currentStatus: req.status,
          targetStatus: input.newStatus,
          hasVerificationEvidence,
          hasRelatedFiles: relatedFiles && relatedFiles.length > 0,
          isApprovalTicketResolved: false // Cannot reach ACCEPTED through UPDATE_STATUS directly
        });

        req.status = input.newStatus;
        if (input.relatedFiles) req.relatedFiles = input.relatedFiles;
        req.updatedAt = new Date().toISOString();

        StorageEngine.writeDocument(zenitchDir, 'requirements.json', doc, doc._version);

        return {
          action: 'UPDATE_STATUS',
          requirement: req,
          message: 'Requirement ' + req.id + ' transitioned to ' + req.status + '.'
        };
      }

      // LINK_VERIFICATION ACTION
      if (input.action === 'LINK_VERIFICATION') {
        if (!input.requirementId) throw new Error('requirementId is required for LINK_VERIFICATION.');
        if (!input.verificationEvidenceId) throw new Error('verificationEvidenceId is required for LINK_VERIFICATION.');

        const req = doc.items[input.requirementId];
        if (!req) throw new Error('Requirement ' + input.requirementId + ' not found.');

        if (!req.verificationEvidenceIds.includes(input.verificationEvidenceId)) {
          req.verificationEvidenceIds.push(input.verificationEvidenceId);
        }
        if (!req.linkedVerificationIds) req.linkedVerificationIds = [];
        if (!req.linkedVerificationIds.includes(input.verificationEvidenceId)) {
          req.linkedVerificationIds.push(input.verificationEvidenceId);
        }
        req.updatedAt = new Date().toISOString();

        StorageEngine.writeDocument(zenitchDir, 'requirements.json', doc, doc._version);

        return {
          action: 'LINK_VERIFICATION',
          requirement: req,
          message: 'Linked verification evidence ' + input.verificationEvidenceId + ' to requirement ' + req.id + '.'
        };
      }

      throw new Error('Unsupported action: ' + input.action);
    });
  }

  // Delegated Change Manager operations
  public static async manageChange(rawInput: z.input<typeof ManageChangeInputSchema>): Promise<any> {
    return ChangeManager.manageChange(rawInput);
  }

  public static async inspectChanges(rawInput: z.input<typeof InspectChangesInputSchema>): Promise<any> {
    return ChangeManager.inspectChanges(rawInput);
  }
}
