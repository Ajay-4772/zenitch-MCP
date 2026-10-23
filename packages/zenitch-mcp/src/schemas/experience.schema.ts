import { z } from 'zod';
import { ProductDomainEnum } from './product.schema.js';

export const DesignReferenceSchema = z.object({
  referenceType: z.enum([
    'explicit_text_instruction',
    'accessible_project_tokens',
    'structured_reference_description',
    'unspecified'
  ]).default('unspecified'),
  surfacePreference: z.enum(['light', 'dark', 'system', 'unspecified']).default('unspecified'),
  layoutPreference: z.enum(['sidebar', 'top_nav', 'tabbed', 'single_view', 'unspecified']).default('unspecified'),
  densityPreference: z.enum(['compact', 'comfortable', 'spacious', 'unspecified']).default('unspecified'),
  keyVisualCharacteristics: z.array(z.string()).default([])
});

export const ExperiencePlannerInputSchema = z.object({
  rawPrompt: z.string().min(3, 'Prompt must describe the intended application'),
  domainHint: ProductDomainEnum.optional(),
  taskComplexity: z.enum(['compact', 'standard', 'expanded', 'auto_detect']).default('auto_detect'),
  targetFormat: z.enum(['single_file_html', 'multi_file_static', 'framework_app', 'auto_detect']).default('auto_detect'),
  designReference: DesignReferenceSchema.optional(),
  projectRoot: z.string().optional()
});

export const CandidateViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  routeOrHash: z.string(),
  purpose: z.string(),
  isInitialView: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  inclusionRationale: z.string(),
  requiredSections: z.array(z.string()),
  essentialComponents: z.array(z.string()),
  dataEntities: z.array(z.string())
});

export const AdaptiveDesignDirectionSchema = z.object({
  selectedArchetype: z.string(),
  surfaceTone: z.enum(['light_neutral', 'dark_monochrome', 'warm_editorial', 'high_contrast', 'custom_user_override']),
  recommendedTheme: z.enum(['light', 'dark', 'system']),
  primaryColorRecommendation: z.string(),
  backgroundSurfaceHex: z.string(),
  cardSurfaceHex: z.string(),
  borderHierarchy: z.string(),
  rationale: z.string(),
  userOverrideApplied: z.boolean().default(false),
  alternativeDirections: z.array(z.object({
    name: z.string(),
    tone: z.string(),
    useCase: z.string()
  }))
});

export const ExperiencePlanOutputSchema = z.object({
  productName: z.string(),
  domain: ProductDomainEnum,
  derivedComplexity: z.enum(['compact', 'standard', 'expanded']),
  targetFormat: z.enum(['single_file_html', 'multi_file_static', 'framework_app']),
  formatRationale: z.string(),
  designDirection: AdaptiveDesignDirectionSchema,
  layoutArchitecture: z.object({
    archetype: z.enum(['app_shell_sidebar', 'app_shell_topnav', 'single_view_drilldown']),
    sidebarCollapsible: z.boolean(),
    headerBreadcrumbs: z.boolean(),
    mobileNavigationPattern: z.enum(['bottom_bar', 'off_canvas_drawer', 'accordion_menu'])
  }),
  candidateViews: z.array(CandidateViewSchema),
  userFlows: z.array(z.object({
    flowId: z.string(),
    description: z.string(),
    stepSequence: z.array(z.string())
  })),
  sharedStateModel: z.array(z.object({
    stateKey: z.string(),
    type: z.string(),
    defaultValue: z.string(),
    consumers: z.array(z.string())
  })),
  inferredAssumptions: z.array(z.string()),
  unsupportedCapabilities: z.array(z.string()),
  acceptanceCriteria: z.array(z.object({
    id: z.string(),
    title: z.string(),
    definition: z.string(),
    verificationType: z.enum(['static_html', 'policy_engine', 'runtime_manual'])
  }))
});

export type DesignReference = z.input<typeof DesignReferenceSchema>;
export type ExperiencePlannerInput = z.input<typeof ExperiencePlannerInputSchema>;
export type CandidateView = z.infer<typeof CandidateViewSchema>;
export type AdaptiveDesignDirection = z.infer<typeof AdaptiveDesignDirectionSchema>;
export type ExperiencePlanOutput = z.infer<typeof ExperiencePlanOutputSchema>;
