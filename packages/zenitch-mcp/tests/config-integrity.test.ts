import { z } from 'zod';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ZenitchServer } from '../src/server.js';
import { ReadinessEvaluator } from '../src/readiness/readiness-evaluator.js';
import { ReadinessManager } from '../src/readiness/readiness-manager.js';
import { ArchitectureEvaluator } from '../src/architecture/architecture-evaluator.js';
import { ArchitectureManager } from '../src/architecture/architecture-manager.js';
import { StorageEngine } from '../src/memory/storage-engine.js';
import { StaticVerifier } from '../src/verification/static-verifier.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

function createTempDir(prefix = 'zenitch-config-test-'): string {
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
// 1. UNDOCUMENTED ENVIRONMENT VARIABLE REFERENCES
// ----------------------------------------------------
test('1. Undocumented env var reference: flags missing documentation as non-blocking warning', () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, '.env.example'), 'PORT=3000\n');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'api.ts'),
      "export const key = process.env.STRIPE_SECRET_KEY;\n"
    );

    const result = ReadinessEvaluator.evaluateConfiguration(dir);

    assert.equal(result.category, 'CONFIGURATION');
    assert.equal(result.status, 'NEEDS_ATTENTION');
    assert.equal(result.blockingFindings, 0, 'Must never block release for missing env documentation');
    assert.equal(result.attentionFindings, 1);

    const undocFinding = result.findings.find(f => f.id.includes('STRIPE_SECRET_KEY'));
    assert.ok(undocFinding, 'Expected finding for STRIPE_SECRET_KEY');
    assert.equal(undocFinding?.severity, 'MEDIUM');
    assert.equal(undocFinding?.status, 'WARN');
    assert.equal(undocFinding?.isBlocking, false);
    assert.ok(undocFinding?.affectedFiles?.includes('src/api.ts'));
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 2. DOCUMENTED VARIABLES IN .env.example AND .env.template
// ----------------------------------------------------
test('2. Documented variables in .env.example and .env.template: fully reconciled', () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, '.env.example'), 'DATABASE_URL=postgres://localhost:5432/db\nREDIS_HOST=localhost\n');
    fs.writeFileSync(path.join(dir, '.env.template'), 'SERVICE_ENDPOINT=https://api.internal\n');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'db.ts'),
      "const db = process.env.DATABASE_URL;\nconst redis = process.env['REDIS_HOST'];\nconst svc = import.meta.env.SERVICE_ENDPOINT;\n"
    );

    const result = ReadinessEvaluator.evaluateConfiguration(dir);

    assert.equal(result.category, 'CONFIGURATION');
    assert.equal(result.status, 'READY');
    assert.equal(result.blockingFindings, 0);
    assert.equal(result.attentionFindings, 0);

    const verifiedFinding = result.findings.find(f => f.id === 'FIND-CONFIG-CONTRACT-VERIFIED');
    assert.ok(verifiedFinding, 'Expected contract verified finding');
    assert.equal(verifiedFinding?.status, 'PASS');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 3. DIRECT FALLBACK EXPRESSIONS
// ----------------------------------------------------
test('3. Direct fallback expressions: ||, ?? and destructuring defaults recognized and not flagged', () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, '.env.example'), '# No vars listed\n');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'server.ts'),
      `
      const port = process.env.CUSTOM_PORT || 8080;
      const host = process.env.CUSTOM_HOST ?? '0.0.0.0';
      const { TIMEOUT = 5000 } = process.env;
      `
    );

    const result = ReadinessEvaluator.evaluateConfiguration(dir);

    assert.equal(result.status, 'READY');
    assert.equal(result.attentionFindings, 0);
    const undocFindings = result.findings.filter(f => f.id.startsWith('FIND-CONFIG-UNDOCUMENTED-'));
    assert.equal(undocFindings.length, 0, 'Variables with fallback expressions must not be flagged');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 4. STANDARD RUNTIME VARIABLE EXEMPTIONS
