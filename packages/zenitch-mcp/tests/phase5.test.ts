import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ZenitchServer } from '../src/server.js';
import { ImpactManager } from '../src/impact/impact-manager.js';
import { ImpactEvaluator } from '../src/impact/impact-evaluator.js';
import { StorageEngine } from '../src/memory/storage-engine.js';
import { MigrationEngine } from '../src/memory/migration-engine.js';

function createTempDir(prefix = 'zenitch-p5-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error
  }
}

const defaultProvenance = {
  source: 'USER' as const,
  verificationLevel: 'USER_CONFIRMED' as const,
  confidence: 1.0,
  timestamp: new Date().toISOString()
};

// ----------------------------------------------------
// 1. SIGNAL & RISK EVALUATION
// ----------------------------------------------------

test('1. Impact analysis: README documentation change evaluates to LOW risk', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'README.md'), '# Updated Readme');

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-doc-1': {
          id: 'chg-doc-1',
          type: 'DOCUMENTATION',
          summary: 'Update setup instructions in README',
          files: ['README.md'],
          affectedFiles: ['README.md'],
          createdAt: new Date().toISOString()
        }
      }
    });

    const res = await ImpactEvaluator.evaluateChangeImpact({ projectRoot: dir, changeId: 'chg-doc-1' });
    assert.equal(res.changeId, 'chg-doc-1');
    assert.equal(res.riskLevel, 'LOW');
    assert.ok(res.affectedFiles.includes('README.md'));
    assert.equal(res.affectedComponents.length, 0);
    assert.equal(res.affectedRoutes.length, 0);
    assert.equal(res.analysisStatus, 'COMPLETE');
  } finally {
    cleanupTempDir(dir);
  }
});

test('2. Impact analysis: component change detects component name and sets MEDIUM risk', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src/components'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/components/CheckoutModal.tsx'), 'export const CheckoutModal = () => null;');

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-comp-1': {
          id: 'chg-comp-1',
          type: 'FEATURE',
          summary: 'Add checkout modal UI component',
          files: ['src/components/CheckoutModal.tsx'],
          createdAt: new Date().toISOString()
        }
      }
    });

    const res = await ImpactEvaluator.evaluateChangeImpact({ projectRoot: dir, changeId: 'chg-comp-1' });
    assert.equal(res.riskLevel, 'MEDIUM');
    assert.ok(res.affectedComponents.includes('CheckoutModal'));
    assert.ok(res.affectedFiles.includes('src/components/CheckoutModal.tsx'));
    assert.ok(res.recommendedVerifications.some(v => typeof v === 'object' && v.target === 'CheckoutModal'));
  } finally {
    cleanupTempDir(dir);
  }
});

test('3. Impact analysis: App router and Pages router file changes detect routes', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src/app/checkout'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/app/checkout/page.tsx'), 'export default function Page() { return null; }');

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-route-1': {
          id: 'chg-route-1',
          type: 'FEATURE',
          summary: 'Add checkout route page',
          files: ['src/app/checkout/page.tsx'],
          createdAt: new Date().toISOString()
        }
      }
    });

    const res = await ImpactEvaluator.evaluateChangeImpact({ projectRoot: dir, changeId: 'chg-route-1' });
    assert.ok(res.affectedRoutes.includes('/checkout'));
    assert.ok(res.recommendedVerifications.some(v => typeof v === 'object' && v.target === '/checkout'));
  } finally {
    cleanupTempDir(dir);
  }
});

test('4. Impact analysis: shared service change detects direct consumer importing it', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src/services'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src/app/checkout'), { recursive: true });

    // Target service
    fs.writeFileSync(path.join(dir, 'src/services/PaymentService.ts'), 'export class PaymentService {}');

    // Consumer file importing target service
    fs.writeFileSync(
      path.join(dir, 'src/app/checkout/page.tsx'),
      'import { PaymentService } from "../../services/PaymentService";\nexport default function Page() { return null; }'
    );

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-svc-1': {
          id: 'chg-svc-1',
          type: 'FEATURE',
          summary: 'Update PaymentService methods',
          files: ['src/services/PaymentService.ts'],
          createdAt: new Date().toISOString()
        }
      }
    });

    const res = await ImpactEvaluator.evaluateChangeImpact({ projectRoot: dir, changeId: 'chg-svc-1', depth: 1 });
    assert.equal(res.riskLevel, 'HIGH');
    assert.ok(res.affectedFiles.includes('src/services/PaymentService.ts'));
    assert.ok(res.affectedFiles.includes('src/app/checkout/page.tsx'));
    assert.ok(res.affectedRoutes.includes('/checkout'));
    assert.ok(res.reasons.some(r => r.includes('Consumer at depth 1')));
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 2. REQUIREMENT TRACEABILITY & NON-INVENTION
// ----------------------------------------------------

