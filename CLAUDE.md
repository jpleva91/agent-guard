# CLAUDE.md — AI Assistant Guide

## Project Overview

**AgentGuard** is a **governed action runtime for AI coding agents**. It intercepts agent tool calls, enforces policies and invariants, executes authorized actions via adapters, and emits lifecycle events. The Action is the primary unit of computation.

The system has one architectural spine: the **canonical event model**. All system activity becomes events. The kernel produces governance events. Subscribers (TUI renderer, JSONL sink, CLI inspect) consume them.

**Key characteristics:**
- Governed action kernel: propose → normalize → evaluate → execute → emit
- 6 built-in invariants (secret exposure, protected branches, blast radius, test-before-push, no force push, lockfile integrity)
- YAML/JSON policy format with pattern matching, scopes, and branch conditions
- Escalation tracking: NORMAL → ELEVATED → HIGH → LOCKDOWN
- JSONL event persistence for audit trail and replay
- Claude Code adapter for PreToolUse/PostToolUse hooks
- TypeScript source (`src/`), compiled to `dist/` via tsc + esbuild
- CLI has runtime dependencies (`chokidar`, `commander`, `pino`)
- Build tooling: tsc + esbuild + vitest (dev dependencies only)

## Quick Start

```bash
npm run build:ts     # Compile TypeScript → dist/

# Governance runtime
echo '{"tool":"Bash","command":"git push origin main"}' | npx agentguard guard --dry-run
npx agentguard guard --policy agentguard.yaml   # Start runtime with policy
npx agentguard inspect --last                   # Inspect most recent run
npx agentguard events --last                    # Show raw event stream
```

## Project Structure

TypeScript in `src/` is the **single source of truth**. It compiles to `dist/` via `tsc` (individual modules) + `esbuild` (CLI bundle).

**Top-level documentation**: `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `agentguard.yaml` (default policy)

```
src/
├── kernel/                 # Governed action kernel
│   ├── kernel.ts           # Orchestrator (propose → evaluate → execute → emit)
│   ├── aab.ts              # Action Authorization Boundary (normalization)
│   ├── decision.ts         # Runtime assurance engine
│   ├── monitor.ts          # Escalation state machine
│   ├── evidence.ts         # Evidence pack generation
│   ├── decisions/          # Typed decision records
│   └── simulation/         # Pre-execution impact simulation
├── events/                 # Canonical event model
│   ├── schema.ts           # Event kinds, factory, validation
│   ├── bus.ts              # Generic typed EventBus
│   ├── store.ts            # In-memory event store
│   ├── jsonl.ts            # JSONL event persistence (audit trail)
│   └── decision-jsonl.ts   # Decision record persistence
├── policy/                 # Policy system
│   ├── evaluator.ts        # Rule matching engine
│   ├── loader.ts           # Policy validation + loading
│   └── yaml-loader.ts      # YAML policy parser
├── invariants/             # Invariant system
│   ├── definitions.ts      # 6 built-in invariant definitions
│   └── checker.ts          # Invariant evaluation engine
├── adapters/               # Execution adapters
│   ├── registry.ts         # Adapter registry (action class → handler)
│   ├── file.ts, shell.ts, git.ts  # Action handlers
│   └── claude-code.ts      # Claude Code hook adapter
├── cli/                    # CLI entry point + commands
│   ├── bin.ts              # CLI entry point
│   ├── args.ts             # Argument parsing utilities
│   ├── colors.ts           # Terminal color helpers
│   ├── tui.ts              # TUI renderer (terminal action stream)
│   ├── recorder.ts         # Event recording
│   ├── replay.ts           # Session replay logic
│   ├── session-store.ts    # Session management
│   ├── file-event-store.ts # File-based event persistence
│   └── commands/           # guard, inspect, replay, claude-hook, claude-init
└── core/                   # Shared utilities
    ├── types.ts            # Shared TypeScript type definitions
    ├── actions.ts          # 23 canonical action types across 8 classes
    ├── hash.ts             # Content hashing utilities
    ├── adapters.ts         # Adapter registry interface
    ├── event-log.ts        # Event logging
    ├── event-projections.ts # Event projections
    ├── event-schema.ts     # Event schema definitions
    ├── index.ts            # Module re-exports
    └── execution-log/      # Execution audit log

tests/                      # Test suite (JS + TS/vitest)
policy/                     # Policy configuration (JSON)
docs/                       # System documentation
hooks/                      # Git hooks for event tracking
examples/                   # Example governance scenarios and error demos
scripts/                    # Build and utility scripts
spec/                       # Feature specifications
```

## Development Commands

```bash
# TypeScript build (required before running tests or CLI)
npm run build:ts           # Build TypeScript (tsc + esbuild → dist/)
npm run ts:check           # Type-check TypeScript (tsc --noEmit)

# Run tests
npm test                   # Run JS tests
npm run ts:test            # Run TypeScript tests (vitest)
npm run ts:test:watch      # Run TypeScript tests in watch mode
npm run test:coverage      # Run with coverage (c8, 50% line threshold)

