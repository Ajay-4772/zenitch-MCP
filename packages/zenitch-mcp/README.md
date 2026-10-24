# Zenitch MCP Server (`zenitch-mcp`)

[![CI](https://github.com/Ajay-4772/zenitch-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/Ajay-4772/zenitch-MCP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![MCP Protocol](https://img.shields.io/badge/MCP-1.32.1-orange.svg)](https://modelcontextprotocol.io)

> The standalone Model Context Protocol server package providing UI/UX design intelligence, project inspection, and static quality checks.

---

## Table of Contents

- [Overview](#overview)
- [Requirements and Prerequisites](#requirements-and-prerequisites)
- [Installation and Build](#installation-and-build)
- [MCP Client Configuration](#mcp-client-configuration)
- [Canonical Baseline Tools (11 Tools)](#canonical-baseline-tools-11-tools)
- [Progressive Engineering Tiers (Up to 24 Tools)](#progressive-engineering-tiers-up-to-24-tools)
- [Example AI Prompts](#example-ai-prompts)
- [Verification Boundaries and Limitations](#verification-boundaries-and-limitations)
- [Security Model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Programmatic Library Usage](#programmatic-library-usage)
- [Contributing and Security](#contributing-and-security)

---

## Overview

`zenitch-mcp` is the core executable package of the Zenitch project. It implements a stdio-based MCP server that connects to AI coding tools like Claude Desktop, Cursor, and Antigravity IDE.

Its goal is to turn generic AI code generation into project-aware, intentional engineering. It provides tools for:
- Planning layout topology and interface requirements based on user goals.
- Inspecting existing codebase frameworks, styling conventions, and components.
- Generating coherent, contrast-checked design tokens.
- Recommending existing component reuse over duplicate scaffolding.
- Auditing HTML and CSS for basic responsive hygiene, static WCAG rules, and GPU-friendly animations.

---

## Requirements and Prerequisites

- **Node.js:** `>= 20.0.0` (verified on Node.js 20.x LTS and 22.x LTS).
- **Package Manager:** `npm >= 9.0.0`.
- **Operating System:** Windows, macOS, or Linux.
- **Client:** Any MCP-compliant client that supports stdio transport (Claude Desktop, Cursor, Antigravity IDE, etc.).

---

## Installation and Build

### Running from Cloned Source

```bash
# 1. From repository root, install dependencies
npm ci

# 2. Build TypeScript across workspaces
npm run build

# 3. Test execution directly
node packages/zenitch-mcp/dist/src/cli.js
```

### Running via npx (Once Published to npm)

Once `zenitch-mcp` is published on the npm registry, no cloning is required:

```bash
npx -y zenitch-mcp
```

---

## MCP Client Configuration

Configure Zenitch in your client's MCP configuration file. Use absolute paths when running from a local checkout.

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "zenitch": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH>/packages/zenitch-mcp/dist/src/cli.js"],
      "env": {
        "ZENITCH_LOG_LEVEL": "INFO",
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
      "command": "node",
      "args": ["<ABSOLUTE_PATH>/packages/zenitch-mcp/dist/src/cli.js"],
      "env": {
        "ZENITCH_LOG_LEVEL": "INFO",
        "ZENITCH_ENABLED": "true"
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
      "args": ["<ABSOLUTE_PATH>/packages/zenitch-mcp/dist/src/cli.js"],
      "env": {
        "ZENITCH_LOG_LEVEL": "INFO",
        "ZENITCH_ENABLED": "true"
      }
    }
  }
}
```

---

## Canonical Baseline Tools (11 Tools)

By default, Zenitch registers 11 core tools to keep tool listings clean and protect the LLM's context window:

| MCP Tool Identifier | Category | When It Is Useful |
| :--- | :--- | :--- |
| `zenitch_ping` | Diagnostics | Verifies that the MCP server process is running, responsive, and reports uptime. |
| `zenitch_get_system_info` | Diagnostics | Reports active subsystem states, registered policies, and server version. |
| `zenitch_analyze_product_context` | Intelligence | Classifies product domain, user goals, and interface density requirements before coding. |
| `zenitch_inspect_project` | Intelligence | Reads existing project dependencies, styling setup, and components without altering code. |
| `zenitch_plan_product_experience` | Intelligence | Generates layout topology, view states, and component hierarchy from natural language. |
| `zenitch_evaluate_design_policy` | Governance | Audits proposed markup against WCAG contrast math, touch targets, and visual anti-patterns. |
| `zenitch_generate_design_system` | Design System | Produces accessible color palettes, typography scales, and spacing tokens. |
| `zenitch_resolve_component` | Component | Suggests reusing existing codebase components or scaffolds accessible new components. |
| `zenitch_audit_page_quality` | Quality | Checks HTML for landmarks, viewport configuration, and responsive layout risks. |
| `zenitch_compare_visual_regression` | Quality | Compares before-and-after visual artifacts and flags structural layout drift. |
| `zenitch_evaluate_animation_budget` | Performance | Inspects CSS transitions for compositor-friendly properties and checks reduced-motion queries. |

---

## Progressive Engineering Tiers (Up to 24 Tools)

If you need deeper change control or persistent project memory, enable progressive tiers using environment variables:

| Environment Variable | Default | Tool Count | What It Adds |
| :--- | :---: | :---: | :--- |
| *(None / Default)* | `false` | **11 tools** | Baseline design intelligence, inspection, and static quality checks. |
| `ZENITCH_ENABLED=true` | `false` | **14 tools** | **Phase 1 Project Memory:** Adds `zenitch_get_project_context`, `zenitch_record_decision`, and `zenitch_manage_requirement` using the `.zenitch/` ledger. |
| `ZENITCH_PHASE2=true` | `false` | **16 tools** | **Phase 2 Change Control:** Adds `zenitch_manage_change` and `zenitch_inspect_changes` to link Git modifications to requirements. |
| `ZENITCH_PHASE3=true` | `false` | **18 tools** | **Phase 3 Verification:** Adds `zenitch_verify` and `zenitch_inspect_verification` for progressive static and runtime check passes. |
| `ZENITCH_PHASE4=true` | `false` | **20 tools** | **Phase 4 Release Readiness:** Adds `zenitch_check_release_readiness` and `zenitch_inspect_release_readiness` across 10 release categories. |
| `ZENITCH_PHASE5=true` | `false` | **22 tools** | **Phase 5 Impact Analysis:** Adds `zenitch_analyze_change_impact` and `zenitch_inspect_impact` to map blast radius and affected files. |
| `ZENITCH_PHASE6=true` | `false` | **24 tools** | **Phase 6 Architecture:** Adds `zenitch_analyze_architecture` and `zenitch_inspect_architecture` for module dependency cycle detection. |

---

## Example AI Prompts

Here are realistic ways to prompt an MCP-connected coding assistant to make use of Zenitch:

### Project Inspection & Reuse
> *"Before you build the user settings form, inspect our repository conventions. Tell me what form libraries, CSS tools, and button components we already have so we don't recreate them."*

### Experience & Layout Planning
> *"We need a clinical sample intake dashboard. Use Zenitch to analyze the domain requirements and plan out the layout hierarchy, density, and key views before writing any markup."*

### Quality & Accessibility Check
> *"Review the markup for this pricing table component. Check for contrast issues, touch target sizes, and missing accessibility attributes, and separate confirmed static findings from things that require manual browser testing."*

### Change Impact Analysis (Tier 5)
> *"We want to update the shared NavigationBar component. Analyze the change impact to see which routes and child components might be affected."*

---

## Verification Boundaries and Limitations

To maintain developer trust, Zenitch makes clear distinctions between static checks and runtime behavior:

- **Static vs. Browser Runtime:** Zenitch analyzes source code, HTML structure, and CSS rules. It does **not** execute browser JavaScript, compute dynamic layout reflows, or emulate hardware GPU frame timings.
- **Accessibility Heuristics:** Contrast calculations and landmark inspections evaluate structural presence. They do **not** certify full WCAG compliance or test screen-reader experience and physical keyboard focus traps.
- **Advisory Guardrails:** Zenitch provides evidence and recommendations. Developers remain in charge of reviewing and testing code generated by AI models.

---

## Security Model

- **Read-Only Codebase Inspection:** Codebase scanning tools (`zenitch_inspect_project`, `zenitch_analyze_architecture`) operate in strictly read-only mode and do not modify project source files.
- **Stateful Memory Quarantined to `.zenitch/`:** While inspection tools are read-only, stateful memory features (Tiers 1–5) record project decisions, requirements, and verification evidence. All written state is strictly quarantined to the `.zenitch/` directory within the target project root, protected by advisory file locks and path traversal validation.
- **Secret Redaction:** Built-in filters mask common environment variables and credential patterns (`.env`, `AKIA...`, private keys) to prevent accidental leaks in logs or tool responses.
- **SSRF Hardening:** Network utilities reject RFC 1918 private subnets, loopback interfaces (`127.0.0.1`, `::1`), and cloud metadata endpoints, enforcing an authoritative 2 MB streaming response buffer cap.
- **Protocol Isolation:** Process `stdout` is strictly reserved for valid JSON-RPC 2.0 messages. All operational telemetry, debug logs, and error traces route exclusively to `stderr`.
- **Defense-in-Depth Limitations:** While inspection tools are read-only and memory storage is quarantined to `.zenitch/`, application-level checks do not replace host operating system permissions or network firewall controls. Developers should always review code generated or modified by AI assistants.

---

## Troubleshooting

### MCP Client Cannot Connect
- **Check executable path:** Verify that the path in your client configuration points to the compiled CLI file: `dist/src/cli.js`.
- **Build output exists:** If you cloned the repo, ensure you ran `npm run build` first.
- **Node version:** Run `node -v` to confirm you are using Node.js `>= 20.0.0`.

### stdout Contains Non-JSON Output
- Zenitch redirects all internal logs to `stderr`. If you modify code, never use `console.log` in tool execution paths, as extra output on `stdout` corrupts the JSON-RPC stdio transport.

### Progressive Tools Not Appearing
- Ensure environment variable names are spelled correctly (e.g., `ZENITCH_ENABLED=true` for memory tools, `ZENITCH_PHASE6=true` for architecture tools).
- Restart your MCP client after updating configuration files.

---

## Programmatic Library Usage

Zenitch MCP can also be imported directly in TypeScript projects as an ES module:

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

## Contributing and Security

- **Contributing:** When working in the source repository, please see [CONTRIBUTING.md](../../CONTRIBUTING.md) (or on [GitHub](https://github.com/Ajay-4772/zenitch-MCP/blob/main/CONTRIBUTING.md)) for development setup, testing requirements, and PR guidelines.
- **Security:** Vulnerability reporting policies are documented in [SECURITY.md](../../SECURITY.md) (or on [GitHub](https://github.com/Ajay-4772/zenitch-MCP/blob/main/SECURITY.md)).
- **License:** Distributed under the MIT License (see [LICENSE](LICENSE)).
- **Notices:** Third-party dependency notices are in [NOTICE](NOTICE).
- **Author:** Ajay M
