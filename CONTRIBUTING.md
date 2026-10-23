# Contributing to Zenitch MCP

Thank you for your interest in contributing to Zenitch MCP!

## Development Setup

1. **Prerequisites**: Node.js >= 18.17.0 (Node 20 or 22 LTS recommended) and npm >= 9.0.0.
2. **Clone the repository**:
   ```bash
   git clone https://github.com/Ajay-4772/zenitch-MCP.git
   cd zenitch-MCP
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Compile TypeScript**:
   ```bash
   npm run build
   ```

## Testing & Quality Assurance

Before submitting any contribution, you must verify that all automated suites and benchmarks pass:

```bash
# Run unit and integration tests (335 tests across 20 suites)
npm test

# Run empirical benchmark evaluation (3 tasks, 6 artifacts)
npm run benchmark
```

## Contribution Guidelines

1. **Zero Production Regressions**: All 335 tests must pass cleanly.
2. **Deterministic Protocol Output**: Tool handlers must emit pure JSON-RPC on `stdout`; all logging must use the structured logger directing to `stderr`.
3. **Progressive Disclosure Discipline**: Baseline registered tools must strictly remain 11 tools. Progressive engineering tiers must only activate when explicitly gated by their corresponding `ZENITCH_*` environment variables.
4. **Clean-Room Code Quality**: Zenitch code must remain original, defensive, and strictly adhere to the MIT license terms.

## Submitting Pull Requests

1. Fork the repository and create a feature branch from `main`.
2. Ensure commit messages follow Conventional Commits format (e.g., `feat:`, `fix:`, `docs:`, `refactor:`).
3. Open a Pull Request against the `main` branch with a detailed explanation of your changes and test verification results.
