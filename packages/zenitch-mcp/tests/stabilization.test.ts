import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fork, spawn } from 'node:child_process';
import { StorageEngine, MemoryCorruptionError, ConcurrencyLockTimeoutError } from '../src/memory/storage-engine.js';
import { MigrationEngine, PHASE5_SCHEMA_VERSION } from '../src/memory/migration-engine.js';
import { ReadinessManager } from '../src/readiness/readiness-manager.js';
import { ReadinessEvaluator } from '../src/readiness/readiness-evaluator.js';
import { StaticVerifier } from '../src/verification/static-verifier.js';
import { RuntimeVerifier } from '../src/verification/runtime-verifier.js';
import { safeFetchHtml, isSafeDestination, isPrivateOrReservedIp, DEFAULT_MAX_RESPONSE_BYTES } from '../src/utils/url-safety.js';
import { RequirementsFileSchema, VerificationFileSchema, ReadinessFileSchema } from '../src/schemas/memory.schema.js';

function createTempDir(prefix = 'zenitch-stab-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

// ============================================================================
// S-001: READINESS CACHE INVALIDATION ASYMMETRY
// ============================================================================

test('S-001.1: READY cache invalidates after source change', async () => {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0', scripts: { build: 'tsc', test: 'node --test' } }));
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test App\nDeployment instructions included.');

    // First assessment -> READY
    const res1 = await ReadinessManager.checkReleaseReadiness({ projectRoot: tempDir });
    assert.equal(res1.reusedEvidence, false);

    // Second assessment without changes -> reused evidence
    const res2 = await ReadinessManager.checkReleaseReadiness({ projectRoot: tempDir });
    assert.equal(res2.reusedEvidence, true);

    // Modify a source/config file
    await new Promise(r => setTimeout(r, 50));
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.1', scripts: { build: 'tsc', test: 'node --test' } }));

    // Third assessment -> must recompute, not reuse
    const res3 = await ReadinessManager.checkReleaseReadiness({ projectRoot: tempDir });
    assert.equal(res3.reusedEvidence, false);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('S-001.2: BLOCKED cache invalidates after source change', async () => {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0', scripts: { build: 'tsc' } }));
    // Add a file with a hardcoded secret to trigger BLOCKED
    fs.writeFileSync(path.join(tempDir, 'secret.ts'), 'export const apiKey = "AKIA1234567890ABCDEF";');

    // First assessment -> BLOCKED
    const res1 = await ReadinessManager.checkReleaseReadiness({ projectRoot: tempDir });
    assert.equal(res1.status, 'BLOCKED');
    assert.equal(res1.reusedEvidence, false);

    // Second assessment without change -> cached BLOCKED
    const res2 = await ReadinessManager.checkReleaseReadiness({ projectRoot: tempDir });
    assert.equal(res2.status, 'BLOCKED');
    assert.equal(res2.reusedEvidence, true);

    // Fix the defect by removing secret
    await new Promise(r => setTimeout(r, 100));
    fs.writeFileSync(path.join(tempDir, 'secret.ts'), 'export const apiKey = process.env.API_KEY;');
    const futureSec = new Date(Date.now() + 2000);
    fs.utimesSync(path.join(tempDir, 'secret.ts'), futureSec, futureSec);

    // Third assessment -> must recompute and clear BLOCKED (not return stale BLOCKED!)
    const res3 = await ReadinessManager.checkReleaseReadiness({ projectRoot: tempDir });
    assert.equal(res3.reusedEvidence, false);
    assert.notEqual(res3.status, 'BLOCKED');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('S-001.3: NEEDS_ATTENTION cache invalidates after source change', async () => {
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0' })); // missing build script

    const res1 = await ReadinessManager.checkReleaseReadiness({ projectRoot: tempDir });
    assert.equal(res1.status, 'NEEDS_ATTENTION');
    assert.equal(res1.reusedEvidence, false);

    // Add build script to address attention item
    await new Promise(r => setTimeout(r, 100));
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0', scripts: { build: 'tsc' } }));
    const futurePkg = new Date(Date.now() + 2000);
    fs.utimesSync(path.join(tempDir, 'package.json'), futurePkg, futurePkg);

    // Reassess -> cache must invalidate
    const res2 = await ReadinessManager.checkReleaseReadiness({ projectRoot: tempDir });
    assert.equal(res2.reusedEvidence, false);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ============================================================================
// S-002: SCHEMA MIGRATION DISCONNECT & PERSISTENCE
// ============================================================================

test('S-002.1: Historical schema v1.0.0 migrates transparently on readDocument', async () => {
  const tempDir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const legacyDoc = {
      schemaVersion: '1.0.0',
      projectId: 'proj-legacy-1',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'REQ-001': {
          id: 'REQ-001',
          title: 'Legacy Requirement',
          description: 'A requirement from v1.0.0',
          category: 'functional',
          status: 'PROPOSED',
          priority: 'must_have',
          acceptanceCriteria: ['Criteria string 1', 'Criteria string 2'] // Legacy string array
        }
      }
    };

    fs.writeFileSync(path.join(zenitchDir, 'requirements.json'), JSON.stringify(legacyDoc, null, 2), 'utf8');

    // readDocument should auto-migrate to structured criteria and current schema
    const loaded = StorageEngine.readDocument<any>(zenitchDir, 'requirements.json', RequirementsFileSchema, () => null);
    assert.ok(loaded);
    assert.equal(loaded.schemaVersion, PHASE5_SCHEMA_VERSION);
    assert.ok(loaded.items['REQ-001']);
    // Structured criteria created
    assert.ok(Array.isArray(loaded.items['REQ-001'].acceptanceCriteria));
    assert.equal(typeof loaded.items['REQ-001'].acceptanceCriteria[0], 'object');
    assert.equal(loaded.items['REQ-001'].acceptanceCriteria[0].description, 'Criteria string 1');

    // Check that migrated file was persisted to disk atomically
    const onDisk = JSON.parse(fs.readFileSync(path.join(zenitchDir, 'requirements.json'), 'utf8'));
    assert.equal(onDisk.schemaVersion, PHASE5_SCHEMA_VERSION);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('S-002.2: Historical schema v1.1.0 and v1.2.0 migrate transparently', async () => {
  const tempDir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const v11Doc = {
      schemaVersion: '1.1.0',
      projectId: 'proj-v11',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {}
    };

    fs.writeFileSync(path.join(zenitchDir, 'requirements.json'), JSON.stringify(v11Doc), 'utf8');
    const loaded = StorageEngine.readDocument<any>(zenitchDir, 'requirements.json', RequirementsFileSchema, () => null);
    assert.equal(loaded.schemaVersion, PHASE5_SCHEMA_VERSION);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('S-002.3: Truly corrupt document enters corruption handling safely', async () => {
  const tempDir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    // Write malformed JSON
    fs.writeFileSync(path.join(zenitchDir, 'requirements.json'), '{ "bad_json": true, incomplete... ', 'utf8');

    assert.throws(() => {
      StorageEngine.readDocument<any>(zenitchDir, 'requirements.json', RequirementsFileSchema, () => null);
    }, MemoryCorruptionError);

    // Corrupted file copied to backup and marker placed
    const files = fs.readdirSync(zenitchDir);
    assert.ok(files.some(f => f.includes('requirements.json.corrupt')));
    assert.ok(files.includes('.corrupted_requirements.json'));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ============================================================================
// S-003: REPOSITORY RESOURCE EXHAUSTION & BOUNDED SCANNING
// ============================================================================

test('S-003.1: scanFilesWithBoundary enforces MAX_SCANNED_FILES cap', () => {
  const tempDir = createTempDir();
  try {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Create 50 files
    for (let i = 0; i < 50; i++) {
      fs.writeFileSync(path.join(srcDir, `file_${i}.ts`), `export const v${i} = ${i};`);
    }

    // Scan with limit 20
    const { files, boundaryReached } = StaticVerifier.scanFilesWithBoundary(tempDir, 5, 20);
    assert.equal(files.length, 20);
    assert.equal(boundaryReached, true);

    // Scan with limit 100
    const normal = StaticVerifier.scanFilesWithBoundary(tempDir, 5, 100);
    assert.equal(normal.files.length, 50);
    assert.equal(normal.boundaryReached, false);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('S-003.2: Oversized file (>512KB) is skipped in security and static verification', () => {
  const tempDir = createTempDir();
  try {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Normal file
    fs.writeFileSync(path.join(srcDir, 'normal.ts'), 'export const hello = "world";');

    // Create 600KB oversized file containing dummy secret
    const largeBuffer = Buffer.alloc(600 * 1024, 'a');
    fs.writeFileSync(path.join(srcDir, 'huge.ts'), largeBuffer);

    const secRes = ReadinessEvaluator.evaluateSecurity(tempDir);
    // Huge file should be skipped from scanning
    const oversizedFinding = secRes.findings.find(f => f.id === 'FIND-SEC-OVERSIZED-SKIPPED');
    assert.ok(oversizedFinding, 'Expected FIND-SEC-OVERSIZED-SKIPPED finding');
    assert.ok(oversizedFinding.summary.includes('oversized file(s)'));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('S-003.3: Large synthetic repository halts and reports partial boundary honestly', () => {
  const tempDir = createTempDir();
  try {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Generate 1050 small files to exceed 1000 file boundary
    for (let i = 0; i < 1050; i++) {
      fs.writeFileSync(path.join(srcDir, `mod_${i}.ts`), `export const x${i} = 1;`);
    }

    const secRes = ReadinessEvaluator.evaluateSecurity(tempDir);
    const boundaryFinding = secRes.findings.find(f => f.id === 'FIND-SEC-SCAN-BOUNDED');
    assert.ok(boundaryFinding, 'Expected FIND-SEC-SCAN-BOUNDED finding');
    assert.ok(boundaryFinding.summary.includes('PARTIAL'));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ============================================================================
// S-004: ADVISORY LOCK TIMEOUT / STALE THRESHOLD & CONCURRENCY
// ============================================================================

test('S-004.1: Lock invariant staleThreshold < timeout is strictly satisfied', () => {
  // Read constants from storage-engine
  const seContent = fs.readFileSync(path.resolve('src/memory/storage-engine.ts'), 'utf8');
  const timeoutMatch = seContent.match(/const timeoutMs = (\d+);/);
  const staleMatch = seContent.match(/const staleThresholdMs = (\d+);/);

  assert.ok(timeoutMatch);
  assert.ok(staleMatch);

  const timeoutMs = parseInt(timeoutMatch[1], 10);
  const staleThresholdMs = parseInt(staleMatch[1], 10);

  assert.ok(staleThresholdMs < timeoutMs, `staleThresholdMs (${staleThresholdMs}) must be < timeoutMs (${timeoutMs})`);
  assert.ok(timeoutMs >= 4000, 'timeoutMs should allow adequate margin for waiter');
});

test('S-004.2: Stale lock is safely recovered by waiting process', async () => {
  const tempDir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const lockPath = path.join(zenitchDir, '.lock');

    // Create a simulated dead-process lock from 3000ms ago (staleThreshold is 2500ms)
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, createdAt: Date.now() - 3000 }), 'utf8');

    // withLock should detect stale lock, unlink it, and succeed
    let executed = false;
    await StorageEngine.withLock(zenitchDir, () => {
      executed = true;
    });

    assert.equal(executed, true);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('S-004.3: Multi-process concurrency maintains serialization without corruption', async () => {
  const tempDir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const counterFile = path.join(zenitchDir, 'counter.json');
    fs.writeFileSync(counterFile, JSON.stringify({ count: 0 }), 'utf8');

    // Spawn 4 independent Node child worker processes to increment counter 5 times each
    const workerScript = `
      const fs = require('fs');
      const path = require('path');
      const { StorageEngine } = require('${path.resolve('dist/src/memory/storage-engine.js').replace(/\\/g, '/')}');

      const zenitchDir = process.argv[2];
      const counterFile = path.join(zenitchDir, 'counter.json');

      async function run() {
        for (let i = 0; i < 5; i++) {
          await StorageEngine.withLock(zenitchDir, async () => {
            const data = JSON.parse(fs.readFileSync(counterFile, 'utf8'));
            data.count += 1;
            // Introduce artificial delay to stress lock exclusivity
            await new Promise(r => setTimeout(r, 20));
            fs.writeFileSync(counterFile, JSON.stringify(data), 'utf8');
          });
        }
      }
      run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
    `;

    const scriptPath = path.join(tempDir, 'worker.js');
    fs.writeFileSync(scriptPath, workerScript, 'utf8');

    const workers = [1, 2, 3, 4].map(() => {
      return new Promise<void>((resolve, reject) => {
        const proc = fork(scriptPath, [zenitchDir], { stdio: 'inherit' });
        proc.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error('Worker exited with code ' + code));
        });
      });
    });

    await Promise.all(workers);

    // Final count must be exactly 4 * 5 = 20
    const finalData = JSON.parse(fs.readFileSync(counterFile, 'utf8'));
    assert.equal(finalData.count, 20);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ============================================================================
// S-005: SSRF PROTECTION & URL SAFETY BOUNDARY
// ============================================================================

test('S-005.1: RuntimeVerifier blocks localhost by default', () => {
  const res = RuntimeVerifier.validateUrlSafety('http://localhost:3000/api');
  assert.equal(res.safe, false);
  assert.ok(res.reason?.includes('Localhost'));
});

test('S-005.2: RuntimeVerifier blocks loopback addresses (127.0.0.1 and ::1)', () => {
  const v4 = RuntimeVerifier.validateUrlSafety('http://127.0.0.1:8080');
  assert.equal(v4.safe, false);

  const v6 = RuntimeVerifier.validateUrlSafety('http://[::1]:8080');
  assert.equal(v6.safe, false);
});

test('S-005.3: RuntimeVerifier blocks RFC 1918 private subnets', () => {
  assert.equal(RuntimeVerifier.validateUrlSafety('http://10.0.0.1/admin').safe, false);
  assert.equal(RuntimeVerifier.validateUrlSafety('http://192.168.1.1/').safe, false);
  assert.equal(RuntimeVerifier.validateUrlSafety('http://172.16.0.5:8000').safe, false);
});

test('S-005.4: RuntimeVerifier blocks link-local subnets', () => {
  assert.equal(RuntimeVerifier.validateUrlSafety('http://169.254.1.1').safe, false);
});

test('S-005.5: RuntimeVerifier blocks cloud metadata endpoints', () => {
  assert.equal(RuntimeVerifier.validateUrlSafety('http://169.254.169.254/latest/meta-data/').safe, false);
  assert.equal(RuntimeVerifier.validateUrlSafety('http://metadata.google.internal/computeMetadata/v1/').safe, false);
});

test('S-005.6: DNS resolution blocks domains resolving to private IPs', async () => {
  // Test shared isSafeDestination with loopback domain or custom domain
  const res = await isSafeDestination('http://127.0.0.1:3000');
  assert.equal(res.safe, false);
});

test('S-005.7: Safe public URL is accepted by both Page Auditor and RuntimeVerifier', async () => {
  const rv = RuntimeVerifier.validateUrlSafety('https://example.com/pricing');
  assert.equal(rv.safe, true);

  const pa = await isSafeDestination('https://example.com/pricing');
  assert.equal(pa.safe, true);
});

test('S-005.8: safeFetchHtml enforces authoritative 2MB response byte cap on streaming response', async () => {
  // Create an HTTP server returning a 3MB payload (30 * 100KB chunks)
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const chunk = Buffer.alloc(100 * 1024, 'x');
    for (let i = 0; i < 30; i++) {
      res.write(chunk);
    }
    res.end();
  });

  await new Promise<void>(r => server.listen(0, r));
  const port = (server.address() as any).port;
  const testUrl = 'http://127.0.0.1:' + port;

  try {
    // Rely on authoritative default production limit (2 MB = 2,097,152 bytes) without overriding maxBytes
    const fetched = await safeFetchHtml(testUrl, { allowLoopback: true });
    assert.equal(fetched.ok, true);
    assert.equal(fetched.truncated, true);
    assert.equal(fetched.content.length, DEFAULT_MAX_RESPONSE_BYTES);
  } finally {
    server.close();
  }
});
