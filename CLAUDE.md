# CLAUDE.md — AI Assistant Guide

## Project Overview

**AgentGuard** is a **governed action runtime for AI coding agents**. It intercepts agent tool calls, enforces policies and invariants, executes authorized actions via adapters, and emits lifecycle events. The Action is the primary unit of computation.

The system has one architectural spine: the **canonical event model**. All system activity becomes events. The kernel produces governance events. Subscribers (TUI renderer, SQLite sink, CLI inspect) consume them.

**Key characteristics:**
- Governed action kernel: propose → normalize → evaluate → execute → emit
- 24 built-in invariants (secret exposure, protected branches, blast radius, test-before-push, no force push, no skill modification, no scheduled task modification, credential file creation, package script injection, lockfile integrity, recursive operation guard, large file write, CI/CD config modification, permission escalation, governance self-modification, container config modification, environment variable modification, network egress, destructive migration, transitive effect analysis, IDE socket access, commit scope guard, script execution tracking, no-verify-bypass)
- YAML/JSON policy format with pattern matching, scopes, and branch conditions
- Escalation tracking: NORMAL → ELEVATED → HIGH → LOCKDOWN
- SQLite event persistence for audit trail and replay (JSONL export still supported)
- Claude Code adapter for PreToolUse/PostToolUse hooks
- **pnpm monorepo** with Turbo orchestration: 16 packages under `packages/`, 3 apps under `apps/`
- Each package compiles independently via `tsc`; CLI bundle via `esbuild` in `apps/cli`
- Scoped npm packages: `@red-codes/*` for workspace modules, `@red-codes/agentguard` for published CLI
- CLI has runtime dependencies (`chokidar`, `commander`, `pino`); optional `better-sqlite3` for SQLite storage backend
- Firestore package has been removed from this repo (out of scope for the OSS kernel)
- Build tooling: Turbo + tsc + esbuild + vitest (dev dependencies only)

## Quick Start

```bash
pnpm install         # Install dependencies
pnpm build           # Build all packages (turbo build)

# Governance runtime
echo '{"tool":"Bash","command":"git push origin main"}' | npx @red-codes/agentguard guard --dry-run
npx @red-codes/agentguard guard --policy agentguard.yaml   # Start runtime with policy
npx @red-codes/agentguard inspect --last                   # Inspect most recent run
npx @red-codes/agentguard events --last                    # Show raw event stream
```

## Project Structure

This is a **pnpm monorepo** orchestrated by **Turbo**. Workspace packages live in `packages/`, applications in `apps/`. Each package has its own `src/`, `dist/`, `package.json`, and `tsconfig.json`.

