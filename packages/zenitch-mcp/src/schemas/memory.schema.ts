import { z } from 'zod';
import { ProductDomainEnum } from './product.schema.js';

export const SourceTypeEnum = z.enum([
  'USER',
  'DOCUMENT',
  'EXISTING_CODE',
  'TEST',
  'AI_PROPOSAL',
  'SYSTEM',
  'AI_INFERENCE',
  'PROJECT_CODE',
  'TEST_RESULT',
  'SYSTEM_RULE',
  'EXTERNAL_REFERENCE'
]);

export const VerificationLevelEnum = z.enum([
  'USER_CONFIRMED',
  'TEST_VERIFIED',
  'CODE_OBSERVED',
  'UNVERIFIED'
]);

export const ProvenanceSchema = z.object({
  source: SourceTypeEnum,
  verificationLevel: VerificationLevelEnum,
  confidence: z.number().min(0).max(1).default(1),
  externalReferenceUrl: z.string().optional(),
  sourceReference: z.string().optional(),
  authorSessionId: z.string().optional(),
  timestamp: z.string()
});

export const RequirementStatusEnum = z.enum([
  'REQUESTED',
  'PLANNED',
  'IMPLEMENTED',
  'TESTED',
  'VERIFIED',
  'PENDING_APPROVAL',
  'ACCEPTED',
  'REJECTED',
  'BLOCKED',
  'UNVERIFIED'
]);

export const RequirementAuthorityEnum = z.enum([
  'AUTHORITATIVE',
  'PROPOSED'
]);

export const CriterionTypeEnum = z.enum([
  'FUNCTIONAL',
  'VISUAL',
  'RESPONSIVE',
  'ACCESSIBILITY',
  'PERFORMANCE',
  'SECURITY',
  'DATA',
  'INTEGRATION',
  'DEPLOYMENT',
  'OTHER'
]);

export const CriterionStatusEnum = z.enum([
  'NOT_TESTED',
  'IN_PROGRESS',
  'PASSED',
  'FAILED',
  'BLOCKED',
  'WAIVED'
]);