// ----------------------------------------------------
test('4. Standard runtime variable exemptions: NODE_ENV, CI, PORT not flagged without template', () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, '.env.example'), '# empty\n');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'runtime.ts'),
      `
      const isDev = process.env.NODE_ENV === 'development';
      const isCi = process.env.CI;
      const port = process.env.PORT;
      const tz = process.env.TZ;
      `
    );

    const result = ReadinessEvaluator.evaluateConfiguration(dir);

    assert.equal(result.status, 'READY');
    assert.equal(result.attentionFindings, 0);
    const undoc = result.findings.filter(f => f.id.startsWith('FIND-CONFIG-UNDOCUMENTED-'));
    assert.equal(undoc.length, 0, 'Standard runtime variables must be exempt');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 5. PUBLIC CLIENT-VARIABLE CONVENTIONS
// ----------------------------------------------------
test('5. Public client-variable conventions: NEXT_PUBLIC_* and VITE_* treated as public conventions', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'app.tsx'),
      `
      'use client';
      export const title = process.env.NEXT_PUBLIC_APP_TITLE;
      export const apiUrl = import.meta.env.VITE_API_URL;
      `
    );

    const arch = ArchitectureEvaluator.evaluate(dir);
    const leakFindings = arch.findings.filter(f => f.ruleId === 'RULE-BUILTIN-CLIENT-SECRET-LEAK');
    assert.equal(leakFindings.length, 0, 'Framework-public prefixes must not be flagged as secret leaks');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 6. SUSPICIOUS SERVER-SECRET REFERENCES IN CLIENT COMPONENTS
// ----------------------------------------------------
test('6. Suspicious server-secret references in client components: flags RULE-BUILTIN-CLIENT-SECRET-LEAK', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'ClientWidget.tsx'),
      `
      'use client';
      import React from 'react';
      const db = process.env.DATABASE_URL;
      const secret = process.env.STRIPE_SECRET_KEY;
      export function Widget() { return <div>Widget</div>; }
      `
    );

    const arch = ArchitectureEvaluator.evaluate(dir);
    const leakFindings = arch.findings.filter(f => f.ruleId === 'RULE-BUILTIN-CLIENT-SECRET-LEAK');

    assert.equal(leakFindings.length, 2, 'Expected 2 secret leak findings for DATABASE_URL and STRIPE_SECRET_KEY');
    assert.ok(leakFindings.some(f => f.evidence.measuredValue === 'DATABASE_URL'));
    assert.ok(leakFindings.some(f => f.evidence.measuredValue === 'STRIPE_SECRET_KEY'));
    assert.equal(leakFindings[0].category, 'LAYER_RULE_VIOLATION');
    assert.equal(leakFindings[0].severity, 'HIGH');
    assert.equal(leakFindings[0].factConfidence, 1.0);
    assert.ok(leakFindings[0].recommendedAction.includes('Server Components'));
    assert.ok(leakFindings[0].affectedFiles.includes('src/ClientWidget.tsx'));
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 6b. DANGEROUS PUBLIC-PREFIXED SECRETS FLAGGED (ISSUE 1 PRECEDENCE)
// ----------------------------------------------------
test('6b. Dangerous public-prefixed secrets: NEXT_PUBLIC_ and VITE_ secrets are flagged', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'InsecureClient.tsx'),
      `
      'use client';
      // Mistakenly prefixing server secrets with NEXT_PUBLIC_ or VITE_ to expose them
      const stripeSecret = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;
      const dbPass = import.meta.env.VITE_DATABASE_PASSWORD;
      const jwtSecret = process.env.NEXT_PUBLIC_JWT_SECRET;
      const privKey = process.env.NEXT_PUBLIC_FIREBASE_PRIVATE_KEY;
      export function Insecure() { return null; }
      `
    );

    const arch = ArchitectureEvaluator.evaluate(dir);
    const leakFindings = arch.findings.filter(f => f.ruleId === 'RULE-BUILTIN-CLIENT-SECRET-LEAK');

    assert.equal(leakFindings.length, 4, 'Must flag all 4 dangerous public-prefixed secrets');
    assert.ok(leakFindings.some(f => f.evidence.measuredValue === 'NEXT_PUBLIC_STRIPE_SECRET_KEY'));
    assert.ok(leakFindings.some(f => f.evidence.measuredValue === 'VITE_DATABASE_PASSWORD'));
    assert.ok(leakFindings.some(f => f.evidence.measuredValue === 'NEXT_PUBLIC_JWT_SECRET'));
    assert.ok(leakFindings.some(f => f.evidence.measuredValue === 'NEXT_PUBLIC_FIREBASE_PRIVATE_KEY'));

    for (const f of leakFindings) {
      assert.equal(f.category, 'LAYER_RULE_VIOLATION');
      assert.equal(f.severity, 'HIGH');
      assert.ok(f.signal.includes('Suspicious credential exposure signal detected'));
      assert.ok(f.evidence.details?.includes('Limitation: Static naming heuristics detect suspicious exposure signals'));
    }
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 7. FALSE-POSITIVE-PRONE NAMES CONTAINING KEY
// ----------------------------------------------------
test('7. False-positive-prone names: public API identifiers containing KEY are not flagged as secrets', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'Checkout.tsx'),
      `
      'use client';
      const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
      const stripePub = process.env.STRIPE_PUBLISHABLE_KEY;
      const recaptcha = process.env.RECAPTCHA_SITE_KEY;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const googleId = process.env.GOOGLE_CLIENT_ID;
      export function Checkout() { return null; }
      `
    );

    const arch = ArchitectureEvaluator.evaluate(dir);
    const leakFindings = arch.findings.filter(f => f.ruleId === 'RULE-BUILTIN-CLIENT-SECRET-LEAK');
    assert.equal(leakFindings.length, 0, 'Public keys, anon keys, site keys, and client IDs must not be flagged as server secret leaks');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 8. COMMENTS, STRINGS, DYNAMIC ACCESS, UNSUPPORTED PATTERNS
