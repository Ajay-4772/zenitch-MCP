import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProductAnalysisInputSchema,
  ProjectInspectionInputSchema,
  PolicyEvaluationInputSchema,
  DesignSystemGenerationInputSchema,
  PageAuditInputSchema,
  AnimationBudgetInputSchema,
  VisualRegressionInputSchema
} from '../src/schemas/index.js';

test('ProductAnalysisInputSchema: accepts valid enterprise SaaS context', () => {
  const input = {
    productName: 'HealthData Pro',
    domain: 'healthcare',
    primaryUserGoal: 'Review patient laboratory metrics and flags with zero distraction',
    dataDensity: 'high',
    environment: 'office_daylight'
  };

  const parsed = ProductAnalysisInputSchema.parse(input);
  assert.equal(parsed.productName, 'HealthData Pro');
  assert.equal(parsed.domain, 'healthcare');
  assert.equal(parsed.dataDensity, 'high');
});

test('ProductAnalysisInputSchema: rejects missing required fields', () => {
  assert.throws(() => {
    ProductAnalysisInputSchema.parse({
      domain: 'invalid_domain'
    });
  });
});

test('ProjectInspectionInputSchema: validates scan depth defaults', () => {
  const input = {
    projectRoot: 'C:/repos/test-app'
  };
  const parsed = ProjectInspectionInputSchema.parse(input);
  assert.equal(parsed.scanDepth, 3);
});

test('PolicyEvaluationInputSchema: enforces markup and domain check', () => {
  const input = {
    productDomain: 'enterprise_saas',
    proposedMarkupOrComponent: '<div class="glass-card shadow-2xl bg-purple-900 neon-glow"><button>AI Sparkle</button></div>',
    strictMode: true
  };
  const parsed = PolicyEvaluationInputSchema.parse(input);
  assert.equal(parsed.strictMode, true);
});

test('PageAuditInputSchema: validates default viewports and URL format', () => {
  const valid = { url: 'http://localhost:3000/dashboard' };
  const parsed = PageAuditInputSchema.parse(valid);
  assert.equal(parsed.viewports.length, 3);
  assert.equal(parsed.checkHorizontalOverflow, true);

  assert.throws(() => {
    PageAuditInputSchema.parse({ url: 'not-a-valid-url' });
  });
});

test('AnimationBudgetInputSchema: verifies animated properties array', () => {
  const valid = {
    animationType: 'css_transition',
    animatedProperties: ['transform', 'opacity'],
    simultaneousElementsCount: 3,
    userInteractionTrigger: 'hover'
  };
  const parsed = AnimationBudgetInputSchema.parse(valid);
  assert.equal(parsed.targetDpr, 1.5); // Verify default clamped DPR
  assert.deepEqual(parsed.animatedProperties, ['transform', 'opacity']);
});

test('VisualRegressionInputSchema: checks baseline and comparison paths', () => {
  const input = {
    baselineImagePath: '/baseline/hero.png',
    currentImagePath: '/current/hero.png',
    toleranceThreshold: 0.02
  };
  const parsed = VisualRegressionInputSchema.parse(input);
  assert.equal(parsed.toleranceThreshold, 0.02);
  assert.equal(parsed.ignoreAntiAliasing, true);
});
