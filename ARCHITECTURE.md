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

## Directory Layout

Each top-level directory under `src/` maps to a single architectural concept:

```
src/
├── analytics/     Cross-session violation analytics (aggregation, clustering, trends, risk scoring)
├── kernel/        Governed action kernel (orchestrate, normalize, decide, escalate)
├── events/        Canonical event model (schema, bus, store, JSONL persistence)
├── policy/        Policy system (composer, evaluator, loaders, pack loader)
├── invariants/    Invariant system (8 built-in definitions, checker)
├── adapters/      Execution adapters (file, shell, git, claude-code)
├── plugins/       Plugin ecosystem (discovery, registry, validation, sandboxing)
├── renderers/     Renderer plugin system (registry, TUI renderer)
├── cli/           CLI entry point and commands
├── telemetry/     Runtime telemetry and logging
└── core/          Shared utilities (types, actions, hash, execution-log)

vscode-extension/  VS Code extension (sidebar panels, notifications, event reader, inline diagnostics)

policies/          Policy packs (YAML: ci-safe, enterprise, open-source, strict)
```

## Layer Rules

- **kernel/** may import from events/, policy/, invariants/, adapters/, core/
- **events/** may import from core/ only
- **policy/** may import from core/ only
- **invariants/** may import from core/, events/ only
- **adapters/** may import from core/, kernel/ only
- **plugins/** may import from core/, events/, kernel/ only
- **renderers/** may import from core/, events/ only
- **analytics/** may import from events/, core/ only
- **cli/** may import from analytics/, kernel/, events/, policy/, plugins/, renderers/, core/
- **telemetry/** may import from core/ only
- **core/** has no project imports (leaf layer)

## Key Design Decisions

1. **Action as primary unit** — Every agent tool call becomes a canonical Action with type, target, and justification
2. **Deterministic evaluation** — Policy matching and invariant checking are pure functions with no side effects
3. **Event-sourced audit** — Every decision is recorded; runs are fully replayable from JSONL
4. **Escalation state machine** — Repeated violations escalate: NORMAL → ELEVATED → HIGH → LOCKDOWN
5. **Adapter pattern** — Execution is abstracted behind adapters, making the kernel testable without real file/git operations
