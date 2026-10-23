import { z } from 'zod';

export const ComponentTypeEnum = z.enum([
  'ui_primitive',
  'layout',
  'composite',
  'page_section'
]);

export const StyleDirectionEnum = z.enum([
  'minimal_saas',
  'dark_modern',
  'editorial',
  'neo_brutalist'
]);

export const ComponentContractSchema = z.object({
  componentId: z.string(),
  name: z.string(),
  category: ComponentTypeEnum,
  structure: z.object({
    semanticElement: z.string(),
    slots: z.record(z.string()),
    containerHierarchy: z.string()
  }),
  accessibility: z.object({
    role: z.string(),
    requiredAttributes: z.array(z.string()),
    keyboardInteractions: z.array(z.string()),
    focusManagement: z.string(),
    touchTarget: z.object({
      minWidth: z.string(),
      minHeight: z.string(),
      standard: z.string()
    })
  }),
  interactionStates: z.object({
    supportedStates: z.array(z.string()),
    stateInvariants: z.record(z.string())
  }),
  responsive: z.object({
    mobile: z.string(),
    desktop: z.string(),
    overflow: z.string()
  }),
  styleAdaptations: z.record(
    StyleDirectionEnum,
    z.object({
      visualTheme: z.string(),
      tokens: z.record(z.any())
    })
  ),
  provenance: z.object({
    source: z.string(),
    license: z.string(),
    author: z.string(),
    version: z.string(),
    verified: z.boolean()
  })
});

export const DiscoveredComponentDetailSchema = z.object({
  name: z.string(),
  filePath: z.string(),
  type: ComponentTypeEnum,
  exports: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  matchScore: z.number().min(0).max(1).default(0)
});

export const DuplicateComponentWarningSchema = z.object({
  componentA: z.string(),
  fileA: z.string(),
  componentB: z.string(),
  fileB: z.string(),
  similarityReason: z.string(),
  recommendation: z.string()
});

export const ComponentResolutionInputSchema = z.object({
  requestedFunctionality: z.string().min(3, 'Functionality description required'),
  targetPageOrView: z.string().optional().default('General'),
  projectRoot: z.string().optional(),
  enforceReuse: z.boolean().optional().default(true),
  frameworkHint: z.string().optional(),
  styleDirection: StyleDirectionEnum.optional(),
  existingComponentsOverride: z.array(z.object({
    name: z.string(),
    filePath: z.string(),
    type: ComponentTypeEnum,
    exports: z.array(z.string()).optional(),
    responsibilities: z.array(z.string()).optional()
  })).optional()
});

export const ComponentResolutionOutputSchema = z.object({
  resolutionType: z.enum(['REUSE_EXISTING', 'EXTEND_EXISTING', 'SCAFFOLD_NEW']),
  recommendedComponent: z.object({
    name: z.string(),
    sourcePath: z.string().optional(),
    propsToPass: z.record(z.any()).optional(),
    codeSnippet: z.string(),
    exportsUsed: z.array(z.string()).optional()
  }),
  componentContract: ComponentContractSchema.optional(),
  rationalExplanation: z.string(),
  preventedDuplicationOf: z.string().optional(),
  evidence: z.object({
    matchedPrimitives: z.array(z.string()),
    confidenceScore: z.number(),
    frameworkConventions: z.string()
  }),
  detectedDuplicates: z.array(DuplicateComponentWarningSchema),
  discoveredProjectComponents: z.array(DiscoveredComponentDetailSchema).optional(),
  isNewComponentJustified: z.boolean()
});

export type ComponentType = z.infer<typeof ComponentTypeEnum>;
export type StyleDirection = z.infer<typeof StyleDirectionEnum>;
export type ComponentContract = z.infer<typeof ComponentContractSchema>;
export type DiscoveredComponentDetail = z.infer<typeof DiscoveredComponentDetailSchema>;
export type DuplicateComponentWarning = z.infer<typeof DuplicateComponentWarningSchema>;
export type ComponentResolutionInput = z.input<typeof ComponentResolutionInputSchema>;
export type ComponentResolutionOutput = z.infer<typeof ComponentResolutionOutputSchema>;
