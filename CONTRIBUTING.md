# Contributing to AgentGuard

Thanks for your interest in contributing to AgentGuard -- a governed action runtime for AI coding agents. This guide covers how to set up the project, run tests, and submit contributions.

## Getting Started

```bash
git clone https://github.com/AgentGuardHQ/agent-guard.git
cd agent-guard
pnpm install
pnpm build
```

This is a **pnpm monorepo** orchestrated by **Turbo**. Workspace packages live in `packages/`, applications in `apps/`. Each package has its own `src/`, `dist/`, `package.json`, and `tsconfig.json`. All tests import from `dist/`, so you must build before running them.

## Development

```bash
pnpm build             # Build all packages (turbo build)
pnpm test              # Run all tests (turbo test)
pnpm lint              # Check code with ESLint (turbo lint)
pnpm format            # Check formatting with Prettier
pnpm format:fix        # Auto-fix formatting
pnpm ts:check          # Type-check all packages (turbo ts:check)

# Per-package filtering
pnpm build --filter=@red-codes/kernel   # Build a single package
pnpm test --filter=@red-codes/kernel    # Test a single package
```

Run `pnpm build` after making changes, then run tests before submitting a PR.

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

1. Open `packages/invariants/src/definitions.ts`
2. Add a check function that returns a violation result with a severity level
3. Register the invariant in the checker (`packages/invariants/src/checker.ts`)
4. Add tests covering the new check

### Bug Fixes and Improvements

- Open an issue first to discuss the change, especially for larger features
- Reference the issue number in your PR
- Keep changes focused -- one fix or feature per PR

## Project Structure

```
packages/
├── core/            # @red-codes/core — Shared types, actions, hash, utilities
├── events/          # @red-codes/events — Canonical event model (schema, bus, store, JSONL)
├── policy/          # @red-codes/policy — Policy evaluator, YAML/JSON loaders, composition
├── invariants/      # @red-codes/invariants — Invariant checker and built-in definitions
├── kernel/          # @red-codes/kernel — Governed action kernel (orchestrator, AAB, decisions)
├── adapters/        # @red-codes/adapters — Execution adapters (file, shell, git, claude-code)
├── analytics/       # @red-codes/analytics — Cross-session violation analytics
├── storage/         # @red-codes/storage — SQLite + Firestore backends (opt-in)
├── telemetry/       # @red-codes/telemetry — Runtime telemetry and logging
├── plugins/         # @red-codes/plugins — Plugin ecosystem (discovery, registry, sandboxing)
└── renderers/       # @red-codes/renderers — Renderer plugin system (TUI renderer)

apps/
├── cli/             # @red-codes/agentguard — CLI (published npm package)
│   └── src/commands/  # Individual CLI subcommands
└── vscode-extension/  # agentguard-vscode — VS Code extension

policy/              # Policy configuration files (JSON)
policies/            # Policy packs (YAML: ci-safe, enterprise, open-source, strict)
tests/               # Root-level test suite (JS + TypeScript)
```

## Pull Request Process

1. Fork the repository and create a branch from `main`
2. Make your changes in the relevant `packages/*/src/` or `apps/*/src/` directory (never edit `dist/` directly)
3. Run `pnpm build` to compile
4. Run `pnpm test` to verify all tests pass
5. Run `pnpm lint` and `pnpm format` to check code style
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
