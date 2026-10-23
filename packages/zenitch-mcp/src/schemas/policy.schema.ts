import { z } from 'zod';
import { ProductAnalysisOutputSchema } from './product.schema.js';
import { ProjectInspectionOutputSchema } from './project.schema.js';

export const PolicyCategoryEnum = z.enum([
  'accessibility',
  'visual_consistency',
  'typography',
  'color_contrast',
  'spacing_layout',
  'component_reuse',
  'interaction_design',
  'responsive_behavior',
  'performance_constraints'
]);

export const PolicySeverityEnum = z.enum([
  'ERROR',
  'WARNING',
  'INFO'
]);

export const PolicyScopeEnum = z.enum([
  'global',
  'product_specific',
  'project_specific',
  'custom'
]);

export const PolicyDefinitionSchema = z.object({
  id: z.string().min(1, 'Policy ID required'),
  name: z.string().min(1, 'Policy name required'),
  category: PolicyCategoryEnum,
  severity: PolicySeverityEnum,
  scope: PolicyScopeEnum.default('custom'),
  description: z.string(),
  isMandatory: z.boolean().default(true),
  explanation: z.string(),
  remediation: z.string()
});

export const PolicyFindingSchema = z.object({
  policyId: z.string(),
  policyName: z.string(),
  category: PolicyCategoryEnum,
  severity: PolicySeverityEnum,
  isMandatory: z.boolean(),
  evidence: z.string(),
  explanation: z.string(),
  recommendedCorrection: z.string(),
  isAutomaticallyVerifiable: z.boolean()
});

export const PolicyConflictSchema = z.object({
  conflictingPolicyIds: z.array(z.string()).min(2),
  conflictReason: z.string(),
  resolution: z.string()
});

export const PolicyEvaluationInputSchema = z.object({
  proposedMarkupOrComponent: z.string().min(1, 'Proposed markup or component code is required'),
  productDomain: z.string().optional(),
  productContext: ProductAnalysisOutputSchema.optional(),
  projectContext: ProjectInspectionOutputSchema.optional(),
  customPolicies: z.array(PolicyDefinitionSchema).optional(),
  disabledPolicyIds: z.array(z.string()).optional(),
  strictMode: z.boolean().default(true)
});

export const PolicyEvaluationOutputSchema = z.object({
  compliant: z.boolean(),
  score: z.number().min(0).max(100),
  findings: z.array(PolicyFindingSchema),
  policyConflicts: z.array(PolicyConflictSchema),
  summary: z.object({
    totalEvaluated: z.number().int().nonnegative(),
    errorsCount: z.number().int().nonnegative(),
    warningsCount: z.number().int().nonnegative(),
    infoCount: z.number().int().nonnegative()
  }),
  contextualDistinction: z.object({
    userProvidedFacts: z.array(z.string()),
    detectedProjectInformation: z.array(z.string()),
    inferredAssumptions: z.array(z.string()),
    mandatoryRequirements: z.array(z.string()),
    optionalRecommendations: z.array(z.string())
  }),
  cleanCodeRecommendation: z.string().optional()
});

export type PolicyCategory = z.infer<typeof PolicyCategoryEnum>;
export type PolicySeverity = z.infer<typeof PolicySeverityEnum>;
export type PolicyDefinition = z.infer<typeof PolicyDefinitionSchema>;
export type PolicyFinding = z.infer<typeof PolicyFindingSchema>;
export type PolicyConflict = z.infer<typeof PolicyConflictSchema>;
export type PolicyEvaluationInput = z.input<typeof PolicyEvaluationInputSchema>;
export type PolicyEvaluationOutput = z.infer<typeof PolicyEvaluationOutputSchema>;