# Code quality
npm run lint               # Run ESLint
npm run lint:fix           # Run ESLint with auto-fix
npm run format             # Check formatting (Prettier)
npm run format:fix         # Fix formatting (Prettier)

# Run AgentGuard CLI
npm run dev
```

## Architecture & Key Patterns

### Governed Action Kernel
The kernel loop is the core of AgentGuard. Every agent action passes through it:
1. Agent proposes action (Claude Code tool call → `RawAgentAction`)
2. AAB normalizes intent (tool → action type, detect git/destructive commands)
3. Policy evaluator matches rules (deny/allow with scopes, branches, limits)
4. Invariant checker verifies system state (6 defaults)
5. If allowed: execute via adapter (file/shell/git handlers)
6. Emit lifecycle events: `ACTION_REQUESTED` → `ACTION_ALLOWED/DENIED` → `ACTION_EXECUTED/FAILED`
7. Sink all events to JSONL for audit trail

Key files: `kernel/kernel.ts`, `kernel/aab.ts`, `kernel/decision.ts`, `kernel/monitor.ts`
See `docs/unified-architecture.md` for the full model.

### Directory Layout
Each top-level directory maps to a single architectural concept:
- **src/kernel/** — Governed action kernel, escalation, evidence, decisions, simulation
- **src/events/** — Canonical event model (schema, bus, store, persistence)
- **src/policy/** — Policy evaluator + loaders (YAML/JSON)
- **src/invariants/** — Invariant definitions + checker
- **src/adapters/** — Execution adapters (file, shell, git, claude-code)
- **src/cli/** — CLI entry point and commands
- **src/core/** — Shared utilities (types, actions, hash, execution-log)

### CLI Commands
- `agentguard guard` — Start the governed action runtime (policy + invariant enforcement)
- `agentguard guard --policy <file>` — Use a specific policy file (YAML or JSON)
- `agentguard guard --dry-run` — Evaluate without executing actions
- `agentguard inspect [runId]` — Show action graph and decisions for a run
- `agentguard events [runId]` — Show raw event stream for a run
- `agentguard replay` — Replay a governance session timeline
- `agentguard claude-init` — Set up Claude Code hook integration

### Event Model
The canonical event model is the architectural spine. Key event kinds:
- Governance: `POLICY_DENIED`, `UNAUTHORIZED_ACTION`, `INVARIANT_VIOLATION`
- Lifecycle: `RUN_STARTED`, `RUN_ENDED`, `CHECKPOINT_REACHED`
- Safety: `BLAST_RADIUS_EXCEEDED`, `MERGE_GUARD_FAILURE`, `EVIDENCE_PACK_GENERATED`
- Dev activity: `FILE_SAVED`, `TEST_COMPLETED`, `BUILD_COMPLETED`, `COMMIT_CREATED`

### Build & Module System
TypeScript source compiles via `tsc` (individual modules for tests/imports) + `esbuild` (CLI bundle).

## Coding Conventions

- **camelCase** for functions and variables
- **UPPER_SNAKE_CASE** for constants
- **const/let** only, no `var`
- Arrow functions preferred
- **ESLint** enforced via `eslint.config.js` (flat config): `no-var`, `prefer-const`, `eqeqeq`, `no-undef`
- **Prettier** enforced via `.prettierrc` for consistent formatting
- Run `npm run lint` and `npm run format` before committing
- Node.js ≥18 required

### Configuration

**TypeScript** (`tsconfig.json`):
- Target: ES2022, Module: ESNext, ModuleResolution: bundler
- Strict mode enabled, plus `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- `verbatimModuleSyntax: true` — use `import type` for type-only imports
- Source: `src/`, Output: `dist/`, with declarations and source maps

**Prettier** (`.prettierrc`):
- Single quotes, trailing commas (es5), printWidth 100, tabWidth 2, semicolons

**ESLint** (`eslint.config.js`):
- Flat config with `typescript-eslint` recommended rules
- Key rules: `no-var`, `prefer-const`, `eqeqeq`, `no-undef`, `@typescript-eslint/no-explicit-any: warn`

## Testing

```bash
npm test                   # Run JS tests
npm run ts:test            # Run TypeScript tests (vitest)
npm run ts:test:watch      # Run TypeScript tests in watch mode
npm run test:coverage      # Run with coverage (c8, 50% line threshold)
```

**Test structure:**
- **JS tests** (`tests/*.test.js`): 11+ files using a custom zero-dependency harness (`tests/run.js` with `node:assert`)
- **TypeScript tests** (`tests/ts/*.test.ts`): 34+ files using vitest
- **Coverage areas**: adapters, kernel (AAB, engine, monitor), CLI commands, decision records, domain models, events, evidence packs, execution log, invariants, JSONL persistence, policy evaluation, simulation, YAML loading

## CI/CD & Automation

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `size-check.yml` | PR (ignoring docs/markdown) | Runs linting, type-checking, tests, and size checks |
| `publish.yml` | GitHub Release published | Validates version, runs tests, publishes npm package with provenance |
| `codeql.yml` | PR to `main`/`master` + weekly schedule | CodeQL security analysis |
