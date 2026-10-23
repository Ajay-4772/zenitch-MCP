import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { analyzeProductContext } from '../src/intelligence/product-analyzer.js';
import { inspectProject } from '../src/intelligence/project-inspector.js';
import { ZenitchServer } from '../src/server.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// ===========================================================================
// 1. PRODUCT INTELLIGENCE TESTS
// ===========================================================================

test('Product Intelligence: Healthcare product enforces strict light theme and WCAG AAA', () => {
  const result = analyzeProductContext({
    productName: 'CardioFlow Clinical',
    domain: 'healthcare',
    primaryUserGoal: 'Review patient telemetry and configure drug dosage limits',
    dataDensity: 'dense',
    environment: 'office_daylight'
  });

  // Verify structure
  assert.equal(result.productName, 'CardioFlow Clinical');
  assert.equal(result.domain, 'healthcare');

  // Verify facts vs assumptions separation
  assert.equal(result.providedFacts.productName, 'CardioFlow Clinical');
  assert.equal(result.providedFacts.specifiedDensity, 'dense');
  assert.ok(result.inferredAssumptions.length > 0);
  assert.ok(result.inferredAssumptions.some(a => a.includes('clinical') || a.includes('glare')));

  // Verify constraints
  assert.equal(result.constraints.recommendedTheme, 'light');
  assert.equal(result.constraints.maxAllowedMotionLevel, 'none');
  assert.equal(result.accessibilityDirectives.wcagTarget, 'WCAG_2_2_AAA');

  // Verify forbidden anti-patterns
  assert.ok(result.constraints.forbiddenPatterns.some(p => p.toLowerCase().includes('dark mode')));
  assert.ok(result.constraints.forbiddenPatterns.some(p => p.toLowerCase().includes('neon')));
});

test('Product Intelligence: Luxury domain allows dark mode and cinematic motion with strict bounds', () => {
  const result = analyzeProductContext({
    productName: 'Aurelia Haute Horlogerie',
    domain: 'luxury',
    primaryUserGoal: 'Immerse high-net-worth collectors in bespoke tourbillon watchmaking',
    dataDensity: 'low',
    environment: 'low_light'
  });

  assert.equal(result.constraints.recommendedTheme, 'dark');
  assert.equal(result.constraints.maxAllowedMotionLevel, 'cinematic');
  assert.ok(result.constraints.forbiddenPatterns.some(p => p.toLowerCase().includes('brass') || p.toLowerCase().includes('cliché')));
  assert.ok(result.constraints.requiredErgonomics.some(e => e.toLowerCase().includes('editorial')));
});

test('Product Intelligence: Developer tool prioritizes monospace code clarity and keyboard navigation', () => {
  const result = analyzeProductContext({
    productName: 'KubeTrace CLI',
    domain: 'developer_tool',
    primaryUserGoal: 'Stream distributed trace logs and debug microservice latencies',
    dataDensity: 'high',
    environment: 'office_daylight'
  });

  assert.ok(result.constraints.requiredErgonomics.some(e => e.includes('Monospace')));
  assert.ok(result.constraints.requiredErgonomics.some(e => e.includes('keyboard')));
});

// ===========================================================================
// 2. PROJECT INTELLIGENCE TESTS
// ===========================================================================

test('Project Intelligence: Real-world inspection of Zenitch root workspace (Read-Only)', () => {
  // Inspect the parent workspace
  const targetDir = path.resolve('../..');
  const canaryFile = path.join(targetDir, 'LICENSE');
  const beforeStats = fs.statSync(canaryFile);

  const result = inspectProject({
    projectRoot: targetDir,
    scanDepth: 4
  });

  // Verify read-only guarantee: modification time must not change
  const afterStats = fs.statSync(canaryFile);
  assert.equal(beforeStats.mtimeMs, afterStats.mtimeMs, 'File modification time must remain identical');

  // Verify discoveries
  assert.ok(result.projectRoot);
  assert.ok(result.detectedLanguages.includes('JavaScript') || result.detectedLanguages.includes('HTML') || result.detectedLanguages.includes('CSS'));
  assert.ok(result.discoveredPagesAndRoutes.length > 0);
  assert.ok(result.discoveredComponents.length >= 0);
  assert.ok(result.structureSummary.length > 0);
});

test('Project Intelligence: Safely handles non-existent paths with clean structured error', () => {
  assert.throws(() => {
    inspectProject({
      projectRoot: 'C:/this/path/does/not/exist/anywhere/on/disk'
    });
  }, /not found/);
});

test('Project Intelligence: Rejects file paths when directory is expected', () => {
  const filePath = path.resolve('package.json');
  assert.throws(() => {
    inspectProject({
      projectRoot: filePath
    });
  }, /file, not a directory/);
});

test('Project Intelligence: Security check redacts sensitive environment files', () => {
  // Create a temporary sandbox directory with a dummy .env
  const tempDir = path.resolve('./temp-security-test');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const dummyEnv = path.join(tempDir, '.env');
  fs.writeFileSync(dummyEnv, 'SUPER_SECRET_DATABASE_KEY=secret_12345\nAPI_SECRET=very_secret');

  try {
    const result = inspectProject({
      projectRoot: tempDir
    });

    assert.equal(result.securitySummary.secretsRedactedCount, 1);
    assert.deepEqual(result.securitySummary.environmentFilesIgnored, ['.env']);
    // Verify that the secret values NEVER appear in any output field
    const jsonOutput = JSON.stringify(result);
    assert.ok(!jsonOutput.includes('secret_12345'), 'Secret key must never leak into inspection output');
    assert.ok(!jsonOutput.includes('very_secret'), 'Secret API key must never leak into inspection output');
  } finally {
    fs.unlinkSync(dummyEnv);
    fs.rmdirSync(tempDir);
  }
});

// ===========================================================================
// 3. MCP SERVER END-TO-END TOOL CALL TESTS
// ===========================================================================

test('ZenitchServer: executes zenitch_analyze_product_context via CallTool', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();

  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_analyze_product_context',
      arguments: {
        productName: 'VaultPay',
        domain: 'fintech',
        primaryUserGoal: 'Approve multi-signature treasury payments',
        dataDensity: 'high',
        environment: 'office_daylight'
      }
    }
  });

  assert.ok(!response.isError);
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.domain, 'fintech');
  assert.ok(parsed.data.justification.includes('VaultPay'));
  assert.ok(parsed.telemetry.executionMs >= 0);
});

test('ZenitchServer: executes zenitch_inspect_project via CallTool and returns real analysis', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();

  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_inspect_project',
      arguments: {
        projectRoot: path.resolve('.') // Current package root
      }
    }
  });

  assert.ok(!response.isError);
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.success, true);
  assert.ok(parsed.data.dependencies['@modelcontextprotocol/sdk']);
  assert.ok(parsed.data.detectedLanguages.includes('TypeScript') || parsed.data.detectedLanguages.includes('JavaScript'));
});
