import test from 'node:test';
import assert from 'node:assert/strict';
import { ZenitchServer } from '../src/server.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { evaluateAnimationBudget } from '../src/animation/budget-evaluator.js';
import { classifyProperty } from '../src/animation/property-classifier.js';
import { parseCssAnimationSnippet } from '../src/animation/css-parser.js';

test('Property Classifier: handles known, vendor-prefixed, custom, context-dependent, and unknown properties', () => {
  const comp = classifyProperty('transform');
  assert.equal(comp.classification, 'composite_friendly');
  assert.equal(comp.pipelineStage, 'composite');

  const vendor = classifyProperty('-webkit-transform');
  assert.equal(vendor.classification, 'composite_friendly');
  assert.ok(vendor.caveat.includes('Vendor-prefixed'));

  const custom = classifyProperty('--theme-accent-pos');
  assert.equal(custom.classification, 'unknown_or_context_dependent');
  assert.equal(custom.pipelineStage, 'unknown');
  assert.ok(custom.caveat.includes('CSS custom property'));

  const clip = classifyProperty('clip-path');
  assert.equal(clip.classification, 'unknown_or_context_dependent');
  assert.equal(clip.pipelineStage, 'paint');
  assert.ok(clip.caveat.includes('context-dependent'));

  const unknown = classifyProperty('future-hologram-depth');
  assert.equal(unknown.classification, 'unknown_or_context_dependent');
  assert.equal(unknown.pipelineStage, 'unknown');
  assert.ok(unknown.caveat.includes('Unregistered or non-standard'));
});

test('Budget Evaluator: composite-friendly pure animation achieves Grade A and production approval', () => {
  const result = evaluateAnimationBudget({
    animationType: 'css_transition',
    animatedProperties: ['transform', 'opacity'],
    hasReducedMotionFallback: true,
    userInteractionTrigger: 'hover',
    targetDpr: 1.5,
    simultaneousElementsCount: 2
  });

  assert.equal(result.score, 100);
  assert.equal(result.performanceGrade, 'A_LIGHTWEIGHT');
  assert.equal(result.approvedForProduction, true);
  assert.equal(result.isGpuCompositedOnly, true);
  assert.equal(result.triggersLayoutRecalculation, false);
  assert.equal(result.triggersPaintReflow, false);
  assert.equal(result.deductions.length, 0);
});

test('Budget Evaluator: prevents duplicate deductions for overlapping properties in input and cssSnippet', () => {
  // 'width' is in both animatedProperties and cssSnippet
  const result = evaluateAnimationBudget({
    animationType: 'css_transition',
    animatedProperties: ['width'],
    cssSnippet: `
      .card {
        transition: width 0.3s ease;
      }
    `,
    hasReducedMotionFallback: true,
    userInteractionTrigger: 'hover'
  });

  // Layout reflow for 'width' is 15 pts. It must NOT be deducted twice (30 pts).
  assert.equal(result.score, 85);
  const layoutDeductions = result.deductions.filter(d => d.category === 'layout_reflow');
  assert.equal(layoutDeductions.length, 1);
  assert.equal(layoutDeductions[0].points, 15);
  assert.equal(result.triggersLayoutRecalculation, true);
  assert.equal(result.isGpuCompositedOnly, false);
});

test('Budget Evaluator: detects transition: all, penalizes -30 pts and blocks production approval', () => {
  const result = evaluateAnimationBudget({
    animationType: 'css_transition',
    cssSnippet: `
      .interactive-button {
        transition: all 0.25s ease-in-out;
      }
    `,
    hasReducedMotionFallback: true,
    userInteractionTrigger: 'hover'
  });

  assert.equal(result.score, 70);
  assert.equal(result.approvedForProduction, false);
  assert.equal(result.triggersLayoutRecalculation, true);
  const allDeduction = result.deductions.find(d => d.category === 'ambiguous_catchall');
  assert.ok(allDeduction);
  assert.equal(allDeduction.points, 30);
});