export const AcceptanceCriterionSchema = z.object({
  id: z.string(),
  requirementId: z.string().optional(),
  description: z.string(),
  type: CriterionTypeEnum.default('FUNCTIONAL'),
  status: CriterionStatusEnum.default('NOT_TESTED'),
  verificationIds: z.array(z.string()).default([]),
  waivedReason: z.string().optional(),
  waivedBy: z.string().optional(),
  provenance: ProvenanceSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ProjectIdentityHierarchySchema = z.object({
  gitRemoteUrl: z.string().optional(),
  gitInitialCommitHash: z.string().optional(),
  packageManifestName: z.string().optional(),
  localFallbackId: z.string()
});

export const ProjectContextSchema = z.object({
  schemaVersion: z.string().default('1.1.0'),
  projectId: z.string(),
  projectName: z.string(),
  projectRoot: z.string(),
  identityHierarchy: ProjectIdentityHierarchySchema,
  domain: ProductDomainEnum,
  primaryUserGoal: z.string(),
  targetAudience: z.string().default('general_users'),
  stylingSystem: z.string().default('tailwind'),
  detectedFramework: z.string().default('react'),
  activeThemePolicy: z.enum(['light_only', 'dark_only', 'adaptive_system', 'user_toggle']).default('adaptive_system'),
  _version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const UserPreferenceSchema = z.object({
  id: z.string(),
  category: z.enum(['visual_style', 'workflow', 'tooling', 'accessibility']),
  preference: z.string(),
  rationale: z.string(),
  scope: z.literal('global_user').default('global_user'),
  provenance: ProvenanceSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ProjectConstraintSchema = z.object({
  id: z.string(),
  title: z.string(),
  rule: z.string(),
  rationale: z.string(),
  enforcementLevel: z.enum(['STRICT_BLOCK', 'WARNING']),
  linkedDecisionId: z.string().optional(),
  provenance: ProvenanceSchema,
  applicableSubsystems: z.array(z.enum(['policy', 'tokens', 'components', 'animations'])).default(['policy']),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const RequirementSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  title: z.string(),
  description: z.string(),
  category: z.enum(['functional', 'ergonomics', 'accessibility', 'performance', 'visual']).default('functional'),
  status: RequirementStatusEnum.default('REQUESTED'),
  source: SourceTypeEnum.optional(),
  authority: RequirementAuthorityEnum.optional(),
  priority: z.enum(['must_have', 'should_have', 'nice_to_have']).default('must_have'),
  parentRequirementId: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  provenance: ProvenanceSchema,
  acceptanceCriteria: z.array(z.union([AcceptanceCriterionSchema, z.string()])).default([]),
  relatedFiles: z.array(z.string()).default([]),
  relatedDecisions: z.array(z.string()).default([]),
  linkedDecisionIds: z.array(z.string()).optional(),
  linkedChangeIds: z.array(z.string()).optional(),
  linkedVerificationIds: z.array(z.string()).optional(),
  activeApprovalTicketId: z.string().optional(),
  verificationEvidenceIds: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const DecisionSchema = z.object({
  id: z.string(),
  title: z.string(),
  decision: z.string(),
  rationale: z.string(),
  disposition: z.enum(['ACCEPTED', 'REJECTED', 'SUPERSEDED']),
  scope: z.enum(['global', 'component', 'layout', 'tokens']).default('global'),
  targetComponentOrArea: z.string().optional(),
  rejectedAlternatives: z.array(z.string()).default([]),
  generatedConstraintId: z.string().optional(),
  supersededBy: z.string().optional(),
  provenance: ProvenanceSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});


export const VerificationEvidenceItemSchema = z.object({
  type: z.enum([
    'PAGE_REACHED',
    'ELEMENT_FOUND',
    'ELEMENT_VISIBLE',
    'ELEMENT_INTERACTED',
    'TEXT_MATCH',
    'URL_MATCH',
    'API_RESPONSE',
    'OVERFLOW_CHECK',
    'CONSOLE_ERROR',
    'SCREENSHOT_REFERENCE'
  ]),
  summary: z.string(),
  target: z.string().optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  timestamp: z.string()
});

export const RuntimeActionSchema = z.object({
  action: z.enum([
    'NAVIGATE',
    'CLICK',
    'FILL',
    'SELECT',
    'CHECK_VISIBLE',
    'CHECK_TEXT',
    'CHECK_URL',
    'CHECK_ATTRIBUTE',
    'WAIT_FOR',
    'SCREENSHOT'
  ]),
  target: z.string().optional(),
  value: z.string().optional(),
  attribute: z.string().optional(),
  expected: z.string().optional(),
  timeoutMs: z.number().int().positive().optional()
});

export const StaticCheckSchema = z.object({
  type: z.enum(['ROUTE_EXISTS', 'COMPONENT_EXISTS', 'TEXT_EXISTS', 'SELECTOR_EXISTS', 'TEST_PASSES']),
  path: z.string().optional(),
  target: z.string().optional(),
  expectedText: z.string().optional()
});

export const VerifyInputSchema = z.object({
  projectRoot: z.string().optional(),
  mode: z.enum(['static', 'runtime', 'responsive']).optional(),
  requirementId: z.string().optional(),
  acceptanceCriterionId: z.string().optional(),
  route: z.string().optional(),
  viewport: z.enum(['desktop', 'tablet', 'mobile']).optional(),
  actions: z.array(RuntimeActionSchema).optional(),
  staticChecks: z.array(StaticCheckSchema).optional(),
  devServerUrl: z.string().optional(),
  forceReverify: z.boolean().optional()
});

export const InspectVerificationInputSchema = z.object({
  projectRoot: z.string().optional(),
  requirementId: z.string().optional(),
  acceptanceCriterionId: z.string().optional(),
  mode: z.enum(['concise', 'standard', 'detailed']).optional(),
  includeOutdated: z.boolean().optional()
});

export const VerificationRecordSchema = z.object({
  id: z.string(),
  requirementId: z.string().optional(),
  acceptanceCriterionId: z.string().optional(),
  changeId: z.string().optional(),
  verificationType: z.enum(['STATIC', 'RUNTIME', 'RESPONSIVE', 'ACCESSIBILITY', 'PERFORMANCE', 'INTEGRATION']).optional(),
  verificationMethod: z.enum([
    'AUTOMATED_TEST',
    'API_CONTRACT',
    'PAGE_QUALITY_AUDIT',
    'VISUAL_REGRESSION',
    'HARDWARE_BUDGET',
    'STATIC_ANALYSIS',
    'MANUAL_EVIDENCE',
    'RUNTIME_VERIFICATION',
    'RESPONSIVE_CHECK'
  ]),
  verdict: z.enum(['PASSED', 'FAILED', 'INCONCLUSIVE', 'BLOCKED', 'OUTDATED']),
  evidenceSummary: z.string(),
  objectiveMetrics: z.record(z.any()).optional(),
  evidence: z.array(VerificationEvidenceItemSchema).optional(),
  durationMs: z.number().optional(),
  reusedCachedEvidence: z.boolean().optional(),
  environment: z.record(z.any()).optional(),
  provenance: ProvenanceSchema,
  timestamp: z.string()
});

export const ChangeTypeEnum = z.enum([
  'FEATURE',
  'BUG_FIX',
  'REFACTOR',
  'UI_CHANGE',
  'ACCESSIBILITY',
  'PERFORMANCE',
  'SECURITY',
  'CONFIGURATION',
  'DEPENDENCY',
  'DOCUMENTATION',
  'TEST',
  'DEPLOYMENT',
  'OTHER'
]);

export const ChangeSourceEnum = z.enum([
  'AI_REPORTED',
  'GIT_OBSERVED',
  'HUMAN_REPORTED',
  'SYSTEM_DETECTED'
]);

export const ChangeActorEnum = z.enum([
  'AI',
  'HUMAN',
  'SYSTEM'
]);

export const ChangeRecordSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  type: ChangeTypeEnum.default('FEATURE'),
  summary: z.string(),
  reason: z.string().optional(),
  source: ChangeSourceEnum.default('AI_REPORTED'),
  actor: ChangeActorEnum.default('AI'),
  files: z.array(z.string()).default([]),
  affectedFiles: z.array(z.string()).default([]),
  requirementIds: z.array(z.string()).default([]),
  linkedRequirementId: z.string().optional(),
  decisionIds: z.array(z.string()).default([]),
  verificationIds: z.array(z.string()).default([]),
  verificationStatus: z.enum(['PENDING', 'PASSED', 'FAILED']).default('PENDING'),
  gitCommit: z.string().optional(),
  unlinkedChange: z.boolean().default(false),
  previousStateSnippet: z.string().optional(),
  newStateSnippet: z.string().optional(),
  provenance: ProvenanceSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional()
});

export const ApprovalTicketSchema = z.object({
  ticketId: z.string(),
  requirementId: z.string(),
  title: z.string(),
  proposedState: z.literal('ACCEPTED'),
  evidenceSummary: z.array(z.string()).default([]),
  affectedFiles: z.array(z.string()).default([]),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
  humanApprovalToken: z.string().optional(),
  createdAt: z.string(),
  resolvedAt: z.string().optional(),
  resolvedBy: z.string().optional(),
  rejectionFeedback: z.string().optional()
});

export const CheckpointSchema = z.object({
  projectId: z.string(),
  gitCommit: z.string().optional(),
  timestamp: z.string(),
  _version: z.number().default(0),
  updatedAt: z.string().optional(),
  trackedState: z.object({
    modifiedFiles: z.array(z.string()).default([]),
    addedFiles: z.array(z.string()).default([]),
    deletedFiles: z.array(z.string()).default([])
  }).default({
    modifiedFiles: [],
    addedFiles: [],
    deletedFiles: []
  }),
  summary: z.string().optional()
});

// Tool Input Schemas

export const GetProjectContextInputSchema = z.object({
  projectRoot: z.string().optional(),
  query: z.string().optional(),
  scope: z.string().optional(),
  mode: z.enum(['concise', 'standard', 'detailed']).default('concise'),
  includeNegativeConstraints: z.boolean().default(true),
  statusFilter: z.array(RequirementStatusEnum).optional()
});

export const RecordDecisionInputSchema = z.object({
  projectRoot: z.string().optional(),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  decision: z.string().min(5, 'Decision statement must be at least 5 characters'),
  rationale: z.string().min(5, 'Rationale must be at least 5 characters'),
  disposition: z.enum(['ACCEPTED', 'REJECTED']),
  scope: z.enum(['global', 'component', 'layout', 'tokens']).default('global'),
  targetComponentOrArea: z.string().optional(),
  rejectedAlternatives: z.array(z.string()).optional(),
  isGeneralPreference: z.boolean().default(false),
  sourceType: SourceTypeEnum.default('USER'),
  externalReferenceUrl: z.string().optional()
});

export const ManageRequirementInputSchema = z.object({
  projectRoot: z.string().optional(),
  action: z.enum([
    'CREATE',
    'UPDATE_STATUS',
    'LINK_VERIFICATION',
    'REQUEST_APPROVAL',
    'RESOLVE_APPROVAL',
    'ADD_CRITERION',
    'UPDATE_CRITERION',
    'LINK_CHANGE',
    'LINK_DECISION',
    'SET_DEPENDENCIES',
    'PROPOSE',
    'CONFIRM_PROPOSAL'
  ]),
  requirementId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.enum(['functional', 'ergonomics', 'accessibility', 'performance', 'visual']).optional(),
  newStatus: RequirementStatusEnum.optional(),
  priority: z.enum(['must_have', 'should_have', 'nice_to_have']).optional(),
  source: SourceTypeEnum.optional(),
  parentRequirementId: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(z.union([AcceptanceCriterionSchema, z.string()])).optional(),
  verificationEvidenceId: z.string().optional(),
  relatedFiles: z.array(z.string()).optional(),
  approvalTicketId: z.string().optional(),
  approvalAction: z.enum(['APPROVE', 'REJECT']).optional(),
  approvalFeedback: z.string().optional(),
  humanApprovalToken: z.string().optional(),

  // Phase 2 specific input fields:
  criterionId: z.string().optional(),
  criterionDescription: z.string().optional(),
  criterionType: CriterionTypeEnum.optional(),
  criterionStatus: CriterionStatusEnum.optional(),
  waivedReason: z.string().optional(),
  waivedBy: z.string().optional(),
  actorIsUser: z.boolean().optional(),
  changeId: z.string().optional(),
  decisionId: z.string().optional()
});

export const ManageChangeInputSchema = z.object({
  projectRoot: z.string().optional(),
  action: z.enum([
    'CREATE',
    'UPDATE',
    'LINK_REQUIREMENT',
    'LINK_DECISION',
    'LINK_VERIFICATION'
  ]),
  changeId: z.string().optional(),
  type: ChangeTypeEnum.optional(),
  summary: z.string().optional(),
  reason: z.string().optional(),
  source: ChangeSourceEnum.optional(),
  actor: ChangeActorEnum.optional(),
  files: z.array(z.string()).optional(),
  requirementIds: z.array(z.string()).optional(),
  requirementId: z.string().optional(),
  decisionIds: z.array(z.string()).optional(),
  decisionId: z.string().optional(),
  verificationIds: z.array(z.string()).optional(),
  verificationId: z.string().optional(),
  gitCommit: z.string().optional(),
  unlinkedChange: z.boolean().optional()
});

export const InspectChangesInputSchema = z.object({
  projectRoot: z.string().optional(),
  mode: z.enum(['concise', 'standard', 'detailed']).default('concise'),
  includeDiff: z.boolean().default(false),
  maxFiles: z.number().int().positive().default(50)
});

export type ProvenanceRecord = z.infer<typeof ProvenanceSchema>;
export type RequirementStatus = z.infer<typeof RequirementStatusEnum>;
export type RequirementAuthority = z.infer<typeof RequirementAuthorityEnum>;
export type CriterionType = z.infer<typeof CriterionTypeEnum>;
export type CriterionStatus = z.infer<typeof CriterionStatusEnum>;
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;
export type ProjectContextRecord = z.infer<typeof ProjectContextSchema>;
export type UserPreferenceRecord = z.infer<typeof UserPreferenceSchema>;
export type ProjectConstraintRecord = z.infer<typeof ProjectConstraintSchema>;
export type RequirementRecord = z.infer<typeof RequirementSchema>;
export type DecisionRecord = z.infer<typeof DecisionSchema>;
export type VerificationRecord = z.infer<typeof VerificationRecordSchema>;
export type VerificationEvidenceItem = z.infer<typeof VerificationEvidenceItemSchema>;
export type RuntimeAction = z.infer<typeof RuntimeActionSchema>;
export type StaticCheck = z.infer<typeof StaticCheckSchema>;
export type VerifyInput = z.infer<typeof VerifyInputSchema>;
export type InspectVerificationInput = z.infer<typeof InspectVerificationInputSchema>;

export type ChangeType = z.infer<typeof ChangeTypeEnum>;
export type ChangeSource = z.infer<typeof ChangeSourceEnum>;
export type ChangeActor = z.infer<typeof ChangeActorEnum>;
export type ChangeRecord = z.infer<typeof ChangeRecordSchema>;
export type ApprovalTicket = z.infer<typeof ApprovalTicketSchema>;
export type CheckpointRecord = z.infer<typeof CheckpointSchema>;
export type GetProjectContextInput = z.infer<typeof GetProjectContextInputSchema>;
export type RecordDecisionInput = z.infer<typeof RecordDecisionInputSchema>;
export type ManageRequirementInput = z.infer<typeof ManageRequirementInputSchema>;
export type ManageChangeInput = z.infer<typeof ManageChangeInputSchema>;
export type InspectChangesInput = z.infer<typeof InspectChangesInputSchema>;

export const PreferencesFileSchema = z.object({
  schemaVersion: z.string().default('1.1.0'),
  projectId: z.string(),
  _version: z.number().default(0),
  updatedAt: z.string(),
  items: z.record(UserPreferenceSchema).default({})
});

export const ConstraintsFileSchema = z.object({
  schemaVersion: z.string().default('1.1.0'),
  projectId: z.string(),
  _version: z.number().default(0),
  updatedAt: z.string(),
  items: z.record(ProjectConstraintSchema).default({})
});

export const DecisionsFileSchema = z.object({
  schemaVersion: z.string().default('1.1.0'),
  projectId: z.string(),
  _version: z.number().default(0),
  updatedAt: z.string(),
  items: z.record(DecisionSchema).default({})
});

export const RequirementsFileSchema = z.object({
  schemaVersion: z.string().default('1.1.0'),
  projectId: z.string(),
  _version: z.number().default(0),
  updatedAt: z.string(),
  items: z.record(RequirementSchema).default({}),
  tickets: z.record(ApprovalTicketSchema).default({})
});

export const ChangesFileSchema = z.object({
  schemaVersion: z.string().default('1.1.0'),
  projectId: z.string(),
  _version: z.number().default(0),
  updatedAt: z.string(),
  items: z.record(ChangeRecordSchema).default({})
});

export const VerificationFileSchema = z.object({
  schemaVersion: z.string().default('1.1.0'),
  projectId: z.string(),
  _version: z.number().default(0),
  updatedAt: z.string(),
  items: z.record(VerificationRecordSchema).default({})
});

export const CheckpointFileSchema = CheckpointSchema;

// ==========================================
// PHASE 4: RELEASE READINESS SCHEMAS
// ==========================================

export const ReadinessStateEnum = z.enum([
  'READY',
  'BLOCKED',
  'NEEDS_ATTENTION',
  'NOT_ASSESSED'
]);

export const ReadinessCategoryEnum = z.enum([
  'REQUIREMENTS',
  'VERIFICATION',
  'BUILD',
  'TESTS',
  'SECURITY',
  'CONFIGURATION',
  'DEPENDENCIES',
  'DEPLOYMENT',
  'DOCUMENTATION',
  'SOURCE_CONTROL'
]);

export const ReadinessSeverityEnum = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'INFO'
]);

export const ReadinessFindingStatusEnum = z.enum([
  'PASS',
  'FAIL',
  'WARN',
  'INFO'
]);

export const ReadinessFindingSchema = z.object({
  id: z.string(),
  category: ReadinessCategoryEnum,
  severity: ReadinessSeverityEnum,
  status: ReadinessFindingStatusEnum,
  isBlocking: z.boolean().default(false),
  summary: z.string(),
  remediation: z.string().optional(),
  evidence: z.record(z.any()).optional(),
  requirementIds: z.array(z.string()).optional(),
  criterionIds: z.array(z.string()).optional(),
  changeIds: z.array(z.string()).optional(),
  verificationIds: z.array(z.string()).optional(),
  affectedFiles: z.array(z.string()).optional(),
  timestamp: z.string()
});

export const CategoryReadinessSchema = z.object({
  category: ReadinessCategoryEnum,
  status: ReadinessStateEnum,
  summary: z.string(),
  blockingFindings: z.number().default(0),
  attentionFindings: z.number().default(0),
  findings: z.array(ReadinessFindingSchema).default([])
});

export const ReleaseReadinessRecordSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  status: ReadinessStateEnum,
  summary: z.string(),
  blockingFindingsCount: z.number().default(0),
  attentionFindingsCount: z.number().default(0),
  infoFindingsCount: z.number().default(0),
  categories: z.record(CategoryReadinessSchema).default({}),
  provenance: ProvenanceSchema,
  reusedEvidence: z.boolean().optional().default(false),
  timestamp: z.string(),
  durationMs: z.number().optional()
});

export const CheckReleaseReadinessInputSchema = z.object({
  projectRoot: z.string().optional(),
  categories: z.array(ReadinessCategoryEnum).optional(),
  mode: z.enum(['concise', 'standard', 'detailed']).optional(),
  forceReassess: z.boolean().optional()
});

export const InspectReleaseReadinessInputSchema = z.object({
  projectRoot: z.string().optional(),
  category: ReadinessCategoryEnum.optional(),
  severity: ReadinessSeverityEnum.optional(),
  mode: z.enum(['concise', 'standard', 'detailed']).optional()
});

export const ReadinessFileSchema = z.object({
  schemaVersion: z.string().default('1.3.0'),
  projectId: z.string(),
  _version: z.number().default(0),
  updatedAt: z.string(),
  latestAssessment: ReleaseReadinessRecordSchema.optional(),
  history: z.record(ReleaseReadinessRecordSchema).default({})
});

export type ReadinessState = z.infer<typeof ReadinessStateEnum>;
export type ReadinessCategory = z.infer<typeof ReadinessCategoryEnum>;
export type ReadinessSeverity = z.infer<typeof ReadinessSeverityEnum>;
export type ReadinessFindingStatus = z.infer<typeof ReadinessFindingStatusEnum>;
export type ReadinessFinding = z.infer<typeof ReadinessFindingSchema>;
export type CategoryReadiness = z.infer<typeof CategoryReadinessSchema>;
export type ReleaseReadinessRecord = z.infer<typeof ReleaseReadinessRecordSchema>;
export type CheckReleaseReadinessInput = z.infer<typeof CheckReleaseReadinessInputSchema>;
export type InspectReleaseReadinessInput = z.infer<typeof InspectReleaseReadinessInputSchema>;
export type ReadinessFile = z.infer<typeof ReadinessFileSchema>;

// ==========================================
// PHASE 5: ENGINEERING IMPACT SCHEMAS
// ==========================================

export const ImpactRiskLevelEnum = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
]);