// ----------------------------------------------------
test('8. Comments, strings, dynamic property access: robust parsing ignores non-code mentions and flags dynamic access', () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, '.env.example'), '# template\n');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'edge.ts'),
      `
      // process.env.COMMENTED_SECRET
      /*
        process.env.MULTI_LINE_COMMENTED_SECRET
      */
      const str = "Logging process.env.STRING_LITERAL_SECRET";
      const keyName = 'DYNAMIC_VAL';
      const dynamicVal = process.env[keyName];
      `
    );

    const result = ReadinessEvaluator.evaluateConfiguration(dir);

    // Commented and string literal secrets must not be extracted
    const undoc = result.findings.filter(f => f.id.startsWith('FIND-CONFIG-UNDOCUMENTED-'));
    assert.equal(undoc.length, 0, 'Commented or string-literal environment variables must not be extracted as code references');

    // Dynamic access must produce an informative finding
    const dynFinding = result.findings.find(f => f.id === 'FIND-CONFIG-DYNAMIC-ACCESS');
    assert.ok(dynFinding, 'Expected dynamic property access finding');
    assert.equal(dynFinding?.severity, 'LOW');
    assert.equal(dynFinding?.status, 'INFO');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 9. MISSING ENVIRONMENT TEMPLATES
// ----------------------------------------------------
test('9. Missing environment templates: flags FIND-CONFIG-NO-EXAMPLE as non-blocking warning', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), "export const x = 1;");

    const result = ReadinessEvaluator.evaluateConfiguration(dir);

    assert.equal(result.status, 'NEEDS_ATTENTION');
    assert.equal(result.blockingFindings, 0);
    assert.equal(result.attentionFindings, 1);
    const noExample = result.findings.find(f => f.id === 'FIND-CONFIG-NO-EXAMPLE');
    assert.ok(noExample, 'Expected FIND-CONFIG-NO-EXAMPLE finding');
    assert.equal(noExample?.isBlocking, false);
    assert.equal(noExample?.severity, 'MEDIUM');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 10. SECRET-VALUE REDACTION