test('Budget Evaluator: reduced-motion rule that does not disable motion is classified as COSMETIC_OR_PARTIAL', () => {
  const result = evaluateAnimationBudget({
    animationType: 'css_keyframe',
    cssSnippet: `
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      .pulsing-box {
        animation: pulse 2s infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .pulsing-box {
          background-color: #f0f0f0;
          color: #333;
        }
      }
    `,
    userInteractionTrigger: 'continuous_ambient'
  });

  // Cosmetic media query does not pass effective remediation!
  assert.equal(result.reducedMotionAudit.detectedInCss, true);
  assert.equal(result.reducedMotionAudit.isRecognizableEffectiveFallback, false);
  assert.equal(result.reducedMotionAudit.status, 'COSMETIC_OR_PARTIAL');
  assert.ok(result.reducedMotionAudit.suggestedPatch);
  assert.equal(result.approvedForProduction, false);
  assert.ok(result.score <= 59); // Score capped due to continuous ambient missing effective reduced motion
});

test('Budget Evaluator: effective reduced-motion rule achieves EFFECTIVE_REMEDIATION status', () => {
  const result = evaluateAnimationBudget({
    animationType: 'css_keyframe',
    cssSnippet: `
      @keyframes spinner {
        to { transform: rotate(360deg); }
      }
      .loader {
        animation: spinner 1s infinite linear;
      }
      @media (prefers-reduced-motion: reduce) {
        .loader {
          animation: none !important;
        }
      }
    `,
    userInteractionTrigger: 'continuous_ambient'
  });

  assert.equal(result.reducedMotionAudit.detectedInCss, true);
  assert.equal(result.reducedMotionAudit.isRecognizableEffectiveFallback, true);
  assert.equal(result.reducedMotionAudit.status, 'EFFECTIVE_REMEDIATION');
  assert.equal(result.reducedMotionAudit.suggestedPatch, null);
  assert.equal(result.score, 100);
  assert.equal(result.approvedForProduction, true);
});

test('Budget Evaluator: malformed CSS with unclosed comments and unbalanced braces handles safely', () => {
  const malformed = `
    /* unclosed comment
    .broken-class {
      transform: translateY(10px);
      width: 100px;
  `;

  const parsed = parseCssAnimationSnippet(malformed);
  assert.ok(parsed.analysisReport.unsupportedSyntaxDetected.length > 0);

  const evaluated = evaluateAnimationBudget({
    animationType: 'css_transition',
    cssSnippet: malformed,
    hasReducedMotionFallback: true,
    userInteractionTrigger: 'hover'
  });

  assert.ok(evaluated);
  assert.ok(evaluated.score >= 0 && evaluated.score <= 100);
  assert.ok(evaluated.cssAnalysisReport);
});

test('Budget Evaluator: input exceeding 100 KB limit is truncated with warning flag', () => {
  const largePadding = '/* extra padding comment */\n'.repeat(5000); // > 100 KB
  const largeCss = `
    ${largePadding}
    .hero {
      transform: scale(1.1);
    }
  `;
  assert.ok(largeCss.length > 102400);

  const parsed = parseCssAnimationSnippet(largeCss);
  assert.equal(parsed.analysisReport.truncatedDueToSizeLimit, true);
  assert.ok(parsed.analysisReport.unsupportedSyntaxDetected.some(s => s.includes('100 KB limit')));
});

