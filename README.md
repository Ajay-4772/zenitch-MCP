# Zenitch MCP

[![CI](https://github.com/Ajay-4772/zenitch-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/Ajay-4772/zenitch-MCP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![MCP Protocol](https://img.shields.io/badge/MCP-1.32.1-orange.svg)](https://modelcontextprotocol.io)

> Design intelligence, architectural context, and static verification for AI coding assistants.

Zenitch is an open-source Model Context Protocol (MCP) server that helps AI coding agents make better visual and structural decisions when building web interfaces. It gives your AI pair-programmer structured tools to understand product requirements, inspect existing project conventions, generate accessible design tokens, reuse components, and audit generated markup before you commit it.

---

## The Problem: Why AI-Generated UIs Often Fall Flat

Modern LLMs are remarkably good at generating code that compiles. But when asked to build user interfaces, they frequently fall into familiar traps:

- **Missing product empathy:** A clinical triage dashboard gets styled like a dark-mode crypto landing page with heavy neon gradients.
- **Ignoring what's already there:** The agent creates new ad-hoc buttons, modal dialogs, and color variables instead of using your project's existing design system or component library.
- **Surface-level accessibility:** Form fields lack labels, empty icon buttons have no `aria-label`, and contrast ratios fail basic readability standards.
- **Responsive afterthoughts:** Layouts break on mobile viewports because they rely on hardcoded pixel widths and neglected media queries.
- **Zero project memory:** In the next prompt, the agent forgets earlier architectural decisions and repeats the same mistakes.

Zenitch addresses this with a simple guiding principle:

> **"Good interfaces don't come from blindly following a style guide. They come from understanding the product, the people using it, and the constraints around it."**

Instead of relying on luck or massive prompt instructions, Zenitch gives the AI agent a focused toolset to inspect, plan, and verify interface work in real time.

---

## What Zenitch Helps With

Zenitch acts as a supporting intelligence and quality-check layer across your frontend workflow:

### 1. Understand the Product Context
Before writing code, the agent can call `zenitch_analyze_product_context` and `zenitch_plan_product_experience` to determine the product domain (enterprise SaaS, healthcare, e-commerce, developer tools), establish the user's primary goal, choose an appropriate density archetype, and map out the layout topology.

### 2. Make Design Decisions Coherent
Using `zenitch_generate_design_system`, the agent creates cohesive color palettes, typography scales, and spacing tokens with calculated contrast ratios. The `zenitch_evaluate_design_policy` tool audits proposals against visual anti-patterns—such as unjustified dark themes in utilitarian workflows or frosted glassmorphism on dense data tables.

### 3. Respect Existing Codebases
The `zenitch_inspect_project` tool scans your repository (strictly read-only) to discover what framework, styling tools, and UI libraries you already use. When a component is needed, `zenitch_resolve_component` checks whether an existing codebase component should be reused before scaffolding a new one.

### 4. Check Implementation Quality
Static auditing tools review markup and styles:
- **`zenitch_audit_page_quality`**: Scans HTML for landmark tags, form accessibility, viewport configuration, and responsive layout risks.
- **`zenitch_evaluate_animation_budget`**: Analyzes CSS transitions and keyframes to flag layout-reflowing properties (like animating `width` or `top`) and verify `prefers-reduced-motion` fallbacks.
- **`zenitch_compare_visual_regression`**: Compares visual artifacts to detect unintended structural shifts.

### 5. Carry Context Forward (Progressive Memory)
When progressive tiers are enabled, Zenitch maintains a lightweight, advisory-locked ledger in `.zenitch/` to track decisions, requirement acceptance criteria, change histories, and architectural dependency boundaries across coding sessions.

---

## How It Fits Into Your Coding Workflow

Zenitch does not write your application for you—it equips your AI assistant with the right questions and checks at each stage:

```
1. Describe feature  ──▶  2. Inspect project  ──▶  3. Plan experience
   (prompt & domain)       (framework & tokens)       (topology & tokens)
                                                           │
6. Iterate & refine  ◀──  5. Audit markup      ◀──  4. Implement code
   (review findings)       (WCAG & responsiveness)    (reuse components)
```

1. **Describe the goal:** You describe what you need in plain English (e.g., *"Build an audit log viewer for our billing admin panel"*).
2. **Inspect conventions:** The agent inspects your repository to see existing components, color tokens, and styling setups.
3. **Plan the layout:** The agent plans the layout hierarchy, empty states, and required interface density.
4. **Implement:** The agent writes the code, prioritizing your existing components and design tokens.
5. **Audit:** The agent runs static quality and policy checks on the proposed markup.
6. **Refine:** You review verified findings and iterate with confidence.

---

## Quick Start

### Option 1: Running from Local Source (Current)

Zenitch is built with TypeScript and runs as a local stdio MCP server.

```bash
# 1. Clone the repository
git clone https://github.com/Ajay-4772/zenitch-MCP.git
cd zenitch-MCP

# 2. Install dependencies (Node.js >= 20.0.0 required)
npm ci

# 3. Compile TypeScript
npm run build
```

### Option 2: Running via npx (Once Published to npm)

Once the `zenitch-mcp` package is published to npm, you can run it directly without cloning:

```bash
npx -y zenitch-mcp
```

---

## Client Configuration

Add Zenitch to your favorite MCP-enabled coding environment.

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "zenitch": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_ZENITCH>/packages/zenitch-mcp/dist/src/cli.js"],
      "env": {
        "ZENITCH_LOG_LEVEL": "INFO"
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
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_ZENITCH>/packages/zenitch-mcp/dist/src/cli.js"],
      "env": {
        "ZENITCH_LOG_LEVEL": "INFO"
      }
    }
  }
}
```

### Antigravity IDE (`mcp_config.json`)

```json
{
  "mcpServers": {
    "zenitch": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_ZENITCH>/packages/zenitch-mcp/dist/src/cli.js"],
      "env": {
        "ZENITCH_LOG_LEVEL": "INFO"
      }
    }
  }
}
```

*(Note: Replace `<ABSOLUTE_PATH_TO_ZENITCH>` with the absolute path to your cloned repository. By default, Zenitch runs in the 11-tool baseline mode. Add `"ZENITCH_ENABLED": "true"` under `"env"` if you want to enable Phase 1 persistent project memory.)*

---

## Progressive Capabilities: 11 to 24 Tools

To protect your LLM's context window, Zenitch uses **progressive disclosure**. By default, it exposes a lightweight baseline of **11 core design tools**. When you need deeper verification or stateful tracking, you can enable additional phases via environment variables:

- **Baseline (Default, 11 tools):** Product analysis, layout planning (PXI), project inspection, design policy evaluation, token generation, component resolution, page quality auditing, visual regression diffing, animation budgets, and server diagnostics.
- **`ZENITCH_ENABLED=true` (14 tools):** Adds Phase 1 persistent project memory (`.zenitch/` ledger for decisions and requirements).
- **`ZENITCH_PHASE2=true` (16 tools):** Adds Phase 2 change control and requirement impact tracking.
- **`ZENITCH_PHASE3=true` (18 tools):** Adds Phase 3 static and runtime verification passes.
- **`ZENITCH_PHASE4=true` (20 tools):** Adds Phase 4 10-category release readiness gates.
- **`ZENITCH_PHASE5=true` (22 tools):** Adds Phase 5 dependency graph traversal and blast radius assessment.
- **`ZENITCH_PHASE6=true` (24 tools):** Adds Phase 6 architecture analysis and module cycle detection.

See [`packages/zenitch-mcp/README.md`](packages/zenitch-mcp/README.md) for the detailed tool reference.

---

## Honest Boundaries & Limitations

We believe open-source tools should be transparent about what they can and cannot do:

1. **Static Analysis is Not a Real Browser:** Zenitch inspects HTML markup, parses CSS ASTs, and calculates mathematical contrast ratios. It does **not** execute browser JavaScript, calculate subpixel rendering reflows, or profile real hardware frame times.
2. **Accessibility Checks are Heuristics:** The policy engine checks for structural presence—like landmark roles, alt text, and minimum touch target declarations. It cannot certify full WCAG compliance or test physical keyboard focus navigation.
3. **Disclosed Benchmark Results:** Zenitch includes a reproducible benchmark harness (`experiments/evaluation-benchmarks/`). In Task 9 testing on a clinical telemetry interface, Zenitch-assisted code scored 7/8 (88%) due to a daylight theme contrast flaw where background `#0f172a` and text `#0f172a` produced a 1.00:1 ratio. This known defect is openly disclosed in our benchmark reports.
4. **Offline Reference Material:** The `design-intelligence/` directory contains curated domain research, accessibility guidelines, and component specifications. This is reference documentation for human prompt engineering; it is not dynamically loaded by the MCP server at runtime.

