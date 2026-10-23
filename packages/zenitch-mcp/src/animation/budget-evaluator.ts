import {
  AnimationBudgetInput,
  AnimationBudgetRawInput,
  AnimationBudgetInputSchema,
  AnimationBudgetOutput,
  DeductionDetail,
  PropertyClassificationDetail,
  HardwareMemoryEstimate,
  ReducedMotionAudit
} from '../schemas/animation.schema.js';
import { DEDUCTION_RULES } from './constants.js';
import { classifyProperty } from './property-classifier.js';
import { parseCssAnimationSnippet } from './css-parser.js';

export function evaluateAnimationBudget(rawInput: AnimationBudgetRawInput): AnimationBudgetOutput {
  const input = AnimationBudgetInputSchema.parse(rawInput);
  const cssAnalysis = parseCssAnimationSnippet(input.cssSnippet);

  // 1. Collect and deduplicate animated properties across input array and cssSnippet
  const propertySet = new Set<string>();

  if (Array.isArray(input.animatedProperties)) {
    for (const p of input.animatedProperties) {
      if (p && p.trim()) {
        propertySet.add(p.trim().toLowerCase());
      }
    }
  }

  for (const p of cssAnalysis.extractedProperties) {
    if (p && p.trim()) {
      propertySet.add(p.trim().toLowerCase());
    }
  }

  const hasTransitionAll = cssAnalysis.hasTransitionAll || propertySet.has('all');

  // 2. Classify properties and assess pipeline stages
  const propertyClassifications: PropertyClassificationDetail[] = [];
  const categorized = {
    layout_reflow: [] as string[],
    gpu_expensive_paint: [] as string[],
    paint_triggering: [] as string[],
    unknown_or_context_dependent: [] as string[],
    composite_friendly: [] as string[],
    ambiguous_catchall: [] as string[]
  };

  for (const prop of Array.from(propertySet).sort()) {
    const classification = classifyProperty(prop);
    propertyClassifications.push(classification);
    if (categorized[classification.classification]) {
      categorized[classification.classification].push(prop);
    }
  }

  const triggersLayoutRecalculation = categorized.layout_reflow.length > 0 || hasTransitionAll;
  const triggersPaintReflow = triggersLayoutRecalculation ||
    categorized.paint_triggering.length > 0 ||
    categorized.gpu_expensive_paint.length > 0 ||
    categorized.unknown_or_context_dependent.length > 0;

  const isGpuCompositedOnly = !hasTransitionAll &&
    categorized.layout_reflow.length === 0 &&
    categorized.paint_triggering.length === 0 &&
    categorized.gpu_expensive_paint.length === 0 &&
    categorized.unknown_or_context_dependent.length === 0 &&
    categorized.composite_friendly.length > 0;

  // 3. Deterministic Scoring & Deduplication
  let score = 100;
  const deductions: DeductionDetail[] = [];

  // Deduct for layout reflow (capped)
  if (categorized.layout_reflow.length > 0) {
    const raw = categorized.layout_reflow.length * DEDUCTION_RULES.LAYOUT_REFLOW.points;
    const pts = Math.min(raw, DEDUCTION_RULES.LAYOUT_REFLOW.maxCategoryDeduction);
    score -= pts;
    deductions.push({
      category: 'layout_reflow',
      property: categorized.layout_reflow.join(', '),
      points: pts,
      reason: `Animates ${categorized.layout_reflow.length} layout-triggering property(s) (${categorized.layout_reflow.join(', ')}). Layout changes force synchronous DOM reflow and geometry recalculation (capped at -${DEDUCTION_RULES.LAYOUT_REFLOW.maxCategoryDeduction} pts).`
    });
  }

  // Deduct for GPU expensive paint (capped)
  if (categorized.gpu_expensive_paint.length > 0) {
    const raw = categorized.gpu_expensive_paint.length * DEDUCTION_RULES.GPU_EXPENSIVE_PAINT.points;
    const pts = Math.min(raw, DEDUCTION_RULES.GPU_EXPENSIVE_PAINT.maxCategoryDeduction);
    score -= pts;
    deductions.push({
      category: 'gpu_expensive_paint',
      property: categorized.gpu_expensive_paint.join(', '),
      points: pts,
      reason: `Animates ${categorized.gpu_expensive_paint.length} GPU-expensive paint/filter property(s) (${categorized.gpu_expensive_paint.join(', ')}). High raster fill-rate and blur shader overhead (capped at -${DEDUCTION_RULES.GPU_EXPENSIVE_PAINT.maxCategoryDeduction} pts).`
    });
  }

  // Deduct for paint triggering (capped)
  if (categorized.paint_triggering.length > 0) {
    const raw = categorized.paint_triggering.length * DEDUCTION_RULES.PAINT_TRIGGERING.points;
    const pts = Math.min(raw, DEDUCTION_RULES.PAINT_TRIGGERING.maxCategoryDeduction);
    score -= pts;
    deductions.push({
      category: 'paint_triggering',
      property: categorized.paint_triggering.join(', '),
      points: pts,
      reason: `Animates ${categorized.paint_triggering.length} paint-triggering property(s) (${categorized.paint_triggering.join(', ')}). Repaints element bitmap on every animation frame (capped at -${DEDUCTION_RULES.PAINT_TRIGGERING.maxCategoryDeduction} pts).`
    });
  }

  // Deduct for unknown or context-dependent properties (capped)
  if (categorized.unknown_or_context_dependent.length > 0) {
    const raw = categorized.unknown_or_context_dependent.length * DEDUCTION_RULES.UNKNOWN_OR_CONTEXT.points;
    const pts = Math.min(raw, DEDUCTION_RULES.UNKNOWN_OR_CONTEXT.maxCategoryDeduction);
    score -= pts;
    deductions.push({
      category: 'unknown_or_context_dependent',
      property: categorized.unknown_or_context_dependent.join(', '),
      points: pts,
      reason: `Animates ${categorized.unknown_or_context_dependent.length} unknown or context-dependent property(s) (${categorized.unknown_or_context_dependent.join(', ')}). Rendering cost cannot be verified statically (capped at -${DEDUCTION_RULES.UNKNOWN_OR_CONTEXT.maxCategoryDeduction} pts).`
    });
  }

  // Deduct for transition: all
  if (hasTransitionAll) {
    const pts = DEDUCTION_RULES.TRANSITION_ALL.points;
    score -= pts;
    deductions.push({
      category: 'ambiguous_catchall',
      property: 'transition: all',
      points: pts,
      reason: 'Explicit or implicit "transition: all" detected. Binds transitions to every animatable CSS property, causing severe layout thrashing.'
    });
  }

  // Simultaneous elements count penalty
  const simCount = input.simultaneousElementsCount ?? 1;
  if (simCount > DEDUCTION_RULES.HIGH_SIMULTANEOUS_ELEMENTS_EXTREME.threshold) {
    const pts = DEDUCTION_RULES.HIGH_SIMULTANEOUS_ELEMENTS_EXTREME.points;
    score -= pts;
    deductions.push({
      category: 'simultaneous_elements',
      property: 'simultaneousElementsCount',
      points: pts,
      reason: `High simultaneous animation count (${simCount} > 50 elements) risks compositing layer explosion and device VRAM exhaustion.`
    });
  } else if (simCount > DEDUCTION_RULES.HIGH_SIMULTANEOUS_ELEMENTS_MODERATE.threshold) {
    const pts = DEDUCTION_RULES.HIGH_SIMULTANEOUS_ELEMENTS_MODERATE.points;
    score -= pts;
    deductions.push({
      category: 'simultaneous_elements',
      property: 'simultaneousElementsCount',
      points: pts,
      reason: `Elevated simultaneous animation count (${simCount} > 10 elements) may cause frame drops on low-tier mobile devices.`
    });
  }

  // Target DPR penalty
  const targetDpr = input.targetDpr ?? 1.5;
  if (targetDpr > DEDUCTION_RULES.HIGH_TARGET_DPR.threshold) {
    const pts = DEDUCTION_RULES.HIGH_TARGET_DPR.points;
    score -= pts;
    deductions.push({
      category: 'hardware_budget',
      property: 'targetDpr',
      points: pts,
      reason: `Unclamped target DPR (${targetDpr} > 2.0) quadratically increases GPU fragment shader fill-rate and display framebuffer memory.`
    });
  }

  // Reduced-motion analysis
  const hasEffectiveReducedMotion = input.hasReducedMotionFallback ||
    cssAnalysis.reducedMotion.isRecognizableEffectiveFallback;

  const isContinuousOrAmbient = input.userInteractionTrigger === 'continuous_ambient' ||
    cssAnalysis.isInfiniteAnimation;

  let hasCriticalAccessibilityFailure = false;

  if (!hasEffectiveReducedMotion) {
    if (isContinuousOrAmbient) {
      hasCriticalAccessibilityFailure = true;
      const pts = DEDUCTION_RULES.MISSING_REDUCED_MOTION_CONTINUOUS.points;
      score -= pts;
      score = Math.min(score, DEDUCTION_RULES.MISSING_REDUCED_MOTION_CONTINUOUS.maxAllowedScore);
      deductions.push({
        category: 'accessibility_violation',
        property: 'prefers-reduced-motion',
        points: pts,
        reason: 'Continuous ambient or infinite animation missing recognizable effective prefers-reduced-motion fallback (violates WCAG 2.2 SC 2.2.2 & 2.3.3; score capped at 59).'
      });
    } else {
      const pts = DEDUCTION_RULES.MISSING_REDUCED_MOTION_GENERAL.points;
      score -= pts;
      deductions.push({
        category: 'accessibility_warning',
        property: 'prefers-reduced-motion',
        points: pts,
        reason: 'Interactive animation missing prefers-reduced-motion fallback for motion-sensitive users.'
      });
    }
  }

  // Final score clamping
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Performance grade
  let performanceGrade: 'A_LIGHTWEIGHT' | 'B_ACCEPTABLE' | 'C_HEAVY_GUARDRAILS_REQUIRED' | 'F_DISALLOWED';
  if (score >= 90) {
    performanceGrade = 'A_LIGHTWEIGHT';
  } else if (score >= 75) {
    performanceGrade = 'B_ACCEPTABLE';
  } else if (score >= 50) {
    performanceGrade = 'C_HEAVY_GUARDRAILS_REQUIRED';
  } else {
    performanceGrade = 'F_DISALLOWED';
  }

  const approvedForProduction = score >= 75 && !hasCriticalAccessibilityFailure && !hasTransitionAll;

  // 4. Hardware Memory Estimation
  const width = input.viewportWidth ?? 1920;
  const height = input.viewportHeight ?? 1080;
  const colorDepth = input.colorDepthBytes ?? 4;
  const bufferCount = input.bufferCount ?? 2;
  const recommendedCeiling = input.recommendedDprCeiling ?? 1.5;

  const effectiveWidth = Math.round(width * targetDpr);
  const effectiveHeight = Math.round(height * targetDpr);
  const framebufferBytes = effectiveWidth * effectiveHeight * colorDepth * bufferCount;
  const framebufferMb = (framebufferBytes / (1024 * 1024)).toFixed(2);

  const hardwareMemoryEstimate: HardwareMemoryEstimate = {
    framebufferBytes,
    framebufferFormatted: `${framebufferMb} MB`,
    assumptions: `Display framebuffer swapchain: ${effectiveWidth}x${effectiveHeight} px at ${targetDpr}x DPR, ${bufferCount} buffers (front/back), ${colorDepth} bytes/pixel (${colorDepth === 4 ? 'RGBA8888' : 'RGBA16F'}).`,
    recommendedDprCeiling: recommendedCeiling,
    disclaimer: 'Estimated display framebuffer allocation only. Does not measure total GPU VRAM, compositing layer textures, vertex buffers, or browser raster caches, which vary across GPU drivers and operating systems. Profile in Chrome/Edge DevTools Performance panel for true runtime memory consumption.'
  };

  // 5. Mandatory Enforcements
  const mandatoryEnforcements: string[] = [];

  if (categorized.layout_reflow.length > 0) {
    mandatoryEnforcements.push(`Eliminate layout-triggering properties (${categorized.layout_reflow.join(', ')}). Refactor to GPU composited transforms (translate3d/scale) and opacity.`);
  }
  if (hasTransitionAll) {
    mandatoryEnforcements.push('Replace "transition: all" with explicit property declarations to prevent reflow thrashing.');
  }
  if (categorized.gpu_expensive_paint.length > 0) {
    mandatoryEnforcements.push(`Constrain GPU-expensive paint properties (${categorized.gpu_expensive_paint.join(', ')}). Consider pre-rendering static shadows or baking blur into assets.`);
  }
  if (targetDpr > recommendedCeiling) {
    mandatoryEnforcements.push(`Clamp rendering devicePixelRatio: Math.min(window.devicePixelRatio, ${recommendedCeiling}) to conserve mobile GPU fill-rate.`);
  }
  if (!hasEffectiveReducedMotion) {
    mandatoryEnforcements.push('Provide an effective @media (prefers-reduced-motion: reduce) rule that zeroes animation/transition durations or sets animation: none.');
  }
  if (simCount > 10) {
    mandatoryEnforcements.push(`High element count (${simCount}): Manage will-change lifecycle dynamically (add on interaction, remove after animation completes).`);
  }

  // 6. Reduced Motion Directive & Audit
  const reducedMotionDirective = hasEffectiveReducedMotion
    ? 'Reduced-motion remediation verified in CSS or input configuration.'
    : 'Mandatory: Implement @media (prefers-reduced-motion: reduce) to disable or clamp animations for accessibility compliance.';

  const reducedMotionAudit: ReducedMotionAudit = {
    detectedInCss: cssAnalysis.reducedMotion.detectedInCss,
    isRecognizableEffectiveFallback: hasEffectiveReducedMotion,
    status: hasEffectiveReducedMotion ? 'EFFECTIVE_REMEDIATION' : cssAnalysis.reducedMotion.status,
    details: cssAnalysis.reducedMotion.details,
    suggestedPatch: cssAnalysis.reducedMotion.suggestedPatch
  };

  // 7. Reasoning
  const summaryPoints = [
    `Animation score: ${score}/100 (${performanceGrade}).`,
    approvedForProduction ? 'Approved for production deployment.' : 'REJECTED for production: architectural or accessibility remediation required.',
    isGpuCompositedOnly ? 'Full GPU compositor acceleration detected.' : 'Non-composited layout or paint operations detected.'
  ];
  if (hasCriticalAccessibilityFailure) {
    summaryPoints.push('CRITICAL: Continuous/infinite animation lacks reduced-motion fallback (WCAG 2.2 violation).');
  }
  if (hasTransitionAll) {
    summaryPoints.push('CRITICAL: transition: all detected.');
  }

  return {
    approvedForProduction,
    performanceGrade,
    score,
    deductions,
    triggersLayoutRecalculation,
    triggersPaintReflow,
    isGpuCompositedOnly,
    propertyClassifications,
    hardwareMemoryEstimate,
    reducedMotionAudit,
    mandatoryEnforcements,
    reducedMotionDirective,
    cssAnalysisReport: input.cssSnippet ? cssAnalysis.analysisReport : undefined,
    reasoning: summaryPoints.join(' ')
  };
}