**Top-level documentation**: `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `agentguard.yaml` (default policy)

```
packages/
├── core/src/                   # @red-codes/core — Shared utilities
│   ├── types.ts                # Shared TypeScript type definitions (includes RunManifest)
│   ├── actions.ts              # 41 canonical action types across 10 classes
│   ├── governance-data.ts      # Governance data loader (typed access to shared JSON data)
│   ├── data/                   # JSON governance data (actions, blast-radius, destructive-patterns, escalation, git-action-patterns, invariant-patterns, tool-action-map)
│   ├── hash.ts                 # Content hashing utilities
│   ├── crypto-hash.ts          # Cryptographic hashing (SHA-256)
│   ├── rtk.ts                  # RTK token optimization integration
│   ├── adapters.ts             # Adapter registry interface
│   ├── rng.ts                  # Seeded random number generator
│   ├── persona.ts              # Persona definitions
│   ├── repo-root.ts            # Repository root detection
│   ├── trust-store.ts          # Trust store for policy/hook verification
│   └── execution-log/          # Execution audit log
│       ├── bridge.ts           # Bridge between event systems
│       ├── event-log.ts        # Event logging
│       ├── event-projections.ts # Event projections
│       ├── event-schema.ts     # Event schema definitions
│       └── index.ts            # Module re-exports
├── events/src/                 # @red-codes/events — Canonical event model
│   ├── schema.ts               # Event kinds, factory, validation
│   ├── bus.ts                  # Generic typed EventBus
│   └── store.ts                # In-memory event store
├── policy/src/                 # @red-codes/policy — Policy system
│   ├── composer.ts             # Policy composition (multi-file merging)
│   ├── evaluator.ts            # Rule matching engine
│   ├── loader.ts               # Policy validation + loading
│   ├── pack-loader.ts          # Policy pack loader (community policy sets)
│   ├── pack-version.ts         # Semantic versioning for policy packs
│   ├── policy-trust.ts         # Policy trust verification
│   └── yaml-loader.ts          # YAML policy parser
├── invariants/src/             # @red-codes/invariants — Invariant system
│   ├── definitions.ts          # 24 built-in invariant definitions
│   └── checker.ts              # Invariant evaluation engine
├── matchers/src/               # @red-codes/matchers — Structured matchers (KE-1)
│   ├── path-matcher.ts         # Glob-based path matching (picomatch)
│   ├── command-scanner.ts      # Command pattern scanning (Aho-Corasick)
│   ├── policy-matcher.ts       # Policy rule matching
│   ├── reason-codes.ts         # Machine-readable match result reason codes
│   └── types.ts                # Matcher type definitions
├── kernel/src/                 # @red-codes/kernel — Governed action kernel
│   ├── kernel.ts               # Orchestrator (propose → evaluate → execute → emit)
│   ├── aab.ts                  # Action Authorization Boundary (normalization)
│   ├── blast-radius.ts         # Weighted blast radius computation engine
│   ├── contract.ts             # Kernel contract definitions
│   ├── decision.ts             # Runtime assurance engine
│   ├── monitor.ts              # Escalation state machine
│   ├── evidence.ts             # Evidence pack generation
│   ├── enforcement-audit.ts    # Enforcement audit chain
│   ├── intent.ts               # Intent drift detection
│   ├── tier-router.ts          # Tiered evaluation pipeline routing
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
│   ├── claude-code.ts          # Claude Code hook adapter
│   ├── copilot-cli.ts          # Copilot CLI hook adapter
│   └── hook-integrity.ts       # Hook integrity verification
├── plugins/src/                # @red-codes/plugins — Plugin ecosystem
│   ├── discovery.ts            # Plugin discovery mechanism
│   ├── registry.ts             # Plugin registry
│   ├── sandbox.ts              # Plugin sandboxing
│   ├── simulator-loader.ts     # Simulator plugin loader
│   ├── validator.ts            # Plugin validation
│   ├── types.ts                # Plugin type definitions
│   └── index.ts                # Module re-exports
├── renderers/src/              # @red-codes/renderers — Renderer plugin system
│   ├── registry.ts             # Renderer registry
│   ├── tui-formatters.ts       # TUI formatting helpers
│   ├── tui-renderer.ts         # TUI renderer implementation
│   ├── types.ts                # Renderer type definitions
│   └── index.ts                # Module re-exports
├── storage/src/                # @red-codes/storage — Storage backends (SQLite, opt-in)
│   ├── adoption-analytics.ts   # Adoption analytics engine
│   ├── denial-learner.ts       # Denial pattern learning
│   ├── factory.ts              # Storage bundle factory
│   ├── index.ts                # Module re-exports
│   ├── migrations.ts           # Schema migrations (version-based)
│   ├── sqlite-session.ts       # SQLite session lifecycle (insert on start, update on end)
│   ├── sqlite-sink.ts          # SQLite event/decision sink
│   ├── sqlite-store.ts         # SQLite event store implementation
│   └── types.ts                # Storage type definitions
├── telemetry/src/              # @red-codes/telemetry — Runtime telemetry and logging
├── telemetry-client/src/       # @red-codes/telemetry-client — Telemetry client (identity, signing, queue, sender)
├── swarm/src/                  # @red-codes/swarm — Shareable agent swarm templates
│   ├── config.ts               # Swarm configuration
│   ├── manifest.ts             # Swarm manifest parsing
│   ├── scaffolder.ts           # Swarm scaffolding
│   ├── types.ts                # Swarm type definitions
│   └── index.ts                # Module re-exports
├── sdk/src/                    # @red-codes/sdk — Agent SDK for programmatic governance
│   ├── sdk.ts                  # SDK implementation
│   ├── session.ts              # Session management
│   ├── types.ts                # SDK type definitions
│   └── index.ts                # Module re-exports
├── invariant-data-protection/src/ # @red-codes/invariant-data-protection — Data protection invariant plugin
│   ├── index.ts                # Module re-exports
│   ├── invariants.ts           # Data protection invariant definitions
│   └── patterns.ts             # Data protection patterns
└── scheduler/src/              # @red-codes/scheduler — Task scheduler, queue, lease manager, and worker orchestration
    ├── dispatcher.ts          # Task dispatcher
    ├── lease-manager.ts       # Distributed lease management
    ├── metrics.ts             # Scheduler metrics
    ├── task-store.ts          # Task persistence
    ├── types.ts               # Scheduler type definitions
    └── index.ts               # Module re-exports

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
│   └── commands/               # guard, inspect, replay, export, import, simulate, ci-check, plugin, policy (validate, suggest, verify), claude-hook, claude-init, copilot-hook, copilot-init, cloud, init, diff, evidence-pr, traces, session-viewer, status, analytics, auto-setup, config, audit-verify, demo, adoption, learn, migrate, trust
├── mcp-server/src/             # @red-codes/mcp-server — MCP governance server
│   ├── index.ts                # Entry point
│   ├── server.ts               # MCP server implementation
│   ├── config.ts               # Server configuration
│   ├── backends/               # Storage backends
│   └── tools/                  # 15 governance MCP tools
└── vscode-extension/src/       # agentguard-vscode — VS Code extension
    ├── extension.ts            # Extension entry point (sidebar panels, file watcher)
    ├── providers/              # Tree data providers (run status, run history, recent events)
    └── services/               # Event reader, notification formatter, notification service, diagnostics service, violation mapper