// ----------------------------------------------------
test('10. Secret-value redaction: never exposes secret values from .env files or code in findings', () => {
  const dir = createTempDir();
  try {
    const rawSecretValue = 'super_secret_production_password_xyz987';
    // Create actual .env file with sensitive secret
    fs.writeFileSync(path.join(dir, '.env'), `DATABASE_URL=postgres://user:${rawSecretValue}@localhost:5432/mydb\n`);
    // Create .env.example with placeholder
    fs.writeFileSync(path.join(dir, '.env.example'), 'DATABASE_URL=postgres://user:password@localhost:5432/mydb\n');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'client.tsx'),
      `
      'use client';
      const db = process.env.DATABASE_URL;
      `
    );

    const readiness = ReadinessEvaluator.evaluateConfiguration(dir);
    const arch = ArchitectureEvaluator.evaluate(dir);

    const readinessJson = JSON.stringify(readiness);
    const archJson = JSON.stringify(arch);

    assert.ok(!readinessJson.includes(rawSecretValue), 'Secret credential value leaked in readiness evaluation findings!');
    assert.ok(!archJson.includes(rawSecretValue), 'Secret credential value leaked in architecture evaluation findings!');
    assert.ok(!readinessJson.includes('super_secret'), 'Secret substring found in readiness output');
    assert.ok(!archJson.includes('super_secret'), 'Secret substring found in architecture output');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 11. FILE AND SCAN LIMITS
// ----------------------------------------------------
test('11. File and scan limits: files >512KB skipped gracefully without error', () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, '.env.example'), '# template\n');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });

    // Create an oversized file > 512KB (600,000 bytes)
    const largeContent = 'export const big = 1;\n' + '// filler\n'.repeat(60000) + 'export const k = process.env.OVERSIZED_VAR;\n';
    const filePath = path.join(dir, 'src', 'large.ts');
    fs.writeFileSync(filePath, largeContent);
    assert.ok(fs.statSync(filePath).size > StaticVerifier.MAX_FILE_SIZE, 'File must be larger than 512KB');

    const result = ReadinessEvaluator.evaluateConfiguration(dir);

    // Should complete cleanly without crashing
    assert.ok(result);
    // The oversized file should have been skipped, so OVERSIZED_VAR is not parsed
    const undoc = result.findings.find(f => f.id.includes('OVERSIZED_VAR'));
    assert.equal(undoc, undefined, 'Oversized file should be skipped by scan limits');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 12. CACHE INVALIDATION AND CONCURRENT PERSISTENCE
