# Zenitch MCP ? Controlled AI-Generation Evaluation Protocol

**Document Version:** 1.0.0-frozen  
**Protocol Status:** PRE-REGISTERED & FROZEN  
**Target Domain:** Enterprise SaaS / FinTech Subscription Management  
**Task Identifier:** Task 8 ? Customer Billing & Subscription Management Portal ("CloudBill")  
**Date:** 2026-10-15  

---

## 1. Objective and Hypothesis

### Objective
Determine whether providing Zenitch's deterministic design intelligence (design tokens, component contracts, and static policy rules) to an AI coding model produces measurable improvements in static accessibility compliance, structural integrity, responsive layout adaptability, and visual quality compared to unassisted generation under identical task requirements.

### Hypotheses
1. **Accessibility & Structural Integrity:** Assisted generation will incorporate semantic WAI-ARIA tab relationships (`role="tablist"`, `role="tab"`, `role="tabpanel"`, roving `tabindex`, bidirectional `aria-controls` / `aria-labelledby`, and strict visual hiding), whereas baseline generation will generate unsemantic pseudo-tabs lacking full ARIA binding.
2. **Responsive Adaptability:** Assisted generation will declare tabstrip-scoped horizontal scrolling/wrapping without breaking desktop container constraints.
3. **Dead Interactions:** Assisted generation will establish functional button event handlers or submit types rather than empty unhandled `<button>` tags.

---

## 2. Model & Generation Environment Settings

| Setting | Value / Specification |
| :--- | :--- |
| **Model / Generator** | Antigravity AI Coding Engine (Advanced Agentic Pair Programmer) |
| **Runtime Environment** | Node.js v24.19.0 / Windows 11 / Antigravity IDE |
| **Sampling Temperature** | 0.2 (High-determinism code generation) |
| **Max Token Ceiling** | 8,192 tokens per artifact |
| **Output Requirement** | Single-file production HTML document containing inline CSS `<style>` and vanilla JavaScript `<script>` |
| **Human In-the-Loop Policy** | Zero manual edits, zero post-generation polish, zero prompt tuning after seeing outputs |

---

## 3. Frozen Task Brief: Task 8 (CloudBill Portal)

```text
Build a complete, single-file responsive customer billing and subscription management web application named "CloudBill" (Enterprise SaaS / FinTech).

Required Sections:
1. Header: Branded header displaying "CloudBill" or "CloudBill Enterprise", organization context ("Acme Global Logistics"), and a live subscription status badge ("Active - Enterprise Tier" or "Account in Good Standing").
2. Tab Navigation: A multi-view tab navigation bar providing three sections:
   - "Subscription & Invoices": Current plan summary ($2,400/mo billed annually), renewal date, and a data table of past invoices (Invoice ID, Billing Date, Amount, Status: Paid, Download PDF action).
   - "Payment Methods": Stored corporate credit cards or ACH accounts, badge marking the primary default payment method, expiration warnings, and an "Add Payment Method" trigger.
   - "Usage & Metering": Cloud compute hours (8,420 / 10,000 hrs), API calls (4.2M / 5.0M), storage resident (1.8 TB), rendered as structured metrics with visual gauges or progress bars.
3. Responsiveness: Fluid layout with mobile viewport support; the tab navigation bar must be horizontally scrollable or wrapping on small viewports without breaking layout.
4. Interactive Actions: Non-dead interactive buttons for invoice export, updating billing address, or adding payment methods.
```

---

## 4. Pre-Registered Acceptance Criteria & Pass/Fail Rules

| Criterion ID | Title | Description & Pass/Fail Rule | Required Evidence |
| :--- | :--- | :--- | :--- |
| `REQ-T8-01-HEADER` | Portal Branding & Account Status Badge | Header landmark containing "CloudBill" title and account status badge ("Active", "Enterprise Tier", or "Good Standing"). | Header containing title and status indicator. |
| `REQ-T8-02-TABLIST-SEMANTICS` | Semantic Tablist with Accessible Name | Navigation container declaring `role="tablist"` with non-empty accessible name (`aria-label` or `aria-labelledby`). | Container with `role="tablist"` and valid accessible name. |
| `REQ-T8-03-TAB-CONTROLS` | WAI-ARIA Tab Triggers with Roving Tabindex | >=2 tab buttons declaring `role="tab"`, unique IDs, explicit `aria-selected`, roving `tabindex` (`0` for selected, `-1` for inactive), and unique `aria-controls` referencing existing panels. | >=2 tab triggers with valid roving `tabindex` and resolved controls. |
| `REQ-T8-04-TABPANEL-LINKING` | WAI-ARIA Tabpanels with Reciprocal Linking & Visual Hiding | >=2 content containers declaring `role="tabpanel"`, unique IDs, and `aria-labelledby` referencing controlling tabs. Active panel is visually displayed; inactive panels are visually hidden via HTML5 `hidden` or scoped `display: none` (`aria-hidden="true"` alone fails). | >=2 tabpanels with reciprocal backlinks and verified visual hiding. |
| `REQ-T8-05-BILLING-DATA` | Structured Invoice Table or Plan Summary Data | Active panel renders structured invoice history table with currency values (`$`) or numerical subscription tiers. | Tabular invoice data with currency symbols. |
| `REQ-T8-06-RESPONSIVE-TABSTRIP` | Responsive Tabstrip Scoped to Navigation | Document includes `<meta name="viewport">`, does not use hardcoded pixel widths >=800px on outer wrapper, and tabstrip declares `overflow-x: auto/scroll` or `flex-wrap: wrap`. | Viewport meta + scoped tabstrip overflow. |
| `REQ-T8-07-RUNTIME-PAYMENT-UPDATE` | Runtime Payment Method Modal / Transaction Lifecycle | Live browser DOM modal presentation, payment tokenization, and dynamic state switching. | **NOT_ASSESSED** (Requires browser runtime event loop). |

---

## 5. Experimental Conditions

### Baseline Condition
- Model receives the frozen task brief.
- No access to Zenitch MCP tools (`zenitch_resolve_component`, `zenitch_generate_design_system`, `zenitch_evaluate_design_policy`).
- Model generates application using standard training priors.

### Assisted Condition
- Model receives the identical frozen task brief.
- Provided with Zenitch MCP design intelligence:
  - Design system tokens for `domain: "fintech"`, `brandMood: "corporate"`.
  - Component contract blueprint for `Tabs` composite component (`role="tablist"`, roving `tabindex`, reciprocal `aria-controls` / `aria-labelledby`, HTML5 `hidden` for inactive panels).
  - Active policy rules (`POL-A11Y-005`, `POL-RESP-001`, `POL-INT-001`).

---

## 6. Randomization Protocol

Condition generation order per trial is pseudo-randomized using SHA-256 of the seed string `task8-controlled-trial-seed-20261015`:
- **Trial 1:** Baseline first, then Assisted (B -> A)
- **Trial 2:** Assisted first, then Baseline (A -> B)
- **Trial 3:** Baseline first, then Assisted (B -> A)

Both artifacts in each trial are evaluated symmetrically using the identical frozen evaluator script (`task8-controlled-evaluator.mjs`).
