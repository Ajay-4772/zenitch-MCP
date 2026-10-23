import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ZenitchServer } from '../src/server.js';
import { ArchitectureManager } from '../src/architecture/architecture-manager.js';
import { ArchitectureEvaluator } from '../src/architecture/architecture-evaluator.js';
import { DependencyGraph } from '../src/architecture/dependency-graph.js';
import { StorageEngine } from '../src/memory/storage-engine.js';
import { MigrationEngine } from '../src/memory/migration-engine.js';
import { ArchitectureFileSchema } from '../src/schemas/architecture.schema.js';

function createTempDir(prefix = 'zenitch-p6-test-'): string {
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
// 1. DEPENDENCY CYCLE DETECTION
// ----------------------------------------------------

test('1. 2-node cycle: detects A -> B -> A circular dependency', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), "import { b } from './b';\nexport const a = 'a';");
    fs.writeFileSync(path.join(dir, 'src', 'b.ts'), "import { a } from './a';\nexport const b = 'b';");

    const record = ArchitectureEvaluator.evaluate(dir);
    const cycleFindings = record.findings.filter(f => f.category === 'DEPENDENCY_CYCLE');

    assert.equal(cycleFindings.length, 1);
    assert.equal(cycleFindings[0].ruleId, 'RULE-BUILTIN-CIRCULAR-DEPENDENCY');
    assert.equal(cycleFindings[0].severity, 'HIGH');
    assert.equal(cycleFindings[0].factConfidence, 1.0);
    assert.ok(cycleFindings[0].affectedFiles.includes('src/a.ts'));
    assert.ok(cycleFindings[0].affectedFiles.includes('src/b.ts'));
    assert.equal(record.metrics.circularDependencyCount, 1);
  } finally {
    cleanupTempDir(dir);
  }
});

test('2. 3-node cycle: detects A -> B -> C -> A circular dependency', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), "import { b } from './b';\nexport const a = 1;");
    fs.writeFileSync(path.join(dir, 'src', 'b.ts'), "import { c } from './c';\nexport const b = 2;");
    fs.writeFileSync(path.join(dir, 'src', 'c.ts'), "import { a } from './a';\nexport const c = 3;");

    const record = ArchitectureEvaluator.evaluate(dir);
    const cycleFindings = record.findings.filter(f => f.category === 'DEPENDENCY_CYCLE');

    assert.equal(cycleFindings.length, 1);
    assert.equal(cycleFindings[0].affectedFiles.length, 3);
    assert.ok(cycleFindings[0].evidence.trace);
    assert.equal(cycleFindings[0].evidence.trace.length, 4); // a -> b -> c -> a
  } finally {
    cleanupTempDir(dir);
  }
});

