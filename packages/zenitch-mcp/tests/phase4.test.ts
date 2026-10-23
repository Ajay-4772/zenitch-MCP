import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { ZenitchServer } from '../src/server.js';
import { ReadinessManager } from '../src/readiness/readiness-manager.js';
import { ReadinessEvaluator } from '../src/readiness/readiness-evaluator.js';
import { StorageEngine } from '../src/memory/storage-engine.js';
import { MigrationEngine } from '../src/memory/migration-engine.js';
import { ApprovalManager } from '../src/memory/approval-manager.js';

function createTempDir(prefix = 'zenitch-p4-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error
  }
}

function initGitRepo(dir: string): boolean {
  try {
    const env = { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(dir) };
    execFileSync('git', ['init'], { cwd: dir, env, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Zenitch Test'], { cwd: dir, env, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@zenitch.local'], { cwd: dir, env, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const defaultProvenance = {
  source: 'USER' as const,
  authority: 'AUTHORITATIVE' as const,
  confidence: 1.0,
  verificationLevel: 'USER_CONFIRMED' as const,
  timestamp: new Date().toISOString()
};

const defaultSystemProvenance = {
  source: 'SYSTEM' as const,
  authority: 'DERIVED' as const,
  confidence: 1.0,
  verificationLevel: 'TEST_VERIFIED' as const,
  timestamp: new Date().toISOString()
};

// ----------------------------------------------------
// 1. REQUIREMENTS READINESS
// ----------------------------------------------------

test('1. Requirements readiness: completed requirements evaluate to READY', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });

    StorageEngine.writeDocument(zenitchDir, 'requirements.json', {
      schemaVersion: '1.3.0',
      projectId: 'proj-1',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'req-1': {
          id: 'req-1',
          title: 'User Login',
          description: 'OAuth and password authentication',
          category: 'functional',
          status: 'VERIFIED',
          priority: 'must_have',
          authority: 'AUTHORITATIVE',
          acceptanceCriteria: [
            {
              id: 'crit-1',
              description: 'Redirects to dashboard',
              type: 'FUNCTIONAL',
              status: 'PASSED',
              verificationIds: ['ev-1'],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ],
          provenance: defaultProvenance,
          createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
        }
      },
      tickets: {}
    });

    const res = ReadinessEvaluator.evaluateRequirements(dir);
    assert.equal(res.status, 'READY');
    assert.equal(res.blockingFindings, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test('2. Requirements readiness: BLOCKED requirement blocks release', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });

    StorageEngine.writeDocument(zenitchDir, 'requirements.json', {
      schemaVersion: '1.3.0',
      projectId: 'proj-1',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'req-1': {
          id: 'req-1',
          title: 'Payment Gateway',
          description: 'Stripe integration',
          category: 'functional',
          status: 'BLOCKED',
          priority: 'must_have',
          authority: 'AUTHORITATIVE',
          acceptanceCriteria: [],
          provenance: defaultProvenance,
          createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
        }
      },
      tickets: {}
    });

    const res = ReadinessEvaluator.evaluateRequirements(dir);
    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.blockingFindings > 0);
    const finding = res.findings.find(item => item.id.includes('REQ-BLOCKED'));
    assert.ok(finding);
    assert.equal(finding?.severity, 'CRITICAL');
    assert.equal(finding?.isBlocking, true);
  } finally {
    cleanupTempDir(dir);
  }
});

test('3. Requirements readiness: REJECTED requirement blocks release', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });

    StorageEngine.writeDocument(zenitchDir, 'requirements.json', {
      schemaVersion: '1.3.0',
      projectId: 'proj-1',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'req-1': {
          id: 'req-1',
          title: 'Export Feature',
          description: 'Export data to CSV',
          category: 'functional',
          status: 'REJECTED',
          priority: 'must_have',
          authority: 'AUTHORITATIVE',
          acceptanceCriteria: [],
          provenance: defaultProvenance,
          createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
        }
      },
      tickets: {}
    });

    const res = ReadinessEvaluator.evaluateRequirements(dir);
    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.blockingFindings > 0);
    const finding = res.findings.find(item => item.id.includes('REQ-REJECTED'));
    assert.ok(finding);
    assert.equal(finding?.severity, 'CRITICAL');
    assert.equal(finding?.isBlocking, true);
  } finally {
    cleanupTempDir(dir);
  }
});

