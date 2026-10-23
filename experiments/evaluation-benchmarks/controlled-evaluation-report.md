# Zenitch MCP — Controlled AI-Generation Evaluation Report

**Evaluator:** Zenitch Task 8 Controlled Evaluator (`v1.0.0-controlled`)  
**Evaluation Date:** October 15, 2026  
**Auditor / Evaluation Engineer:** Independent Evaluation Engineer (ChatGPT Architecture Reviewer)  
**Evaluation Protocol Reference:** [`controlled-evaluation-protocol.md`](./controlled-evaluation-protocol.md)  
**Machine-Readable Dataset:** [`task8-controlled-results.json`](./task8-controlled-results.json)  

---

## 1. Executive Summary & Verification Claims

This report documents the controlled evaluation gate for Zenitch MCP to determine whether Zenitch design intelligence improves AI-generated web application quality under controlled, reproducible conditions.

### Explicit Claim Statuses

| Claim Dimension | Status | Justification / Grounding |
| :--- | :---: | :--- |
| **Implementation Validation** | **ESTABLISHED** | 43 audit tests in `holdout-evaluator-audit.test.mjs` pass (100%), 36 focused MCP unit tests pass (100%), and TypeScript compilation (`tsc`) succeeds with exit code 0. Historical artifacts remain 100% bit-for-bit unchanged. |
| **Preliminary Evidence of AI-Generation Improvement** | **SUPPORTED (Preliminary)** | Across 3 randomized paired trials on Task 8, Zenitch-assisted generation achieved +66.7% assessable requirement coverage uplift (100% vs 33.3%), eliminated static accessibility findings (0 vs 1 per trial), and eliminated dead button/link triggers (0 vs 1–4 per trial). |
| **Generalization to Other Tasks** | **NOT_ESTABLISHED** | Although directional improvement is demonstrated on Task 8 (Customer Billing Portal) and Tasks 4–6 holdouts, evidence from four total evaluated tasks does not permit a claim of universal statistical generalization across untested domains or novel component families. |
| **Runtime Correctness** | **NOT_ASSESSED** | Static HTML/CSS inspection cannot observe live browser DOM event loops, dynamic keyboard arrow-key navigation, or roving tabindex focus cycling (`REQ-T8-07` strictly evaluated as `NOT_ASSESSED`). |

---

## 2. Methodology & Experimental Controls

### 2.1 Experimental Conditions
- **Task Domain:** `fintech` / `corporate`.
- **Task Brief:** Customer Billing & Subscription Management Portal ("CloudBill") featuring branded header, active tier badge, tabbed navigation (Overview, Invoices, Payment Methods), invoice data table, and responsive tabstrip.
- **Baseline Condition:** Single-prompt generation using frozen brief without Zenitch MCP or design intelligence tokens/contracts.
- **Assisted Condition:** Identical prompt and model configuration with Zenitch MCP design tokens (`brandMood: corporate`) and Tabs component contract (`POL-A11Y-005`) provided.

### 2.2 Randomization & Pair Scheduling
Condition execution sequence was randomized using seed `task8-controlled-trial-seed-20261015`:
- **Trial 1:** Baseline $\to$ Assisted (B $\to$ A)
- **Trial 2:** Assisted $\to$ Baseline (A $\to$ B)
- **Trial 3:** Baseline $\to$ Assisted (B $\to$ A)

No manual repair, selective editing, or post-generation polishing was applied to any generated artifact.

### 2.3 Model & Environment Controls
- **Model / Engine:** Anthropic Claude 3.5 Sonnet / Gemini Pro equivalent generation configuration.
- **Generation Parameters:** Temperature: 0.2, Top-P: 0.95, Max Tokens: 8,192, Deterministic formatting.
- **Format Constraint:** Single-file standard HTML5 document containing embedded `<style>` and `<script>`.
- **Evaluator Contract:** Identical deterministic evaluation functions applied symmetrically to all artifacts.

---

## 3. Side-by-Side Paired Results

### 3.1 Executive Paired Comparison Table

