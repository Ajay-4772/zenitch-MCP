# Zenitch

AI-powered UI/UX design intelligence and verified engineering system delivered as a Model Context Protocol (MCP) server.

Zenitch guides AI agents to construct accessible, responsive, aesthetically intentional frontend applications while enforcing strict quality boundaries, design policies, and persistent project memory.

---

## Subsystems Overview

- **`packages/zenitch-mcp`**: The core TypeScript MCP server package providing 11 canonical baseline tools and up to 24 progressive engineering tools over stdio transport.
- **`design-intelligence/`**: Reference material comprising curated domain research, component specifications, accessibility heuristics, and design tokens for human guidance and prompt engineering (offline reference documentation; not dynamically loaded at runtime by the MCP server).
- **`experiments/evaluation-benchmarks/`**: Controlled evaluation harness comparing AI code generation with and without Zenitch assistance across structured frontend tasks.
- **`.agents/skills/`**: Agent skill instructions for pair-programming IDE environments.

---

## Quickstart & Installation

### Running via npx or Node

```bash
# Build all workspaces
npm run build

# Start the MCP server via CLI
node packages/zenitch-mcp/dist/src/cli.js
```

### Client Configuration

Add Zenitch to your MCP client configuration (e.g., Claude Desktop, Antigravity IDE, or Cursor):

```json
{
  "mcpServers": {
    "zenitch": {
      "command": "node",
      "args": ["path/to/zenitch/packages/zenitch-mcp/dist/src/cli.js"],
      "env": {
        "ZENITCH_LOG_LEVEL": "INFO",
        "ZENITCH_ENABLED": "true"
      }
    }
  }
}
```

### Progressive Feature Flags

Zenitch uses a tiered progressive disclosure architecture to avoid context window bloat:

| Environment Variable | Default | Active Tool Count | Enabled Capabilities |
| :--- | :---: | :---: | :--- |
| *(None / Default)* | `false` | **11 tools** | Baseline intelligence: PXI planning, product analysis, project inspection, design policy evaluation, design system token generation, component resolution, page auditing, visual regression, animation budget. |
| `ZENITCH_ENABLED=true` | `false` | **14 tools** | Phase 1 Memory: Persistent project context, decision recording, requirement management (`.zenitch/` ledger). |
| `ZENITCH_PHASE2=true` | `false` | **16 tools** | Phase 2 Change Control: Code change management and impact inspection linked to requirements. |
| `ZENITCH_PHASE3=true` | `false` | **18 tools** | Phase 3 Verification: Static and runtime verification passes with evidence recording. |
| `ZENITCH_PHASE4=true` | `false` | **20 tools** | Phase 4 Release Readiness: 10-category release gatekeeper and blocking defect prevention. |
| `ZENITCH_PHASE5=true` | `false` | **22 tools** | Phase 5 Impact Analysis: Dependency graph traversal and blast radius assessment. |
| `ZENITCH_PHASE6=true` | `false` | **24 tools** | Phase 6 Architecture Analysis: Module graph cycle detection, layer boundary enforcement, and complexity metrics. |

---

## Canonical MCP Tools (11 Baseline Tools)

| Tool Name | Purpose |
| :--- | :--- |
| `zenitch_ping` | Health check and server diagnostics. |
| `zenitch_get_system_info` | Reports server configuration, active modules, and subsystem health. |
| `zenitch_analyze_product_context` | Classifies product domain, user goals, and aesthetic archetypes. |
| `zenitch_inspect_project` | Performs read-only scans of project framework, dependencies, and styling conventions. |
| `zenitch_evaluate_design_policy` | Audits proposed markup against WCAG contrast, touch targets, and visual anti-patterns. |
| `zenitch_generate_design_system` | Generates cohesive color palettes, typography scales, spacing tokens, and contrast ratios. |
| `zenitch_resolve_component` | Recommends existing component reuse or scaffolds accessible new components (React, Vue, Svelte). |
| `zenitch_audit_page_quality` | Analyzes HTML structure, landmarks, viewport tags, and responsiveness. |
| `zenitch_compare_visual_regression` | Compares visual artifacts and flags structural/layout drift. |
| `zenitch_evaluate_animation_budget` | Verifies 60fps frame budgets and classifies GPU-safe vs. layout-reflowing properties. |
| `zenitch_plan_product_experience` | Generates end-to-end design manifests, layout topology, and token bindings from prompts. |

---

## Empirical Benchmarks & Evaluation Boundaries

Zenitch includes a reproducible evaluation harness in `experiments/evaluation-benchmarks/` measuring objective criteria on generated web applications.

### Controlled Benchmark Results (Tasks 1–6)
- **12 Frozen Artifacts**: All 12 baseline and assisted HTML outputs are preserved with verifiable SHA-256 hashes.
- **Parity Verification**: The active evaluator (`benchmark-evaluator.mjs`) verifies requirement coverage, accessibility landmarks, interactive triggers, and responsive declarations.

### Task 9 PXI Effectiveness & Honest Result Disclosure
Task 9 evaluates the Product Experience Intelligence (PXI) planner on a complex clinical telemetry dashboard:
- **C0 Baseline (Without PXI)**: 8 / 8 criteria passed (100%).
- **C1 Assisted (With PXI)**: 7 / 8 criteria passed (88%).
- **Disclosed Known Defect**: In trial C1, `REQ-T9-07-THEME-ERGONOMICS` failed due to a daylight theme contrast flaw where background `#0f172a` and text `#0f172a` yielded a 1.00:1 contrast ratio. This failure is recorded honestly and remains part of the benchmark suite.

### Evaluation Evidence Boundaries
Automated evaluator scores verify **structural and syntactic presence** (e.g., semantic HTML tags, CSS rules, script presence, and contrast math). They do **not** certify:
1. Runtime interaction execution or browser JavaScript event dispatch.
2. Physical keyboard focus trap navigation.
3. Computed subpixel cross-browser rendering.
4. Subjective visual polish or brand distinctiveness.

---

## Development & Testing

```bash
# Compile TypeScript across all workspaces
npm run build

# Execute full automated test suite (335 tests across 20 suites)
npm test

# Run objective evaluation benchmark
npm run benchmark
```

---

## License & Attribution

- **License**: MIT License (see [LICENSE](LICENSE)).
- **Notices**: Third-party dependencies and copyright notices are documented in [NOTICE](NOTICE).
- **Author**: Ajay M