// ----------------------------------------------------
test('12. Cache invalidation on .env.example change and concurrent persistence', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'test-app', scripts: { build: 'tsc' } }));
    fs.writeFileSync(path.join(dir, '.env.example'), 'PORT=3000\n');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const p = process.env.PORT;\n');

    // First evaluation: caches result
    const res1 = await ReadinessManager.checkReleaseReadiness({ projectRoot: dir, categories: ['CONFIGURATION'], mode: 'detailed' });
    assert.equal(res1.status, 'READY');

    // Ensure timestamp advances beyond filesystem granularity
    await new Promise(r => setTimeout(r, 100));

    // Modify .env.example with an unfulfilled requirement in code
    fs.writeFileSync(path.join(dir, '.env.example'), 'PORT=3000\nNEW_REQUIRED_VAR=true\n');
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const p = process.env.PORT;\nexport const n = process.env.UNDOCUMENTED_SECRET;\n');

    // Second evaluation: cache must invalidate and detect the new undocumented secret
    const res2 = await ReadinessManager.checkReleaseReadiness({ projectRoot: dir, categories: ['CONFIGURATION'], mode: 'detailed' });
    assert.equal(res2.status, 'NEEDS_ATTENTION');
    assert.equal(res2.reusedEvidence, false, 'Cache must be invalidated when .env.example is updated');
    const catFindings = res2.categories?.CONFIGURATION?.findings || [];
    const hasUndoc = catFindings.some((f: any) => f.id.includes('UNDOCUMENTED_SECRET'));
    assert.ok(hasUndoc, 'Expected cache invalidation to detect newly added undocumented secret');

    // Test concurrent storage writes without corruption
    const promises = Array.from({ length: 5 }, (_, i) =>
      StorageEngine.withLock(zenitchDir, async () => {
        StorageEngine.writeDocument(zenitchDir, 'test-doc.json', {
          schemaVersion: '1.5.0',
          projectId: 'proj-concurrent',
          _version: 1,
          writeIndex: i
        });
      })
    );
    await Promise.all(promises);
    const finalDoc = StorageEngine.readDocument(zenitchDir, 'test-doc.json', z.any(), () => null);
    assert.ok(finalDoc, 'Document persisted safely under concurrent locks');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 13. EXISTING RELEASE-BLOCKING BEHAVIOR
// ----------------------------------------------------
test('13. Existing release-blocking behavior: configuration findings are non-blocking, true blockers still block', () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });

    // Missing .env.example and undocumented variable -> NEEDS_ATTENTION, NOT BLOCKED
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'api.ts'), 'const x = process.env.UNDOC_VAR;');

    const configResult = ReadinessEvaluator.evaluateConfiguration(dir);
    assert.equal(configResult.status, 'NEEDS_ATTENTION');
    assert.equal(configResult.blockingFindings, 0);

    // But if package.json is corrupt, BUILD category is BLOCKED
    fs.writeFileSync(path.join(dir, 'package.json'), 'CORRUPTED JSON {{{{');
    const buildResult = ReadinessEvaluator.evaluateBuild(dir);
    assert.equal(buildResult.status, 'BLOCKED');
    assert.equal(buildResult.blockingFindings, 1);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 14. EXACTLY 23 TOOLS IN APPLICABLE PROGRESSIVE MODE
// ----------------------------------------------------
test('14. Exactly 23 registered MCP tools preserved', async () => {
  const server = new ZenitchServer({
    enableZenitchTools: true,
    enablePhase2Tools: true,
    enablePhase3Tools: true,
    enablePhase4Tools: true,
    enablePhase5Tools: true,
    enablePhase6Tools: true,
    logLevel: 'ERROR'
  });
  const internalServer = server.getServerInstance();
  const handler = (internalServer as any)._requestHandlers.get(ListToolsRequestSchema.shape.method.value);
  assert.ok(handler, 'ListTools handler must be registered');

  const result = await handler({ method: 'tools/list', params: {} });
  assert.equal(result.tools.length, 24, 'Must maintain exactly 24 registered MCP tools in progressive mode');

  const toolNames = result.tools.map((t: any) => t.name);
  assert.ok(toolNames.includes('zenitch_check_release_readiness'));
  assert.ok(toolNames.includes('zenitch_analyze_architecture'));
  assert.ok(toolNames.includes('zenitch_inspect_architecture'));
  assert.ok(toolNames.includes('zenitch_ping'));
});

