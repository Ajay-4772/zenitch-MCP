# Task 9 — Controlled PXI Effectiveness Evaluation Protocol

**Evaluator Version:** `3.1.0-pxi-fairness-amended`  
**Date:** October 16, 2026 (Amended Pre-C1)  
**Status:** `AMENDED FROZEN EXPERIMENTAL PROTOCOL — EVALUATOR FAIRNESS & EVIDENCE BOUNDARY AMENDMENT`  
**Integrity Rule:** Zero hand-authored fixtures, zero simulated agent outputs, zero fabricated transcripts.

---

## 1. Frozen Application Brief: Telehealth Patient Triage & Vitals Monitoring Console

### Prompt Brief
> "Build a responsive, single-page Telehealth Patient Triage & Vitals Monitoring Console for emergency clinic clinicians. The console must provide a high-contrast clinical theme suitable for daylight reading, an urgent patient triage grid displaying vital telemetry (heart rate, blood pressure, oxygen saturation, temperature), a filterable patient queue by triage acuity (Immediate, Urgent, Standard), and an active clinical alert stream. Ensure accessible landmarks, full keyboard navigation, and semantic tabular data without horizontal overflow."

### Domain & Ergonomic Expectations
- **Domain:** Healthcare (`healthcare`).
- **Ergonomics Baseline:** High-contrast clinical theme suitable for daylight reading meeting WCAG 2.1 AA/AAA readability standards (contrast ratio >= 4.5:1, target >= 7:1 for critical vitals), zero frivolous motion. Both light and dark clinical themes are evaluated symmetrically based on objective contrast ratio.
- **Complexity:** Compact (one coherent dashboard page).
- **Format:** Single-file portable HTML with inline styles/scripts.

---

## 2. Predefined Acceptance Criteria & Evaluation Rubric

Both Condition A (Baseline $C_0$) and Condition B (PXI-Assisted $C_1$) are evaluated against identical, predefined verification criteria:

| Criterion ID | Category | Requirement Title | Verification Method & Standard |
|---|---|---|---|
| `REQ-T9-01-HEADER` | Landmark | Clinical Header & Session Identity | `<header>` containing clinic identity and clinician status badge with accessible labeling. |
| `REQ-T9-02-VITALS-GRID` | Product | Multi-Metric Triage Telemetry Grid | Priority cards showing Heart Rate, Blood Pressure, SpO2, and Core Temp with distinct metric IDs. |
| `REQ-T9-03-QUEUE-TABLE` | Product | Patient Queue Tabular Structure | Semantic `<table>` with `<thead>`, `<th>` with scope="col", and patient rows with acuity status badges. |
| `REQ-T9-04-TRIAGE-FILTER` | Interaction | Acuity Filtering Toolbar | Accessible filter buttons or select control markup with `aria-pressed`, `aria-selected`, or active class state indication (static inspection; runtime interaction not certified). |
| `REQ-T9-05-ALERT-STREAM` | Product | Clinical Alert & Anomaly Stream | Semantic container with `role="region"` or `aria-live="polite"` announcing vital anomalies. |
| `REQ-T9-06-A11Y-LANDMARKS` | Compliance | Semantic Landmark Architecture | Valid `<header>`, `<main>`, `<nav>` or toolbar, and `<footer>` (or `<aside>`) landmarks without duplicates. |
| `REQ-T9-07-THEME-ERGONOMICS` | Compliance | Clinical High-Contrast Theme (Daylight Readability) | Objective WCAG 2.1 relative luminance contrast measurement between foreground text and background surface (>= 4.5:1 minimum threshold, target >= 7:1 AAA). If contrast cannot be reliably measured statically, returns `NOT_ASSESSED`. |
| `REQ-T9-08-RESPONSIVE-LAYOUT` | Responsive | Mobile-Adaptive Grid | CSS media queries or flexible grid rules adapting layout without fixed viewport widths (static declaration check; computed rendering not assessed). |

---

## 3. Experimental Design

### Conditions
- **Condition A (Baseline $C_0$):** Independent frontier coding agent receives the prompt brief above with standard shell and filesystem tools. PXI planner is disabled and unavailable.
- **Condition B (PXI-Assisted $C_1$):** Identical agent receives the identical prompt brief with Zenitch MCP server running and `aucdi_plan_product_experience` tool registered.

### Generation Provenance Controls
1. Generated HTML files must be output directly by the AI agent into isolated condition directories (`trial-c0-baseline/` and `trial-c1-assisted/`).
2. Complete raw stdout, model identifiers, tool-call logs, and prompt transcripts must be captured without truncation or post-hoc editing.
3. API keys and credentials must be redacted from all committed artifacts.

---

## 4. Pre-C1 Protocol Amendment: Evaluator Fairness & Evidence Boundaries

**Amendment Timestamp:** October 16, 2026 (Prior to C1 Generation)  
**Amendment Authority:** Zenitch MCP Benchmark Evaluator Fairness Gate  

### 4.1 Rationale for Amendment
Prior to scoring the generated $C_0$ baseline or generating $C_1$, a fairness audit identified that version `1.0.0-frozen` of `task9-evaluator.mjs` contained an evaluator bias: it assumed that dark-mode defaults automatically failed the clinical theme requirement. The user prompt specified "a high-contrast clinical theme suitable for daylight reading", which is an ergonomic readability requirement, not an aesthetic preference for light themes. A dark theme with high contrast (e.g., pure black background `#000000` with pure white text `#ffffff`, 21:1 contrast) satisfies daylight readability, while a low-contrast light theme (e.g., `#ffffff` background with `#cbd5e1` text, 1.7:1 contrast) fails it.

### 4.2 Key Protocol & Evaluator Modifications
1. **Removal of Dark-Mode Bias:** Eliminated the hardcoded check that automatically marked `<body>` dark classes or dark inline backgrounds as `FAIL`.
2. **Objective Contrast Measurement:** Implemented WCAG 2.1 relative luminance and contrast ratio calculation. Evaluates foreground text color against background surface color against a 4.5:1 threshold (target 7:1 AAA).
3. **Safe Handling of Unresolvable Styles:** If styles or custom properties exist but cannot be statically resolved into numeric RGB values, the evaluator returns `NOT_ASSESSED` rather than guessing or defaulting to failure.
4. **Strict Evidence Boundaries:** The evaluator and protocol explicitly record that static HTML inspection cannot verify:
   - Actual runtime event listener execution (`runtimeInteractionExecution`: `NOT_ASSESSED`)
   - Physical keyboard navigation or focus ring traversal (`actualKeyboardNavigation`: `NOT_ASSESSED`)
   - Computed subpixel layout or clipping (`computedBrowserRendering`: `NOT_ASSESSED`)
   - Aesthetic elegance or visual polish (`visualQualityRating`: `NOT_ASSESSED`)
5. **Symmetry & Immutability:** Symmetrical verification logic applies identically to $C_0$ and $C_1$. Historical benchmark artifacts (Tasks 1–6 and Task 8) remain completely untouched and unaltered.