test('5. Impact analysis: existing requirement link surfaces requirement and criteria', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/pay.ts'), 'export const pay = () => true;');

    StorageEngine.writeDocument(zenitchDir, 'requirements.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'REQ-PAY-01': {
          id: 'REQ-PAY-01',
          title: 'Secure Payment Processing',
          description: 'Process credit card payments',
          category: 'functional',
          status: 'IMPLEMENTED',
          priority: 'must_have',
          authority: 'AUTHORITATIVE',
          acceptanceCriteria: [
            {
              id: 'AC-PAY-1',
              description: 'Validates card format',
              type: 'FUNCTIONAL',
              status: 'PASSED',
              verificationIds: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            },
            {
              id: 'AC-PAY-2',
              description: 'Rejects expired cards',
              type: 'FUNCTIONAL',
              status: 'PASSED',
              verificationIds: [],
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

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-pay-1': {
          id: 'chg-pay-1',
          type: 'FEATURE',
          summary: 'Card processing updates',
          files: ['src/pay.ts'],
          requirementIds: ['REQ-PAY-01'],
          createdAt: new Date().toISOString()
        }
      }
    });

    const res = await ImpactEvaluator.evaluateChangeImpact({ projectRoot: dir, changeId: 'chg-pay-1' });
    assert.ok(res.affectedRequirements.includes('REQ-PAY-01'));
    assert.ok(res.affectedCriteria.includes('AC-PAY-1'));
    assert.ok(res.affectedCriteria.includes('AC-PAY-2'));
  } finally {
    cleanupTempDir(dir);
  }
});

test('6. Impact analysis: requirement relatedFiles link surfaces requirement even without explicit change link', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src/api'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/api/auth.ts'), 'export const check = () => true;');

    StorageEngine.writeDocument(zenitchDir, 'requirements.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'REQ-AUTH-01': {
          id: 'REQ-AUTH-01',
          title: 'Session Authentication',
          description: 'Authenticate user requests',
          category: 'functional',
          status: 'IMPLEMENTED',
          priority: 'must_have',
          authority: 'AUTHORITATIVE',
          relatedFiles: ['src/api/auth.ts'],
          acceptanceCriteria: ['AC-AUTH-1'],
          provenance: defaultProvenance,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      },
      tickets: {}
    });

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-auth-1': {
          id: 'chg-auth-1',
          type: 'SECURITY',
          summary: 'Refactor session check',
          files: ['src/api/auth.ts'],
          createdAt: new Date().toISOString()
        }
      }
    });

    const res = await ImpactEvaluator.evaluateChangeImpact({ projectRoot: dir, changeId: 'chg-auth-1' });
    assert.ok(res.affectedRequirements.includes('REQ-AUTH-01'));
    assert.ok(res.affectedCriteria.includes('AC-AUTH-1'));
  } finally {
    cleanupTempDir(dir);
  }
});

test('7. Impact analysis: unknown requirement relationships are NOT invented', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/standalone.ts'), 'export const x = 42;');

    StorageEngine.writeDocument(zenitchDir, 'requirements.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'REQ-OTHER-01': {
          id: 'REQ-OTHER-01',
          title: 'Unrelated Feature',
          description: 'Something else',
          category: 'visual',
          status: 'PLANNED',
          priority: 'nice_to_have',
          authority: 'AUTHORITATIVE',
          relatedFiles: ['src/unrelated.ts'],
          acceptanceCriteria: [],
          provenance: defaultProvenance,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      },
      tickets: {}
    });

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-stand-1': {
          id: 'chg-stand-1',
          type: 'FEATURE',
          summary: 'Standalone change with no links',
          files: ['src/standalone.ts'],
          createdAt: new Date().toISOString()
        }
      }
    });

    const res = await ImpactEvaluator.evaluateChangeImpact({ projectRoot: dir, changeId: 'chg-stand-1' });
    assert.equal(res.affectedRequirements.length, 0);
    assert.equal(res.affectedCriteria.length, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 3. SECURITY SENSITIVITY & CRITICAL RISK
// ----------------------------------------------------

test('8. Impact analysis: authentication and middleware change evaluates to HIGH risk', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src/middleware'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/middleware/auth-guard.ts'), 'export const guard = () => false;');

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-sec-1': {
          id: 'chg-sec-1',
          type: 'SECURITY',
          summary: 'Update auth guard logic',
          files: ['src/middleware/auth-guard.ts'],
          createdAt: new Date().toISOString()
        }
      }
    });

    const res = await ImpactEvaluator.evaluateChangeImpact({ projectRoot: dir, changeId: 'chg-sec-1' });
    assert.equal(res.riskLevel, 'HIGH');
    assert.ok(res.reasons.some(r => r.includes('authentication, authorization, or security middleware')));
    assert.ok(res.recommendedVerifications.some(v => typeof v === 'object' && v.suggestedMethod === 'AUTOMATED_TEST'));
  } finally {
    cleanupTempDir(dir);
  }
});

