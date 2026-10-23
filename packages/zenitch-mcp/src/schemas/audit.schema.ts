import { z } from 'zod';

export const ViewportConfigSchema = z.object({
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

export const PageAuditInputSchema = z.object({
  url: z.string().url('A valid URL is required'),
  htmlContent: z.string().optional(),
  viewports: z.array(ViewportConfigSchema).default([
    { name: 'mobile_small', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop_standard', width: 1440, height: 900 }
  ]),
  checkAccessibility: z.boolean().default(true),
  checkHorizontalOverflow: z.boolean().default(true),
  checkInteractiveHitTargets: z.boolean().default(true)
});

// Empirical Observations Strictly Grounded in Facts
export const EmpiricalFindingsSchema = z.object({
  testedUrl: z.string(),
  testedAt: z.string(),
  auditMode: z.enum(['static_source_analysis', 'runtime_browser_measured']).default('static_source_analysis'),
  disclaimer: z.string().default(
    'Findings derived from static HTML/CSS source analysis. Rendered layout shifts and computed runtime styles require an active browser runtime.'
  ),
  testedCriteria: z.array(z.string()).default([]),
  untestedCriteria: z.array(z.string()).default([]),
  horizontalOverflowDetected: z.boolean(),
  overflowingElements: z.array(z.string()),
  touchTargetViolations: z.array(z.object({
    selector: z.string(),
    boundingBox: z.object({ width: z.number(), height: z.number() }),
    minimumRequired: z.string()
  })),
  contrastFailures: z.array(z.object({
    selector: z.string(),
    textColor: z.string(),
    backgroundColor: z.string(),
    measuredRatio: z.number(),
    requiredRatio: z.number()
  })),
  missingFormLabels: z.array(z.string()),
  brokenNavLinks: z.array(z.string()),
  policyViolations: z.array(z.object({
    policyId: z.string(),
    rule: z.string(),
    severity: z.enum(['ERROR', 'WARNING', 'INFO']),
    evidence: z.string(),
    recommendation: z.string()
  })).optional()
});

// Actionable Engineering Recommendations
export const AuditRecommendationsSchema = z.object({
  criticalFixes: z.array(z.string()),
  suggestedCssDiffs: z.array(z.object({
    targetFileOrSelector: z.string(),
    cssPatch: z.string(),
    explanation: z.string()
  })),
  scoreBreakdown: z.object({
    baseScore: z.number(),
    deductions: z.array(z.string()),
    finalScore: z.number()
  }).optional(),
  summaryScore: z.number().min(0).max(100)
});

export const PageAuditOutputSchema = z.object({
  empiricalFindings: EmpiricalFindingsSchema,
  recommendations: AuditRecommendationsSchema
});

export type ViewportConfig = z.infer<typeof ViewportConfigSchema>;
export type PageAuditInput = z.input<typeof PageAuditInputSchema>;
export type PageAuditOutput = z.infer<typeof PageAuditOutputSchema>;