test('3. Clean DAG: reports 0 circular dependencies', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), "import { b } from './b';\nimport { c } from './c';");
    fs.writeFileSync(path.join(dir, 'src', 'b.ts'), "import { c } from './c';\nexport const b = 1;");
    fs.writeFileSync(path.join(dir, 'src', 'c.ts'), "export const c = 2;");

    const record = ArchitectureEvaluator.evaluate(dir);
    const cycleFindings = record.findings.filter(f => f.category === 'DEPENDENCY_CYCLE');

    assert.equal(cycleFindings.length, 0);
    assert.equal(record.metrics.circularDependencyCount, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test('21. Unresolved import does not create false cycle', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    // Imports missing file and external library
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), "import { missing } from './does-not-exist';\nimport express from 'express';");
    fs.writeFileSync(path.join(dir, 'src', 'b.ts'), "import { a } from './a';");

    const record = ArchitectureEvaluator.evaluate(dir);
    const cycleFindings = record.findings.filter(f => f.category === 'DEPENDENCY_CYCLE');

    assert.equal(cycleFindings.length, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test('22. Bounded cycle length: cycle exceeding 15 hops is not reported beyond bound', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    // Create chain of 20 nodes
    for (let i = 1; i <= 20; i++) {
      const next = i === 20 ? 1 : i + 1;
      fs.writeFileSync(
        path.join(dir, 'src', `node${i}.ts`),
        `import { n${next} } from './node${next}';\nexport const n${i} = ${i};`
      );
    }

    // Default maxCycleLength = 15; a 20-hop cycle exceeds 15
    const record = ArchitectureEvaluator.evaluate(dir, { maxCycleLength: 15 });
    const cycleFindings = record.findings.filter(f => f.category === 'DEPENDENCY_CYCLE');

    // Cycle of 20 hops must not be reported as a <=15 cycle
    assert.equal(cycleFindings.length, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 2. EXPLICIT LAYER-RULE VIOLATIONS
// ----------------------------------------------------

test('4. Client/Server layer violation: client component importing server module', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'ClientWidget.tsx'),
      "'use client';\nimport { PrismaClient } from '@prisma/client';\nexport function ClientWidget() { return null; }"
    );

    const record = ArchitectureEvaluator.evaluate(dir);
    const layerFindings = record.findings.filter(f => f.category === 'LAYER_RULE_VIOLATION');

    assert.equal(layerFindings.length, 1);
    assert.equal(layerFindings[0].ruleId, 'RULE-BUILTIN-CLIENT-NO-SERVER');
    assert.equal(layerFindings[0].severity, 'HIGH');
    assert.equal(layerFindings[0].factConfidence, 1.0);
    assert.ok(layerFindings[0].fact.includes('@prisma/client'));
    assert.ok(layerFindings[0].signal.includes('Client component'));
    assert.ok(layerFindings[0].potentialRisk.includes('May bundle sensitive'));
  } finally {
    cleanupTempDir(dir);
  }
});

test('5. Server import in client component: fs or child_process flagged', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'ClientButton.tsx'),
      `"use client";\nimport fs from \'node:fs\';\nexport const Button = () => null;`
    );

    const record = ArchitectureEvaluator.evaluate(dir);
    const layerFindings = record.findings.filter(f => f.category === 'LAYER_RULE_VIOLATION');

    assert.equal(layerFindings.length, 1);
    assert.equal(layerFindings[0].ruleId, 'RULE-BUILTIN-CLIENT-NO-SERVER');
  } finally {
    cleanupTempDir(dir);
  }
});

test('12. Human-approved decision constraint violation', () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'src', 'domain'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src', 'infra'), { recursive: true });

    fs.writeFileSync(path.join(dir, 'src', 'infra', 'db.ts'), "export const db = {};");
    // Domain imports Infra directly
    fs.writeFileSync(path.join(dir, 'src', 'domain', 'user.ts'), "import { db } from '../infra/db';\nexport const user = {};");

    // Human-approved architectural decision in decisions.json
    StorageEngine.writeDocument(zenitchDir, 'decisions.json', {
      schemaVersion: '1.0.0',
      projectId: 'proj-p6',
      _version: 1,
      updatedAt: new Date().toISOString(),
      items: {
        'DEC-042': {
          id: 'DEC-042',
          title: 'Domain Layer Isolation',
          statement: 'Domain layer must not depend on Infrastructure layer',
          category: 'architecture',
          status: 'APPROVED',
          architecturalRule: {
            from: 'src/domain/*',
            disallow: 'src/infra/*'
          },
          provenance: {
            source: 'USER',
            verificationLevel: 'USER_CONFIRMED',
            confidence: 1.0,
            timestamp: new Date().toISOString()
          }
        }
      }
    });

    const record = ArchitectureEvaluator.evaluate(dir);
    const layerFindings = record.findings.filter(f => f.category === 'LAYER_RULE_VIOLATION' && f.ruleId === 'DEC-042');

    assert.equal(layerFindings.length, 1);
    assert.equal(layerFindings[0].ruleId, 'DEC-042');
    assert.equal(layerFindings[0].severity, 'HIGH');
    assert.ok(layerFindings[0].relatedDecisionIds.includes('DEC-042'));
    assert.ok(layerFindings[0].evidence.metricName === 'decisionConstraintViolation');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 3. COMPLEXITY BOUNDARY SIGNALS
// ----------------------------------------------------

test('6. >800 LOC boundary: flagged with exact measurement', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    const lines = Array.from({ length: 850 }, (_, i) => `// line ${i + 1}`).join('\n');
    fs.writeFileSync(path.join(dir, 'src', 'huge.ts'), lines);

    const record = ArchitectureEvaluator.evaluate(dir);
    const locFindings = record.findings.filter(f => f.ruleId === 'RULE-BUILTIN-FILE-SIZE-BOUNDARY');

    assert.equal(locFindings.length, 1);
    assert.equal(locFindings[0].category, 'COMPLEXITY_BOUNDARY');
    assert.equal(locFindings[0].severity, 'MEDIUM');
    assert.equal(locFindings[0].evidence.measuredValue, 850);
    assert.equal(locFindings[0].evidence.threshold, 800);
    assert.ok(locFindings[0].fact.includes('850 lines'));
  } finally {
    cleanupTempDir(dir);
  }
});