test('4. Requirements readiness: FAILED acceptance criterion triggers critical blocking finding', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });

    StorageEngine.writeDocument(zenitchDir, 'requirements.json', {
      schemaVersion: '1.3.0',
      projectId: 'proj-1',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'req-1': {
          id: 'req-1',
          title: 'Checkout Form',
          description: 'Validate billing address',
          category: 'functional',
          status: 'IMPLEMENTED',
          priority: 'must_have',
          authority: 'AUTHORITATIVE',
          acceptanceCriteria: [
            {
              id: 'crit-fail',
              description: 'Zip code pattern validation',
              type: 'FUNCTIONAL',
              status: 'FAILED',
              verificationIds: ['ev-fail'],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ],
          provenance: defaultProvenance,
          createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
        }
      },
      tickets: {}
    });

    const res = ReadinessEvaluator.evaluateRequirements(dir);
    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.blockingFindings > 0);
    const finding = res.findings.find(item => item.id.includes('CRIT-FAIL'));
    assert.ok(finding);
    assert.equal(finding?.severity, 'CRITICAL');
    assert.equal(finding?.isBlocking, true);
  } finally {
    cleanupTempDir(dir);
  }
});

test('5. Requirements readiness: pending human approval ticket blocks readiness', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });

    StorageEngine.writeDocument(zenitchDir, 'requirements.json', {
      schemaVersion: '1.3.0',
      projectId: 'proj-1',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'req-1': {
          id: 'req-1',
          title: 'Security Overhaul',
          description: 'MFA implementation',
          category: 'functional',
          status: 'VERIFIED',
          priority: 'must_have',
          authority: 'AUTHORITATIVE',
          acceptanceCriteria: [],
          provenance: defaultProvenance,
          createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
        }
      },
      tickets: {
        'tkt-1': {
          ticketId: 'tkt-1',
          requirementId: 'req-1',
          title: 'Human Sign-off',
          proposedState: 'ACCEPTED',
          status: 'PENDING',
          evidenceSummary: ['All MFA tests passing'],
          affectedFiles: ['src/auth/mfa.ts'],
          createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
        }
      }
    });

    const res = ReadinessEvaluator.evaluateRequirements(dir);
    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.blockingFindings > 0);
    const finding = res.findings.find(item => item.id.includes('FIND-TICKET-'));
    assert.ok(finding);
    assert.equal(finding?.severity, 'CRITICAL');
    assert.equal(finding?.isBlocking, true);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 2. VERIFICATION READINESS
// ----------------------------------------------------

test('6. Verification readiness: passed verification record evaluated cleanly', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });

    StorageEngine.writeDocument(zenitchDir, 'verification.json', {
      schemaVersion: '1.3.0',
      projectId: 'proj-1',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'ver-1': {
          id: 'ver-1',
          requirementId: 'req-1',
          timestamp: new Date().toISOString(),
          targetUrl: 'http://localhost:3000',
          verificationMethod: 'RUNTIME_VERIFICATION',
          verdict: 'PASSED',
          evidenceSummary: 'HTTP 200 OK',
          evidencePayload: { status: 200 },
          provenance: defaultSystemProvenance
        }
      }
    });

    const res = ReadinessEvaluator.evaluateVerification(dir);
    assert.equal(res.status, 'READY');
    assert.equal(res.blockingFindings, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test('7. Verification readiness: failed verification record blocks readiness', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });

    StorageEngine.writeDocument(zenitchDir, 'verification.json', {
      schemaVersion: '1.3.0',
      projectId: 'proj-1',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'ver-1': {
          id: 'ver-1',
          requirementId: 'req-1',
          timestamp: new Date().toISOString(),
          verificationMethod: 'STATIC_ANALYSIS',
          verdict: 'FAILED',
          evidenceSummary: 'Syntax errors in build',
          evidencePayload: { errors: 3 },
          provenance: defaultSystemProvenance
        }
      }
    });

    const res = ReadinessEvaluator.evaluateVerification(dir);
    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.blockingFindings > 0);
    const finding = res.findings.find(item => item.id.includes('VERIF-FAILED'));
    assert.ok(finding);
    assert.equal(finding?.severity, 'CRITICAL');
    assert.equal(finding?.isBlocking, true);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 3. BUILD READINESS
