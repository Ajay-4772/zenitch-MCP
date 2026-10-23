import { z } from 'zod';

export const VisualRegressionInputSchema = z.object({
  baselineImagePath: z.string().min(1, 'Baseline image path is required'),
  currentImagePath: z.string().min(1, 'Current comparison image path is required'),
  diffOutputPath: z.string().optional(),
  toleranceThreshold: z.number().min(0).max(1).default(0.05),
  ignoreAntiAliasing: z.boolean().default(true)
});

export const VisualRegressionOutputSchema = z.object({
  hasRegression: z.boolean(),
  mismatchPercentage: z.number().min(0).max(100),
  mismatchPixelCount: z.number().int().nonnegative(),
  diffMaskSavedPath: z.string().optional(),
  detectedShifts: z.array(z.string()),
  verdict: z.enum([
    'PASS_IDENTICAL',
    'PASS_WITHIN_TOLERANCE',
    'FAIL_REGRESSION_DETECTED',
    'ERROR_UNSUPPORTED_OR_CORRUPT'
  ]),
  baselineDimensions: z.object({ width: z.number(), height: z.number() }).optional(),
  comparisonDimensions: z.object({ width: z.number(), height: z.number() }).optional(),
  errorDetails: z.string().optional()
});

export type VisualRegressionInput = z.input<typeof VisualRegressionInputSchema>;
export type VisualRegressionOutput = z.infer<typeof VisualRegressionOutputSchema>;