export const ImpactAnalysisStatusEnum = z.enum([
  'COMPLETE',
  'PARTIAL'
]);

export const RecommendedVerificationSchema = z.object({
  id: z.string(),
  description: z.string(),
  suggestedMethod: z.enum([
    'AUTOMATED_TEST',
    'API_CONTRACT',
    'PAGE_QUALITY_AUDIT',
    'VISUAL_REGRESSION',
    'HARDWARE_BUDGET',
    'STATIC_ANALYSIS',
    'MANUAL_EVIDENCE',
    'RUNTIME_VERIFICATION',
    'RESPONSIVE_CHECK'
  ]).default('STATIC_ANALYSIS'),
  target: z.string().optional(),
  priority: z.enum(['MUST_VERIFY', 'SHOULD_VERIFY', 'OPTIONAL']).default('SHOULD_VERIFY')
});

export const ImpactRecordSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  changeId: z.string(),
  affectedFiles: z.array(z.string()).default([]),
  affectedComponents: z.array(z.string()).default([]),
  affectedRoutes: z.array(z.string()).default([]),
  affectedRequirements: z.array(z.string()).default([]),
  affectedCriteria: z.array(z.string()).default([]),
  affectedDependencies: z.array(z.string()).default([]),
  riskLevel: ImpactRiskLevelEnum.default('MEDIUM'),
  reasons: z.array(z.string()).default([]),
  recommendedVerifications: z.array(z.union([RecommendedVerificationSchema, z.string()])).default([]),
  analysisStatus: ImpactAnalysisStatusEnum.default('COMPLETE'),
  partialReason: z.string().optional(),
  traversalDepth: z.number().default(1),
  visitedFilesCount: z.number().default(0),
  confidence: z.number().min(0).max(1).default(1.0),
  fingerprint: z.string().optional(),
  provenance: ProvenanceSchema,
  reusedEvidence: z.boolean().optional().default(false),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const AnalyzeChangeImpactInputSchema = z.object({
  projectRoot: z.string().optional(),
  changeId: z.string().min(1, 'changeId is required'),
  depth: z.number().int().min(1).max(3).optional().default(1),
  forceRefresh: z.boolean().optional().default(false)
});

export const InspectImpactInputSchema = z.object({
  projectRoot: z.string().optional(),
  changeId: z.string().optional(),
  requirementId: z.string().optional(),
  route: z.string().optional(),
  component: z.string().optional(),
  riskLevel: ImpactRiskLevelEnum.optional(),
  mode: z.enum(['concise', 'standard', 'detailed']).optional().default('standard')
});

export const ImpactFileSchema = z.object({
  schemaVersion: z.string().default('1.4.0'),
  projectId: z.string(),
  _version: z.number().default(0),
  updatedAt: z.string(),
  items: z.record(ImpactRecordSchema).default({})
});

export type ImpactRiskLevel = z.infer<typeof ImpactRiskLevelEnum>;
export type ImpactAnalysisStatus = z.infer<typeof ImpactAnalysisStatusEnum>;
export type RecommendedVerification = z.infer<typeof RecommendedVerificationSchema>;
export type ImpactRecord = z.infer<typeof ImpactRecordSchema>;
export type AnalyzeChangeImpactInput = z.infer<typeof AnalyzeChangeImpactInputSchema>;
export type InspectImpactInput = z.infer<typeof InspectImpactInputSchema>;
export type ImpactFile = z.infer<typeof ImpactFileSchema>;