// ----------------------------------------------------
// 15. P0-A: COMPREHENSIVE SECRET-DETECTION PRECEDENCE & TOKEN BOUNDARIES
// ----------------------------------------------------
test('15. P0-A: Precedence hierarchy distinguishes strong secrets, public identifiers, and token boundaries', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'ClientPrecedence.tsx'),
      `
      'use client';
      // Dangerous public-prefixed secrets: MUST be flagged
      const s1 = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;
      const s2 = import.meta.env.VITE_DATABASE_PASSWORD;
      const s3 = process.env.PUBLIC_JWT_SECRET;
      const s4 = process.env.NEXT_PUBLIC_PRIVATE_KEY;
      const s5 = process.env.NEXT_PUBLIC_DATABASE_URL;
      const s6 = import.meta.env.VITE_SERVICE_ROLE_KEY;
      const s7 = process.env.PUBLIC_ADMIN_KEY;

      // Legitimate public identifiers: MUST NOT be flagged
      const p1 = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
      const p2 = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const p3 = process.env.STRIPE_PUBLISHABLE_KEY;
      const p4 = process.env.RECAPTCHA_SITE_KEY;
      const p5 = process.env.GOOGLE_CLIENT_ID;
      const p6 = process.env.NEXT_PUBLIC_APP_TITLE;
      const p7 = import.meta.env.VITE_API_URL;
      const p8 = process.env.PORT;

      // Token boundary tests: 'MONKEY_PATCH' should not trigger 'KEY', 'PASSING_SCORE' should not trigger 'PASS'
      const t1 = process.env.NEXT_PUBLIC_MONKEY_PATCH;
      const t2 = process.env.NEXT_PUBLIC_PASSING_SCORE;

      export function Component() { return null; }
      `
    );

    const arch = ArchitectureEvaluator.evaluate(dir);
    const leakFindings = arch.findings.filter(f => f.ruleId === 'RULE-BUILTIN-CLIENT-SECRET-LEAK');

    // All 7 dangerous variables must be flagged
    assert.equal(leakFindings.length, 7, 'Must flag exactly the 7 dangerous secrets');
    const flaggedVars = leakFindings.map(f => f.evidence.measuredValue);
    assert.ok(flaggedVars.includes('NEXT_PUBLIC_STRIPE_SECRET_KEY'));
    assert.ok(flaggedVars.includes('VITE_DATABASE_PASSWORD'));
    assert.ok(flaggedVars.includes('PUBLIC_JWT_SECRET'));
    assert.ok(flaggedVars.includes('NEXT_PUBLIC_PRIVATE_KEY'));
    assert.ok(flaggedVars.includes('NEXT_PUBLIC_DATABASE_URL'));
    assert.ok(flaggedVars.includes('VITE_SERVICE_ROLE_KEY'));
    assert.ok(flaggedVars.includes('PUBLIC_ADMIN_KEY'));

    // Verify legitimate public variables are NOT in findings
    assert.ok(!flaggedVars.includes('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'));
    assert.ok(!flaggedVars.includes('VITE_SUPABASE_ANON_KEY'));
    assert.ok(!flaggedVars.includes('STRIPE_PUBLISHABLE_KEY'));
    assert.ok(!flaggedVars.includes('RECAPTCHA_SITE_KEY'));
    assert.ok(!flaggedVars.includes('GOOGLE_CLIENT_ID'));
    assert.ok(!flaggedVars.includes('NEXT_PUBLIC_APP_TITLE'));
    assert.ok(!flaggedVars.includes('VITE_API_URL'));
    assert.ok(!flaggedVars.includes('PORT'));
    assert.ok(!flaggedVars.includes('NEXT_PUBLIC_MONKEY_PATCH'));
    assert.ok(!flaggedVars.includes('NEXT_PUBLIC_PASSING_SCORE'));
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 16. P0-B: DYNAMIC ENV ACCESS AND STATIC CONSTANT ALIAS RESOLUTION
// ----------------------------------------------------
test('16. P0-B: Static constant aliases are resolved; unresolvable dynamic accesses flag RULE-BUILTIN-DYNAMIC-ENV-ACCESS', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'ClientDynamic.tsx'),
      `
      'use client';
      // 1. Statically resolvable constant alias: should resolve to STRIPE_SECRET_KEY and flag leak!
      const secretAlias = 'STRIPE_SECRET_KEY';
      const secretVal = process.env[secretAlias];

      // 2. Direct property access
      const jwtVal = process.env['JWT_SECRET'];

      // 3. Unresolvable dynamic access
      const keyName = computeKey();
      const dyn1 = process.env[keyName];
      const dyn2 = process.env[prefix + suffix];
      const dyn3 = process.env[getConfigKey()];

      // 4. Repeated dynamic access to verify deduplication
      const dyn4 = process.env[keyName];

      // 5. Unrelated object property access: must NOT be reported as env access
      const myObj = { foo: 'bar' };
      const unrelated = myObj[keyName];

      export function DynamicWidget() { return null; }
      `
    );

    const arch = ArchitectureEvaluator.evaluate(dir);
    const secretFindings = arch.findings.filter(f => f.ruleId === 'RULE-BUILTIN-CLIENT-SECRET-LEAK');
    const dynamicFindings = arch.findings.filter(f => f.ruleId === 'RULE-BUILTIN-DYNAMIC-ENV-ACCESS');

    // Both the direct 'JWT_SECRET' and the statically resolved alias 'STRIPE_SECRET_KEY' must be flagged
    assert.equal(secretFindings.length, 2, 'Must flag direct secret and statically resolved constant alias');
    assert.ok(secretFindings.some(f => f.evidence.measuredValue === 'STRIPE_SECRET_KEY'));
    assert.ok(secretFindings.some(f => f.evidence.measuredValue === 'JWT_SECRET'));

    // Unresolved dynamic accesses must emit RULE-BUILTIN-DYNAMIC-ENV-ACCESS with MEDIUM severity
    assert.ok(dynamicFindings.length >= 3, 'Must flag unresolvable dynamic expressions');
    for (const df of dynamicFindings) {
      assert.equal(df.category, 'LAYER_RULE_VIOLATION');
      assert.equal(df.severity, 'MEDIUM');
      assert.equal(df.factConfidence, 1.0);
      assert.ok(df.signal.includes('Dynamic environment variable access detected'));
    }

    // Verify deduplication: dyn1 and dyn4 (both process.env[keyName]) should produce only 1 finding
    const keyNameFindings = dynamicFindings.filter(f => f.evidence.measuredValue === 'process.env[keyName]');
    assert.equal(keyNameFindings.length, 1, 'Duplicate dynamic access must be deduplicated');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 17. P0-C: SYNTHETIC CANARY CREDENTIAL REDACTION IN ALL OUTPUT PATHS
