import { z } from 'zod';

export const AnimationTypeEnum = z.enum([
  'css_transition',
  'css_keyframe',
  'gsap_scroll_trigger',
  'motion_spring',
  'canvas_2d',
  'webgl_threejs',
  'webgl_shader'
]);

export const PropertyCategoryEnum = z.enum([
  'composite_friendly',
  'paint_triggering',
  'layout_reflow',
  'gpu_expensive_paint',
  'ambiguous_catchall',
  'unknown_or_context_dependent'
]);

export const PipelineStageEnum = z.enum([
  'composite',
  'paint',
  'layout',
  'raster',
  'ambiguous',
  'unknown'
]);

export const ReducedMotionStatusEnum = z.enum([
  'EFFECTIVE_REMEDIATION',
  'COSMETIC_OR_PARTIAL',
  'MISSING_FALLBACK',
  'NOT_APPLICABLE'
]);

export const AnimationBudgetInputSchema = z.object({
  animationType: AnimationTypeEnum,
  animatedProperties: z.array(z.string()).default([]),
  cssSnippet: z.string().max(102400, 'CSS snippet exceeds 100 KB limit').optional(),
  simultaneousElementsCount: z.number().int().positive().default(1),
  targetDpr: z.number().min(1).max(3).default(1.5),
  recommendedDprCeiling: z.number().min(1).max(3).default(1.5).optional(),
  viewportWidth: z.number().int().positive().max(7680).default(1920).optional(),
  viewportHeight: z.number().int().positive().max(4320).default(1080).optional(),
  colorDepthBytes: z.union([z.literal(4), z.literal(8)]).default(4).optional(),
  bufferCount: z.number().int().min(2).max(4).default(2).optional(),
  hasReducedMotionFallback: z.boolean().default(false),
  userInteractionTrigger: z.enum(['hover', 'scroll_scrub', 'click', 'continuous_ambient'])
}).refine(
  (data) => (data.animatedProperties && data.animatedProperties.length > 0) || (data.cssSnippet && data.cssSnippet.trim().length > 0),
  { message: 'At least one animated property or a non-empty cssSnippet must be provided.' }
);

export const DeductionDetailSchema = z.object({
  category: z.string(),
  property: z.string(),
  points: z.number(),
  reason: z.string()
});

export const PropertyClassificationDetailSchema = z.object({
  property: z.string(),
  classification: PropertyCategoryEnum,
  pipelineStage: PipelineStageEnum,
  caveat: z.string()
});

export const HardwareMemoryEstimateSchema = z.object({
  framebufferBytes: z.number(),
  framebufferFormatted: z.string(),
  assumptions: z.string(),
  recommendedDprCeiling: z.number(),
  disclaimer: z.string()
});

export const ReducedMotionAuditSchema = z.object({
  detectedInCss: z.boolean(),
  isRecognizableEffectiveFallback: z.boolean(),
  status: ReducedMotionStatusEnum,
  details: z.string(),
  suggestedPatch: z.string().nullable()
});

export const CssAnalysisReportSchema = z.object({
  parsedRulesCount: z.number(),
  unsupportedSyntaxDetected: z.array(z.string()),
  truncatedDueToSizeLimit: z.boolean()
});

export const AnimationBudgetOutputSchema = z.object({
  approvedForProduction: z.boolean(),
  performanceGrade: z.enum(['A_LIGHTWEIGHT', 'B_ACCEPTABLE', 'C_HEAVY_GUARDRAILS_REQUIRED', 'F_DISALLOWED']),
  score: z.number().min(0).max(100),
  deductions: z.array(DeductionDetailSchema),
  triggersLayoutRecalculation: z.boolean(),
  triggersPaintReflow: z.boolean(),
  isGpuCompositedOnly: z.boolean(),
  propertyClassifications: z.array(PropertyClassificationDetailSchema),
  hardwareMemoryEstimate: HardwareMemoryEstimateSchema,
  reducedMotionAudit: ReducedMotionAuditSchema,
  mandatoryEnforcements: z.array(z.string()),
  reducedMotionDirective: z.string(),
  cssAnalysisReport: CssAnalysisReportSchema.optional(),
  reasoning: z.string()
});

export type AnimationBudgetInput = z.infer<typeof AnimationBudgetInputSchema>;
export type AnimationBudgetRawInput = z.input<typeof AnimationBudgetInputSchema>;
export type AnimationBudgetOutput = z.infer<typeof AnimationBudgetOutputSchema>;
export type PropertyCategory = z.infer<typeof PropertyCategoryEnum>;
export type PipelineStage = z.infer<typeof PipelineStageEnum>;
export type ReducedMotionStatus = z.infer<typeof ReducedMotionStatusEnum>;
export type DeductionDetail = z.infer<typeof DeductionDetailSchema>;
export type PropertyClassificationDetail = z.infer<typeof PropertyClassificationDetailSchema>;
export type HardwareMemoryEstimate = z.infer<typeof HardwareMemoryEstimateSchema>;
export type ReducedMotionAudit = z.infer<typeof ReducedMotionAuditSchema>;
export type CssAnalysisReport = z.infer<typeof CssAnalysisReportSchema>;
