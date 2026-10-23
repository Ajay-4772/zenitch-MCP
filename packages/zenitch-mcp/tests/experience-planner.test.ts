import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { planProductExperience } from '../src/intelligence/experience-planner.js';
import { analyzeProductContext } from '../src/intelligence/product-analyzer.js';
import { ExperiencePlanOutputSchema } from '../src/schemas/experience.schema.js';

describe('PXI Experience Planner — Phase 1 Test Suite & Verification Gate', () => {

  describe('1. Explicit Light, Dark, and Editorial Theme Overrides', () => {
    it('honors explicit light theme override regardless of domain', () => {
      const plan = planProductExperience({
        rawPrompt: 'Build a developer terminal dashboard but use a bright clean light theme with white background',
        designReference: {
          referenceType: 'explicit_text_instruction',
          surfacePreference: 'light',
          layoutPreference: 'sidebar',
          densityPreference: 'comfortable',
          keyVisualCharacteristics: ['clean light theme', 'white background']
        }
      });

      assert.strictEqual(plan.designDirection.recommendedTheme, 'light');
      assert.strictEqual(plan.designDirection.userOverrideApplied, true);
      assert.strictEqual(plan.designDirection.surfaceTone, 'light_neutral');
      assert.ok(plan.designDirection.rationale.includes('light'));
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });

    it('honors explicit dark theme override when requested', () => {
      const plan = planProductExperience({
        rawPrompt: 'Create a medical clinic appointment scheduler with a dark mode cyberpunk aesthetic',
        designReference: {
          referenceType: 'explicit_text_instruction',
          surfacePreference: 'dark',
          layoutPreference: 'unspecified',
          densityPreference: 'unspecified',
          keyVisualCharacteristics: []
        }
      });

      assert.strictEqual(plan.designDirection.recommendedTheme, 'dark');
      assert.strictEqual(plan.designDirection.userOverrideApplied, true);
      assert.strictEqual(plan.designDirection.surfaceTone, 'dark_monochrome');
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });

    it('preserves dark editorial design intent with warm stone tones rather than generic terminal dark', () => {
      const plan = planProductExperience({
        rawPrompt: 'Use a dark editorial design with compact charts for our monograph publishing dashboard',
        designReference: {
          referenceType: 'explicit_text_instruction',
          surfacePreference: 'dark',
          densityPreference: 'compact',
          keyVisualCharacteristics: ['editorial', 'dark aesthetic', 'compact charts']
        }
      });

      assert.strictEqual(plan.designDirection.recommendedTheme, 'dark');
      assert.strictEqual(plan.designDirection.surfaceTone, 'warm_editorial');
      assert.strictEqual(plan.designDirection.selectedArchetype, 'Dark Editorial Monograph');
      assert.strictEqual(plan.designDirection.userOverrideApplied, true);
      assert.strictEqual(plan.designDirection.backgroundSurfaceHex, '#1c1917');
      assert.strictEqual(plan.designDirection.cardSurfaceHex, '#292524');
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });

    it('falls back to domain context baseline when no explicit theme is specified', () => {
      const plan = planProductExperience({
        rawPrompt: 'Build a medical patient record management portal'
      });

      // Healthcare defaults to light ergonomic baseline
      assert.strictEqual(plan.designDirection.recommendedTheme, 'light');
      assert.strictEqual(plan.designDirection.userOverrideApplied, false);
      assert.strictEqual(plan.designDirection.surfaceTone, 'light_neutral');
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });
  });

  describe('2. Sparse, Ambiguous, and Uncertain Inputs (Safe Explainable Defaults)', () => {
    it('handles minimal 3-word prompt gracefully with safe explainable defaults', () => {
      const plan = planProductExperience({
        rawPrompt: 'make an app'
      });

      assert.ok(plan.productName);
      assert.strictEqual(plan.candidateViews.length, 1);
      assert.strictEqual(plan.derivedComplexity, 'compact');
      assert.ok(plan.inferredAssumptions.length > 0);
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });

    it('handles vague utility prompt without crashing or hallucinating extra screens', () => {
      const plan = planProductExperience({
        rawPrompt: 'a tool to view numbers'
      });

      assert.strictEqual(plan.derivedComplexity, 'compact');
      assert.strictEqual(plan.candidateViews.length, 1);
      assert.strictEqual(plan.candidateViews[0].id, 'dashboard');
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });
  });

  describe('3. Central Dashboard Use Cases (Scenarios A through E)', () => {
    // Scenario A
    it('Scenario A: plans one coherent dashboard page for "modern e-commerce product performance dashboard"', () => {
      const plan = planProductExperience({
        rawPrompt: 'Build a modern e-commerce product performance dashboard.'
      });

      assert.strictEqual(plan.derivedComplexity, 'compact');
      assert.strictEqual(plan.candidateViews.length, 1);
      assert.strictEqual(plan.candidateViews[0].id, 'dashboard');
      assert.strictEqual(plan.candidateViews[0].isInitialView, true);
      assert.strictEqual(plan.layoutArchitecture.archetype, 'single_view_drilldown');

      // Verify rich coherent hierarchy on the single page
      const sections = plan.candidateViews[0].requiredSections;
      assert.ok(sections.some(s => s.includes('KPI Metric')));
      assert.ok(sections.some(s => s.includes('Trend Visualizer')));
      assert.ok(sections.some(s => s.includes('Data Table')));
      assert.ok(sections.some(s => s.includes('Filter')));
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });

    // Scenario B
    it('Scenario B: plans multi-view portal for "e-commerce management portal with products, orders, customers, and analytics"', () => {
      const plan = planProductExperience({
        rawPrompt: 'Build an e-commerce management portal with products, orders, customers, and analytics.'
      });

      assert.strictEqual(plan.derivedComplexity, 'expanded');
      assert.ok(plan.candidateViews.length >= 3);
      assert.strictEqual(plan.layoutArchitecture.archetype, 'app_shell_sidebar');

      // Verify distinct evidence-based candidate views
      const viewIds = plan.candidateViews.map(v => v.id);
      assert.ok(viewIds.includes('dashboard'));
      assert.ok(viewIds.includes('products'));
      assert.ok(viewIds.includes('orders'));
      assert.ok(viewIds.includes('customers'));

      for (const view of plan.candidateViews) {
        assert.ok(view.inclusionRationale.length <= 120);
        assert.ok(view.confidence > 0.85);
      }
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });

    // Scenario C
    it('Scenario C: honors single-file constraint while retaining rich usable dashboard experience', () => {
      const plan = planProductExperience({
        rawPrompt: 'Build the entire dashboard as a single HTML file.'
      });

      assert.strictEqual(plan.targetFormat, 'single_file_html');
      assert.strictEqual(plan.candidateViews.length, 1);
      assert.ok(plan.formatRationale.includes('single-file'));
      assert.ok(plan.candidateViews[0].requiredSections.length >= 3);
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });

    // Scenario D
    it('Scenario D: honors "dark editorial design with compact charts" via prompt and reference', () => {
      const plan = planProductExperience({
        rawPrompt: 'Use a dark editorial design with compact charts.',
        designReference: {
          referenceType: 'explicit_text_instruction',
          surfacePreference: 'dark',
          densityPreference: 'compact',
          keyVisualCharacteristics: ['editorial', 'dark aesthetic', 'compact charts']
        }
      });

      assert.strictEqual(plan.designDirection.recommendedTheme, 'dark');
      assert.strictEqual(plan.designDirection.surfaceTone, 'warm_editorial');
      assert.strictEqual(plan.designDirection.userOverrideApplied, true);
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });

    // Scenario E
    it('Scenario E: respects detected Next.js repository convention and avoids proposing unrelated standalone app', () => {
      const plan = planProductExperience({
        rawPrompt: 'Improve the dashboard in my existing Next.js project.'
      });

      assert.strictEqual(plan.targetFormat, 'framework_app');
      assert.ok(plan.formatRationale.includes('Next.js'));
      assert.ok(!plan.formatRationale.includes('Defaulting to portable single-file'));
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });
  });

  describe('4. Bounded Project Inspection Safety', () => {
    it('safely handles non-existent projectRoot without throwing', () => {
      const plan = planProductExperience({
        rawPrompt: 'Add telemetry widget',
        projectRoot: 'C:\\non\\existent\\path\\to\\project'
      });

      assert.ok(plan.targetFormat);
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });

    it('safely handles file path passed as projectRoot without throwing', () => {
      const plan = planProductExperience({
        rawPrompt: 'Add telemetry widget',
        projectRoot: path.join(process.cwd(), 'package.json')
      });

      assert.ok(plan.targetFormat);
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });

    it('respects real repository inspection when valid directory provided', () => {
      const plan = planProductExperience({
        rawPrompt: 'Add a new metrics component',
        projectRoot: process.cwd()
      });

      assert.ok(plan.formatRationale);
      assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
    });
  });

  describe('5. Invalid Input and Schema Boundaries', () => {
    it('rejects input with prompt under 3 characters', () => {
      assert.throws(() => {
        planProductExperience({ rawPrompt: 'hi' });
      }, /Prompt must describe the intended application/);
    });

    it('bounds rationale strings to <= 120 characters across all views', () => {
      const plan = planProductExperience({
        rawPrompt: 'Build an e-commerce management portal with products, orders, customers, and analytics.'
      });

      for (const view of plan.candidateViews) {
        assert.ok(view.inclusionRationale.length <= 120);
      }
    });

    it('reports unsupported capabilities transparently', () => {
      const plan = planProductExperience({
        rawPrompt: 'Analyze this screenshot and build an identical page'
      });

      assert.ok(plan.unsupportedCapabilities.some((c: string) => c.includes('Raw visual screenshot')));
      assert.ok(plan.unsupportedCapabilities.some((c: string) => c.includes('Runtime browser DOM')));
    });
  });

  describe('6. Backward Compatibility with Existing Product Analysis', () => {
    it('matches domain detection and classification of analyzeProductContext', () => {
      const rawPrompt = 'Online grocery store with shopping cart and product catalog';
      const plan = planProductExperience({ rawPrompt });

      const existingAnalysis = analyzeProductContext({
        productName: plan.productName,
        domain: plan.domain,
        primaryUserGoal: `Plan and structure experience for ${plan.productName}`,
        dataDensity: 'medium',
        environment: 'office_daylight'
      });

      assert.strictEqual(plan.domain, existingAnalysis.providedFacts.domain);
      assert.strictEqual(plan.domain, 'ecommerce');
    });
  });

  describe('7. Latency Benchmarking (Separated In-Process Timing Methodology)', () => {
    it('measures first in-process call and warm executions over 50 iterations', async () => {
      const rawPrompt = 'Build a modern e-commerce product performance dashboard.';

      // First in-process invocation timing (note: module is already imported in test process)
      const firstCallStart = performance.now();
      const firstPlan = planProductExperience({ rawPrompt });
      const firstCallDurationMs = performance.now() - firstCallStart;

      assert.ok(firstPlan.candidateViews.length > 0);

      // Warm executions (50 iterations)
      const iterations = 50;
      const warmLatencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        planProductExperience({ rawPrompt });
        warmLatencies.push(performance.now() - start);
      }

      warmLatencies.sort((a, b) => a - b);
      const sum = warmLatencies.reduce((acc, v) => acc + v, 0);
      const meanMs = sum / iterations;
      const minMs = warmLatencies[0];
      const maxMs = warmLatencies[warmLatencies.length - 1];
      const p95Ms = warmLatencies[Math.floor(iterations * 0.95)];

      console.log(`\n======================================================`);
      console.log(`PXI Phase 1 Timing Benchmark (Separated Measurement)`);
      console.log(`======================================================`);
      console.log(`First In-Process Call:  ${firstCallDurationMs.toFixed(3)} ms (in-process first call after module load)`);
      console.log(`Warm Iterations:        ${iterations} runs`);
      console.log(`Warm Mean Latency:      ${meanMs.toFixed(3)} ms`);
      console.log(`Warm Min Latency:       ${minMs.toFixed(3)} ms`);
      console.log(`Warm Max Latency:       ${maxMs.toFixed(3)} ms`);
      console.log(`Warm p95 Latency:       ${p95Ms.toFixed(3)} ms`);
      console.log(`======================================================\n`);

      assert.ok(meanMs < 10, `Warm mean latency (${meanMs.toFixed(3)} ms) should be bounded < 10 ms`);
    });
  });

});