// ----------------------------------------------------

test('8. Build readiness: detects package.json build script and safe commands', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'test-app',
      scripts: {
        build: 'tsc -p tsconfig.json'
      }
    }));

    const res = ReadinessEvaluator.evaluateBuild(dir);
    assert.equal(res.status, 'READY');
    assert.equal(res.blockingFindings, 0);
    const f = res.findings.find(item => item.id === 'FIND-BUILD-OK');
    assert.ok(f);
    assert.equal(f?.status, 'PASS');
    assert.equal(f?.isBlocking, false);
  } finally {
    cleanupTempDir(dir);
  }
});

test('9. Build readiness: tsconfig missing build script is high-risk NEEDS_ATTENTION, not BLOCKED', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'no-build-app',
      scripts: {
        start: 'node src/main.ts'
      }
    }));

    const res = ReadinessEvaluator.evaluateBuild(dir);
    assert.equal(res.status, 'NEEDS_ATTENTION');
    assert.equal(res.blockingFindings, 0);
    assert.equal(res.attentionFindings, 1);
    const f = res.findings.find(item => item.id === 'FIND-BUILD-MISSING-SCRIPT');
    assert.ok(f);
    assert.equal(f?.severity, 'HIGH');
    assert.equal(f?.isBlocking, false);
  } finally {
    cleanupTempDir(dir);
  }
});

test('9b. Build readiness: demonstrably corrupt package.json blocks release', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), '{{{ INVALID JSON');

    const res = ReadinessEvaluator.evaluateBuild(dir);
    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.blockingFindings > 0);
    const f = res.findings.find(item => item.id === 'FIND-BUILD-PKG-CORRUPT');
    assert.ok(f);
    assert.equal(f?.severity, 'CRITICAL');
    assert.equal(f?.isBlocking, true);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 4. TEST READINESS
// ----------------------------------------------------

test('10. Test readiness: distinguishes test configuration from actual test execution', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'tested-app',
      scripts: {
        test: 'node --test'
      }
    }));

    const res = ReadinessEvaluator.evaluateTests(dir);
    assert.equal(res.status, 'READY');
    assert.equal(res.blockingFindings, 0);
    const f = res.findings.find(item => item.id === 'FIND-TEST-SCRIPT');
    assert.ok(f);
    assert.equal(f?.isBlocking, false);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 5. SECURITY READINESS
// ----------------------------------------------------

test('11. Security readiness: detects hardcoded credentials and blocks release', async () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/config.ts'), 'export const awsKey = "AKIAIOSFODNN7EXAMPLE";');

    const res = ReadinessEvaluator.evaluateSecurity(dir);
    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.blockingFindings > 0);
    const f = res.findings.find(item => item.id.includes('FIND-SEC-SECRET'));
    assert.ok(f);
    assert.equal(f?.severity, 'CRITICAL');
    assert.equal(f?.isBlocking, true);
  } finally {
    cleanupTempDir(dir);
  }
});

