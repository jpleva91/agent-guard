# Unified Architecture — AgentGuard

This document describes the architecture of AgentGuard as a governed action runtime for AI agents.

## Architectural Thesis

AgentGuard is a **governed action runtime**. The Action is the primary unit of computation. Every agent tool call passes through the kernel loop, which enforces policies and invariants before execution.

The system has one architectural spine: the **canonical event model**. All system activity becomes events. The kernel produces governance events. Subscribers (TUI renderer, JSONL sink, CLI inspect) consume them.

## System Model

```
┌──────────────────────────────────────────────────────────────────┐
│                        Event Sources                             │
│                                                                  │
│  Claude Code Hooks        Agent Tool Calls      CI Systems       │
│  ├── PreToolUse           ├── file.write        ├── pipeline     │
│  ├── PostToolUse          ├── git.commit         ├── build       │
│  └── (future hooks)       ├── git.push          └── deploy      │
│                           └── shell.exec                         │
└──────────────────┬───────────────────┬───────────────┬───────────┘
                   │                   │               │
                   ▼                   ▼               ▼
         ┌─────────────────────────────────────────────────────┐
         │              Claude Code Adapter                     │
         │                                                     │
         │  Normalize tool calls → RawAgentAction              │
         │  Implementation: agentguard/adapters/claude-code.ts │
         └──────────────────────┬──────────────────────────────┘
                                │
                                ▼
         ┌─────────────────────────────────────────────────────┐
         │              Governed Action Kernel                  │
         │                                                     │
         │  1. ACTION_REQUESTED event                          │
         │  2. AAB normalizes intent                           │
         │  3. Policy evaluation (match → allow/deny)          │
         │  4. Invariant checking (6 default invariants)       │
         │  5. Evidence pack generation                        │
         │  6. If allowed: execute via adapter                 │
         │  7. ACTION_ALLOWED/DENIED + ACTION_EXECUTED/FAILED  │
         │  8. Escalation tracking (monitor)                   │
         │                                                     │
         │  Implementation: agentguard/kernel.ts               │
         └──────────────────────┬──────────────────────────────┘
                                │
               ┌────────────────┼────────────────┐
               │                │                │
               ▼                ▼                ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │ TUI Renderer │  │ JSONL Sink   │  │  EventBus   │
     │              │  │              │  │             │
     │ Terminal     │  │ .agentguard/ │  │ Pub/sub     │
     │ action       │  │ events/      │  │ broadcast   │
     │ stream       │  │ <runId>.jsonl│  │             │
     └──────────────┘  └──────────────┘  └──────┬──────┘
                                                │
                                                ▼
                                    ┌───────────────────┐
                                    │   Subscribers      │
                                    │                   │
                                    │  CLI inspect      │
                                    │  CLI events       │
                                    └───────────────────┘
```

## Kernel Loop Detail

```
Agent proposes action (RawAgentAction)
    │
    ▼ emit ACTION_REQUESTED
    │
    ▼ AAB.normalizeIntent() → NormalizedIntent
    │   ├── Map tool name to action type (Write → file.write, Bash → shell.exec)
    │   ├── Detect git commands in shell (git push → git.push)
    │   └── Flag destructive commands (rm -rf, chmod 777, etc.)
    │
    ▼ Engine.evaluate() → EngineDecision
    │   ├── Policy evaluator: match rules, check deny/allow
    │   ├── Invariant checker: 6 defaults + custom invariants
    │   └── Evidence pack: structured audit record
    │
    ▼ Monitor.process() → MonitorDecision
    │   ├── Track escalation level (NORMAL → ELEVATED → HIGH → LOCKDOWN)
    │   └── LOCKDOWN = all actions denied until human intervention
    │
    ├── If DENIED:
    │   ├── emit ACTION_DENIED
    │   ├── sink events to JSONL
    │   └── return { allowed: false, intervention }
    │
    └── If ALLOWED:
        ├── emit ACTION_ALLOWED
        ├── Execute via adapter registry (file/shell/git handlers)
        ├── emit ACTION_EXECUTED or ACTION_FAILED
        ├── sink events to JSONL
        └── return { allowed: true, executed: true/false, execution result }
```

## Layer Responsibilities

### Kernel Layer (Active Focus)

The kernel is the **governance producer and action executor**. It is the core of the system.

| Component | File | Responsibility |
|-----------|------|----------------|
| Kernel loop | `agentguard/kernel.ts` | Orchestrate propose → evaluate → execute → emit |
| AAB | `agentguard/core/aab.ts` | Normalize tool calls, detect destructive commands |
| Engine | `agentguard/core/engine.ts` | Policy + invariant evaluation, intervention selection |
| Monitor | `agentguard/monitor.ts` | Escalation tracking, lockdown enforcement |
| Policy evaluator | `agentguard/policies/evaluator.ts` | Rule matching with wildcards and scopes |
| Policy loader | `agentguard/policies/loader.ts` | JSON policy validation |
| YAML loader | `agentguard/policies/yaml-loader.ts` | YAML policy parsing |
| Invariant checker | `agentguard/invariants/checker.ts` | System state invariant verification |
| Evidence packs | `agentguard/evidence/pack.ts` | Audit trail generation |
| File adapter | `agentguard/adapters/file.ts` | Read/write/delete/move files |
| Shell adapter | `agentguard/adapters/shell.ts` | Execute shell commands with timeout |
| Git adapter | `agentguard/adapters/git.ts` | Git operations with validation |
| Claude Code adapter | `agentguard/adapters/claude-code.ts` | Hook payload normalization |
| TUI renderer | `agentguard/renderers/tui.ts` | Terminal action stream display |
| JSONL sink | `agentguard/sinks/jsonl.ts` | Event persistence |

### Domain Layer (Shared)

Pure domain logic with no environment dependencies.

| Component | File | Responsibility |
|-----------|------|----------------|
| Canonical actions | `domain/actions.ts` | 23 action types, 8 classes |
| Canonical events | `domain/events.ts` | 50+ event kinds, factory, validation |
| Reference monitor | `domain/reference-monitor.ts` | Action authorization with decision trail |
| Adapter registry | `domain/execution/adapters.ts` | Action class → handler mapping |
| Event store | `domain/event-store.ts` | In-memory event persistence |

### CLI Layer

| Component | File | Responsibility |
|-----------|------|----------------|
| `agentguard guard` | `cli/commands/guard.ts` | Start governed action runtime |
| `agentguard inspect` | `cli/commands/inspect.ts` | Show action graph for a run |
| `agentguard events` | `cli/commands/inspect.ts` | Show raw event stream for a run |

## Integration Guarantees

1. **Single event schema.** The kernel and all consumers use the same canonical event format.

2. **Kernel as single mediation point.** All agent actions pass through the kernel. No bypass.

3. **Independent operation.** The kernel operates independently. Subscribers connect through the canonical event model.

4. **Deterministic evaluation.** Same action + same policy + same state = same decision. No inference, no heuristics.

5. **Observable.** Every decision produces events. Every event is sunk to JSONL. Every run is inspectable.
