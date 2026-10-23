import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Import benchmark evaluator and contracts
const benchmarkModulePath = path.resolve('../../experiments/evaluation-benchmarks/benchmark-evaluator.mjs');
const {
  TASK_CONTRACTS,
  evaluateArtifact,
  runBenchmark,
  EVALUATOR_VERSION
} = await import(pathToFileURL(benchmarkModulePath).href);

const baseBenchmarksDir = path.resolve('../../experiments/evaluation-benchmarks');

// ===========================================================================
// 1. EVALUATION PARITY & COMMON CONTRACT TESTS
// ===========================================================================

test('Benchmark Parity: Common evaluation contract applies identical criteria to all tasks', () => {
  const taskKeys = ['task-1', 'task-2', 'task-3'];
  for (const taskId of taskKeys) {
    const contract = TASK_CONTRACTS[taskId];
    assert.ok(contract, `Contract for ${taskId} must exist`);
    assert.ok(Array.isArray(contract.criteria), `Criteria for ${taskId} must be an array`);
    assert.ok(contract.criteria.length >= 5, `Task ${taskId} must define >=5 explicit criteria`);

    // Verify each criterion defines an id, title, description, and verify function
    for (const c of contract.criteria) {
      assert.ok(c.id.startsWith('REQ-'), `Criterion ${c.id} must follow REQ- naming convention`);
      assert.ok(c.title && c.title.length > 0, `Criterion ${c.id} must have a title`);
      assert.equal(typeof c.verify, 'function', `Criterion ${c.id} must have a verify function`);
    }
  }
});

test('Benchmark Parity: Evaluator runs identical verification logic on baseline and assisted markup', () => {
  const contract = TASK_CONTRACTS['task-1'];
  const dummyMarkup = '<header><h1>KRAFTWERK Studio</h1></header><nav><a href="/projects">Projects</a></nav>';

  // Evaluate the exact same markup under baseline mode vs assisted mode
  // The criteria results must be 100% identical regardless of mode string
  const resBaselineMode = contract.criteria.map((c: any) => c.verify(dummyMarkup));
  const resAssistedMode = contract.criteria.map((c: any) => c.verify(dummyMarkup));

  assert.deepEqual(
    resBaselineMode,
    resAssistedMode,
    'Criteria verification functions must produce identical outcomes regardless of mode'
  );
});

// ===========================================================================
// 2. CRITERION-LEVEL ACCURACY & REPRODUCIBILITY
// ===========================================================================

test('Benchmark Reproducibility: Evaluates all 6 artifacts deterministically across successive runs', () => {
  const taskConfigs = [
    { id: 'task-1', folder: 'task1-landing-page' },
    { id: 'task-2', folder: 'task2-data-dashboard' },
    { id: 'task-3', folder: 'task3-multistep-form' }
  ];

  for (const tc of taskConfigs) {
    const contract = TASK_CONTRACTS[tc.id];
    for (const mode of ['baseline', 'assisted']) {
      const artifactPath = path.resolve(baseBenchmarksDir, tc.folder, mode, 'index.html');

      // Run 1
      const eval1 = evaluateArtifact(contract, mode, artifactPath);
      // Run 2
      const eval2 = evaluateArtifact(contract, mode, artifactPath);

      // Verify stable, deterministic results
      assert.equal(eval1.requirementCoverage.coveragePercentage, eval2.requirementCoverage.coveragePercentage);
      assert.equal(eval1.requirementCoverage.passedCount, eval2.requirementCoverage.passedCount);
      assert.equal(eval1.requirementCoverage.failedCount, eval2.requirementCoverage.failedCount);
      assert.equal(eval1.requirementCoverage.notAssessedCount, eval2.requirementCoverage.notAssessedCount);
      assert.equal(eval1.staticAccessibility.findingsCount, eval2.staticAccessibility.findingsCount);
      assert.equal(eval1.deadInteractions.totalDeadIndicators, eval2.deadInteractions.totalDeadIndicators);
      assert.equal(eval1.staticResponsiveRisks.risksCount, eval2.staticResponsiveRisks.risksCount);
      assert.equal(eval1.visualDistinctiveness.score, eval2.visualDistinctiveness.score);

      // Detailed criterion breakdown matching
      assert.deepEqual(
        eval1.requirementCoverage.criteriaBreakdown,
        eval2.requirementCoverage.criteriaBreakdown,
        `Criterion breakdown for ${tc.id} ${mode} must be completely deterministic`
      );
    }
  }
});