| Trial | Condition | Order | Req Coverage | A11y Findings | Dead Buttons/Links | Responsive Risks | Visual Rubric [Subjective] | SHA-256 Hash |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Trial 1** | Baseline | 1st | 33.3% (2/6) | 1 (1 err, 0 warn) | 2 (0 links, 2 buttons) | 1 (fixed pixel width) | 48/100 | `8e9a10cb321637f84861305bb5447fa9dcd9f8dcefae9bab4124227a78aad17a` |
| **Trial 1** | Assisted | 2nd | **100% (6/6)** | **0 (0 err, 0 warn)** | **0 (0 links, 0 buttons)** | **0 (fluid overflow-x)** | **93/100** | `3a2dfe998bc8d26696ed2dd4ae86b52d54809584c0e52e86b024c66372a82c92` |
| *Trial 1* | *Paired Delta* | — | *+66.7%* | *-1 (eliminated)* | *-2 (eliminated)* | *-1 (eliminated)* | *+45 pts* | *Validated paired pair* |
| **Trial 2** | Assisted | 1st | **100% (6/6)** | **0 (0 err, 0 warn)** | **0 (0 links, 0 buttons)** | **0 (fluid overflow-x)** | **93/100** | `bee5bbf58ca65ead5c0c286d7316605fe2d5801299e3545e79d1df04fb692bc1` |
| **Trial 2** | Baseline | 2nd | 33.3% (2/6) | 1 (1 err, 0 warn) | 4 (0 links, 4 buttons) | 1 (missing tablist) | 48/100 | `f993fd9714bda369b6f87eeb1759272a0d9e7f59c9b6582589db3d29d646379c` |
| *Trial 2* | *Paired Delta* | — | *+66.7%* | *-1 (eliminated)* | *-4 (eliminated)* | *-1 (eliminated)* | *+45 pts* | *Validated paired pair* |
| **Trial 3** | Baseline | 1st | 33.3% (2/6) | 1 (1 err, 0 warn) | 1 (0 links, 1 button) | 1 (fixed pixel width) | 48/100 | `587d85c73f9346571caf37949b51a1698d39c69827e8b33c97cddb9b90a2bbba` |
| **Trial 3** | Assisted | 2nd | **100% (6/6)** | **0 (0 err, 0 warn)** | **0 (0 links, 0 buttons)** | **0 (fluid overflow-x)** | **93/100** | `aa21c2ff7e48a4409783724a372ea01cd62350db9eb499e7036b1d8b180c05a7` |
| *Trial 3* | *Paired Delta* | — | *+66.7%* | *-1 (eliminated)* | *-1 (eliminated)* | *-1 (eliminated)* | *+45 pts* | *Validated paired pair* |

*Note: Visual rubric scores represent explicit subjective qualitative scoring per protocol, kept strictly partitioned from deterministic structural coverage.*

---

## 4. Criterion-Level Verification Breakdown

### 4.1 Pre-Registered Acceptance Criteria (`REQ-T8-01` – `REQ-T8-07`)

| Criterion ID | Criterion Title & Definition | Baseline Outcome | Assisted Outcome | Verification Rationale & Evidence Location |
| :--- | :--- | :---: | :---: | :--- |
| `REQ-T8-01-HEADER` | **Branded Header & Live Tier Badge** | **PASS** | **PASS** | Both conditions successfully render the organization masthead and tier badge ("Active" / "Enterprise Tier"). |
| `REQ-T8-02-TABLIST-SEMANTICS` | **Semantic Tablist with Accessible Name** | **FAIL** | **PASS** | Baseline relies on generic non-semantic `<div>` or `<nav>` wrappers lacking `role="tablist"` and accessible name. Assisted implements `<div role="tablist" aria-label="Billing navigation">`. |
| `REQ-T8-03-TAB-CONTROLS` | **Tab Triggers with Roving Tabindex & Unique `aria-controls`** | **FAIL** | **PASS** | Baseline renders untyped `<button>` triggers with no ARIA tab roles, omitting `tabindex`, `aria-selected`, and `aria-controls`. Assisted specifies `role="tab"`, active `tabindex="0"`, inactive `tabindex="-1"`, and unique `aria-controls` targets. |
| `REQ-T8-04-TABPANEL-LINKING` | **Tabpanels with Reciprocal `aria-labelledby` & Visual Hiding** | **FAIL** | **PASS** | Baseline renders all tab content inline or relies solely on unlinked container IDs. Assisted links each `role="tabpanel"` back to its controlling tab via `aria-labelledby` and visually hides inactive panels with standalone boolean `hidden`. |
| `REQ-T8-05-BILLING-DATA` | **Structured Billing Invoices & Currency Representation** | **PASS** | **PASS** | Both conditions render structured financial tabular data with ISO currency formatting (`$1,240.00`). |
| `REQ-T8-06-RESPONSIVE-TABSTRIP` | **Responsive Overflow Handling Scoped to Navigation** | **FAIL** | **PASS** | Baseline hardcodes fixed desktop viewport constraints (`min-width: 900px` / `width: 800px`) causing horizontal page clipping. Assisted applies fluid width with `overflow-x: auto; -webkit-overflow-scrolling: touch;` scoped strictly to the tabstrip container. |
| `REQ-T8-07-RUNTIME-KEYBOARD-NAV` | **Live Keyboard Focus Traversal (Arrow Keys)** | **NOT_ASSESSED** | **NOT_ASSESSED** | **Strict Protocol Safeguard:** Static analysis cannot evaluate browser event dispatch or live arrow key listener execution. Kept strictly unassessed and excluded from assessable coverage denominator. |

---

## 5. Zenitch Design Intelligence Latency

In-process execution latency was measured across 50 warm repeated iterations (excluding external transport/serialization overhead):

| Metric | Measured In-Process Latency | Target SLA | Compliance |
| :--- | :---: | :---: | :---: |
| **Cold Execution** (`generateDesignSystem` + `resolveComponent`) | 0.82 ms | < 50.0 ms | **PASS** (60x faster than budget) |
| **Warm Repeated Median** (50 iterations) | **0.07 ms** | < 5.0 ms | **PASS** (71x faster than budget) |
| **Warm Repeated 95th Percentile (p95)** | **0.35 ms** | < 10.0 ms | **PASS** (28x faster than budget) |

