import { z } from 'zod';

export const PHASE6_SCHEMA_VERSION = '1.5.0';

export const ArchitectureFindingCategoryEnum = z.enum([
  'DEPENDENCY_CYCLE',
  'LAYER_RULE_VIOLATION',
  'COMPLEXITY_BOUNDARY',
  'SWALLOWED_ERROR',
  'UNREFERENCED_DECLARED_DEPENDENCY',
  'DECISION_TRACEABILITY_VIOLATION'
]);
export type ArchitectureFindingCategory = z.infer<typeof ArchitectureFindingCategoryEnum>;

export const ArchitectureFindingSeverityEnum = z.enum([
  'INFO',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
]);
export type ArchitectureFindingSeverity = z.infer<typeof ArchitectureFindingSeverityEnum>;

export const ArchitectureFindingEvidenceSchema = z.object({
  metricName: z.string(),
  measuredValue: z.union([z.number(), z.string()]),
  threshold: z.union([z.number(), z.string()]).optional(),
  trace: z.array(z.string()).optional(),
  lineNumbers: z.array(z.number()).optional(),
  details: z.string().optional()
});
export type ArchitectureFindingEvidence = z.infer<typeof ArchitectureFindingEvidenceSchema>;

export const ArchitectureFindingSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  category: ArchitectureFindingCategoryEnum,
  severity: ArchitectureFindingSeverityEnum,
  factConfidence: z.number().default(1.0),
  title: z.string(),
  fact: z.string(),
  signal: z.string(),
  potentialRisk: z.string(),
  recommendedAction: z.string(),
  affectedFiles: z.array(z.string()),
  evidence: ArchitectureFindingEvidenceSchema,
  relatedRequirementIds: z.array(z.string()).default([]),
  relatedDecisionIds: z.array(z.string()).default([])
});
export type ArchitectureFinding = z.infer<typeof ArchitectureFindingSchema>;

export const ArchitectureMetricsSchema = z.object({
  totalFilesScanned: z.number(),
  totalModulesAnalyzed: z.number(),
  circularDependencyCount: z.number(),
  layerViolationCount: z.number(),
  complexityViolationCount: z.number(),
  swallowedErrorCount: z.number(),
  unreferencedDependencyCount: z.number(),
  boundaryReached: z.boolean(),
  partialEvaluation: z.boolean(),
  boundariesEnforced: z.array(z.string()).default([])
});
export type ArchitectureMetrics = z.infer<typeof ArchitectureMetricsSchema>;

export const ArchitectureCategoryBreakdownSchema = z.object({
  status: z.enum(['HEALTHY', 'WARNING', 'VIOLATION']),
  findingsCount: z.number()
});
export type ArchitectureCategoryBreakdown = z.infer<typeof ArchitectureCategoryBreakdownSchema>;

export const ArchitectureRecordSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  timestamp: z.string(),
  headCommit: z.string().optional(),
  status: z.enum(['HEALTHY', 'NEEDS_ATTENTION', 'DEGRADED']),
  summary: z.string(),
  metrics: ArchitectureMetricsSchema,
  categories: z.record(ArchitectureCategoryBreakdownSchema).default({}),
  findings: z.array(ArchitectureFindingSchema),
  reusedEvidence: z.boolean().default(false),
  durationMs: z.number()
});
export type ArchitectureRecord = z.infer<typeof ArchitectureRecordSchema>;

export const ArchitectureFileSchema = z.object({
  schemaVersion: z.string().default('1.5.0'),
  version: z.string().default('1.5.0'),
  projectId: z.string(),
  _version: z.number().default(0),
  updatedAt: z.string(),
  latestAssessment: ArchitectureRecordSchema.optional(),
  history: z.array(ArchitectureRecordSchema).default([])
});
export type ArchitectureFile = z.infer<typeof ArchitectureFileSchema>;

export const AnalyzeArchitectureInputSchema = z.object({
  projectRoot: z.string().optional(),
  forceReassess: z.boolean().optional(),
  forceRefresh: z.boolean().optional(),
  categories: z.array(ArchitectureFindingCategoryEnum).optional(),
  mode: z.enum(['concise', 'standard', 'detailed']).optional().default('concise')
});
export type AnalyzeArchitectureInput = z.input<typeof AnalyzeArchitectureInputSchema>;

export const InspectArchitectureInputSchema = z.object({
  projectRoot: z.string().optional(),
  assessmentId: z.string().optional(),
  category: ArchitectureFindingCategoryEnum.optional(),
  minSeverity: ArchitectureFindingSeverityEnum.optional(),
  severity: ArchitectureFindingSeverityEnum.optional(),
  ruleId: z.string().optional(),
  mode: z.enum(['concise', 'standard', 'detailed']).optional().default('concise'),
  detailLevel: z.enum(['concise', 'standard', 'detailed']).optional()
});
export type InspectArchitectureInput = z.input<typeof InspectArchitectureInputSchema>;
