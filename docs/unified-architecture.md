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
         │  Implementation: packages/adapters/src/claude-code.ts │
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
         │  Implementation: packages/kernel/src/kernel.ts               │
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
| Kernel loop | `packages/kernel/src/kernel.ts` | Orchestrate propose → evaluate → execute → emit |
| AAB | `packages/kernel/src/aab.ts` | Normalize tool calls, detect destructive commands |
| Engine | `packages/kernel/src/decision.ts` | Policy + invariant evaluation, intervention selection |
| Monitor | `packages/kernel/src/monitor.ts` | Escalation tracking, lockdown enforcement |
| Policy evaluator | `packages/policy/src/evaluator.ts` | Rule matching with wildcards and scopes |
| Policy loader | `packages/policy/src/loader.ts` | JSON policy validation |
| YAML loader | `packages/policy/src/yaml-loader.ts` | YAML policy parsing |
| Invariant checker | `packages/invariants/src/checker.ts` | System state invariant verification |
| Evidence packs | `packages/kernel/src/evidence.ts` | Audit trail generation |
| File adapter | `packages/adapters/src/file.ts` | Read/write/delete/move files |
| Shell adapter | `packages/adapters/src/shell.ts` | Execute shell commands with timeout |
| Git adapter | `packages/adapters/src/git.ts` | Git operations with validation |
| Claude Code adapter | `packages/adapters/src/claude-code.ts` | Hook payload normalization |
| TUI renderer | `packages/renderers/src/tui-renderer.ts` | Terminal action stream display |
| JSONL sink | `packages/events/src/jsonl.ts` | Event persistence |

### Domain Layer (Shared)

Pure domain logic with no environment dependencies.

| Component | File | Responsibility |
|-----------|------|----------------|
| Canonical actions | `packages/core/src/actions.ts` | 41 action types, 10 classes |
| Canonical events | `packages/events/src/schema.ts` | 47 event kinds, factory, validation |
| Reference monitor | `packages/kernel/src/decision.ts` | Action authorization with decision trail |
| Adapter registry | `packages/adapters/src/registry.ts` | Action class → handler mapping |
| Event store | `packages/events/src/store.ts` | In-memory event persistence |

### CLI Layer

| Component | File | Responsibility |
|-----------|------|----------------|
| `agentguard guard` | `apps/cli/src/commands/guard.ts` | Start governed action runtime |
| `agentguard inspect` | `apps/cli/src/commands/inspect.ts` | Show action graph for a run |
| `agentguard events` | `apps/cli/src/commands/inspect.ts` | Show raw event stream for a run |

## Integration Guarantees

1. **Single event schema.** The kernel and all consumers use the same canonical event format.

2. **Kernel as single mediation point.** All agent actions pass through the kernel. No bypass.

3. **Independent operation.** The kernel operates independently. Subscribers connect through the canonical event model.

4. **Deterministic evaluation.** Same action + same policy + same state = same decision. No inference, no heuristics.

5. **Observable.** Every decision produces events. Every event is sunk to JSONL. Every run is inspectable.

6. **Default-deny (complete mediation).** When a policy file is loaded, any action without an explicit `allow` rule is denied. Agents cannot escalate privileges by requesting action types absent from the policy. Fail-open only applies when no policy is configured, preserving zero-friction onboarding while enforcing closed posture in governed environments.