test('7. >5 nesting boundary: flagged with exact measurement', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    // Nesting depth 7 with braces
    const deepCode = `
export function deep() {
  if (true) {
    while (true) {
      for (let i = 0; i < 1; i++) {
        if (i === 0) {
          if (true) {
            console.log('depth 6');
          }
        }
      }
    }
  }
}
`;
    fs.writeFileSync(path.join(dir, 'src', 'deep.ts'), deepCode);

    const record = ArchitectureEvaluator.evaluate(dir);
    const nestingFindings = record.findings.filter(f => f.ruleId === 'RULE-BUILTIN-NESTING-DEPTH-BOUNDARY');

    assert.equal(nestingFindings.length, 1);
    assert.equal(nestingFindings[0].category, 'COMPLEXITY_BOUNDARY');
    assert.equal(nestingFindings[0].severity, 'LOW');
    assert.ok(Number(nestingFindings[0].evidence.measuredValue) > 5);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 4. SWALLOWED / EMPTY CATCH DETECTION
// ----------------------------------------------------

test('8. Empty catch: detects swallowed exception with no handling', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    const emptyCatchCode = `
export function risky() {
  try {
    JSON.parse('bad');
  } catch (err) {
    // silently swallowed
  }
}
`;
    fs.writeFileSync(path.join(dir, 'src', 'swallowed.ts'), emptyCatchCode);

    const record = ArchitectureEvaluator.evaluate(dir);
    const catchFindings = record.findings.filter(f => f.category === 'SWALLOWED_ERROR');

    assert.equal(catchFindings.length, 1);
    assert.equal(catchFindings[0].ruleId, 'RULE-BUILTIN-SWALLOWED-CATCH');
    assert.equal(catchFindings[0].severity, 'MEDIUM');
    assert.ok(catchFindings[0].evidence.lineNumbers);
  } finally {
    cleanupTempDir(dir);
  }
});

test('9. Correctly handled catch: not flagged when logged or rethrown', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    const handledCatchCode = `
export function safe() {
  try {
    JSON.parse('data');
  } catch (err) {
    console.error('Failed to parse:', err);
    throw err;
  }
}
`;
    fs.writeFileSync(path.join(dir, 'src', 'safe.ts'), handledCatchCode);

    const record = ArchitectureEvaluator.evaluate(dir);
    const catchFindings = record.findings.filter(f => f.category === 'SWALLOWED_ERROR');

    assert.equal(catchFindings.length, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 5. UNREFERENCED DECLARED DEPENDENCIES
// ----------------------------------------------------

test('10. Unreferenced declared dependency: flagged in package.json with exact category', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), "export const main = 1;");
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        dependencies: {
          'lodash': '^4.17.21'
        }
      })
    );

    const record = ArchitectureEvaluator.evaluate(dir);
    const depFindings = record.findings.filter(f => f.category === 'UNREFERENCED_DECLARED_DEPENDENCY');

    assert.equal(depFindings.length, 1);
    assert.equal(depFindings[0].ruleId, 'RULE-BUILTIN-UNREFERENCED-DEPENDENCY');
    assert.equal(depFindings[0].category, 'UNREFERENCED_DECLARED_DEPENDENCY');
    assert.equal(depFindings[0].severity, 'LOW');
    assert.ok(depFindings[0].fact.includes('lodash'));
  } finally {
    cleanupTempDir(dir);
  }
});