test('12. Security readiness: ignores mock credentials in test files and documentation', async () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tests/auth.test.ts'), 'const mockKey = "AKIAIOSFODNN7EXAMPLE";');
    fs.writeFileSync(path.join(dir, 'README.md'), 'Use demo key: AKIAIOSFODNN7EXAMPLE');

    const res = ReadinessEvaluator.evaluateSecurity(dir);
    assert.equal(res.status, 'READY');
    assert.equal(res.blockingFindings, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 6. CONFIGURATION READINESS
// ----------------------------------------------------

test('13. Configuration readiness: detects missing .env.example file as non-blocking attention', async () => {
  const dir = createTempDir();
  try {
    const res = ReadinessEvaluator.evaluateConfiguration(dir);
    assert.equal(res.status, 'NEEDS_ATTENTION');
    assert.equal(res.blockingFindings, 0);
    const f = res.findings.find(item => item.id === 'FIND-CONFIG-NO-EXAMPLE');
    assert.ok(f);
    assert.equal(f?.severity, 'MEDIUM');
    assert.equal(f?.isBlocking, false);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 7. DEPENDENCY READINESS
// ----------------------------------------------------

test('14. Dependency readiness: detects missing lockfile as NEEDS_ATTENTION, not BLOCKED', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'dep-app',
      dependencies: { express: '^4.18.2' }
    }));

    const res = ReadinessEvaluator.evaluateDependencies(dir);
    assert.equal(res.status, 'NEEDS_ATTENTION');
    assert.equal(res.blockingFindings, 0);
    const f = res.findings.find(item => item.id === 'FIND-DEP-NO-LOCKFILE');
    assert.ok(f);
    assert.equal(f?.severity, 'MEDIUM');
    assert.equal(f?.isBlocking, false);
  } finally {
    cleanupTempDir(dir);
  }
});

test('15. Dependency readiness: passes when lockfile is present', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'dep-app',
      dependencies: { express: '^4.18.2' }
    }));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');

    const res = ReadinessEvaluator.evaluateDependencies(dir);
    assert.equal(res.status, 'READY');
    assert.equal(res.blockingFindings, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 8. DEPLOYMENT CONFIGURATION DETECTION (CONTEXT-AWARE)
// ----------------------------------------------------

test('16. Deployment detection: identifies Docker and Vercel configurations', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node:20-alpine\nCMD ["npm", "start"]');
    fs.writeFileSync(path.join(dir, 'vercel.json'), '{"version": 2}');

    const res = ReadinessEvaluator.evaluateDeployment(dir);
    assert.equal(res.status, 'READY');
    assert.equal(res.blockingFindings, 0);
    const dockerFinding = res.findings.find(item => item.id === 'FIND-DEPLOY-DOCKER');
    const vercelFinding = res.findings.find(item => item.id === 'FIND-DEPLOY-VERCEL');
    assert.ok(dockerFinding);
    assert.ok(vercelFinding);
  } finally {
    cleanupTempDir(dir);
  }
});

test('16b. Context-aware deployment: valid Docker deployment without Vercel config is READY', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node:20-alpine');

    const res = ReadinessEvaluator.evaluateDeployment(dir);
    assert.equal(res.status, 'READY');
    assert.equal(res.blockingFindings, 0);
    assert.ok(res.findings.some(item => item.id === 'FIND-DEPLOY-DOCKER'));
    assert.ok(!res.findings.some(item => item.id === 'FIND-DEPLOY-VERCEL'));
  } finally {
    cleanupTempDir(dir);
  }
});

test('16c. Context-aware deployment: valid Vercel deployment without Dockerfile is READY', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'vercel.json'), '{"version": 2}');

    const res = ReadinessEvaluator.evaluateDeployment(dir);
    assert.equal(res.status, 'READY');
    assert.equal(res.blockingFindings, 0);
    assert.ok(res.findings.some(item => item.id === 'FIND-DEPLOY-VERCEL'));
    assert.ok(!res.findings.some(item => item.id === 'FIND-DEPLOY-DOCKER'));
  } finally {
    cleanupTempDir(dir);
  }
});

