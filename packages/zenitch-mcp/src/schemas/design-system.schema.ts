import { z } from 'zod';

export const ColorTokenSchema = z.object({
  name: z.string(),
  hex: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Invalid hex color'),
  usage: z.string(),
  contrastOnBackground: z.number().min(1).max(21).optional(),
  isExisting: z.boolean().default(false),
  source: z.enum(['existing_project', 'proposed_recommendation']).default('proposed_recommendation')
});

export const TypographyTokenSchema = z.object({
  role: z.enum(['display', 'heading', 'body', 'caption', 'mono']),
  fontFamily: z.string(),
  sizes: z.record(z.string()),
  weights: z.array(z.number()),
  lineHeights: z.record(z.string()),
  isExisting: z.boolean().default(false),
  source: z.enum(['existing_project', 'proposed_recommendation']).default('proposed_recommendation')
});

export const SpacingTokenSchema = z.object({
  name: z.string(),
  value: z.string(),
  pixelEquivalent: z.number().optional(),
  usage: z.string().optional()
});

export const RadiusTokenSchema = z.object({
  name: z.string(),
  value: z.string(),
  usage: z.string().optional()
});

export const ShadowTokenSchema = z.object({
  name: z.string(),
  value: z.string(),
  elevation: z.string().optional()
});

export const BreakpointTokenSchema = z.object({
  name: z.string(),
  minWidth: z.string(),
  targetDevice: z.string().optional()
});

export const DesignSystemConstraintSchema = z.object({
  maxColors: z.number().min(2).max(30).optional(),
  enforceWcagLevel: z.enum(['WCAG_AA', 'WCAG_AAA']).optional(),
  preferredBaseFontSize: z.number().min(12).max(20).optional(),
  preventDarkTheme: z.boolean().optional(),
  customBrandPrimaryHex: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Invalid hex color').optional()
});

export const DesignSystemInconsistencySchema = z.object({
  type: z.enum(['contrast_violation', 'missing_scale_step', 'duplicate_value', 'naming_irregularity']),
  token: z.string(),
  description: z.string(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
  recommendation: z.string()
});

export const DesignSystemGenerationInputSchema = z.object({
  productDomain: z.string(),
  brandMood: z.enum(['clinical_precise', 'enterprise_solid', 'minimal_editorial', 'luxury_sensory', 'playful_warm', 'minimal_saas', 'dark_modern', 'editorial', 'neo_brutalist']).optional().default('enterprise_solid'),
  colorMode: z.enum(['light_only', 'dark_only', 'dual_adaptive']).optional().default('dual_adaptive'),
  preserveExistingTokens: z.boolean().optional().default(true),
  existingTokensSnippet: z.string().optional(),
  projectRoot: z.string().optional(),
  constraints: DesignSystemConstraintSchema.optional()
});

export const DesignSystemGenerationOutputSchema = z.object({
  systemName: z.string(),
  colorTokens: z.array(ColorTokenSchema),
  typographyTokens: z.array(TypographyTokenSchema),
  spacingScale: z.array(z.string()),
  spacingTokens: z.array(SpacingTokenSchema).optional(),
  borderRadiusTokens: z.array(RadiusTokenSchema).optional(),
  shadowTokens: z.array(ShadowTokenSchema).optional(),
  breakpointTokens: z.array(BreakpointTokenSchema).optional(),
  otherProperties: z.record(z.any()).optional(),
  cssVariablesExport: z.string(),
  tailwindConfigExport: z.string().optional(),
  a11yComplianceRating: z.enum(['WCAG_AA', 'WCAG_AAA']),
  inconsistenciesIdentified: z.array(DesignSystemInconsistencySchema),
  rationalExplanation: z.string(),
  tokenOrigins: z.object({
    preservedCount: z.number(),
    proposedCount: z.number()
  })
});

export type ColorToken = z.infer<typeof ColorTokenSchema>;
export type TypographyToken = z.infer<typeof TypographyTokenSchema>;
export type SpacingToken = z.infer<typeof SpacingTokenSchema>;
export type RadiusToken = z.infer<typeof RadiusTokenSchema>;
export type ShadowToken = z.infer<typeof ShadowTokenSchema>;
export type BreakpointToken = z.infer<typeof BreakpointTokenSchema>;
export type DesignSystemConstraint = z.infer<typeof DesignSystemConstraintSchema>;
export type DesignSystemInconsistency = z.infer<typeof DesignSystemInconsistencySchema>;
export type DesignSystemGenerationInput = z.input<typeof DesignSystemGenerationInputSchema>;
export type DesignSystemGenerationOutput = z.infer<typeof DesignSystemGenerationOutputSchema>;
