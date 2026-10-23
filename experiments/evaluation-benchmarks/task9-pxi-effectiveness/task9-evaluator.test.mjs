import { test, describe } from 'node:test';
import assert from 'node:assert';
import { evaluateTask9Artifact, TASK9_CRITERIA } from './task9-evaluator.mjs';

const SYNTHETIC_POSITIVE_FIXTURE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Telehealth Patient Triage & Vitals Monitoring Console</title>
  <style>
    :root { --bg: #f8fafc; --text: #0f172a; --primary: #0284c7; }
    body { background-color: #f8fafc; color: #0f172a; font-family: sans-serif; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header role="banner">
    <h1>Emergency Clinic Telehealth Triage Console</h1>
    <span class="badge" aria-label="Clinician Status: Dr. Smith, On Duty">Dr. Smith (On Duty)</span>
  </header>
  <nav aria-label="Triage Navigation">
    <button class="filter-btn active" data-acuity="all" aria-pressed="true">All Patients</button>
    <button class="filter-btn" data-acuity="immediate" aria-pressed="false">Immediate</button>
    <button class="filter-btn" data-acuity="urgent" aria-pressed="false">Urgent</button>
    <button class="filter-btn" data-acuity="standard" aria-pressed="false">Standard</button>
  </nav>
  <main>
    <section aria-labelledby="telemetry-title">
      <h2 id="telemetry-title">Active Telemetry Averages</h2>
      <div class="grid">
        <div class="card">Heart Rate: 78 bpm</div>
        <div class="card">Blood Pressure: 120/80 mmHg</div>
        <div class="card">Oxygen Saturation SpO2: 98%</div>
        <div class="card">Core Temp: 37.0 °C</div>
      </div>
    </section>
    <section aria-labelledby="queue-title">
      <h2 id="queue-title">Patient Triage Queue</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Patient ID</th>
            <th scope="col">Name</th>
            <th scope="col">Triage Level</th>
            <th scope="col">Vitals</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>PT-101</td>
            <td>Jane Doe</td>
            <td><span class="badge badge-immediate">Immediate</span></td>
            <td>HR: 130, SpO2: 91%</td>
          </tr>
          <tr>
            <td>PT-102</td>
            <td>John Roe</td>
            <td><span class="badge badge-urgent">Urgent</span></td>
            <td>HR: 95, SpO2: 96%</td>
          </tr>
        </tbody>
      </table>
    </section>
    <section role="region" aria-live="polite" aria-labelledby="alert-title">
      <h2 id="alert-title">Clinical Alert & Anomaly Stream</h2>
      <div class="alert alert-critical">Critical Warning: Patient PT-101 tachycardia and hypoxia alert!</div>
    </section>
  </main>
  <footer>
    <p>Telehealth Clinical System v2.4 | Emergency Medicine Department</p>
  </footer>
  <script>
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
      });
    });
  </script>
</body>
</html>
`;

const SYNTHETIC_NEGATIVE_FIXTURE = `
<!DOCTYPE html>
<html>
<head><title>Test App</title></head>
<body>
  <div>Generic Unstyled Container Without Clinical Content</div>
</body>
</html>
`;

// High-contrast dark theme (e.g. pure black with pure white text, 21:1 contrast)
const HIGH_CONTRAST_DARK_THEME_FIXTURE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Emergency Clinic Console - Dark High Contrast</title>
  <style>
    :root { --bg-surface: #000000; --text-main: #ffffff; }
    body { background-color: #000000; color: #ffffff; }
  </style>
</head>
<body>
  <header><h1>Emergency Telehealth Clinic</h1><span>Dr. Vance (On Duty)</span></header>
  <nav><button aria-pressed="true" class="filter-btn">All Patients</button></nav>
  <main>
    <div>Heart Rate: 80 bpm, Blood Pressure: 120/80 mmHg, SpO2: 99%, Core Temp: 37.0 °C</div>
    <table><thead><tr><th scope="col">Patient</th></tr></thead><tbody><tr><td>Immediate</td></tr></tbody></table>
    <div role="region" aria-live="polite">Alert: Patient Anomaly</div>
  </main>
  <footer>Clinical Emergency Systems</footer>
</body>
</html>
`;

