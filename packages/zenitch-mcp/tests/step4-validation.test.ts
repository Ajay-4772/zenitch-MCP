import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDesignSystem } from '../src/intelligence/design-system-generator.js';
import { resolveComponent } from '../src/intelligence/component-resolver.js';

test('Step 4 Validation: Compound subcomponents do NOT trigger false-positive duplicate warnings', () => {
  const result = resolveComponent({
    requestedFunctionality: 'Card container with header',
    targetPageOrView: 'Dashboard',
    existingComponentsOverride: [
      { name: 'Card', filePath: 'src/components/ui/Card.tsx', type: 'ui_primitive' },
      { name: 'CardHeader', filePath: 'src/components/ui/CardHeader.tsx', type: 'ui_primitive' },
      { name: 'CardFooter', filePath: 'src/components/ui/CardFooter.tsx', type: 'ui_primitive' },
      { name: 'Dialog', filePath: 'src/components/ui/Dialog.tsx', type: 'ui_primitive' },
      { name: 'DialogTrigger', filePath: 'src/components/ui/DialogTrigger.tsx', type: 'ui_primitive' },
      // Actual duplicates:
      { name: 'Button', filePath: 'src/components/ui/Button.tsx', type: 'ui_primitive' },
      { name: 'PrimaryButton', filePath: 'src/components/ui/PrimaryButton.tsx', type: 'ui_primitive' }
    ]
  });

  // Card vs CardHeader should NOT be in detectedDuplicates
  const cardFalsePositive = result.detectedDuplicates.find(
    d => (d.componentA === 'Card' && d.componentB === 'CardHeader') ||
         (d.componentA === 'CardHeader' && d.componentB === 'Card')
  );
  assert.equal(cardFalsePositive, undefined, 'Card and CardHeader must not be flagged as duplicates');

  const dialogFalsePositive = result.detectedDuplicates.find(
    d => (d.componentA === 'Dialog' && d.componentB === 'DialogTrigger') ||
         (d.componentA === 'DialogTrigger' && d.componentB === 'Dialog')
  );
  assert.equal(dialogFalsePositive, undefined, 'Dialog and DialogTrigger must not be flagged as duplicates');

  // Genuine duplicate (Button vs PrimaryButton) MUST be detected
  const buttonDuplicate = result.detectedDuplicates.find(
    d => (d.componentA === 'Button' && d.componentB === 'PrimaryButton') ||
         (d.componentA === 'PrimaryButton' && d.componentB === 'Button')
  );
  assert.ok(buttonDuplicate, 'Button and PrimaryButton must be detected as genuine duplicates');
});

test('Step 4 Validation: Dark-only theme produces high-contrast light text on dark background', () => {
  const result = generateDesignSystem({
    productDomain: 'enterprise_saas',
    colorMode: 'dark_only'
  });

  const bgToken = result.colorTokens.find(c => c.name === '--color-background');
  const textToken = result.colorTokens.find(c => c.name === '--color-text-primary');

  assert.ok(bgToken);
  assert.ok(textToken);
  assert.equal(bgToken.hex, '#0f172a');
  assert.equal(textToken.hex, '#f8fafc');

  // Verify contrast of light text on dark background
  assert.ok(textToken.contrastOnBackground! >= 10.0, `Expected contrast >= 10.0, got ${textToken.contrastOnBackground}`);
});

test('Step 4 Validation: preventDarkTheme constraint omits prefers-color-scheme media block', () => {
  const result = generateDesignSystem({
    productDomain: 'healthcare',
    colorMode: 'dual_adaptive',
    constraints: {
      preventDarkTheme: true
    }
  });

  assert.ok(!result.cssVariablesExport.includes('@media (prefers-color-scheme: dark)'));
  assert.ok(result.rationalExplanation.includes('preventDarkTheme'));
});

test('Step 4 Validation: maxColors: 4 preserves essential reading tokens (bg, surface, text, primary)', () => {
  const result = generateDesignSystem({
    productDomain: 'enterprise_saas',
    constraints: {
      maxColors: 4
    }
  });

  assert.equal(result.colorTokens.length, 4);
  const tokenNames = result.colorTokens.map(c => c.name);
  assert.ok(tokenNames.includes('--color-background'));
  assert.ok(tokenNames.includes('--color-surface'));
  assert.ok(tokenNames.includes('--color-text-primary'));
  assert.ok(tokenNames.includes('--color-primary'));
  assert.equal(result.tokenOrigins.preservedCount + result.tokenOrigins.proposedCount, 4 + result.typographyTokens.length);
});

test('Step 4 Validation: Preserves existing typography and custom background tokens', () => {
  const existingCss = `
    :root {
      --color-background: #f1f5f9;
      --font-heading: 'Poppins', sans-serif;
      --font-body: 'Open Sans', sans-serif;
    }
  `;

  const result = generateDesignSystem({
    productDomain: 'consumer',
    existingTokensSnippet: existingCss,
    preserveExistingTokens: true
  });

  const bgToken = result.colorTokens.find(c => c.name === '--color-background');
  assert.equal(bgToken?.hex, '#f1f5f9');
  assert.equal(bgToken?.isExisting, true);

  const headingToken = result.typographyTokens.find(t => t.role === 'heading');
  assert.ok(headingToken?.fontFamily.includes('Poppins'));
  assert.equal(headingToken?.isExisting, true);

  const bodyToken = result.typographyTokens.find(t => t.role === 'body');
  assert.ok(bodyToken?.fontFamily.includes('Open Sans'));
  assert.equal(bodyToken?.isExisting, true);

  assert.ok(result.tokenOrigins.preservedCount >= 3);
});

test('Step 4 Validation: Scaffolds Svelte 5 component with runes ($props)', () => {
  const result = resolveComponent({
    requestedFunctionality: 'Interactive audio visualizer canvas',
    frameworkHint: 'svelte'
  });

  assert.equal(result.resolutionType, 'SCAFFOLD_NEW');
  assert.ok(result.recommendedComponent.codeSnippet.includes('$props()'));
  assert.ok(result.recommendedComponent.codeSnippet.includes('{@render children?.()}'));
});

test('Step 4 Validation: Missing or invalid projectRoot reports structured warning gracefully', () => {
  const result = resolveComponent({
    requestedFunctionality: 'Filter bar',
    projectRoot: 'Z:/does_not_exist_at_all_12345'
  });

  assert.ok(result);
  assert.equal(result.resolutionType, 'SCAFFOLD_NEW');
  assert.ok(result.evidence.frameworkConventions.includes('does not exist'));
});
