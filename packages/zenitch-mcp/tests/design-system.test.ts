import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDesignSystem, calculateContrastRatio } from '../src/intelligence/design-system-generator.js';
import { ZenitchServer } from '../src/server.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

test('Contrast Math: correctly calculates WCAG 2.2 relative luminance contrast ratio', () => {
  // Pure black on pure white is 21:1
  const blackOnWhite = calculateContrastRatio('#000000', '#ffffff');
  assert.equal(blackOnWhite, 21);

  // Pure white on pure white is 1:1
  const whiteOnWhite = calculateContrastRatio('#ffffff', '#ffffff');
  assert.equal(whiteOnWhite, 1);

  // #0284c7 (Sky 600) on #ffffff is ~4.5:1 or higher
  const skyOnWhite = calculateContrastRatio('#0284c7', '#ffffff');
  assert.ok(skyOnWhite >= 4.0, `Expected contrast >= 4.0, got ${skyOnWhite}`);
});

test('Design System Intelligence: Healthcare domain enforces AAA contrast, clinical typography & small radii', () => {
  const result = generateDesignSystem({
    productDomain: 'healthcare',
    brandMood: 'clinical_precise',
    colorMode: 'light_only',
    preserveExistingTokens: true
  });

  assert.equal(result.a11yComplianceRating, 'WCAG_AAA');
  assert.ok(result.colorTokens.length >= 6);

  // Verify primary token
  const primary = result.colorTokens.find(c => c.name === '--color-primary');
  assert.ok(primary);
  assert.equal(primary.source, 'proposed_recommendation');

  // Verify typography
  const heading = result.typographyTokens.find(t => t.role === 'heading');
  assert.ok(heading?.fontFamily.includes('Inter'));

  // Verify spacing scale & radii
  assert.ok(result.spacingScale.length >= 5);
  const radiusMd = result.borderRadiusTokens?.find(r => r.name === '--radius-md');
  assert.equal(radiusMd?.value, '4px');

  // Verify CSS variables export
  assert.ok(result.cssVariablesExport.includes(':root {'));
  assert.ok(result.cssVariablesExport.includes('--color-primary:'));
});

test('Design System Intelligence: Luxury domain generates gold/obsidian palette, serif fonts & subtle radii', () => {
  const result = generateDesignSystem({
    productDomain: 'luxury',
    brandMood: 'luxury_sensory',
    colorMode: 'dark_only',
    preserveExistingTokens: true
  });

  const primary = result.colorTokens.find(c => c.name === '--color-primary');
  assert.equal(primary?.hex, '#c5a059'); // Bronze gold

  const heading = result.typographyTokens.find(t => t.role === 'heading');
  assert.ok(heading?.fontFamily.includes('Playfair Display') || heading?.fontFamily.includes('Cinzel'));

  const radiusMd = result.borderRadiusTokens?.find(r => r.name === '--radius-md');
  assert.equal(radiusMd?.value, '1px');
});

test('Design System Intelligence: Preserves existing brand tokens and marks source accurately', () => {
  const existingCss = `
    :root {
      --color-brand-primary: #e11d48;
      --color-brand-secondary: #0f172a;
      --color-duplicate: #e11d48;
    }
  `;

  const result = generateDesignSystem({
    productDomain: 'enterprise_saas',
    brandMood: 'enterprise_solid',
    colorMode: 'dual_adaptive',
    preserveExistingTokens: true,
    existingTokensSnippet: existingCss
  });

  // Primary should be preserved from existingCss (#e11d48)
  const primary = result.colorTokens.find(c => c.name === '--color-primary');
  assert.equal(primary?.hex, '#e11d48');
  assert.equal(primary?.isExisting, true);
  assert.equal(primary?.source, 'existing_project');

  // Token origins count
  assert.ok(result.tokenOrigins.preservedCount >= 1);
  assert.ok(result.tokenOrigins.proposedCount >= 1);

  // Inconsistency check: duplicate hex #e11d48 should be identified
  const duplicateWarning = result.inconsistenciesIdentified.find(i => i.type === 'duplicate_value');
  assert.ok(duplicateWarning);
  assert.ok(duplicateWarning.description.includes('#e11d48'));
});

test('Design System Intelligence: Enforces user constraints (maxColors, customBrandPrimaryHex)', () => {
  const result = generateDesignSystem({
    productDomain: 'fintech',
    brandMood: 'enterprise_solid',
    colorMode: 'dual_adaptive',
    constraints: {
      maxColors: 4,
      customBrandPrimaryHex: '#10b981',
      enforceWcagLevel: 'WCAG_AAA'
    }
  });

  assert.equal(result.colorTokens.length, 4);
  const primary = result.colorTokens.find(c => c.name === '--color-primary');
  assert.equal(primary?.hex, '#10b981');
  assert.equal(result.a11yComplianceRating, 'WCAG_AAA');
});

test('Design System Intelligence: Flags contrast violations when colors fail WCAG threshold', () => {
  // Low-contrast yellow text (#fef08a) on white background (#ffffff)
  const existingCss = `
    :root {
      --color-primary: #fef08a;
    }
  `;

  const result = generateDesignSystem({
    productDomain: 'enterprise_saas',
    brandMood: 'enterprise_solid',
    colorMode: 'light_only',
    preserveExistingTokens: true,
    existingTokensSnippet: existingCss
  });

  const contrastIssue = result.inconsistenciesIdentified.find(i => i.type === 'contrast_violation');
  assert.ok(contrastIssue, 'Should flag contrast violation for low-contrast primary color');
  assert.equal(contrastIssue?.severity, 'WARNING');
});

test('ZenitchServer: executes zenitch_generate_design_system via CallTool', async () => {
  const server = new ZenitchServer({ requireApprovalForChanges: false, logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();

  const handler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
  assert.ok(handler);

  const response = await handler(
    {
      method: 'tools/call',
      params: {
        name: 'zenitch_generate_design_system',
        arguments: {
          productDomain: 'developer_tool',
          brandMood: 'minimal_editorial',
          colorMode: 'dual_adaptive',
          preserveExistingTokens: true
        }
      }
    },
    {}
  );

  assert.equal(response.isError, undefined);
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.success, true);
  assert.ok(parsed.data.systemName.includes('Developer Tool'));
  assert.ok(parsed.data.colorTokens.length > 0);
  assert.ok(parsed.data.tailwindConfigExport.includes('tailwind.config.js'));
});
