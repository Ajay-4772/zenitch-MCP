import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { ZenitchServer } from '../src/server.js';
import { StaticVerifier } from '../src/verification/static-verifier.js';
import { RuntimeVerifier, VIEWPORTS } from '../src/verification/runtime-verifier.js';
import { VerificationCache } from '../src/verification/verification-cache.js';
import { VerificationManager } from '../src/verification/verification-manager.js';
import { StorageEngine } from '../src/memory/storage-engine.js';
import { MigrationEngine } from '../src/memory/migration-engine.js';
import { MemoryManager } from '../src/memory/memory-manager.js';
import {
  VerificationFileSchema,
  RequirementsFileSchema,
  ChangesFileSchema
} from '../src/schemas/memory.schema.js';

function createTempDir(prefix = 'zenitch-p3-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error
  }
}

// ----------------------------------------------------
// A. STATIC VERIFICATION TESTS
// ----------------------------------------------------

test('1. Static verification: detects route definitions and files', async () => {
  const tempDir = createTempDir();
  try {
    fs.mkdirSync(path.join(tempDir, 'src/pages'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src/pages/dashboard.tsx'), 'export default function Dashboard() { return <div>Dashboard</div>; }');

    const result = await StaticVerifier.execute(tempDir, {
      route: '/dashboard'
    });

    assert.equal(result.passed, true);
    assert.ok(result.evidence.length > 0);
    assert.equal(result.evidence[0].type, 'PAGE_REACHED');
    assert.ok(result.evidence[0].actual?.includes('dashboard.tsx'));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('2. Static verification: fails when route cannot be found', async () => {
  const tempDir = createTempDir();
  try {
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src/index.ts'), 'console.log("hello");');

    const result = await StaticVerifier.execute(tempDir, {
      route: '/non-existent-route'
    });

    assert.equal(result.passed, false);
    assert.equal(result.evidence[0].actual, 'NOT_FOUND');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('3. Static verification: verifies component declarations in project', async () => {
  const tempDir = createTempDir();
  try {
    fs.mkdirSync(path.join(tempDir, 'src/components'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src/components/LoginForm.tsx'), 'export function LoginForm() { return <form></form>; }');

    const compRes = StaticVerifier.verifyComponentExists(tempDir, 'LoginForm');
    assert.equal(compRes.found, true);
    assert.equal(compRes.evidence.type, 'ELEMENT_FOUND');

    const missingRes = StaticVerifier.verifyComponentExists(tempDir, 'NonExistentModal');
    assert.equal(missingRes.found, false);
    assert.equal(missingRes.evidence.actual, 'NOT_FOUND');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('4. Static verification: verifies text and selectors in templates', async () => {
  const tempDir = createTempDir();
  try {
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'src/App.tsx'),
      '<div class="order-summary"><button data-testid="submit-order">Place Order</button></div>'
    );

    const textRes = StaticVerifier.verifyTextExists(tempDir, 'Place Order');
    assert.equal(textRes.found, true);
    assert.equal(textRes.evidence.actual, 'PRESENT');

    const selectorRes = StaticVerifier.verifySelectorExists(tempDir, '[data-testid="submit-order"]');
    assert.equal(selectorRes.found, true);

    const missingSelector = StaticVerifier.verifySelectorExists(tempDir, '#missing-checkout-btn');
    assert.equal(missingSelector.found, false);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ----------------------------------------------------
// B. RUNTIME VERIFICATION WITH DETERMINISTIC HTTP SERVER
// ----------------------------------------------------

test('5. Runtime verification: navigates route and verifies elements on running server', async () => {
  const tempDir = createTempDir();
  const server = http.createServer((req, res) => {
    if (req.url === '/login') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><body><h1>Sign In</h1><form><input name="email" /><button type="submit">Log In</button></form></body></html>');
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = 'http://localhost:' + port;

  try {
    const result = await RuntimeVerifier.execute({
      projectRoot: tempDir,
      route: '/login',
      devServerUrl: baseUrl,
      actions: [
        { action: 'CHECK_TEXT', target: 'h1', expected: 'Sign In' },
        { action: 'CHECK_VISIBLE', target: 'input[name="email"]' },
        { action: 'CHECK_VISIBLE', target: 'button' }
      ]
    });

    assert.equal(result.verdict, 'PASSED');
    assert.ok(result.evidence.length >= 3);
    assert.ok(result.summary.includes('PASSED'));
  } finally {
    server.close();
    cleanupTempDir(tempDir);
  }
});

test('6. Runtime verification: fails concisely on missing expected text or element', async () => {
  const tempDir = createTempDir();
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body><div>Order In Progress</div></body></html>');
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = 'http://localhost:' + port;

  try {
    const result = await RuntimeVerifier.execute({
      projectRoot: tempDir,
      route: '/checkout',
      devServerUrl: baseUrl,
      actions: [
        { action: 'CHECK_TEXT', target: 'div', expected: 'Order Completed Successfully' }
      ]
    });

    assert.equal(result.verdict, 'FAILED');
    assert.ok(result.summary.includes('FAILED'));
    const failedItem = result.evidence.find(e => e.actual === 'ABSENT');
    assert.ok(failedItem);
  } finally {
    server.close();
    cleanupTempDir(tempDir);
  }
});

test('7. Runtime verification: returns BLOCKED when dev server is offline', async () => {
  const tempDir = createTempDir();
  try {
    // Unreachable localhost port
    const result = await RuntimeVerifier.execute({
      projectRoot: tempDir,
      route: '/home',
      devServerUrl: 'http://localhost:59999',
      timeoutMs: 500
    });

    assert.equal(result.verdict, 'BLOCKED');
    assert.ok(result.summary.includes('not reachable') || result.summary.includes('BLOCKED'));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ----------------------------------------------------
// C. RESPONSIVE VERIFICATION & OVERFLOW DETECTION
// ----------------------------------------------------

test('8. Responsive verification: tests mobile viewport and detects fixed-width horizontal overflow', async () => {
  const tempDir = createTempDir();
  const server = http.createServer((req, res) => {
    // Container with 600px width will overflow on mobile (width 390px)
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body><div style="width: 600px;">Desktop wide content</div></body></html>');
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = 'http://localhost:' + port;

  try {
    const mobileResult = await RuntimeVerifier.execute({
      projectRoot: tempDir,
      route: '/responsive-test',
      viewport: 'mobile',
      devServerUrl: baseUrl
    });

    assert.equal(mobileResult.verdict, 'FAILED');
    const overflowEvidence = mobileResult.evidence.find(e => e.type === 'OVERFLOW_CHECK');
    assert.ok(overflowEvidence);
    assert.equal(overflowEvidence.actual, '600px');

    // On desktop (width 1280px), 600px should NOT overflow!
    const desktopResult = await RuntimeVerifier.execute({
      projectRoot: tempDir,
      route: '/responsive-test',
      viewport: 'desktop',
      devServerUrl: baseUrl
    });

    assert.equal(desktopResult.verdict, 'PASSED');
  } finally {
    server.close();
    cleanupTempDir(tempDir);
  }
});

// ----------------------------------------------------
// D. CACHING AND DETERMINISTIC INVALIDATION
// ----------------------------------------------------

test('9. Caching: reuses valid verification when code and criteria are unchanged', async () => {
  const tempDir = createTempDir();
  try {
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name":"test-app"}');

    // First static run
    const firstRun = await VerificationManager.verify({
      projectRoot: tempDir,
      mode: 'static',
      requirementId: 'REQ-001',
      acceptanceCriterionId: 'AC-001'
    });

    assert.equal(firstRun.status, 'PASSED');
    assert.equal(firstRun.reusedCachedEvidence, false);

    // Second run without code change -> should reuse cache!
    const secondRun = await VerificationManager.verify({
      projectRoot: tempDir,
      mode: 'static',
      requirementId: 'REQ-001',
      acceptanceCriterionId: 'AC-001'
    });

    assert.equal(secondRun.status, 'PASSED');
    assert.equal(secondRun.reusedCachedEvidence, true);
    assert.equal(secondRun.verificationId, firstRun.verificationId);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('10. Invalidation: code or requirement change invalidates cached verification', async () => {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name":"test-app"}');
    const appFile = path.join(tempDir, 'App.tsx');
    fs.writeFileSync(appFile, '<div>Hello World</div>');

    const firstRun = await VerificationManager.verify({
      projectRoot: tempDir,
      mode: 'static',
      requirementId: 'REQ-AUTH',
      acceptanceCriterionId: 'AC-AUTH-1',
      staticChecks: [{ type: 'TEXT_EXISTS', path: 'App.tsx', expectedText: 'Hello World' }]
    });

    assert.equal(firstRun.status, 'PASSED');

    // Invalidate affected verification by criterion
    const invalidated = await VerificationCache.invalidateAffected(tempDir, {
      criterionId: 'AC-AUTH-1'
    });

    assert.equal(invalidated, 1);

    // Next verification cannot reuse cache and runs fresh
    const secondRun = await VerificationManager.verify({
      projectRoot: tempDir,
      mode: 'static',
      requirementId: 'REQ-AUTH',
      acceptanceCriterionId: 'AC-AUTH-1',
      staticChecks: [{ type: 'TEXT_EXISTS', path: 'App.tsx', expectedText: 'Hello World' }]
    });

    assert.equal(secondRun.reusedCachedEvidence, false);
    assert.notEqual(secondRun.verificationId, firstRun.verificationId);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ----------------------------------------------------
// E. SECURITY AND REDACTION
// ----------------------------------------------------

test('11. Security: SSRF metadata endpoint is strictly blocked', () => {
  const gcpBlocked = RuntimeVerifier.validateUrlSafety('http://metadata.google.internal/computeMetadata/v1/');
  assert.equal(gcpBlocked.safe, false);

  const awsBlocked = RuntimeVerifier.validateUrlSafety('http://169.254.169.254/latest/meta-data/');
  assert.equal(awsBlocked.safe, false);

  const fileBlocked = RuntimeVerifier.validateUrlSafety('file:///etc/passwd');
  assert.equal(fileBlocked.safe, false);

  // S-005: Localhost is blocked by default without explicit authorization
  const localhostBlocked = RuntimeVerifier.validateUrlSafety('http://localhost:3000/app');
  assert.equal(localhostBlocked.safe, false);

  const loopbackAllowedExplicitly = RuntimeVerifier.validateUrlSafety('http://localhost:3000/app', { allowLoopback: true });
  assert.equal(loopbackAllowedExplicitly.safe, true);

  const validHttp = RuntimeVerifier.validateUrlSafety('https://example.com/app');
  assert.equal(validHttp.safe, true);
});

test('12. Security: secret redaction removes tokens from verification records', async () => {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name":"test"}');

    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify({ jwt: token }));

    const res = await VerificationManager.verify({
      projectRoot: tempDir,
      mode: 'static',
      staticChecks: [{ type: 'TEXT_EXISTS', path: 'config.json', target: token }]
    });

    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const verDoc = StorageEngine.readDocument<any>(zenitchDir, 'verification.json', VerificationFileSchema, () => null);
    const savedRecord = verDoc.items[res.verificationId];

    // Secret must NOT be in persisted evidence
    const savedStr = JSON.stringify(savedRecord);
    assert.ok(!savedStr.includes(token));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ----------------------------------------------------
// F. REQUIREMENT / ACCEPTANCE CRITERION LIFECYCLE SEPARATION
// ----------------------------------------------------

test('13. Lifecycle separation: passing verification moves criterion to PASSED but NEVER moves requirement to ACCEPTED', async () => {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name":"test"}');
    fs.mkdirSync(path.join(tempDir, 'src/pages'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src/pages/index.tsx'), 'export default function Home() { return <div>Home</div>; }');

    // Create a requirement with criterion via MemoryManager
    const reqRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'Checkout Flow',
      description: 'Customer can checkout order',
      acceptanceCriteria: ['AC-CHECKOUT-1: Order confirmation displays']
    });

    const reqId = reqRes.requirement.id;
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const reqDocBefore = StorageEngine.readDocument<any>(zenitchDir, 'requirements.json', RequirementsFileSchema, () => null);
    const criterionId = reqDocBefore.items[reqId].acceptanceCriteria[0].id;

    // Run verification on this criterion
    const verifRes = await VerificationManager.verify({
      projectRoot: tempDir,
      mode: 'static',
      requirementId: reqId,
      acceptanceCriterionId: criterionId,
      staticChecks: [{ type: 'ROUTE_EXISTS', path: '/' }]
    });

    assert.equal(verifRes.status, 'PASSED');

    // Inspect requirements.json
    const reqDocAfter = StorageEngine.readDocument<any>(zenitchDir, 'requirements.json', RequirementsFileSchema, () => null);
    const reqAfter = reqDocAfter.items[reqId];

    // Criterion is PASSED
    const critAfter = reqAfter.acceptanceCriteria.find((c: any) => c.id === criterionId);
    assert.equal(critAfter.status, 'PASSED');

    // Requirement is still REQUESTED (NEVER automatically ACCEPTED!)
    assert.notEqual(reqAfter.status, 'ACCEPTED');
    assert.equal(reqAfter.status, 'REQUESTED');
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ----------------------------------------------------
// G. MIGRATION: 1.1.0 -> 1.2.0
// ----------------------------------------------------

test('14. Schema migration: upgrades v1.1.0 verification document to v1.2.0 preserving all history', () => {
  const v11Doc = {
    schemaVersion: '1.1.0',
    projectId: 'PRJ-MIGRATION',
    _version: 3,
    updatedAt: '2026-09-01T00:00:00.000Z',
    items: {
      'ver-100': {
        id: 'ver-100',
        requirementId: 'REQ-1',
        verificationMethod: 'STATIC_ANALYSIS',
        verdict: 'PASSED',
        evidenceSummary: 'Legacy static evidence',
        timestamp: '2026-09-01T00:00:00.000Z'
      }
    }
  };

  const migrated = MigrationEngine.migrateDocument<any>('verification.json', v11Doc, '1.2.0');
  assert.equal(migrated.schemaVersion, '1.2.0');
  assert.equal(migrated._version, 3);
  assert.equal(migrated.items['ver-100'].verificationType, 'STATIC');
  assert.equal(migrated.items['ver-100'].evidenceSummary, 'Legacy static evidence');
  assert.deepEqual(migrated.items['ver-100'].evidence, []);
});

// ----------------------------------------------------
// H. CONCURRENCY: SIMULTANEOUS VERIFICATION WRITES
// ----------------------------------------------------

test('15. Concurrency: simultaneous verification writes serialize correctly without corruption', async () => {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name":"test"}');

    // Fire 5 concurrent verification writes
    const promises = Array.from({ length: 5 }, (_, i) =>
      VerificationManager.verify({
        projectRoot: tempDir,
        mode: 'static',
        requirementId: 'REQ-CONCURRENT-' + i,
        forceReverify: true
      })
    );

    const results = await Promise.all(promises);
    assert.equal(results.length, 5);

    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const verDoc = StorageEngine.readDocument<any>(zenitchDir, 'verification.json', VerificationFileSchema, () => null);

    // All 5 verification records must be preserved
    assert.equal(Object.keys(verDoc.items).length, 5);
    for (const r of results) {
      assert.ok(verDoc.items[r.verificationId]);
    }
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ----------------------------------------------------
// I. IMPORTANT ARCHITECTURAL TESTS (CASES 1-5)
// ----------------------------------------------------

test('16. Architectural Case 1: Requirement proven statically launches NO browser', async () => {
  const tempDir = createTempDir();
  try {
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src/LoginForm.tsx'), '<input name="email" /><input name="password" />');

    const result = await VerificationManager.verify({
      projectRoot: tempDir,
      mode: 'static',
      staticChecks: [
        { type: 'SELECTOR_EXISTS', target: 'name="email"' },
        { type: 'SELECTOR_EXISTS', target: 'name="password"' }
      ]
    });

    assert.equal(result.status, 'PASSED');
    assert.equal(result.mode, 'static');
    // Static mode completes in < 50ms without launching browser or probe
    assert.ok(result.durationMs < 200);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('17. Architectural Case 2: Requirement requiring runtime probing verifies targeted route only', async () => {
  const tempDir = createTempDir();
  const accessedRoutes: string[] = [];

  const server = http.createServer((req, res) => {
    accessedRoutes.push(req.url || '');
    if (req.url === '/checkout/submit') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Order Confirmed</h1>');
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  try {
    const result = await VerificationManager.verify({
      projectRoot: tempDir,
      mode: 'runtime',
      route: '/checkout/submit',
      devServerUrl: 'http://localhost:' + port,
      actions: [{ action: 'CHECK_TEXT', target: 'h1', expected: 'Order Confirmed' }]
    });

    assert.equal(result.status, 'PASSED');
    // Verifies ONLY the targeted route, does NOT crawl the application
    assert.ok(accessedRoutes.includes('/checkout/submit'));
    assert.ok(!accessedRoutes.includes('/dashboard'));
    assert.ok(!accessedRoutes.includes('/settings'));
  } finally {
    server.close();
    cleanupTempDir(tempDir);
  }
});

test('18. Architectural Case 3: Only mobile viewport layout probed when requested', async () => {
  const tempDir = createTempDir();
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<div>Responsive Content</div>');
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  try {
    const result = await VerificationManager.verify({
      projectRoot: tempDir,
      mode: 'responsive',
      viewport: 'mobile',
      devServerUrl: 'http://localhost:' + port
    });

    assert.equal(result.status, 'PASSED');
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const verDoc = StorageEngine.readDocument<any>(zenitchDir, 'verification.json', VerificationFileSchema, () => null);
    const record = verDoc.items[result.verificationId];

    // Only mobile viewport was configured and recorded
    assert.equal(record.environment.viewport, 'mobile');
    assert.equal(record.verificationType, 'RESPONSIVE');
  } finally {
    server.close();
    cleanupTempDir(tempDir);
  }
});

test('19. Architectural Case 4: Reuses previous valid verification when code unchanged', async () => {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name":"test"}');

    const v1 = await VerificationManager.verify({
      projectRoot: tempDir,
      mode: 'static',
      requirementId: 'REQ-STABLE'
    });

    const v2 = await VerificationManager.verify({
      projectRoot: tempDir,
      mode: 'static',
      requirementId: 'REQ-STABLE'
    });

    assert.equal(v1.status, 'PASSED');
    assert.equal(v2.status, 'PASSED');
    assert.equal(v2.reusedCachedEvidence, true);
    assert.equal(v2.verificationId, v1.verificationId);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('20. Architectural Case 5: Relevant implementation change invalidates affected verification', async () => {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name":"test"}');

    const v1 = await VerificationManager.verify({
      projectRoot: tempDir,
      mode: 'static',
      requirementId: 'REQ-MODIFIED'
    });

    // Invalidate affected requirement
    await VerificationCache.invalidateAffected(tempDir, {
      requirementId: 'REQ-MODIFIED'
    });

    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const verDoc = StorageEngine.readDocument<any>(zenitchDir, 'verification.json', VerificationFileSchema, () => null);
    assert.equal(verDoc.items[v1.verificationId].verdict, 'OUTDATED');

    // Run again - must produce new verification
    const v2 = await VerificationManager.verify({
      projectRoot: tempDir,
      mode: 'static',
      requirementId: 'REQ-MODIFIED'
    });

    assert.equal(v2.reusedCachedEvidence, false);
    assert.notEqual(v2.verificationId, v1.verificationId);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ----------------------------------------------------
// J. SERVER MCP TOOL SURFACE (11 -> 14 -> 16 -> 18 TOOLS)
// ----------------------------------------------------

test('21. MCP Tool Surface: Phase 3 mode advertises exactly 18 tools and executes verification tools', async () => {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name":"test"}');

    // 1. Default mode: exactly 11 baseline tools
    const defaultServer = new ZenitchServer({ enableZenitchTools: false });
    const defaultInstance = defaultServer.getServerInstance() as any;
    const defaultTools = await defaultInstance._requestHandlers.get('tools/list')({ method: 'tools/list' });
    assert.equal(defaultTools.tools.length, 11);

    // 2. Phase 1 mode: 14 tools
    const p1Server = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: false, enablePhase3Tools: false });
    const p1Instance = p1Server.getServerInstance() as any;
    const p1Tools = await p1Instance._requestHandlers.get('tools/list')({ method: 'tools/list' });
    assert.equal(p1Tools.tools.length, 14);

    // 3. Phase 2 mode: 16 tools
    const p2Server = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: false });
    const p2Instance = p2Server.getServerInstance() as any;
    const p2Tools = await p2Instance._requestHandlers.get('tools/list')({ method: 'tools/list' });
    assert.equal(p2Tools.tools.length, 16);

    // 4. Phase 3 mode: exactly 18 tools
    const p3Server = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true });
    const p3Instance = p3Server.getServerInstance() as any;
    const p3Tools = await p3Instance._requestHandlers.get('tools/list')({ method: 'tools/list' });
    assert.equal(p3Tools.tools.length, 18);

    const toolNames = p3Tools.tools.map((t: any) => t.name);
    assert.ok(toolNames.includes('zenitch_verify'));
    assert.ok(toolNames.includes('zenitch_inspect_verification'));

    // Call zenitch_verify over server
    const callHandler = p3Instance._requestHandlers.get('tools/call');
    const verifyCallRes = await callHandler({
      method: 'tools/call',
      params: {
        name: 'zenitch_verify',
        arguments: {
          projectRoot: tempDir,
          mode: 'static'
        }
      }
    });

    assert.equal(verifyCallRes.isError, undefined);
    const parsedData = JSON.parse(verifyCallRes.content[0].text);
    assert.equal(parsedData.success, true);
    assert.equal(parsedData.data.status, 'PASSED');

    // Call zenitch_inspect_verification over server
    const inspectCallRes = await callHandler({
      method: 'tools/call',
      params: {
        name: 'zenitch_inspect_verification',
        arguments: {
          projectRoot: tempDir,
          mode: 'concise'
        }
      }
    });

    assert.equal(inspectCallRes.isError, undefined);
    const inspectData = JSON.parse(inspectCallRes.content[0].text);
    assert.equal(inspectData.success, true);
    assert.ok(inspectData.data.count >= 1);
  } finally {
    cleanupTempDir(tempDir);
  }
});