---

## Repository Structure

```text
zenitch-mcp/
├── packages/
│   └── zenitch-mcp/              # Core publishable MCP server (TypeScript)
├── design-intelligence/          # Curated offline reference documentation & research
├── experiments/
│   └── evaluation-benchmarks/    # Controlled evaluation harness & 14 frozen test artifacts
├── .agents/skills/               # Agent skill definition directories
├── CONTRIBUTING.md               # Development setup & contributor guidelines
├── SECURITY.md                   # Security model, defense boundaries & vulnerability reporting
├── LICENSE                       # MIT License
└── NOTICE                        # Third-party notices and attributions
```

---

## Development & Verification

```bash
# Compile TypeScript
npm run build

# Run automated test suite (335 tests across 8 suites)
npm test

# Run evaluation benchmark
npm run benchmark

# Verify dependency security
npm audit
```

---

## Contributing & Security

- **Contributing:** We welcome bug reports, discussion, and improvements. Please review [CONTRIBUTING.md](CONTRIBUTING.md) for coding standards, PR workflows, and testing invariants.
- **Security:** Security policies and private vulnerability reporting instructions are detailed in [SECURITY.md](SECURITY.md).
- **License:** Licensed under the [MIT License](LICENSE). Third-party attributions are listed in [NOTICE](NOTICE).
