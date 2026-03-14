# Architecture

## Architectural Thesis

The system has a single architectural spine: the **canonical event model**.

All system activity — agent tool calls, governance decisions, invariant violations, escalation state changes — is normalized into structured events. AgentGuard enforces deterministic execution constraints on AI coding agents through a governed action kernel that produces a complete audit trail.

## System Diagram

```
┌──────────────┐
│  AI Agent     │  (Claude Code, etc.)
│  Tool Call    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│              AgentGuard Kernel                │
│                                              │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
│  │   AAB   │→ │  Policy  │→ │ Invariants │  │
│  │normalize│  │ evaluate │  │   check    │  │
│  └─────────┘  └──────────┘  └────────────┘  │
│       │                           │          │
│       ▼                           ▼          │
│  ┌─────────┐              ┌────────────┐     │
│  │ Execute │              │  Escalate  │     │
│  │ Adapter │              │  if needed │     │
│  └─────────┘              └────────────┘     │
│       │                                      │
│       ▼                                      │
│  ┌──────────────────────┐                    │
│  │   Event Stream       │                    │
│  │   (JSONL audit trail)│                    │
│  └──────────────────────┘                    │
└──────────────────────────────────────────────┘
```

## Package Layout

This is a **pnpm monorepo** orchestrated by **Turbo**. Each workspace package maps to a single architectural concept:

```
packages/
├── core/          @red-codes/core — Shared utilities (types, actions, hash, execution-log)
├── events/        @red-codes/events — Canonical event model (schema, bus, store, JSONL persistence)
├── policy/        @red-codes/policy — Policy system (composer, evaluator, loaders, pack loader)
├── invariants/    @red-codes/invariants — Invariant system (10 built-in definitions, checker)
├── kernel/        @red-codes/kernel — Governed action kernel (orchestrate, normalize, decide, escalate)
├── adapters/      @red-codes/adapters — Execution adapters (file, shell, git, claude-code)
├── analytics/     @red-codes/analytics — Cross-session violation analytics
├── storage/       @red-codes/storage — SQLite and Firestore backends (opt-in)
├── telemetry/     @red-codes/telemetry — Runtime telemetry and logging
├── plugins/       @red-codes/plugins — Plugin ecosystem (discovery, registry, validation, sandboxing)
└── renderers/     @red-codes/renderers — Renderer plugin system (registry, TUI renderer)

apps/
├── cli/           @red-codes/agentguard — CLI entry point and commands (published npm package)
├── vscode-extension/  agentguard-vscode — VS Code extension (sidebar panels, notifications, diagnostics)
└── telemetry-server/  Telemetry server (placeholder)

policies/          Policy packs (YAML: ci-safe, enterprise, open-source, strict)
```

## Layer Rules

Package boundaries enforce these dependency rules via `package.json` workspace dependencies:

- **@red-codes/kernel** may import from events, policy, invariants, telemetry, core
- **@red-codes/events** may import from core only
- **@red-codes/policy** may import from core only
- **@red-codes/invariants** may import from core, events only
- **@red-codes/adapters** may import from core, kernel only
- **@red-codes/plugins** may import from core only
- **@red-codes/renderers** may import from core, kernel, plugins only
- **@red-codes/analytics** may import from core only
- **@red-codes/storage** may import from core, events, kernel, analytics, telemetry only
- **@red-codes/agentguard** (cli) may import from all workspace packages
- **@red-codes/telemetry** may import from core only
- **@red-codes/core** has no project imports (leaf layer)

## Key Design Decisions

1. **Action as primary unit** — Every agent tool call becomes a canonical Action with type, target, and justification
2. **Deterministic evaluation** — Policy matching and invariant checking are pure functions with no side effects
3. **Event-sourced audit** — Every decision is recorded; runs are fully replayable from JSONL
4. **Escalation state machine** — Repeated violations escalate: NORMAL → ELEVATED → HIGH → LOCKDOWN
5. **Adapter pattern** — Execution is abstracted behind adapters, making the kernel testable without real file/git operations