test('9. Impact analysis: production credentials/secret change evaluates to CRITICAL risk', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'config/credentials.ts'), 'export const token = "test";');

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-crit-1': {
          id: 'chg-crit-1',
          type: 'SECURITY',
          summary: 'Update credentials configuration',
          files: ['config/credentials.ts'],
          createdAt: new Date().toISOString()
        }
      }
    });

    const res = await ImpactEvaluator.evaluateChangeImpact({ projectRoot: dir, changeId: 'chg-crit-1' });
    assert.equal(res.riskLevel, 'CRITICAL');
    assert.ok(res.reasons.some(r => r.includes('CRITICAL: production security or credential')));
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 4. BOUNDED TRAVERSAL & PARTIAL STATUS
// ----------------------------------------------------

test('10. Impact analysis: dependency traversal is bounded by depth parameter', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });

    // A -> B -> C
    fs.writeFileSync(path.join(dir, 'src/serviceA.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(dir, 'src/serviceB.ts'), 'import { a } from "./serviceA";\nexport const b = a + 1;');
    fs.writeFileSync(path.join(dir, 'src/serviceC.ts'), 'import { b } from "./serviceB";\nexport const c = b + 1;');

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-chain-1': {
          id: 'chg-chain-1',
          type: 'FEATURE',
          summary: 'Modify root service A',
          files: ['src/serviceA.ts'],
          createdAt: new Date().toISOString()
        }
      }
    });

    // Depth 1: finds serviceA and direct consumer serviceB
    const depth1 = await ImpactEvaluator.evaluateChangeImpact({ projectRoot: dir, changeId: 'chg-chain-1', depth: 1 });
    assert.ok(depth1.affectedFiles.includes('src/serviceA.ts'));
    assert.ok(depth1.affectedFiles.includes('src/serviceB.ts'));
    assert.ok(!depth1.affectedFiles.includes('src/serviceC.ts'));

    // Depth 2: finds serviceA, serviceB, and transitive consumer serviceC
    const depth2 = await ImpactEvaluator.evaluateChangeImpact({ projectRoot: dir, changeId: 'chg-chain-1', depth: 2 });
    assert.ok(depth2.affectedFiles.includes('src/serviceA.ts'));
    assert.ok(depth2.affectedFiles.includes('src/serviceB.ts'));
    assert.ok(depth2.affectedFiles.includes('src/serviceC.ts'));
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 5. CACHING, FINGERPRINTING & INVALIDATION
// ----------------------------------------------------

test('11. ImpactManager: caching returns reusedEvidence = true on identical second run', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src/components'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/components/Header.tsx'), 'export const Header = () => null;');

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-cache-1': {
          id: 'chg-cache-1',
          type: 'FEATURE',
          summary: 'Header modification',
          files: ['src/components/Header.tsx'],
          createdAt: new Date().toISOString()
        }
      }
    });

    const first = await ImpactManager.analyzeChangeImpact({ projectRoot: dir, changeId: 'chg-cache-1' });
    assert.equal(first.reusedEvidence, false);

    const second = await ImpactManager.analyzeChangeImpact({ projectRoot: dir, changeId: 'chg-cache-1' });
    assert.equal(second.reusedEvidence, true);
    assert.equal(second.id, first.id);
  } finally {
    cleanupTempDir(dir);
  }
});

test('12. ImpactManager: modifying file content invalidates cache and triggers fresh analysis', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    const targetFile = path.join(dir, 'src/calc.ts');
    fs.writeFileSync(targetFile, 'export const calc = 10;');

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-inval-1': {
          id: 'chg-inval-1',
          type: 'FEATURE',
          summary: 'Calculator logic',
          files: ['src/calc.ts'],
          createdAt: new Date().toISOString()
        }
      }
    });

    const first = await ImpactManager.analyzeChangeImpact({ projectRoot: dir, changeId: 'chg-inval-1' });
    assert.equal(first.reusedEvidence, false);

    // Modify file content & update mtime
    fs.writeFileSync(targetFile, 'export const calc = 20; // updated');

    const second = await ImpactManager.analyzeChangeImpact({ projectRoot: dir, changeId: 'chg-inval-1' });
    assert.equal(second.reusedEvidence, false);
  } finally {
    cleanupTempDir(dir);
  }
});

