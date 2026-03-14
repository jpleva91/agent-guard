# CLAUDE.md — AI Assistant Guide

## Project Overview

**AgentGuard** is a **governed action runtime for AI coding agents**. It intercepts agent tool calls, enforces policies and invariants, executes authorized actions via adapters, and emits lifecycle events. The Action is the primary unit of computation.

The system has one architectural spine: the **canonical event model**. All system activity becomes events. The kernel produces governance events. Subscribers (TUI renderer, JSONL sink, CLI inspect) consume them.

**Key characteristics:**
- Governed action kernel: propose → normalize → evaluate → execute → emit
- 10 built-in invariants (secret exposure, protected branches, blast radius, test-before-push, no force push, no skill modification, no scheduled task modification, credential file creation, package script injection, lockfile integrity)
- YAML/JSON policy format with pattern matching, scopes, and branch conditions
- Escalation tracking: NORMAL → ELEVATED → HIGH → LOCKDOWN
- JSONL event persistence for audit trail and replay
- Claude Code adapter for PreToolUse/PostToolUse hooks
- **pnpm monorepo** with Turbo orchestration: 15 packages under `packages/`, 3 apps under `apps/`
- Each package compiles independently via `tsc`; CLI bundle via `esbuild` in `apps/cli`
- Scoped npm packages: `@red-codes/*` for workspace modules, `@red-codes/agentguard` for published CLI
- CLI has runtime dependencies (`chokidar`, `commander`, `pino`); optional `better-sqlite3` for SQLite storage backend; optional Firestore for cloud-based governance data sharing
- Build tooling: Turbo + tsc + esbuild + vitest (dev dependencies only)

## Quick Start

```bash
pnpm install         # Install dependencies
pnpm build           # Build all packages (turbo build)

# Governance runtime
echo '{"tool":"Bash","command":"git push origin main"}' | npx agentguard guard --dry-run
npx agentguard guard --policy agentguard.yaml   # Start runtime with policy
npx agentguard inspect --last                   # Inspect most recent run
npx agentguard events --last                    # Show raw event stream
```

## Project Structure

This is a **pnpm monorepo** orchestrated by **Turbo**. Workspace packages live in `packages/`, applications in `apps/`. Each package has its own `src/`, `dist/`, `package.json`, and `tsconfig.json`.