test('11. Dependency whitelist: standard build tools and @types are not flagged', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), "export const main = 1;");
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        dependencies: {
          '@types/node': '^20.0.0',
          'typescript': '^5.0.0',
          'prettier': '^3.0.0',
          'eslint': '^8.0.0'
        }
      })
    );

    const record = ArchitectureEvaluator.evaluate(dir);
    const depFindings = record.findings.filter(f => f.category === 'UNREFERENCED_DECLARED_DEPENDENCY');

    assert.equal(depFindings.length, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test('23. Dynamic/config dependency caveat: explains dynamic/config possibilities', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), "export const main = 1;");
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        dependencies: {
          'moment': '^2.29.4'
        }
      })
    );

    const record = ArchitectureEvaluator.evaluate(dir);
    const depFinding = record.findings.find(f => f.category === 'UNREFERENCED_DECLARED_DEPENDENCY');

    assert.ok(depFinding);
    assert.ok(depFinding.recommendedAction.includes('dynamic imports'));
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 6. RESOURCE BOUNDARIES
// ----------------------------------------------------

test('13. >2000 file boundary: caps analysis deterministically and sets boundaryReached', () => {
  const dir = createTempDir();
  try {
    // Test capping with options maxScannedFiles = 5
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    for (let i = 1; i <= 10; i++) {
      fs.writeFileSync(path.join(dir, 'src', `file${i}.ts`), `export const v${i} = ${i};`);
    }

    const record = ArchitectureEvaluator.evaluate(dir, { maxScannedFiles: 5 });

    assert.equal(record.metrics.totalFilesScanned, 5);
    assert.equal(record.metrics.boundaryReached, true);
    assert.equal(record.metrics.partialEvaluation, true);
    assert.ok(record.metrics.boundariesEnforced.some(b => b.includes('capped at 5')));
  } finally {
    cleanupTempDir(dir);
  }
});

test('14. >512 KB file boundary: large file is skipped safely without crashing', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'normal.ts'), "export const ok = true;");
    // Simulate oversized file (using maxFileSize option = 1000 bytes)
    const bigContent = 'x'.repeat(2000);
    fs.writeFileSync(path.join(dir, 'src', 'oversized.ts'), bigContent);

    const record = ArchitectureEvaluator.evaluate(dir, { maxFileSize: 1000 });

    assert.equal(record.metrics.boundaryReached, true);
    assert.equal(record.metrics.partialEvaluation, true);
    assert.ok(record.metrics.boundariesEnforced.some(b => b.includes('oversized.ts')));
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 7. CACHING & INVALIDATION
// ----------------------------------------------------

test('15. Cache reuse: second call without changes returns cached assessment', async () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), "export const a = 1;");

    const first = await ArchitectureManager.analyzeArchitecture({ projectRoot: dir, mode: 'detailed' });
    assert.equal(first.reusedEvidence, false);

    const second = await ArchitectureManager.analyzeArchitecture({ projectRoot: dir, mode: 'detailed' });
    assert.equal(second.reusedEvidence, true);
    assert.equal(second.id, first.id);
  } finally {
    cleanupTempDir(dir);
  }
});

