# Architecture Contract

## Layers

TypeScript in `src/` is the single source of truth, compiled to `dist/` via tsc + esbuild.

```
                ┌──────────┐
                │ src/cli/ │
                │ (Node.js │
                │   CLI)   │
                └────┬─────┘
                     │
           ┌─────────┼───────────────────────┐
           │         ▼                        │
           │    ┌────────────────────────┐    │
           │    │   src/kernel/          │    │
           │    │  (Governance runtime)  │    │
           │    └────────────────────────┘    │
           │                                  │
           │    ┌────────────────────────┐    │
           │    │   src/policy/          │    │
           │    │  (Policy evaluation)   │    │
           │    └────────────────────────┘    │
           │                                  │
           │    ┌────────────────────────┐    │
           │    │   src/invariants/      │    │
           │    │  (Invariant checking)  │    │
           │    └────────────────────────┘    │
           │                                  │
           │    ┌────────────────────────┐    │
           │    │   src/adapters/        │    │
           │    │  (Execution adapters)  │    │
           │    └────────────────────────┘    │
           │                                  │
           │    ┌────────────────────────┐    │
           │    │   src/events/          │    │
           │    │  (Canonical events)    │    │
           │    └────────────────────────┘    │
           │                                  │
           │    ┌────────────────────────┐    │
           │    │   src/core/            │    │
           │    │  (Shared logic)        │    │
           │    └────────────────────────┘    │
           └──────────────────────────────────┘
```

### src/kernel/ — Governance Runtime

Orchestrates the governed action loop: propose, normalize, evaluate, execute, emit. Contains:

- `kernel.ts` — Governed action kernel (orchestrator)
- `monitor.ts` — Runtime monitor (escalation tracking: NORMAL → ELEVATED → HIGH → LOCKDOWN)

### src/events/ — Canonical Events

All system activity becomes events conforming to a single schema. Contains:

- `events.ts` — Canonical event schema (50+ event kinds) and factory
- `event-bus.ts` — Universal pub/sub (typed EventBus)
- `event-store.ts` — Event persistence interface

### src/policy/ — Policy Evaluation

YAML/JSON policy format with pattern matching, scopes, and branch conditions. Contains:

- `evaluator.ts` — Policy evaluation (deny/allow with scopes, branches, limits)
- `loader.ts` — Policy loading from JSON/YAML

### src/invariants/ — Invariant Checking

6 built-in invariants enforced before action execution. Contains:

- `checker.ts` — Invariant checking engine
- `definitions.ts` — Built-in invariant definitions (secret exposure, protected branches, blast radius, test-before-push, no force push, lockfile integrity)

### src/adapters/ — Execution Adapters

Action class to handler mapping. Contains:

- `file.ts` — File system adapter
- `shell.ts` — Shell command adapter
- `git.ts` — Git operations adapter
- `claude-code.ts` — Claude Code hook adapter (PreToolUse/PostToolUse)
- `registry.ts` — Adapter registry

### src/core/ — Shared Logic

Shared utilities used across layers. Contains:

- `hash.ts` — Hashing utilities
- `actions.ts` — Canonical action types
- `adapters.ts` — Adapter type definitions
- `execution-log/` — Execution event log with causal chains

### src/cli/ — CLI (Node.js)

Commander-based CLI for AgentGuard commands. Contains:

- `bin.ts` — Entry point (agentguard binary)
- `commands/` — Subcommands (guard, inspect, replay, claude-hook)
- `recorder.ts` — Event recording
- `file-event-store.ts` — JSONL event persistence
- `tui.ts` — Terminal UI renderer

## Dependency Rules

1. **src/core/ depends on nothing** — it is the pure foundation
2. **src/events/ depends on core/** — canonical event definitions
3. **src/policy/ depends on core/, events/** — policy evaluation layer
4. **src/invariants/ depends on core/, events/** — invariant checking layer
5. **src/adapters/ depends on core/, events/** — execution adapters
6. **src/kernel/ depends on core/, events/, policy/, invariants/, adapters/** — orchestrator
7. **src/cli/ depends on all layers** — user-facing entry point
8. **No circular dependencies** between any layers

## Module System

All source uses ES6 `import`/`export` with TypeScript. `verbatimModuleSyntax: true` — use `import type` for type-only imports.

## Data Flow

```
Agent Tool Call (Claude Code PreToolUse/PostToolUse hook)
    → src/kernel/ (normalize → evaluate → execute → emit)
    → Canonical Event (src/events/ schema)
    → EventBus
    → Subscribers (TUI Renderer, JSONL Sink, CLI Inspect)
```