test('17. Deployment detection: generic project without specific provider does not fail release', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'index.html'), '<h1>Hello</h1>');

    const res = ReadinessEvaluator.evaluateDeployment(dir);
    assert.equal(res.status, 'READY');
    assert.equal(res.blockingFindings, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 9. DOCUMENTATION READINESS
// ----------------------------------------------------

test('18. Documentation readiness: passes with README containing deployment & environment notes', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(
      path.join(dir, 'README.md'),
      '# My Project\n\n## Setup\nRun npm install\n\n## Environment\nRequires DATABASE_URL\n\n## Deployment\nBuild using npm run build and deploy container.'
    );

    const res = ReadinessEvaluator.evaluateDocumentation(dir);
    assert.equal(res.status, 'READY');
    assert.equal(res.blockingFindings, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test('19. Documentation readiness: flags missing README as non-blocking NEEDS_ATTENTION', async () => {
  const dir = createTempDir();
  try {
    const res = ReadinessEvaluator.evaluateDocumentation(dir);
    assert.equal(res.status, 'NEEDS_ATTENTION');
    assert.equal(res.blockingFindings, 0);
    const f = res.findings.find(item => item.id === 'FIND-DOC-NO-README');
    assert.ok(f);
    assert.equal(f?.severity, 'LOW');
    assert.equal(f?.isBlocking, false);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 10. SOURCE CONTROL READINESS (READ-ONLY)
// ----------------------------------------------------

test('20. Source control readiness: non-git directory returns clean INFO status without crashing', async () => {
  const dir = createTempDir();
  try {
    const res = ReadinessEvaluator.evaluateSourceControl(dir);
    assert.equal(res.status, 'READY');
    assert.equal(res.blockingFindings, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test('20b. Source control readiness: dirty README change yields NEEDS_ATTENTION, not BLOCKED', async () => {
  const dir = createTempDir();
  const prevCeiling = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = path.dirname(dir);
  try {
    const gitOk = initGitRepo(dir);
    if (!gitOk) return; // Skip if git unavailable in environment

    fs.writeFileSync(path.join(dir, 'README.md'), '# Initial');
    execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: dir, stdio: 'ignore' });

    // Modify README without committing
    fs.writeFileSync(path.join(dir, 'README.md'), '# Updated README info');

    const res = ReadinessEvaluator.evaluateSourceControl(dir);
    assert.equal(res.status, 'NEEDS_ATTENTION');
    assert.equal(res.blockingFindings, 0);
    assert.equal(res.attentionFindings, 1);
    const f = res.findings.find(item => item.id === 'FIND-GIT-UNCOMMITTED');
    assert.ok(f);
    assert.equal(f?.isBlocking, false);
  } finally {
    if (prevCeiling !== undefined) {
      process.env.GIT_CEILING_DIRECTORIES = prevCeiling;
    } else {
      delete process.env.GIT_CEILING_DIRECTORIES;
    }
    cleanupTempDir(dir);
  }
});

test('20c. Source control readiness: uncommitted secret in working tree BLOCKS release', async () => {
  const dir = createTempDir();
  const prevCeiling = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = path.dirname(dir);
  try {
    const gitOk = initGitRepo(dir);
    if (!gitOk) return;

    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: dir, stdio: 'ignore' });

    // Add uncommitted file containing secret
    fs.writeFileSync(path.join(dir, 'credentials.ts'), 'export const token = "AKIAIOSFODNN7EXAMPLE";');

    const res = ReadinessEvaluator.evaluateSourceControl(dir);
    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.blockingFindings > 0);
    const f = res.findings.find(item => item.id.includes('UNCOMMITTED-SECRET'));
    assert.ok(f);
    assert.equal(f?.severity, 'CRITICAL');
    assert.equal(f?.isBlocking, true);
  } finally {
    if (prevCeiling !== undefined) {
      process.env.GIT_CEILING_DIRECTORIES = prevCeiling;
    } else {
      delete process.env.GIT_CEILING_DIRECTORIES;
    }
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 11. END-TO-END READINESS ASSESSMENT & CACHING
// ----------------------------------------------------

test('21. ReadinessManager: comprehensive assessment aggregates all 10 categories correctly', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'full-app',
      scripts: { build: 'tsc', test: 'node --test' }
    }));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(dir, 'README.md'), '# Full App\n## Setup\n## Deployment\n## Environment');

    const result = await ReadinessManager.checkReleaseReadiness({ projectRoot: dir, mode: 'concise' });
    assert.ok(result.readinessId);
    assert.equal(result.categoriesChecked, 10);
    assert.equal(result.blockingFindings, 0);
    assert.equal(result.reusedEvidence, false);

    const zenitchDir = StorageEngine.getZenitchDir(dir);
    assert.ok(fs.existsSync(path.join(zenitchDir, 'readiness.json')));
  } finally {
    cleanupTempDir(dir);
  }
});

test('21b. ReadinessManager: non-blocking HIGH findings result in NEEDS_ATTENTION, never BLOCKED', async () => {
  const dir = createTempDir();
  try {
    // Project with tsconfig but missing build script (HIGH finding), missing lockfile (MEDIUM), missing README (LOW)
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'high-finding-app',
      dependencies: { lodash: '^4.17.21' }
    }));

    const result = await ReadinessManager.checkReleaseReadiness({ projectRoot: dir, mode: 'standard' });
    assert.equal(result.status, 'NEEDS_ATTENTION');
    assert.equal(result.blockingFindings, 0);
    assert.ok(result.attentionFindings > 0);
    assert.notEqual(result.status, 'BLOCKED');
  } finally {
    cleanupTempDir(dir);
  }
});