**Top-level documentation**: `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `agentguard.yaml` (default policy)

```
packages/
├── core/src/                   # @red-codes/core — Shared utilities
│   ├── types.ts                # Shared TypeScript type definitions
│   ├── actions.ts              # 23 canonical action types across 8 classes
│   ├── hash.ts                 # Content hashing utilities
│   ├── adapters.ts             # Adapter registry interface
│   ├── rng.ts                  # Seeded random number generator
│   └── execution-log/          # Execution audit log
│       ├── bridge.ts           # Bridge between event systems
│       ├── event-log.ts        # Event logging
│       ├── event-projections.ts # Event projections
│       ├── event-schema.ts     # Event schema definitions
│       └── index.ts            # Module re-exports
├── events/src/                 # @red-codes/events — Canonical event model
│   ├── schema.ts               # Event kinds, factory, validation
│   ├── bus.ts                  # Generic typed EventBus
│   ├── store.ts                # In-memory event store
│   ├── jsonl.ts                # JSONL event persistence (audit trail)
│   └── decision-jsonl.ts       # Decision record persistence
├── policy/src/                 # @red-codes/policy — Policy system
│   ├── composer.ts             # Policy composition (multi-file merging)
│   ├── evaluator.ts            # Rule matching engine
│   ├── loader.ts               # Policy validation + loading
│   ├── pack-loader.ts          # Policy pack loader (community policy sets)
│   └── yaml-loader.ts          # YAML policy parser
├── invariants/src/             # @red-codes/invariants — Invariant system
│   ├── definitions.ts          # 10 built-in invariant definitions
│   └── checker.ts              # Invariant evaluation engine
├── kernel/src/                 # @red-codes/kernel — Governed action kernel
│   ├── kernel.ts               # Orchestrator (propose → evaluate → execute → emit)
│   ├── aab.ts                  # Action Authorization Boundary (normalization)
│   ├── blast-radius.ts         # Weighted blast radius computation engine
│   ├── decision.ts             # Runtime assurance engine
│   ├── monitor.ts              # Escalation state machine
│   ├── evidence.ts             # Evidence pack generation
│   ├── replay-comparator.ts    # Replay outcome comparison
│   ├── replay-engine.ts        # Deterministic replay engine
│   ├── replay-processor.ts     # Replay event processor
│   ├── heartbeat.ts            # Agent heartbeat monitor
│   ├── decisions/              # Typed decision records
│   │   ├── factory.ts          # Decision record factory
│   │   └── types.ts            # Decision record type definitions
│   └── simulation/             # Pre-execution impact simulation
│       ├── filesystem-simulator.ts  # File system impact simulation
│       ├── git-simulator.ts         # Git operation simulation
│       ├── package-simulator.ts     # Package change simulation
│       ├── forecast.ts              # Impact forecast builder
│       ├── registry.ts              # Simulator registry
│       └── types.ts                 # Simulation type definitions
├── adapters/src/               # @red-codes/adapters — Execution adapters
│   ├── registry.ts             # Adapter registry (action class → handler)
│   ├── file.ts, shell.ts, git.ts  # Action handlers
│   └── claude-code.ts          # Claude Code hook adapter
├── analytics/src/              # @red-codes/analytics — Cross-session violation analytics
│   ├── aggregator.ts           # Violation aggregation across sessions
│   ├── cluster.ts              # Violation clustering by dimension
│   ├── engine.ts               # Analytics engine orchestrator
│   ├── index.ts                # Module re-exports
│   ├── reporter.ts             # Output formatters (terminal, JSON, markdown)
│   ├── risk-scorer.ts          # Per-run risk scoring engine
│   ├── trends.ts               # Violation trend computation
│   └── types.ts                # Analytics type definitions
├── plugins/src/                # @red-codes/plugins — Plugin ecosystem
│   ├── discovery.ts            # Plugin discovery mechanism
│   ├── registry.ts             # Plugin registry
│   ├── sandbox.ts              # Plugin sandboxing
│   ├── validator.ts            # Plugin validation
│   ├── types.ts                # Plugin type definitions
│   └── index.ts                # Module re-exports
├── renderers/src/              # @red-codes/renderers — Renderer plugin system
│   ├── registry.ts             # Renderer registry
│   ├── tui-renderer.ts         # TUI renderer implementation
│   ├── types.ts                # Renderer type definitions
│   └── index.ts                # Module re-exports
├── storage/src/                # @red-codes/storage — Storage backends (SQLite + Firestore, opt-in)
│   ├── factory.ts              # Storage bundle factory
│   ├── index.ts                # Module re-exports
│   ├── migrations.ts           # Schema migrations (version-based)
│   ├── sqlite-analytics.ts     # SQLite-backed analytics queries
│   ├── sqlite-session.ts       # SQLite session lifecycle (insert on start, update on end)
│   ├── sqlite-sink.ts          # SQLite event/decision sink
│   ├── sqlite-store.ts         # SQLite event store implementation
│   ├── firestore-analytics.ts  # Firestore-backed analytics queries
│   ├── firestore-sink.ts       # Firestore event/decision sink
│   ├── firestore-store.ts      # Firestore event store implementation
│   └── types.ts                # Storage type definitions
├── telemetry/src/              # @red-codes/telemetry — Runtime telemetry
│   ├── index.ts                # Module re-exports
│   ├── runtimeLogger.ts        # Runtime logging implementation
│   ├── tracepoint.ts           # Kernel-level tracepoint interface
│   ├── tracer.ts               # Tracepoint execution engine
│   └── types.ts                # Telemetry type definitions
├── runtime/src/                # @red-codes/runtime — Agent runtime (placeholder)
├── sentinel01/src/             # @red-codes/sentinel01 — Robotics/edge module (placeholder)
├── adapter-openclaw/src/       # @red-codes/adapter-openclaw — OpenClaw adapter (placeholder)
└── telemetry-client/src/       # @red-codes/telemetry-client — Telemetry client (placeholder)