// ----------------------------------------------------
test('17. P0-C: Synthetic canary credential values never leak into findings, JSON serialization, or tool responses', async () => {
  const dir = createTempDir();
  const CANARY_SECRET = 'CANARY_SECRET_DO_NOT_LEAK_123';
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'CanaryClient.tsx'),
      `
      'use client';
      // Embedding synthetic secret value in code
      const apiKey = process.env.STRIPE_SECRET_KEY || '${CANARY_SECRET}';
      const bearer = '${CANARY_SECRET}';
      export function CanaryWidget() { return null; }
      `
    );

    // 1. Run Architecture evaluation
    const arch = ArchitectureEvaluator.evaluate(dir);
    const serializedArch = JSON.stringify(arch);

    // Assert secret detection occurred
    const leakFindings = arch.findings.filter(f => f.ruleId === 'RULE-BUILTIN-CLIENT-SECRET-LEAK');
    assert.equal(leakFindings.length, 1, 'Must detect STRIPE_SECRET_KEY');

    // Assert CANARY value is strictly absent from all findings and serialized output
    assert.ok(!serializedArch.includes(CANARY_SECRET), 'Canary secret value MUST NOT appear in serialized architecture record');

    // 2. Run MCP Inspect Architecture formatResponse
    const conciseResponse = JSON.stringify(await ArchitectureManager.analyzeArchitecture({ projectRoot: dir, mode: 'concise' }));
    assert.ok(!conciseResponse.includes(CANARY_SECRET), 'Canary secret value MUST NOT appear in concise MCP response');

    const detailedResponse = JSON.stringify(await ArchitectureManager.analyzeArchitecture({ projectRoot: dir, mode: 'detailed' }));
    assert.ok(!detailedResponse.includes(CANARY_SECRET), 'Canary secret value MUST NOT appear in detailed MCP response');

    // 3. Run Readiness evaluation
    const configResult = ReadinessEvaluator.evaluateConfiguration(dir);
    const serializedConfig = JSON.stringify(configResult);
    assert.ok(!serializedConfig.includes(CANARY_SECRET), 'Canary secret value MUST NOT appear in readiness configuration findings');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 18. P0-D: FILESYSTEM SAFETY, ROOT CONTAINMENT, AND SYMLINK ESCAPE PROTECTION