# TS test files (vitest) distributed across packages/ and apps/ directories
policy/                     # Policy configuration (JSON: action_rules, capabilities)
policies/                   # Policy packs (YAML: ci-safe, engineering-standards, enterprise, hipaa, open-source, soc2, strict)
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
4. Invariant checker verifies system state (21 defaults)
5. If allowed: execute via adapter (file/shell/git handlers)
6. Emit lifecycle events: `ACTION_REQUESTED` → `ACTION_ALLOWED/DENIED` → `ACTION_EXECUTED/FAILED`
7. Sink all events to SQLite for audit trail

Key files: `packages/kernel/src/kernel.ts`, `packages/kernel/src/aab.ts`, `packages/kernel/src/decision.ts`, `packages/kernel/src/monitor.ts`
See `docs/unified-architecture.md` for the full model.

### Package Layout
Each workspace package maps to a single architectural concept:
- **packages/kernel/** — Governed action kernel, escalation, evidence, decisions, simulation
- **packages/events/** — Canonical event model (schema, bus, store, persistence)
- **packages/policy/** — Policy evaluator + loaders (YAML/JSON, pack loader, semantic versioning)
- **packages/invariants/** — Invariant definitions + checker
- **packages/matchers/** — Structured matchers for enforcement (Aho-Corasick, globs, hash sets)
- **packages/adapters/** — Execution adapters (file, shell, git, claude-code, copilot-cli)
- **packages/plugins/** — Plugin ecosystem (discovery, registry, validation, sandboxing)
- **packages/renderers/** — Renderer plugin system (registry, TUI renderer)
- **packages/core/** — Shared utilities (types, actions, hash, execution-log)
- **packages/storage/** — Storage backend: SQLite (indexed queries, the only storage backend)
- **packages/telemetry/** — Runtime telemetry and logging
- **packages/telemetry-client/** — Telemetry client (identity, signing, queue, sender)
- **packages/sdk/** — Agent SDK for programmatic governance integration
- **packages/swarm/** — Shareable agent swarm templates (config, manifest, scaffolder)
- **packages/scheduler/** — Task scheduler, queue, lease manager, and worker orchestration for swarm
- **apps/cli/** — CLI entry point and commands (published as `@red-codes/agentguard`)
- **packages/invariant-data-protection/** — Data protection invariant plugin
- **apps/mcp-server/** — MCP governance server (15 governance tools)

### CLI Commands
- `agentguard guard` — Start the governed action runtime (policy + invariant enforcement)
- `agentguard guard --policy <file>` — Use a specific policy file (YAML or JSON)
- `agentguard guard --dry-run` — Evaluate without executing actions
- `agentguard guard --agent-name <name>` — Set agent identity for this session (required; prompts if not set)
- `agentguard inspect [runId]` — Show action graph and decisions for a run
- `agentguard events [runId]` — Show raw event stream for a run
- `agentguard export <runId>` — Export a governance session to a portable JSONL file
- `agentguard import <file>` — Import a governance session from a portable JSONL file
- `agentguard replay` — Replay a governance session timeline
- `agentguard session-viewer [runId]` — Generate interactive HTML dashboard (auto-opens on session end; `--share` for cloud sharing; `--merge-recent <n>` to combine runs)
- `agentguard plugin list|install|remove|enable|disable|search` — Manage plugins
- `agentguard simulate <action-json>` — Simulate an action and display predicted impact without executing
- `agentguard ci-check <session-file>` — CI governance verification (check a session for violations)
- `agentguard policy validate <file>` — Validate a policy file (YAML/JSON)
- `agentguard claude-hook` — Handle Claude Code PreToolUse/PostToolUse hook events
- `agentguard claude-init` — Set up Claude Code hook integration
- `agentguard diff <run1> <run2>` — Compare two governance sessions side-by-side
- `agentguard evidence-pr` — Attach governance evidence summary to a pull request
- `agentguard traces [runId]` — Display policy evaluation traces for a run
- `agentguard init <type>` — Scaffold governance extensions (invariant, policy-pack, adapter, renderer, replay-processor)
- `agentguard status` — Show current governance session status
- `agentguard policy verify <file>` — Verify policy file structure and rules
- `agentguard analytics` — Analyze violation patterns across sessions
- `agentguard auto-setup` — Auto-detect AgentGuard and configure Claude Code hooks
- `agentguard config show|get|set|path|keys` — Manage AgentGuard configuration
- `agentguard audit-verify` — Verify tamper-resistant audit chain integrity
- `agentguard demo` — Interactive governance showcase
- `agentguard adoption` — Adoption metrics and onboarding status
- `agentguard learn` — Interactive tutorials and learning paths
- `agentguard migrate` — Migrate configuration between versions
- `agentguard trust` — Manage policy and hook trust verification
- `agentguard cloud login|signup|connect|status|events|runs|summary|disconnect` — Cloud governance analytics
- `agentguard copilot-hook` — Handle GitHub Copilot PreToolUse/PostToolUse hook events
- `agentguard copilot-init` — Set up GitHub Copilot hook integration
- `agentguard team-report` — Team-level governance observability across agents
- `agentguard telemetry [on|off|status]` — Manage anonymous telemetry settings

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
- **Token Optimization**: `TokenOptimizationApplied`
- **Heartbeat**: `HeartbeatEmitted`, `HeartbeatMissed`, `AgentUnresponsive`
- **Integrity & Trust**: `HookIntegrityVerified`, `HookIntegrityFailed`, `PolicyTrustVerified`, `PolicyTrustDenied`
- **Adoption Analytics**: `AdoptionAnalyzed`, `AdoptionAnalysisFailed`
- **Denial Learning**: `DenialPatternDetected`
- **Intent Drift**: `IntentDriftDetected`
- **Capability Validation**: `CapabilityValidated`
- **Environmental Enforcement**: `IdeSocketAccessBlocked`

### Action Classes & Types
41 canonical action types across 10 classes, defined in `packages/core/src/actions.ts`:
- **file**: `file.read`, `file.write`, `file.delete`, `file.move`
- **test**: `test.run`, `test.run.unit`, `test.run.integration`
- **git**: `git.diff`, `git.commit`, `git.push`, `git.force-push`, `git.branch.create`, `git.branch.delete`, `git.checkout`, `git.reset`, `git.merge`, `git.worktree.add`, `git.worktree.remove`, `git.worktree.list`
- **shell**: `shell.exec`
- **npm**: `npm.install`, `npm.script.run`, `npm.publish`
- **http**: `http.request`
- **deploy**: `deploy.trigger`
- **infra**: `infra.apply`, `infra.destroy`
- **github**: `github.pr.list`, `github.pr.create`, `github.pr.merge`, `github.pr.close`, `github.pr.view`, `github.pr.checks`, `github.issue.list`, `github.issue.create`, `github.issue.close`, `github.release.create`, `github.run.list`, `github.run.view`, `github.api`
- **mcp**: `mcp.call`

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
- **TypeScript tests** (distributed across `packages/*/tests/` and `apps/*/tests/`): vitest
- **Coverage areas**: adapters (file, git, shell, claude-code, copilot-cli, hook integrity), kernel (AAB, engine, monitor, blast radius, heartbeat, integration, e2e pipeline, conformance, tiers, intent drift, enforcement audit, interventions), CLI commands (args, guard, inspect, init, simulate, ci-check, claude-hook, claude-init, export/import, policy-validate, policy-verify, diff, evidence-pr, traces, plugin, auto-setup, config, demo, migrate), decision records, domain models, events, evidence packs (explainable, explanation chain), evidence summary, execution log, export-import roundtrip, impact forecast, invariants, matchers (path-matcher, command-scanner, policy-matcher, benchmark), notification formatter, plugins (discovery, registry, sandbox, validation), policy evaluation (including composer, pack loader, policy packs, evaluation trace, forecast conditions, gate conditions, persona, trust, pack versioning), renderers, replay (engine, comparator, processor), simulation (filesystem, git, package, dependency graph), SQLite storage (migrations, session, sink, store, cross-run, factory, aggregation queries, commands), swarm (scaffolder, config, manifest), telemetry (event queue, event sender, anonymize, cloud sink, event mapper), TUI renderer, violation mapper, VS Code event reader, YAML loading

## CI/CD & Automation

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `size-check.yml` | PR (ignoring docs/markdown) | Runs linting, type-checking, tests, and size checks |
| `publish.yml` | GitHub Release published | Validates version, runs tests, publishes npm package with provenance |
| `agentguard-governance.yml` | Reusable workflow (called from other repos) | CI governance verification for sessions |
| `codeql.yml` | PR to `main`/`master` + weekly schedule | CodeQL security analysis |
| `deploy-pages.yml` | Push to `main` (paths: `site/**`) | Deploys site directory to GitHub Pages |
| `bench-regression-gate.yml` | PR / scheduled | Performance benchmark regression gate |


## Agent Identity

At session start, if you see `[AgentGuard] No agent identity set`, ask the user:
1. **Role**: developer / reviewer / ops / security / ci
2. **Driver**: human / claude-code / copilot / ci

Then run: `scripts/write-persona.sh <driver> <role>`
