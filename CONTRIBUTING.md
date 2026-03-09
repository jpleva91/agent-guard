# Contributing to AgentGuard

Thanks for your interest in contributing to AgentGuard -- a governed action runtime for AI coding agents. This guide covers how to set up the project, run tests, and submit contributions.

## Getting Started

```bash
git clone https://github.com/jpleva91/agent-guard.git
cd agent-guard
npm install
npm run build:ts
```

The TypeScript source in `src/` is the single source of truth. It compiles to `dist/` via `tsc` (individual modules) and `esbuild` (CLI bundle). All tests import from `dist/`, so you must build before running them.

## Development

```bash
npm run build:ts       # Compile TypeScript to dist/
npm test               # Run JS test suite
npm run ts:test        # Run TypeScript tests (vitest)
npm run lint           # Check code with ESLint
npm run lint:fix       # Auto-fix lint issues
npm run format         # Check formatting with Prettier
npm run format:fix     # Auto-fix formatting
npm run ts:check       # Type-check without emitting (tsc --noEmit)
```

Run `npm run build:ts` after making changes, then run both test suites before submitting a PR.

## How to Contribute

### Custom Policies

AgentGuard uses YAML or JSON policy files to define action rules. You can contribute new policy examples or improve the policy format.

- Policy files live in `policy/` or at the repo root as `agentguard.yaml`
- Policies define `rules` with `action`, `effect` (allow/deny), optional `scopes`, `branches`, and `limits`
- Example:

```yaml
rules:
  - action: 'git.push'
    effect: deny
    branches: ['main', 'production']
    reason: 'Direct push to protected branches is not allowed'

  - action: 'file.write'
    effect: allow
    scopes: ['src/**', 'tests/**']
    reason: 'Allow writes within source and test directories'
```

### Custom Invariants

Invariants are runtime checks that verify system state before an action executes. AgentGuard ships with 6 built-in invariants (secret exposure, protected branches, blast radius, test-before-push, no force push, lockfile integrity).

To add a new invariant:

1. Open `src/invariants/` (or `src/agentguard/invariants/definitions.ts` on main)
2. Add a check function that returns a violation result with a severity level
3. Register the invariant in the checker
4. Add tests covering the new check

### Bug Fixes and Improvements

- Open an issue first to discuss the change, especially for larger features
- Reference the issue number in your PR
- Keep changes focused -- one fix or feature per PR

## Project Structure

```
src/
├── kernel/          # Governed action kernel (orchestrator)
├── events/          # Canonical event model and lifecycle events
├── policy/          # Policy evaluator, YAML/JSON loaders
├── invariants/      # Invariant checker and built-in definitions
├── adapters/        # Execution adapters (file, shell, git, claude-code)
├── core/            # Shared logic (EventBus, types, hashing)
├── cli/             # CLI entry point and commands (guard, inspect, replay)
│   └── commands/    # Individual CLI subcommands
├── domain/          # Pure domain logic (actions, events, reference monitor)
└── agentguard/      # Legacy kernel location (being consolidated)

policy/              # Policy configuration files (JSON)
tests/               # Test suite (JS + TypeScript)
dist/                # Compiled output (generated, do not edit)
```

## Pull Request Process

1. Fork the repository and create a branch from `main`
2. Make your changes in `src/` (never edit `dist/` directly)
3. Run `npm run build:ts` to compile
4. Run `npm test` and `npm run ts:test` to verify all tests pass
5. Run `npm run lint` and `npm run format` to check code style
6. Open a PR against `main` with a clear description of what changed and why

## Code Style

- **TypeScript** with strict mode enabled (`verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`)
- **ESLint** flat config with `typescript-eslint` recommended rules
- **Prettier** for formatting (single quotes, trailing commas, 100 char print width, 2 space indent)
- **camelCase** for functions and variables
- **UPPER_SNAKE_CASE** for constants
- `const`/`let` only, no `var`
- Arrow functions preferred
- Use `import type` for type-only imports