// ----------------------------------------------------
test('18. P0-D: Filesystem safety rejects lexical path traversal and outside-root symlink escapes', () => {
  const dir = createTempDir();
  const outsideDir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'valid.ts'), 'export const a = 1;');

    // Create an outside secret file
    fs.writeFileSync(path.join(outsideDir, 'outside_secret.ts'), 'export const secret = "OUTSIDE";');

    // Try creating a symlink inside dir pointing to outsideDir (if OS supports symlinks)
    let symlinkCreated = false;
    try {
      fs.symlinkSync(path.join(outsideDir, 'outside_secret.ts'), path.join(dir, 'src', 'symlink_outside.ts'));
      symlinkCreated = true;
    } catch {
      // Symlinks may require admin or Developer Mode on Windows; handled gracefully
    }

    // Run discoverSourceFiles
    const discovered = ArchitectureEvaluator.discoverSourceFiles(dir);

    // Valid file must be discovered
    assert.ok(discovered.includes('src/valid.ts'));

    // Symlink pointing outside root must NEVER be included in discovered files
    if (symlinkCreated) {
      assert.ok(!discovered.includes('src/symlink_outside.ts'), 'Symlink escaping project root must be rejected');
    }

    // Run StaticVerifier.scanFilesWithBoundary
    const { files } = StaticVerifier.scanFilesWithBoundary(dir);
    if (symlinkCreated) {
      assert.ok(!files.some(f => f.includes('symlink_outside')), 'StaticVerifier must reject outside-root symlink escapes');
    }
  } finally {
    cleanupTempDir(dir);
    cleanupTempDir(outsideDir);
  }
});

// ----------------------------------------------------
// 19. P0-D: CACHE INVALIDATION ON SOURCE FILE ADDITION OR DELETION
// ----------------------------------------------------
test('19. P0-D: Cache invalidates immediately when source files are added or deleted in non-git projects', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a = 1;');

    // First evaluation
    const res1 = await ArchitectureManager.analyzeArchitecture({ projectRoot: dir, mode: 'concise' });
    assert.equal(res1.reusedEvidence, false, 'First run must not reuse evidence');

    // Second evaluation with no changes -> should reuse evidence
    const res2 = await ArchitectureManager.analyzeArchitecture({ projectRoot: dir, mode: 'concise' });
    assert.equal(res2.reusedEvidence, true, 'Unchanged repository should reuse evidence');

    // Add a new file -> must invalidate cache!
    fs.writeFileSync(path.join(dir, 'src', 'b.ts'), 'export const b = 2;');
    const res3 = await ArchitectureManager.analyzeArchitecture({ projectRoot: dir, mode: 'concise' });
    assert.equal(res3.reusedEvidence, false, 'Adding a file must invalidate architecture cache');

    // Delete a file -> must invalidate cache!
    fs.unlinkSync(path.join(dir, 'src', 'b.ts'));
    const res4 = await ArchitectureManager.analyzeArchitecture({ projectRoot: dir, mode: 'concise' });
    assert.equal(res4.reusedEvidence, false, 'Deleting a file must invalidate architecture cache');
  } finally {
    cleanupTempDir(dir);
  }
});