// Low-contrast light theme (poor daylight readability: white on light gray, ~1.7:1 contrast)
const LOW_CONTRAST_LIGHT_THEME_FIXTURE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Low Contrast Light</title>
  <style>
    body { background-color: #ffffff; color: #cbd5e1; }
  </style>
</head>
<body>
  <header><h1>Emergency Clinic</h1><span>Dr. On Duty</span></header>
  <nav><button aria-pressed="true">Filter</button></nav>
  <main>
    <div>Heart Rate 70, Blood Pressure 120/80, SpO2 99, Core Temp 37</div>
    <table><thead><tr><th scope="col">Patient</th></tr></thead><tbody><tr><td>Immediate</td></tr></tbody></table>
    <div role="region" aria-live="polite">Alert: Anomaly</div>
  </main>
  <footer>Status</footer>
</body>
</html>
`;

// Low-contrast dark theme (poor daylight readability: dark slate on navy, ~2.1:1 contrast)
const LOW_CONTRAST_DARK_THEME_FIXTURE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Low Contrast Dark</title>
  <style>
    body { background-color: #0f172a; color: #334155; }
  </style>
</head>
<body>
  <header><h1>Emergency Clinic</h1><span>Dr. On Duty</span></header>
  <nav><button aria-pressed="true">Filter</button></nav>
  <main>
    <div>Heart Rate 70, Blood Pressure 120/80, SpO2 99, Core Temp 37</div>
    <table><thead><tr><th scope="col">Patient</th></tr></thead><tbody><tr><td>Immediate</td></tr></tbody></table>
    <div role="region" aria-live="polite">Alert: Anomaly</div>
  </main>
  <footer>Status</footer>
</body>
</html>
`;

// Fixture with CSS present but colors not statically extractable (returns NOT_ASSESSED instead of guessing)
const UNRESOLVABLE_THEME_FIXTURE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unresolvable Dynamic Theme</title>
  <style>
    .dynamic-theme { filter: invert(var(--runtime-inversion)); }
  </style>
</head>
<body class="dynamic-theme">
  <header><h1>Emergency Clinic</h1><span>Dr. On Duty</span></header>
  <nav><button aria-pressed="true">Filter</button></nav>
  <main>
    <div>Heart Rate 70, Blood Pressure 120/80, SpO2 99, Core Temp 37</div>
    <table><thead><tr><th scope="col">Patient</th></tr></thead><tbody><tr><td>Immediate</td></tr></tbody></table>
    <div role="region" aria-live="polite">Alert: Anomaly</div>
  </main>
  <footer>Status</footer>
</body>
</html>
`;

describe('Task 9 Evaluator Unit Tests', () => {
  test('1. Positive synthetic fixture passes all 8 frozen criteria (100% coverage)', () => {
    const result = evaluateTask9Artifact(SYNTHETIC_POSITIVE_FIXTURE, { test: true });
    assert.strictEqual(result.summary.passedCount, 8);
    assert.strictEqual(result.summary.failedCount, 0);
    assert.strictEqual(result.summary.coveragePercentage, 100);
    assert.strictEqual(result.interactionEvidence.hasInteractiveHandlers, true);
  });

  test('2. Negative synthetic fixture fails all criteria safely without throwing', () => {
    const result = evaluateTask9Artifact(SYNTHETIC_NEGATIVE_FIXTURE, { test: true });
    assert.strictEqual(result.summary.passedCount, 0);
    assert.strictEqual(result.summary.failedCount, 8);
    assert.strictEqual(result.summary.coveragePercentage, 0);
  });

  test('3. Positive high-contrast light theme passes REQ-T9-07 with measured contrast ratio', () => {
    const result = evaluateTask9Artifact(SYNTHETIC_POSITIVE_FIXTURE);
    const themeCrit = result.criteriaResults.find(c => c.id === 'REQ-T9-07-THEME-ERGONOMICS');
    assert.ok(themeCrit, 'Theme criterion must be evaluated');
    assert.strictEqual(themeCrit.status, 'PASS');
    assert.match(themeCrit.reason, /measurable contrast ratio/i);
    assert.match(themeCrit.reason, /meets daylight readability/i);
  });

  test('4. Positive high-contrast dark theme passes REQ-T9-07 without dark-mode bias penalty', () => {
    const result = evaluateTask9Artifact(HIGH_CONTRAST_DARK_THEME_FIXTURE);
    const themeCrit = result.criteriaResults.find(c => c.id === 'REQ-T9-07-THEME-ERGONOMICS');
    assert.ok(themeCrit, 'Theme criterion must be evaluated');
    assert.strictEqual(themeCrit.status, 'PASS');
    assert.match(themeCrit.reason, /measurable contrast ratio 21\.00:1/i);
  });

  test('5. Negative low-contrast light theme fails REQ-T9-07 due to insufficient contrast (< 4.5:1)', () => {
    const result = evaluateTask9Artifact(LOW_CONTRAST_LIGHT_THEME_FIXTURE);
    const themeCrit = result.criteriaResults.find(c => c.id === 'REQ-T9-07-THEME-ERGONOMICS');
    assert.ok(themeCrit, 'Theme criterion must be evaluated');
    assert.strictEqual(themeCrit.status, 'FAIL');
    assert.match(themeCrit.reason, /Insufficient contrast for daylight reading/i);
  });

  test('6. Negative low-contrast dark theme fails REQ-T9-07 due to insufficient contrast (< 4.5:1)', () => {
    const result = evaluateTask9Artifact(LOW_CONTRAST_DARK_THEME_FIXTURE);
    const themeCrit = result.criteriaResults.find(c => c.id === 'REQ-T9-07-THEME-ERGONOMICS');
    assert.ok(themeCrit, 'Theme criterion must be evaluated');
    assert.strictEqual(themeCrit.status, 'FAIL');
    assert.match(themeCrit.reason, /Insufficient contrast for daylight reading/i);
  });

  test('7. Statically unresolvable theme colors return NOT_ASSESSED instead of guessing', () => {
    const result = evaluateTask9Artifact(UNRESOLVABLE_THEME_FIXTURE);
    const themeCrit = result.criteriaResults.find(c => c.id === 'REQ-T9-07-THEME-ERGONOMICS');
    assert.ok(themeCrit, 'Theme criterion must be evaluated');
    assert.strictEqual(themeCrit.status, 'NOT_ASSESSED');
    assert.match(themeCrit.reason, /cannot be reliably resolved/i);
  });

  test('8. Incomplete vitals fixture fails REQ-T9-02 when metrics are missing', () => {
    const partialVitalsHtml = SYNTHETIC_POSITIVE_FIXTURE
      .replace(/SpO2/gi, 'METRIC_REMOVED')
      .replace(/Oxygen Saturation/gi, 'METRIC_REMOVED')
      .replace(/Core Temp/gi, 'METRIC_REMOVED')
      .replace(/°C/gi, '');
    const result = evaluateTask9Artifact(partialVitalsHtml);
    const vitalsCrit = result.criteriaResults.find(c => c.id === 'REQ-T9-02-VITALS-GRID');
    assert.strictEqual(vitalsCrit.status, 'FAIL');
    assert.match(vitalsCrit.reason, /Incomplete telemetry metrics/i);
  });

  test('9. Empty or non-string input returns structured error safely', () => {
    const result = evaluateTask9Artifact('');
    assert.strictEqual(result.status, 'ERROR');
    assert.strictEqual(result.coveragePercentage, 0);
  });

  test('10. Evaluator symmetry: identical input yields identical output regardless of condition label', () => {
    const resC0 = evaluateTask9Artifact(SYNTHETIC_POSITIVE_FIXTURE, { condition: 'C0_Baseline' });
    const resC1 = evaluateTask9Artifact(SYNTHETIC_POSITIVE_FIXTURE, { condition: 'C1_Assisted' });
    assert.strictEqual(resC0.summary.coveragePercentage, resC1.summary.coveragePercentage);
    assert.deepStrictEqual(resC0.criteriaResults, resC1.criteriaResults);
  });

  test('11. Evidence boundaries audit: static inspection marks runtime/keyboard/browser/visual as NOT_ASSESSED', () => {
    const result = evaluateTask9Artifact(SYNTHETIC_POSITIVE_FIXTURE);
    assert.ok(result.evidenceBoundaries, 'Must include explicit evidence boundaries audit');
    assert.strictEqual(result.evidenceBoundaries.runtimeInteractionExecution.status, 'NOT_ASSESSED');
    assert.strictEqual(result.evidenceBoundaries.actualKeyboardNavigation.status, 'NOT_ASSESSED');
    assert.strictEqual(result.evidenceBoundaries.computedBrowserRendering.status, 'NOT_ASSESSED');
    assert.strictEqual(result.evidenceBoundaries.visualQualityRating.status, 'NOT_ASSESSED');
  });
});
