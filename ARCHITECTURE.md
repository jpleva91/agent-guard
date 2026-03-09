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
├── kernel/        Governed action kernel (orchestrate, normalize, decide, escalate)
├── events/        Canonical event model (schema, bus, store, JSONL persistence)
├── policy/        Policy system (evaluator, loaders)
├── invariants/    Invariant system (6 built-in definitions, checker)
├── adapters/      Execution adapters (file, shell, git, claude-code)
├── cli/           CLI entry point and commands
└── core/          Shared utilities (types, actions, hash, execution-log)
```

## Layer Rules

- **kernel/** may import from events/, policy/, invariants/, adapters/, core/
- **events/** may import from core/ only
- **policy/** may import from core/ only
- **invariants/** may import from core/, events/ only
- **adapters/** may import from core/, kernel/ only
- **cli/** may import from kernel/, events/, policy/, core/
- **core/** has no project imports (leaf layer)

## Key Design Decisions

1. **Action as primary unit** — Every agent tool call becomes a canonical Action with type, target, and justification
2. **Deterministic evaluation** — Policy matching and invariant checking are pure functions with no side effects
3. **Event-sourced audit** — Every decision is recorded; runs are fully replayable from JSONL
4. **Escalation state machine** — Repeated violations escalate: NORMAL → ELEVATED → HIGH → LOCKDOWN
5. **Adapter pattern** — Execution is abstracted behind adapters, making the kernel testable without real file/git operations