test('Budget Evaluator: hardware estimation calculates swapchain bytes and disclaims total VRAM', () => {
  const result = evaluateAnimationBudget({
    animationType: 'webgl_threejs',
    animatedProperties: ['transform'],
    hasReducedMotionFallback: true,
    userInteractionTrigger: 'click',
    viewportWidth: 1920,
    viewportHeight: 1080,
    targetDpr: 2.0,
    bufferCount: 2,
    colorDepthBytes: 4
  });

  // Effective W = 1920 * 2 = 3840, H = 1080 * 2 = 2160
  // Bytes = 3840 * 2160 * 4 * 2 = 66,355,200 bytes (~63.28 MB)
  const expectedBytes = 3840 * 2160 * 4 * 2;
  assert.equal(result.hardwareMemoryEstimate.framebufferBytes, expectedBytes);
  assert.ok(result.hardwareMemoryEstimate.framebufferFormatted.includes('MB'));
  assert.ok(result.hardwareMemoryEstimate.disclaimer.includes('Estimated display framebuffer'));
  assert.ok(result.hardwareMemoryEstimate.disclaimer.includes('Does not measure total GPU VRAM'));
});

test('ZenitchServer: executes zenitch_evaluate_animation_budget via CallTool', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();

  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
  assert.ok(callHandler);

  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_evaluate_animation_budget',
      arguments: {
        animationType: 'css_transition',
        animatedProperties: ['transform', 'opacity'],
        hasReducedMotionFallback: true,
        userInteractionTrigger: 'hover'
      }
    }
  });

  assert.ok(!response.isError);
  const parsedContent = JSON.parse(response.content[0].text);
  assert.equal(parsedContent.success, true);
  assert.equal(parsedContent.data.approvedForProduction, true);
  assert.equal(parsedContent.data.performanceGrade, 'A_LIGHTWEIGHT');
  assert.equal(parsedContent.data.score, 100);
});

test('ZenitchServer: zenitch_get_system_info reports animation_intelligence as ACTIVE_STEP6', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();

  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_get_system_info',
      arguments: {}
    }
  });

  assert.ok(!response.isError);
  const parsedContent = JSON.parse(response.content[0].text);
  const animSub = parsedContent.data.subsystems.find((s: any) => s.id === 'animation_intelligence');
  assert.ok(animSub);
  assert.equal(animSub.status, 'ACTIVE_STEP6');
});

test('Budget Evaluator: category deduction caps prevent disproportionate point losses', () => {
  // 5 layout properties: width, height, margin, padding, top (raw: 5 * 15 = 75 pts)
  // Must cap at -50 pts.
  const result = evaluateAnimationBudget({
    animationType: 'css_transition',
    animatedProperties: ['width', 'height', 'margin', 'padding', 'top'],
    hasReducedMotionFallback: true,
    userInteractionTrigger: 'hover'
  });

  const layoutDeductions = result.deductions.filter(d => d.category === 'layout_reflow');
  assert.equal(layoutDeductions.length, 1);
  assert.equal(layoutDeductions[0].points, 50); // Capped at 50, not 75
  assert.equal(result.score, 50); // 100 - 50 = 50
  assert.equal(result.performanceGrade, 'C_HEAVY_GUARDRAILS_REQUIRED');
  assert.equal(result.approvedForProduction, false);
});

test('Budget Evaluator: high DPR (> 2.0) and high simultaneous element count apply deterministic hardware penalties', () => {
  const result = evaluateAnimationBudget({
    animationType: 'css_transition',
    animatedProperties: ['transform'],
    hasReducedMotionFallback: true,
    userInteractionTrigger: 'hover',
    targetDpr: 2.5,
    simultaneousElementsCount: 60
  });

  // Base 100 - 10 (targetDpr > 2.0) - 25 (elements > 50) = 65
  assert.equal(result.score, 65);
  const dprDeduction = result.deductions.find(d => d.property === 'targetDpr');
  assert.ok(dprDeduction);
  assert.equal(dprDeduction.points, 10);

  const elementsDeduction = result.deductions.find(d => d.property === 'simultaneousElementsCount');
  assert.ok(elementsDeduction);
  assert.equal(elementsDeduction.points, 25);

  assert.equal(result.performanceGrade, 'C_HEAVY_GUARDRAILS_REQUIRED');
  assert.equal(result.approvedForProduction, false);
});