test('13. ImpactManager: forceRefresh: true bypasses cache', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/data.ts'), 'export const data = [];');

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-force-1': {
          id: 'chg-force-1',
          type: 'FEATURE',
          summary: 'Data change',
          files: ['src/data.ts'],
          createdAt: new Date().toISOString()
        }
      }
    });

    await ImpactManager.analyzeChangeImpact({ projectRoot: dir, changeId: 'chg-force-1' });
    const forced = await ImpactManager.analyzeChangeImpact({ projectRoot: dir, changeId: 'chg-force-1', forceRefresh: true });
    assert.equal(forced.reusedEvidence, false);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 6. INSPECTION & DETERMINISTIC FILTERING
// ----------------------------------------------------

test('14. ImpactManager: inspectImpact returns stored assessments with filters', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src/components'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src/app/cart'), { recursive: true });

    fs.writeFileSync(path.join(dir, 'src/components/CartIcon.tsx'), 'export const CartIcon = () => null;');
    fs.writeFileSync(path.join(dir, 'src/app/cart/page.tsx'), 'export default function Page() { return null; }');

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-cart-1': {
          id: 'chg-cart-1',
          type: 'FEATURE',
          summary: 'Cart icon and route',
          files: ['src/components/CartIcon.tsx', 'src/app/cart/page.tsx'],
          createdAt: new Date().toISOString()
        }
      }
    });

    await ImpactManager.analyzeChangeImpact({ projectRoot: dir, changeId: 'chg-cart-1' });

    // Filter by changeId
    const resChange = await ImpactManager.inspectImpact({ projectRoot: dir, changeId: 'chg-cart-1' });
    assert.equal(resChange.totalEvaluations, 1);
    assert.equal(resChange.impacts[0].changeId, 'chg-cart-1');

    // Filter by route
    const resRoute = await ImpactManager.inspectImpact({ projectRoot: dir, route: '/cart' });
    assert.equal(resRoute.totalEvaluations, 1);

    // Filter by component
    const resComp = await ImpactManager.inspectImpact({ projectRoot: dir, component: 'CartIcon' });
    assert.equal(resComp.totalEvaluations, 1);

    // Concise mode
    const concise = await ImpactManager.inspectImpact({ projectRoot: dir, mode: 'concise' });
    assert.equal(concise.totalEvaluations, 1);
    assert.ok(concise.affectedFilesCount >= 2);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 7. SCHEMA MIGRATION: 1.3.0 -> 1.4.0
// ----------------------------------------------------

test('15. Schema migration: upgrades v1.3.0 documents to v1.4.0 preserving data', async () => {
  const v13Doc = {
    version: '1.3.0',
    schemaVersion: '1.3.0',
    updatedAt: new Date().toISOString(),
    records: []
  };

  const migrated = MigrationEngine.migrateDocument<any>('impact.json', v13Doc, '1.4.0');
  assert.equal(migrated.schemaVersion, '1.4.0');
  assert.equal(migrated.version, '1.4.0');
});

// ----------------------------------------------------
// 8. PROGRESSIVE TOOL COUNT & CALLTOOL INVOCATION
// ----------------------------------------------------

test('16. Progressive tool count: lists 11 -> 14 -> 16 -> 18 -> 20 -> 22 tools across progressive modes', async () => {
  // Mode 1: Default baseline -> 11 tools
  const s1 = new ZenitchServer({ enableZenitchTools: false });
  const inst1 = s1.getServerInstance() as any;
  const t1 = await inst1._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t1.tools.length, 11);

  // Mode 2: Phase 1 enabled -> 14 tools
  const s2 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: false, enablePhase3Tools: false, enablePhase4Tools: false, enablePhase5Tools: false });
  const inst2 = s2.getServerInstance() as any;
  const t2 = await inst2._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t2.tools.length, 14);

  // Mode 3: Phase 2 enabled -> 16 tools
  const s3 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: false, enablePhase4Tools: false, enablePhase5Tools: false });
  const inst3 = s3.getServerInstance() as any;
  const t3 = await inst3._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t3.tools.length, 16);

  // Mode 4: Phase 3 enabled -> 18 tools
  const s4 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: false, enablePhase5Tools: false });
  const inst4 = s4.getServerInstance() as any;
  const t4 = await inst4._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t4.tools.length, 18);

  // Mode 5: Phase 4 enabled -> 20 tools
  const s5 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: true, enablePhase5Tools: false });
  const inst5 = s5.getServerInstance() as any;
  const t5 = await inst5._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t5.tools.length, 20);

  // Mode 6: Phase 5 enabled -> 22 tools
  const s6 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: true, enablePhase5Tools: true });
  const inst6 = s6.getServerInstance() as any;
  const t6 = await inst6._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t6.tools.length, 22);

  const toolNames = t6.tools.map((t: any) => t.name);
  assert.ok(toolNames.includes('zenitch_analyze_change_impact'));
  assert.ok(toolNames.includes('zenitch_inspect_impact'));
});