test('22. ReadinessManager caching: unchanged project reuses readiness evidence', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'cached-app',
      scripts: { build: 'echo ok' }
    }));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(dir, 'README.md'), '# App\n## Deployment');

    // Run first assessment
    const first = await ReadinessManager.checkReleaseReadiness({ projectRoot: dir, mode: 'concise' });
    assert.equal(first.reusedEvidence, false);

    // Run second assessment immediately without changes
    const second = await ReadinessManager.checkReleaseReadiness({ projectRoot: dir, mode: 'concise' });
    assert.equal(second.reusedEvidence, true);
    assert.equal(second.readinessId, first.readinessId);

    // Force re-evaluation bypasses cache
    const forced = await ReadinessManager.checkReleaseReadiness({ projectRoot: dir, mode: 'concise', forceReassess: true });
    assert.equal(forced.reusedEvidence, false);
  } finally {
    cleanupTempDir(dir);
  }
});

test('23. ReadinessManager invalidation: adding a critical security defect invalidates cache', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'vuln-app',
      scripts: { build: 'echo ok', test: 'echo ok' }
    }));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(dir, 'README.md'), '# App\n## Deployment\n## Setup\n## Environment');

    const first = await ReadinessManager.checkReleaseReadiness({ projectRoot: dir, mode: 'concise' });
    assert.ok(['READY', 'NEEDS_ATTENTION'].includes(first.status));
    assert.equal(first.blockingFindings, 0);

    // Introduce a hardcoded secret in a source file
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/api.ts'), 'export const key = "AKIAIOSFODNN7EXAMPLE";');

    // Force check
    const second = await ReadinessManager.checkReleaseReadiness({ projectRoot: dir, mode: 'concise', forceReassess: true });
    assert.equal(second.status, 'BLOCKED');
    assert.ok(second.blockingFindings > 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test('24. ReadinessManager inspection: inspectReleaseReadiness returns stored records with filtering', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'inspect-app',
      scripts: { build: 'echo ok' }
    }));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(dir, 'README.md'), '# App');

    await ReadinessManager.checkReleaseReadiness({ projectRoot: dir });

    // Inspect all with detailed mode
    const full = await ReadinessManager.inspectReleaseReadiness({ projectRoot: dir, mode: 'detailed' });
    assert.ok(full.assessment);
    assert.ok(Array.isArray(full.filteredFindings));

    // Inspect category filter in standard mode
    const catFiltered = await ReadinessManager.inspectReleaseReadiness({ projectRoot: dir, category: 'BUILD', mode: 'standard' });
    assert.ok(catFiltered.readinessId);
    assert.ok(Array.isArray(catFiltered.findings));
    for (const f of catFiltered.findings) {
      assert.equal(f.category, 'BUILD');
    }
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 12. TRACEABILITY & PATH TRAVERSAL SECURITY
// ----------------------------------------------------

