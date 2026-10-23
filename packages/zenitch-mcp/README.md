# Zenitch MCP Server (`zenitch-mcp`)

> **AI-Powered UI/UX Design Intelligence and Verified Engineering Model Context Protocol Server**  
> Enforcing product-driven ergonomics, project-aware preservation, anti-cliche design policies, design system token intelligence, component reuse discovery, deterministic quality auditing, visual regression diffing, 60FPS hardware budgets, and stateful verified engineering across AI coding workflows.

---

## 1. Overview

**Zenitch MCP** is an enterprise-grade Model Context Protocol (MCP) server designed to eliminate low-quality, generic AI code generation. It equips AI coding assistants with deep design system intelligence, architecture dependency graphs, change impact analysis, and persistent project memory.

### Key Capabilities:
* **Product Experience Intelligence (PXI):** Proactively plans adaptive application architecture, layout hierarchies, candidate views, and ergonomic requirements before code generation.
* **Design Policy & Anti-Cliche Governance:** Enforces strict WCAG 2.2 AA/AAA accessibility, responsive touch targets, contrast math, and prevents cliche dark/neon or excessive glassmorphism anti-patterns.
* **Hardware Animation Budgets:** Analyzes CSS transitions and keyframes, enforcing GPU compositor properties, clamped device pixel ratios (DPR), and `prefers-reduced-motion` fallbacks.
* **Persistent Project Memory (`.zenitch/`):** Provides an advisory-locked, corruption-resistant ledger for requirements, human approvals, architectural decisions, and progressive verification.

---

## 2. Quick Start

Run Zenitch MCP directly using `npx` (zero installation required):

```bash
npx -y zenitch-mcp
```

Alternatively, install it globally:

```bash
npm install -g zenitch-mcp
zenitch-mcp
```

---

## 3. Client Configuration

### Google Antigravity (`mcp_config.json`)
```json
{
  "mcpServers": {
    "zenitch": {
      "command": "npx",
      "args": ["-y", "zenitch-mcp"],
      "env": {
        "ZENITCH_ENABLED": "true"
      }
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "zenitch": {
      "command": "npx",
      "args": ["-y", "zenitch-mcp"],
      "env": {
        "ZENITCH_ENABLED": "true"
      }
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "zenitch": {
      "command": "npx",
      "args": ["-y", "zenitch-mcp"],
      "env": {
        "ZENITCH_ENABLED": "true"
      }
    }
  }
}
```

---

## 4. MCP Tool Inventory & Compatibility

Zenitch MCP organizes its capabilities into progressive tiers, unified under canonical `zenitch_*` identifiers across both design intelligence and stateful engineering memory.

| Subsystem | MCP Tool Identifier | Category | Purpose |
| :--- | :--- | :--- | :--- |
| **Core** | `zenitch_ping` | Diagnostic | Health check, uptime telemetry, and server readiness. |
| **Core** | `zenitch_get_system_info` | Diagnostic | Subsystem operational status and registered policies. |
| **PXI** | `zenitch_plan_product_experience` | Intelligence | Plans layout architecture, candidate views, and component hierarchy before coding. |
| **Product** | `zenitch_analyze_product_context` | Intelligence | Analyzes domain, target audience, and ergonomic density requirements. |
| **Project** | `zenitch_inspect_project` | Intelligence | Discovers project framework, existing components, and tokens (read-only). |
| **Policy** | `zenitch_evaluate_design_policy` | Governance | Evaluates UI/markup against anti-cliche, anti-bloat, and WCAG rules. |
| **Design System** | `zenitch_generate_design_system` | Design System | Generates accessible color palettes, typography, and spacing scales. |
| **Component** | `zenitch_resolve_component` | Component | Recommends reusing existing codebase components before creating new ones. |
| **Audit** | `zenitch_audit_page_quality` | Quality Assurance | Audits pages for overflow, contrast, touch targets, and form accessibility. |
| **Visual** | `zenitch_compare_visual_regression` | Quality Assurance | Compares before/after screenshot diffs to detect unexpected layout shifts. |
| **Animation** | `zenitch_evaluate_animation_budget` | Performance | Enforces composite-only properties, clamped DPR, and reduced motion. |
| **Memory** | `zenitch_get_project_context` | Engineering Memory | Retrieves persistent project requirements, constraints, and preferences. |
| **Memory** | `zenitch_record_decision` | Engineering Memory | Records accepted/rejected decisions and generates negative constraints. |
| **Memory** | `zenitch_manage_requirement` | Engineering Memory | Tracks requirement lifecycles, acceptance criteria, and human approvals. |
| **Changes (Phase 2)** | `zenitch_manage_change` | Change Control | Records and links code modifications to requirements and decisions. |
| **Changes (Phase 2)** | `zenitch_inspect_changes` | Change Control | Inspects Git status and detects affected requirements. |
| **Verification (Phase 3)** | `zenitch_verify` | Verification | Executes progressive static and runtime verification passes. |
| **Verification (Phase 3)** | `zenitch_inspect_verification` | Verification | Inspects verification history and criterion evidence. |
| **Readiness (Phase 4)** | `zenitch_check_release_readiness` | Release Control | Comprehensive 10-category audit before production release. |
| **Readiness (Phase 4)** | `zenitch_inspect_release_readiness` | Release Control | Inspects stored readiness reports and blocking issues. |
| **Impact (Phase 5)** | `zenitch_analyze_change_impact` | Impact Analysis | Traverses dependency graph to assess blast radius of code changes. |
| **Impact (Phase 5)** | `zenitch_inspect_impact` | Impact Analysis | Queries historical impact assessments and risk levels. |
| **Architecture (Phase 6)** | `zenitch_analyze_architecture` | Architecture | Constructs module dependency graph and detects circular dependencies. |
| **Architecture (Phase 6)** | `zenitch_inspect_architecture` | Architecture | Inspects layer violations, LOC boundaries, and complexity metrics. |

---

## 5. Security & Safety Boundaries

1. **Read-Only Codebase Inspection:** Codebase scanning is strictly read-only with automatic redaction of API keys, AWS credentials, and environment tokens.
2. **Confined Memory Storage:** State mutations are strictly quarantined to the `.zenitch/` directory within the target project root, protected by advisory file locking and path traversal validation.
3. **SSRF & Network Mitigations:** Network tools block RFC 1918 private subnets, loopback interfaces (`127.0.0.1`, `::1`), and cloud metadata endpoints, enforcing a strict 2 MB response buffer limit.
4. **Clean-Room Boundary:** Zenitch does not bundle decompilers or binary reverse-engineering tools. It ingests verified behavioral requirements and design specifications while safeguarding proprietary IP.

---

## 6. Programmatic Library Usage

Zenitch MCP can also be imported as a non-blocking ES module library:

```typescript
import {
  ZenitchServer,
  planProductExperience,
  analyzeProductContext,
  generateDesignSystem
} from 'zenitch-mcp';

// Generate an experience plan programmatically
const plan = await planProductExperience({
  rawPrompt: 'Build a clinical laboratory sample triage dashboard',
  targetFormat: 'single_file_html'
});

console.log('Archetype:', plan.layoutArchitecture.archetype);
```

---

## 7. License

Licensed under the [MIT License](LICENSE).  
Copyright (c) 2026 Ajay M.