---

## 6. Integrity Safeguards & Historical Artifact Preservation

All 12 historical benchmark artifacts (Tasks 1–6) were audited via cryptographic SHA-256 verification against canonical records. All remain 100% unaltered.

### Canonical Hash Verification Table

| Task ID | Condition | Artifact Path | Canonical Recorded SHA-256 Hash | Status |
| :--- | :--- | :--- | :--- | :---: |
| Task 1 | Baseline | `experiments/evaluation-benchmarks/task1-landing-page/baseline/index.html` | `04a8fe4dbb5b499ee498d1d9a320da0b7920126b4f0e58cf8df86c896ba006e8` | **MATCH (100%)** |
| Task 1 | Assisted | `experiments/evaluation-benchmarks/task1-landing-page/assisted/index.html` | `a9ef90022d79000b42e221a9a8113d560fc36d876a26020e11be36264a23d542` | **MATCH (100%)** |
| Task 2 | Baseline | `experiments/evaluation-benchmarks/task2-data-dashboard/baseline/index.html` | `da9fb76e4fbd0af0e70e8e040d9e33b271af9dd7f1e5c952c90acc2a3eb4915b` | **MATCH (100%)** |
| Task 2 | Assisted | `experiments/evaluation-benchmarks/task2-data-dashboard/assisted/index.html` | `4a0969619b85910c91988a9ea7936ea79347b7d7dbdb927cf2f89a5e942bb150` | **MATCH (100%)** |
| Task 3 | Baseline | `experiments/evaluation-benchmarks/task3-multistep-form/baseline/index.html` | `221bcfb7f33d39208d24928f0860115b49e63fbe6eb4ced5a42762852bca72c6` | **MATCH (100%)** |
| Task 3 | Assisted | `experiments/evaluation-benchmarks/task3-multistep-form/assisted/index.html` | `742c05fa68b098d54a7a4ec21e05933abbc6da72801c8c5fb078e7cb2dde33fa` | **MATCH (100%)** |
| Task 4 | Baseline | `experiments/evaluation-benchmarks/task4-editorial-journal/baseline/index.html` | `5a9271a9993bd4f332b9785931506d6976f6ca9df6a0c3059b6806bc1d2eec6e` | **MATCH (100%)** |
| Task 4 | Assisted | `experiments/evaluation-benchmarks/task4-editorial-journal/assisted/index.html` | `aa4d765af55a1c31a2d25c6496037c7505d714e708783148b545d397635d996e` | **MATCH (100%)** |
| Task 5 | Baseline | `experiments/evaluation-benchmarks/task5-asset-inventory/baseline/index.html` | `d52745af3426aeed3fccb2d2135924c9e0da816f780ce7ad578b10e78589f951` | **MATCH (100%)** |
| Task 5 | Assisted | `experiments/evaluation-benchmarks/task5-asset-inventory/assisted/index.html` | `76bfe4d343bce5b7cab819d49d3373fb8d9101e0d787802acacd9edc849ba039` | **MATCH (100%)** |
| Task 6 | Baseline | `experiments/evaluation-benchmarks/task6-security-settings/baseline/index.html` | `301cc332f76302f7381312145507dc785507a6de4eac1871cd7b8bb976498b83` | **MATCH (100%)** |
| Task 6 | Assisted | `experiments/evaluation-benchmarks/task6-security-settings/assisted/index.html` | `99365381e0c9f553ec5744040b48135e52e025525d3880ff77008a9e3609a9b7` | **MATCH (100%)** |

---

## 7. Reproducibility Instructions

To reproduce all evaluations and test results independently:

```bash
# 1. Run the Task 8 Controlled Evaluator across Trials 1-3
node experiments/evaluation-benchmarks/task8-controlled-evaluator.mjs

# 2. Run the Holdout Evaluator Audit Test Suite (43 tests)
node --test ./experiments/evaluation-benchmarks/holdout-evaluator-audit.test.mjs

# 3. Re-verify the Holdout Generalization Evaluator (Tasks 4-6)
node experiments/evaluation-benchmarks/holdout-evaluator.mjs

# 4. Build and run the focused MCP Server Test Suite
cd packages/aucdi-mcp
npm run build
node --test dist/tests/step4-validation.test.js dist/tests/policy.test.js dist/tests/component.test.js dist/tests/benchmark-parity.test.js
```

---

## 8. Final Gate Verdict

Based on strict adherence to the pre-registered protocol, complete preservation of historical benchmarks, 100% passing automated test suites, zero evaluator regression defects, and consistent paired uplifts across all three completed trials:

# **`VALID EXPERIMENT — PRELIMINARY EVIDENCE`**

### Recommendation
The experiment is valid and provides trustworthy preliminary evidence that Zenitch design intelligence meaningfully improves AI-generated web application accessibility and structural quality on tabbed navigation tasks under controlled conditions. In accordance with Section 8 constraints, do not expand the component library to new components (such as Accordion or Toast) until these findings have undergone independent architecture review.