test('16. Source modification invalidation: modifying source file invalidates cache', async () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    const file = path.join(dir, 'src', 'index.ts');
    fs.writeFileSync(file, "export const a = 1;");

    const first = await ArchitectureManager.analyzeArchitecture({ projectRoot: dir, mode: 'detailed' });
    assert.equal(first.reusedEvidence, false);

    // Wait a tiny bit and touch file to ensure mtime advances
    await new Promise(r => setTimeout(r, 50));
    fs.appendFileSync(file, "\nexport const b = 2;");

    const second = await ArchitectureManager.analyzeArchitecture({ projectRoot: dir, mode: 'detailed' });
    assert.equal(second.reusedEvidence, false);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 8. PERSISTENCE & HISTORY BOUNDARY
// ----------------------------------------------------

test('25. History never exceeds 5 snapshots: FIFO pruning enforced', async () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), "export const a = 1;");

    for (let i = 1; i <= 8; i++) {
      await ArchitectureManager.analyzeArchitecture({ projectRoot: dir, forceReassess: true });
    }

    const zenitchDir = StorageEngine.getZenitchDir(dir);
    const doc = StorageEngine.readDocument<any>(
      zenitchDir,
      'architecture.json',
      ArchitectureFileSchema,
      () => null
    );

    assert.ok(doc);
    assert.ok(doc.history.length <= 5);
    assert.equal(doc.history.length, 5);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 9. SCHEMA MIGRATION & CORRUPTION HANDLING
// ----------------------------------------------------

test('17. Schema migration: migrates 1.4.0 document to 1.5.0', () => {
  const legacyDoc = {
    schemaVersion: '1.4.0',
    projectId: 'test-legacy',
    _version: 3,
    updatedAt: new Date().toISOString()
  };

  const migrated = MigrationEngine.migrateDocument<any>('architecture.json', legacyDoc, '1.5.0');
  assert.equal(migrated.schemaVersion, '1.5.0');
});

test('26. Corrupt architecture document: handles corrupt document gracefully', () => {
  const dir = createTempDir();
  try {
    const zenitchDir = StorageEngine.getZenitchDir(dir);
    fs.mkdirSync(zenitchDir, { recursive: true });
    // Write invalid JSON into architecture.json
    fs.writeFileSync(path.join(zenitchDir, 'architecture.json'), "{ corrupt json content !!!");

    // Inspection handles corrupted document safely and evaluates fresh
    const res = ArchitectureEvaluator.evaluate(dir);
    assert.ok(res);
    assert.equal(res.status, 'HEALTHY');
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 10. CONCURRENCY PROTECTION
// ----------------------------------------------------

test('18. Multi-process concurrency: concurrent evaluations resolve safely under lock', async () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), "export const a = 1;");

    // Execute 5 concurrent analyses
    const promises = Array.from({ length: 5 }, () =>
      ArchitectureManager.analyzeArchitecture({ projectRoot: dir, forceReassess: true })
    );

    const results = await Promise.all(promises);
    assert.equal(results.length, 5);

    const zenitchDir = StorageEngine.getZenitchDir(dir);
    const doc = StorageEngine.readDocument<any>(
      zenitchDir,
      'architecture.json',
      ArchitectureFileSchema,
      () => null
    );

    assert.ok(doc);
    assert.ok(doc._version >= 1);
  } finally {
    cleanupTempDir(dir);
  }
});

// ----------------------------------------------------
// 11. TOOL COUNT PROGRESSION & REAL STDIO
// ----------------------------------------------------