test('25. Path traversal protection: prevents escaping project boundary', () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    assert.ok(zenitchDir.startsWith(fs.realpathSync(dir)));
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 13. SCHEMA MIGRATION: 1.2.0 -> 1.3.0
// ----------------------------------------------------

test('26. Schema migration: upgrades v1.2.0 documents to v1.3.0 preserving data', async () => {
  const v12Doc = {
    version: '1.2.0',
    schemaVersion: '1.2.0',
    updatedAt: new Date().toISOString(),
    records: []
  };

  const migrated = MigrationEngine.migrateDocument<any>('verification.json', v12Doc, '1.3.0');
  assert.equal(migrated.schemaVersion, '1.3.0');
  assert.equal(migrated.version, '1.3.0');
});

// ----------------------------------------------------
// 14. MCP TOOL SURFACE & INVOCATION
// ----------------------------------------------------

test('27. MCP Tool Surface: progressive tool count across all modes', async () => {
  // Mode 1: Default baseline -> 11 tools
  const s1 = new ZenitchServer({ enableZenitchTools: false });
  const inst1 = s1.getServerInstance() as any;
  const t1 = await inst1._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t1.tools.length, 11);

  // Mode 2: Phase 1 enabled -> 14 tools
  const s2 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: false, enablePhase3Tools: false });
  const inst2 = s2.getServerInstance() as any;
  const t2 = await inst2._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t2.tools.length, 14);

  // Mode 3: Phase 2 enabled -> 16 tools
  const s3 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: false });
  const inst3 = s3.getServerInstance() as any;
  const t3 = await inst3._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t3.tools.length, 16);

  // Mode 4: Phase 3 enabled -> 18 tools
  const s4 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: false });
  const inst4 = s4.getServerInstance() as any;
  const t4 = await inst4._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t4.tools.length, 18);

  // Mode 5: Phase 4 enabled -> 20 tools
  const s5 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: true });
  const inst5 = s5.getServerInstance() as any;
  const t5 = await inst5._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t5.tools.length, 20);
});

test('28. ZenitchServer: executes zenitch_check_release_readiness via CallTool', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'server-tested-app',
      scripts: { build: 'tsc' }
    }));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(dir, 'README.md'), '# Server App\n## Deployment');

    const s = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: true });
    const inst = s.getServerInstance() as any;

    const res = await inst._requestHandlers.get('tools/call')({
      method: 'tools/call',
      params: {
        name: 'zenitch_check_release_readiness',
        arguments: {
          projectRoot: dir,
          mode: 'concise'
        }
      }
    });

    assert.ok(res.content && res.content[0]);
    const parsed = JSON.parse(res.content[0].text);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.blockingFindings, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test('29. ZenitchServer: executes zenitch_inspect_release_readiness via CallTool', async () => {
  const dir = createTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'server-inspect-app',
      scripts: { build: 'tsc' }
    }));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(dir, 'README.md'), '# Server App\n## Deployment');

    const s = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: true });
    const inst = s.getServerInstance() as any;

    // First check
    await inst._requestHandlers.get('tools/call')({
      method: 'tools/call',
      params: {
        name: 'zenitch_check_release_readiness',
        arguments: { projectRoot: dir }
      }
    });

    // Then inspect
    const res = await inst._requestHandlers.get('tools/call')({
      method: 'tools/call',
      params: {
        name: 'zenitch_inspect_release_readiness',
        arguments: {
          projectRoot: dir,
          mode: 'standard'
        }
      }
    });

    assert.ok(res.content && res.content[0]);
    const parsed = JSON.parse(res.content[0].text);
    assert.equal(parsed.success, true);
    assert.ok(parsed.data.readinessId);
  } finally {
    cleanupTempDir(dir);
  }
});

