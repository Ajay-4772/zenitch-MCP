import { z } from 'zod';

export const FrameworkEnum = z.enum([
  'nextjs_app_router',
  'nextjs_pages_router',
  'vite_react',
  'vue',
  'svelte',
  'remix',
  'astro',
  'vanilla_html_css',
  'unknown'
]);

export const StylingApproachEnum = z.enum([
  'tailwind_v3',
  'tailwind_v4',
  'css_modules',
  'styled_components',
  'vanilla_css',
  'sass_scss',
  'shadcn_radix',
  'unknown'
]);

export const PackageManagerEnum = z.enum([
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'unknown'
]);

export const ProjectInspectionInputSchema = z.object({
  projectRoot: z.string().min(1, 'Project root directory path is required'),
  scanDepth: z.number().int().min(1).max(5).default(3)
});

export const DiscoveredComponentSchema = z.object({
  name: z.string(),
  filePath: z.string(),
  type: z.enum(['ui_primitive', 'layout', 'composite', 'page_section']),
  propsExported: z.array(z.string()).optional()
});

export const DiscoveredRouteSchema = z.object({
  routePath: z.string(),
  filePath: z.string()
});

export const DetectedDesignTokenSchema = z.object({
  name: z.string(),
  type: z.enum(['color', 'font', 'spacing', 'radius', 'shadow', 'other']),
  sourceFile: z.string(),
  sampleValue: z.string().optional()
});

export const ProjectInspectionOutputSchema = z.object({
  projectRoot: z.string(),
  framework: FrameworkEnum,
  styling: StylingApproachEnum,
  packageManager: PackageManagerEnum,
  detectedLanguages: z.array(z.string()),
  structureSummary: z.string(),
  hasExistingDesignTokens: z.boolean(),
  detectedDesignTokens: z.array(DetectedDesignTokenSchema),
  discoveredComponents: z.array(DiscoveredComponentSchema),
  discoveredPagesAndRoutes: z.array(DiscoveredRouteSchema),
  routesCount: z.number().int().nonnegative(),
  dependencies: z.record(z.string()),
  preservationWarnings: z.array(z.string()),
  securitySummary: z.object({
    secretsRedactedCount: z.number().int().nonnegative(),
    environmentFilesIgnored: z.array(z.string())
  })
});

export type ProjectInspectionInput = z.input<typeof ProjectInspectionInputSchema>;
export type ProjectInspectionOutput = z.infer<typeof ProjectInspectionOutputSchema>;