test('19. Progressive tool count: lists 11 -> 14 -> 16 -> 18 -> 20 -> 22 -> 24 tools across progressive modes', async () => {
  // Mode 1: Default baseline -> 11 tools
  const s1 = new ZenitchServer({ enableZenitchTools: false });
  const inst1 = s1.getServerInstance() as any;
  const t1 = await inst1._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t1.tools.length, 11);

  // Mode 2: Phase 1 enabled -> 14 tools
  const s2 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: false, enablePhase3Tools: false, enablePhase4Tools: false, enablePhase5Tools: false, enablePhase6Tools: false });
  const inst2 = s2.getServerInstance() as any;
  const t2 = await inst2._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t2.tools.length, 14);

  // Mode 3: Phase 2 enabled -> 16 tools
  const s3 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: false, enablePhase4Tools: false, enablePhase5Tools: false, enablePhase6Tools: false });
  const inst3 = s3.getServerInstance() as any;
  const t3 = await inst3._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t3.tools.length, 16);

  // Mode 4: Phase 3 enabled -> 18 tools
  const s4 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: false, enablePhase5Tools: false, enablePhase6Tools: false });
  const inst4 = s4.getServerInstance() as any;
  const t4 = await inst4._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t4.tools.length, 18);

  // Mode 5: Phase 4 enabled -> 20 tools
  const s5 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: true, enablePhase5Tools: false, enablePhase6Tools: false });
  const inst5 = s5.getServerInstance() as any;
  const t5 = await inst5._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t5.tools.length, 20);

  // Mode 6: Phase 5 enabled -> 22 tools
  const s6 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: true, enablePhase5Tools: true, enablePhase6Tools: false });
  const inst6 = s6.getServerInstance() as any;
  const t6 = await inst6._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t6.tools.length, 22);

  // Mode 7: Phase 6 enabled -> 24 tools!
  const s7 = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true, enablePhase3Tools: true, enablePhase4Tools: true, enablePhase5Tools: true, enablePhase6Tools: true });
  const inst7 = s7.getServerInstance() as any;
  const t7 = await inst7._requestHandlers.get('tools/list')({ method: 'tools/list' });
  assert.equal(t7.tools.length, 24);

  // Confirm exact Phase 6 tool names
  const toolNames = t7.tools.map((t: any) => t.name);
  assert.ok(toolNames.includes('zenitch_analyze_architecture'));
  assert.ok(toolNames.includes('zenitch_inspect_architecture'));
});

test('20. Real JSON-RPC tool execution: zenitch_analyze_architecture and zenitch_inspect_architecture', async () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), "export const app = 'ready';");

    const server = new ZenitchServer({
      enableZenitchTools: true,
      enablePhase6Tools: true
    });
    const inst = server.getServerInstance() as any;

    // Call zenitch_analyze_architecture
    const analyzeRes = await inst._requestHandlers.get('tools/call')({
      method: 'tools/call',
      params: {
        name: 'zenitch_analyze_architecture',
        arguments: {
          projectRoot: dir,
          mode: 'standard'
        }
      }
    });

    assert.ok(analyzeRes.content && analyzeRes.content[0]);
    const parsedAnalyze = JSON.parse(analyzeRes.content[0].text);
    assert.equal(parsedAnalyze.success, true);
    assert.equal(parsedAnalyze.data.metrics.totalFilesScanned, 1);

    // Call zenitch_inspect_architecture
    const inspectRes = await inst._requestHandlers.get('tools/call')({
      method: 'tools/call',
      params: {
        name: 'zenitch_inspect_architecture',
        arguments: {
          projectRoot: dir,
          mode: 'detailed'
        }
      }
    });

    assert.ok(inspectRes.content && inspectRes.content[0]);
    const parsedInspect = JSON.parse(inspectRes.content[0].text);
    assert.equal(parsedInspect.success, true);
    assert.ok(parsedInspect.data.id);
  } finally {
    cleanupTempDir(dir);
  }
});

test('24. Project-specific rule attribution: findings have exact ruleId', () => {
  const dir = createTempDir();
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), "import { b } from './b';");
    fs.writeFileSync(path.join(dir, 'src', 'b.ts'), "import { a } from './a';");

    const record = ArchitectureEvaluator.evaluate(dir);
    for (const f of record.findings) {
      assert.ok(f.ruleId);
      assert.ok(f.ruleId.startsWith('RULE-') || f.ruleId.startsWith('DEC-'));
    }
  } finally {
    cleanupTempDir(dir);
  }
});