test('17. ZenitchServer: executes zenitch_analyze_change_impact via CallTool', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src/components'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/components/Footer.tsx'), 'export const Footer = () => null;');

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-server-1': {
          id: 'chg-server-1',
          type: 'FEATURE',
          summary: 'Footer changes',
          files: ['src/components/Footer.tsx'],
          createdAt: new Date().toISOString()
        }
      }
    });

    const s = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: true, enablePhase5Tools: true });
    const inst = s.getServerInstance() as any;

    const res = await inst._requestHandlers.get('tools/call')({
      method: 'tools/call',
      params: {
        name: 'zenitch_analyze_change_impact',
        arguments: {
          projectRoot: dir,
          changeId: 'chg-server-1'
        }
      }
    });

    assert.ok(res.content && res.content[0]);
    const parsed = JSON.parse(res.content[0].text);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.changeId, 'chg-server-1');
    assert.ok(parsed.data.affectedComponents.includes('Footer'));
  } finally {
    cleanupTempDir(dir);
  }
});

test('18. ZenitchServer: executes zenitch_inspect_impact via CallTool', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(path.join(dir, 'src/components'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/components/Sidebar.tsx'), 'export const Sidebar = () => null;');

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'chg-server-2': {
          id: 'chg-server-2',
          type: 'FEATURE',
          summary: 'Sidebar UI change',
          files: ['src/components/Sidebar.tsx'],
          createdAt: new Date().toISOString()
        }
      }
    });

    const s = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: true, enablePhase5Tools: true });
    const inst = s.getServerInstance() as any;

    // First analyze
    await inst._requestHandlers.get('tools/call')({
      method: 'tools/call',
      params: {
        name: 'zenitch_analyze_change_impact',
        arguments: {
          projectRoot: dir,
          changeId: 'chg-server-2'
        }
      }
    });

    // Then inspect
    const res = await inst._requestHandlers.get('tools/call')({
      method: 'tools/call',
      params: {
        name: 'zenitch_inspect_impact',
        arguments: {
          projectRoot: dir,
          changeId: 'chg-server-2'
        }
      }
    });

    assert.ok(res.content && res.content[0]);
    const parsed = JSON.parse(res.content[0].text);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.totalEvaluations, 1);
    assert.equal(parsed.data.impacts[0].changeId, 'chg-server-2');
  } finally {
    cleanupTempDir(dir);
  }
});

test('19. ZenitchServer: zenitch_get_system_info reports engineering_impact as ACTIVE_PHASE5', async () => {
  const s = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: true, enablePhase5Tools: true });
  const inst = s.getServerInstance() as any;

  const res = await inst._requestHandlers.get('tools/call')({
    method: 'tools/call',
    params: {
      name: 'zenitch_get_system_info',
      arguments: {}
    }
  });

  assert.ok(res.content && res.content[0]);
  const parsed = JSON.parse(res.content[0].text);
  assert.equal(parsed.success, true);
  const subs = parsed.data.subsystems;
  const p5Sub = subs.find((s: any) => s.id === 'engineering_impact');
  assert.ok(p5Sub);
  assert.equal(p5Sub.status, 'ACTIVE_PHASE5');
});

test('20. Security boundary: missing changeId throws clean structured error without crashing', async () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });

    StorageEngine.writeDocument(zenitchDir, 'changes.json', {
      schemaVersion: '1.4.0',
      projectId: 'proj-p5',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {}
    });

    await assert.rejects(
      async () => {
        await ImpactEvaluator.evaluateChangeImpact({ projectRoot: dir, changeId: 'non-existent-chg' });
      },
      /Change record "non-existent-chg" not found in \.zenitch\/changes\.json/
    );
  } finally {
    cleanupTempDir(dir);
  }
});