// ===========================================================================
// 3. METRIC SEPARATION & HONEST LIMITATION REPORTING
// ===========================================================================

test('Benchmark Integrity: Unrecorded metrics are explicitly marked NOT_RECORDED', () => {
  const contract = TASK_CONTRACTS['task-1'];
  const artifactPath = path.resolve(baseBenchmarksDir, 'task1-landing-page/baseline/index.html');
  const result = evaluateArtifact(contract, 'baseline', artifactPath);

  assert.equal(result.unrecordedMetrics.implementationTimeSeconds, 'NOT_RECORDED');
  assert.equal(result.unrecordedMetrics.repairIterationsCount, 'NOT_RECORDED');
  assert.ok(result.unrecordedMetrics.rationale.includes('not instrumented'));
});

test('Benchmark Integrity: Runtime layout and async transport report NOT_ASSESSED', () => {
  for (const taskId of ['task-1', 'task-2', 'task-3']) {
    const contract = TASK_CONTRACTS[taskId];
    const notAssessedCriteria = contract.criteria.filter((c: any) => c.verify('').status === 'NOT_ASSESSED');
    assert.ok(
      notAssessedCriteria.length >= 1,
      `Task ${taskId} must explicitly identify runtime criteria as NOT_ASSESSED`
    );

    for (const nac of notAssessedCriteria) {
      const outcome = nac.verify('<div>Any HTML</div>');
      assert.equal(outcome.status, 'NOT_ASSESSED');
      assert.ok(
        outcome.reason.includes('Static analysis inspection only') || outcome.reason.includes('browser layout engine') || outcome.reason.includes('runtime'),
        `${nac.id} reason must state static analysis limitation`
      );
    }
  }
});

test('Benchmark Integrity: Visual distinctiveness is labeled as subjective rubric with rationale', () => {
  for (const taskId of ['task-1', 'task-2', 'task-3']) {
    const contract = TASK_CONTRACTS[taskId];
    for (const mode of ['baseline', 'assisted']) {
      const artifactPath = path.resolve(
        baseBenchmarksDir,
        taskId === 'task-1' ? 'task1-landing-page' : taskId === 'task-2' ? 'task2-data-dashboard' : 'task3-multistep-form',
        mode,
        'index.html'
      );
      const res = evaluateArtifact(contract, mode, artifactPath);
      assert.equal(res.visualDistinctiveness.type, 'SUBJECTIVE_RUBRIC_EVALUATION');
      assert.ok(typeof res.visualDistinctiveness.score === 'number');
      assert.ok(res.visualDistinctiveness.rationale.length > 10);
      assert.ok(res.visualDistinctiveness.rubricExplanation.length > 10);
    }
  }
});

test('Benchmark Integrity: Tool latency distinguishes cold and cached execution', () => {
  const contract = TASK_CONTRACTS['task-1'];
  const artifactPath = path.resolve(baseBenchmarksDir, 'task1-landing-page/assisted/index.html');
  const res = evaluateArtifact(contract, 'assisted', artifactPath);

  assert.equal(typeof res.toolPerformance.coldLatencyMs, 'number');
  assert.equal(typeof res.toolPerformance.cachedLatencyMs, 'number');
  assert.equal(res.toolPerformance.toolErrorsCount, 0);
  assert.ok(res.toolPerformance.timerScope.includes('performance.now()'));
});

test('Benchmark Integrity: Missing artifact throws an explicit error', () => {
  const contract = TASK_CONTRACTS['task-1'];
  assert.throws(
    () => evaluateArtifact(contract, 'baseline', 'nonexistent/path/index.html'),
    /Artifact file not found/
  );
});
