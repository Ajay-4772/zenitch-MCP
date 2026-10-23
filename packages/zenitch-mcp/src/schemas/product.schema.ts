import { z } from 'zod';

export const ProductDomainEnum = z.enum([
  'enterprise_saas',
  'ecommerce',
  'healthcare',
  'developer_tool',
  'fintech',
  'consumer',
  'luxury',
  'internal_tool',
  'editorial'
]);

export const DataDensityEnum = z.enum([
  'low',
  'medium',
  'high',
  'dense'
]);

export const TargetEnvironmentEnum = z.enum([
  'office_daylight',
  'low_light',
  'field_mobile',
  'mixed'
]);

export const ProductAnalysisInputSchema = z.object({
  productName: z.string().min(1, 'Product name is required'),
  domain: ProductDomainEnum,
  primaryUserGoal: z.string().min(5, 'Primary user goal must be detailed'),
  dataDensity: DataDensityEnum.default('medium'),
  environment: TargetEnvironmentEnum.default('office_daylight'),
  targetAudience: z.string().optional()
});

export const DesignConstraintSchema = z.object({
  recommendedTheme: z.enum(['light', 'dark', 'system']),
  colorRationale: z.string(),
  forbiddenPatterns: z.array(z.string()),
  requiredErgonomics: z.array(z.string()),
  maxAllowedMotionLevel: z.enum(['none', 'subtle', 'expressive', 'cinematic'])
});

export const ProductAnalysisOutputSchema = z.object({
  productName: z.string(),
  domain: ProductDomainEnum,
  providedFacts: z.object({
    productName: z.string(),
    domain: ProductDomainEnum,
    primaryUserGoal: z.string(),
    specifiedDensity: DataDensityEnum,
    specifiedEnvironment: TargetEnvironmentEnum,
    targetAudience: z.string().optional()
  }),
  inferredAssumptions: z.array(z.string()),
  targetUserProfiles: z.array(z.object({
    role: z.string(),
    primaryWorkflow: z.string(),
    cognitiveLoadTolerance: z.enum(['low', 'medium', 'high'])
  })),
  informationHierarchy: z.object({
    primaryFocalPoint: z.string(),
    secondarySupportingData: z.string(),
    backgroundOrUtilityContext: z.string()
  }),
  accessibilityDirectives: z.object({
    wcagTarget: z.enum(['WCAG_2_2_AA', 'WCAG_2_2_AAA']),
    minimumContrastRatio: z.string(),
    minimumTouchTargetPx: z.number(),
    focusManagementRequirement: z.string()
  }),
  constraints: DesignConstraintSchema,
  justification: z.string()
});

export type ProductAnalysisInput = z.input<typeof ProductAnalysisInputSchema>;
export type ProductAnalysisOutput = z.infer<typeof ProductAnalysisOutputSchema>;