apps/
├── cli/src/                    # @red-codes/agentguard — CLI (published npm package)
│   ├── bin.ts                  # CLI entry point
│   ├── args.ts                 # Argument parsing utilities
│   ├── colors.ts               # Terminal color helpers
│   ├── tui.ts                  # TUI renderer (terminal action stream)
│   ├── policy-resolver.ts      # Policy file discovery and resolution
│   ├── recorder.ts             # Event recording
│   ├── replay.ts               # Session replay logic
│   ├── session-store.ts        # Session management
│   ├── file-event-store.ts     # File-based event persistence
│   ├── evidence-summary.ts     # Evidence summary generator for PR reports
│   └── commands/               # analytics, guard, inspect, replay, export, import, simulate, ci-check, plugin, policy, claude-hook, claude-init, init, diff, evidence-pr, traces
├── vscode-extension/src/       # agentguard-vscode — VS Code extension
│   ├── extension.ts            # Extension entry point (sidebar panels, file watcher)
│   ├── providers/              # Tree data providers (run status, run history, recent events)
│   └── services/               # Event reader, notification formatter, notification service, diagnostics service, violation mapper
└── telemetry-server/src/       # @red-codes/telemetry-server — Telemetry server (placeholder)

tests/
├── *.test.js               # 14 JS test files (custom zero-dependency harness)
└── ts/*.test.ts            # 77 TS test files (vitest)
policy/                     # Policy configuration (JSON: action_rules, capabilities)
policies/                   # Policy packs (YAML: ci-safe, enterprise, open-source, strict)
docs/                       # System documentation (architecture, event model, specs)
hooks/                      # Git hooks (post-commit, post-merge)
examples/                   # Example governance scenarios and error demos
logs/                       # Runtime telemetry logs (runtime-events.jsonl)
paper/                      # White paper (agentguard-whitepaper.md, diagrams, references)
scripts/                    # Build and utility scripts
site/                       # GitHub Pages static site
spec/                       # Feature specifications and templates
templates/                  # Policy templates (ci-only, development, permissive, strict)
```

## Development Commands

```bash
# Build all packages (Turbo orchestrates per-package tsc + esbuild for CLI)
pnpm build                 # Build all packages (turbo build)
pnpm ts:check              # Type-check all packages (turbo ts:check)

# Run tests
pnpm test                  # Run all tests across workspace (turbo test)

# Code quality
pnpm lint                  # Run ESLint across all packages (turbo lint)
pnpm format                # Check formatting (Prettier)
pnpm format:fix            # Fix formatting (Prettier)

# Per-package filtering
pnpm build --filter=@red-codes/kernel     # Build a single package
pnpm test --filter=@red-codes/kernel      # Test a single package

# Run AgentGuard CLI
pnpm dev
```

## Architecture & Key Patterns

### Governed Action Kernel
The kernel loop is the core of AgentGuard. Every agent action passes through it:
1. Agent proposes action (Claude Code tool call → `RawAgentAction`)
2. AAB normalizes intent (tool → action type, detect git/destructive commands)
3. Policy evaluator matches rules (deny/allow with scopes, branches, limits)
4. Invariant checker verifies system state (10 defaults)
5. If allowed: execute via adapter (file/shell/git handlers)
6. Emit lifecycle events: `ACTION_REQUESTED` → `ACTION_ALLOWED/DENIED` → `ACTION_EXECUTED/FAILED`
7. Sink all events to JSONL for audit trail

Key files: `packages/kernel/src/kernel.ts`, `packages/kernel/src/aab.ts`, `packages/kernel/src/decision.ts`, `packages/kernel/src/monitor.ts`
See `docs/unified-architecture.md` for the full model.

### Package Layout
Each workspace package maps to a single architectural concept:
- **packages/analytics/** — Cross-session violation analytics (aggregation, clustering, trends, risk scoring, reporting)
- **packages/kernel/** — Governed action kernel, escalation, evidence, decisions, simulation
- **packages/events/** — Canonical event model (schema, bus, store, persistence)
- **packages/policy/** — Policy evaluator + loaders (YAML/JSON, pack loader)
- **packages/invariants/** — Invariant definitions + checker
- **packages/adapters/** — Execution adapters (file, shell, git, claude-code)
- **packages/plugins/** — Plugin ecosystem (discovery, registry, validation, sandboxing)
- **packages/renderers/** — Renderer plugin system (registry, TUI renderer)
- **apps/cli/** — CLI entry point and commands (published as `@red-codes/agentguard`)
- **packages/core/** — Shared utilities (types, actions, hash, execution-log)
- **packages/storage/** — Storage backends: SQLite and Firestore (opt-in alternatives to JSONL, indexed queries)
- **packages/telemetry/** — Runtime telemetry and logging

### CLI Commands
- `agentguard analytics` — Analyze violation patterns across governance sessions
- `agentguard guard` — Start the governed action runtime (policy + invariant enforcement)
- `agentguard guard --policy <file>` — Use a specific policy file (YAML or JSON)
- `agentguard guard --dry-run` — Evaluate without executing actions
- `agentguard inspect [runId]` — Show action graph and decisions for a run
- `agentguard events [runId]` — Show raw event stream for a run
- `agentguard export <runId>` — Export a governance session to a portable JSONL file
- `agentguard import <file>` — Import a governance session from a portable JSONL file
- `agentguard replay` — Replay a governance session timeline
- `agentguard plugin list|install|remove|search` — Manage plugins
- `agentguard simulate <action-json>` — Simulate an action and display predicted impact without executing
- `agentguard ci-check <session-file>` — CI governance verification (check a session for violations)
- `agentguard policy validate <file>` — Validate a policy file (YAML/JSON)
- `agentguard claude-hook` — Handle Claude Code PreToolUse/PostToolUse hook events
- `agentguard claude-init` — Set up Claude Code hook integration
- `agentguard diff <run1> <run2>` — Compare two governance sessions side-by-side
- `agentguard evidence-pr` — Attach governance evidence summary to a pull request
- `agentguard traces [runId]` — Display policy evaluation traces for a run
- `agentguard init <type>` — Scaffold governance extensions (invariant, policy-pack, adapter, renderer, replay-processor, firestore)

### Event Model
The canonical event model is the architectural spine. Event kinds defined in `packages/events/src/schema.ts`:
- **Governance**: `PolicyDenied`, `UnauthorizedAction`, `InvariantViolation`
- **Lifecycle**: `RunStarted`, `RunEnded`, `CheckpointReached`, `StateChanged`
- **Safety**: `BlastRadiusExceeded`, `MergeGuardFailure`, `EvidencePackGenerated`
- **Reference Monitor**: `ActionRequested`, `ActionAllowed`, `ActionDenied`, `ActionEscalated`, `ActionExecuted`, `ActionFailed`
- **Decision & Simulation**: `DecisionRecorded`, `SimulationCompleted`
- **Policy Composition**: `PolicyComposed`
- **Policy Traces**: `PolicyTraceRecorded`
- **Pipeline**: `PipelineStarted`, `StageCompleted`, `StageFailed`, `PipelineCompleted`, `PipelineFailed`, `FileScopeViolation`
- **Dev activity**: `FileSaved`, `TestCompleted`, `BuildCompleted`, `CommitCreated`, `CodeReviewed`, `DeployCompleted`, `LintCompleted`
- **Heartbeat**: `HeartbeatEmitted`, `HeartbeatMissed`, `AgentUnresponsive`
- **Battle lifecycle**: `ENCOUNTER_STARTED`, `MOVE_USED`, `DAMAGE_DEALT`, `HEALING_APPLIED`, `PASSIVE_ACTIVATED`, `BUGMON_FAINTED`, `CACHE_ATTEMPTED`, `CACHE_SUCCESS`, `BATTLE_ENDED`
- **Ingestion**: `ErrorObserved`, `BugClassified`, `ActivityRecorded`, `EvolutionTriggered`

### Action Classes & Types
23 canonical action types across 8 classes, defined in `packages/core/src/actions.ts`:
- **file**: `file.read`, `file.write`, `file.delete`, `file.move`
- **test**: `test.run`, `test.run.unit`, `test.run.integration`
- **git**: `git.diff`, `git.commit`, `git.push`, `git.branch.create`, `git.branch.delete`, `git.checkout`, `git.reset`, `git.merge`
- **shell**: `shell.exec`
- **npm**: `npm.install`, `npm.script.run`, `npm.publish`
- **http**: `http.request`
- **deploy**: `deploy.trigger`
- **infra**: `infra.apply`, `infra.destroy`

### Build & Module System
Turbo orchestrates per-package `tsc` builds (incremental via TypeScript project references). The CLI app (`apps/cli`) is additionally bundled via `esbuild`. Workspace imports use `@red-codes/*` scoped package names.

## Coding Conventions

- **camelCase** for functions and variables
- **UPPER_SNAKE_CASE** for constants
- **const/let** only, no `var`
- Arrow functions preferred
- **ESLint** enforced via `eslint.config.js` (flat config): `no-var`, `prefer-const`, `eqeqeq`, `no-undef`
- **Prettier** enforced via `.prettierrc` for consistent formatting
- Run `pnpm lint` and `pnpm format` before committing
- Node.js ≥18 required

### Configuration

**TypeScript** (`tsconfig.base.json` + per-package `tsconfig.json`):
- Root `tsconfig.base.json` defines shared compiler options; each package extends it
- Root `tsconfig.json` declares project references for all packages and apps
- Target: ES2022, Module: ESNext, ModuleResolution: bundler
- Strict mode enabled, plus `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- `verbatimModuleSyntax: true` — use `import type` for type-only imports
- Each package has its own `src/` → `dist/` with declarations and source maps

**Prettier** (`.prettierrc`):
- Single quotes, trailing commas (es5), printWidth 100, tabWidth 2, semicolons

**ESLint** (`eslint.config.js`):
- Flat config with `typescript-eslint` recommended rules
- Key rules: `no-var`, `prefer-const`, `eqeqeq`, `no-undef`, `@typescript-eslint/no-explicit-any: warn`

## Testing

```bash
pnpm test                  # Run all tests across workspace (turbo test)
pnpm test --filter=@red-codes/kernel  # Test a single package
```

**Test structure:**
- **Vitest workspace** (`vitest.workspace.ts`): orchestrates tests across all packages
- **JS tests** (`tests/*.test.js`): 14 files using a custom zero-dependency harness (`tests/run.js` with `node:assert`)
- **TypeScript tests** (`tests/ts/*.test.ts`): 77 files using vitest
- **Coverage areas**: adapters, analytics (including risk scorer), kernel (AAB, engine, monitor, blast radius, heartbeat, integration, e2e pipeline), CLI commands (args, guard, inspect, init, simulate, ci-check, claude-hook, claude-init, export/import, policy-validate, diff, evidence-pr, traces), decision records, domain models, events, evidence packs, evidence summary, execution log, export-import roundtrip, impact forecast, invariants, JSONL persistence, notification formatter, plugins (discovery, registry, validation), policy evaluation (including composer, pack loader, policy packs, evaluation trace), renderers, replay (engine, comparator, processor), simulation, SQLite storage (analytics, commands, migrations, session, sink, store, factory), Firestore storage, telemetry (including tracepoint), TUI renderer, violation mapper, VS Code event reader, YAML loading

## CI/CD & Automation

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `size-check.yml` | PR (ignoring docs/markdown) | Runs linting, type-checking, tests, and size checks |
| `publish.yml` | GitHub Release published | Validates version, runs tests, publishes npm package with provenance |
| `agentguard-governance.yml` | Reusable workflow (called from other repos) | CI governance verification for sessions |
| `codeql.yml` | PR to `main`/`master` + weekly schedule | CodeQL security analysis |
| `deploy-pages.yml` | Push to `main` (paths: `site/**`) | Deploys site directory to GitHub Pages |
