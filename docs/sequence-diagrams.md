# Sequence Diagrams

System flows for key operations in the AgentGuard governance runtime.

## 1. Agent Violation → Governance Denial

An AI agent attempts an unauthorized action, triggering AgentGuard policy enforcement and invariant checking.

```
AI Agent         AgentGuard AAB    Policy Eval     Invariant       Evidence        EventBus
    │                │               │            Checker          Generator          │
    │                │               │               │               │               │
    │  file_write    │               │               │               │               │
    │  (prod config) │               │               │               │               │
    │───────────────>│               │               │               │               │
    │                │               │               │               │               │
    │                │  check scope  │               │               │               │
    │                │──────────────>│               │               │               │
    │                │               │               │               │               │
    │                │  DENY:        │               │               │               │
    │                │  outside scope│               │               │               │
    │                │◄──────────────│               │               │               │
    │                │               │               │               │               │
    │                │  check        │               │               │               │
    │                │  invariants   │               │               │               │
    │                │──────────────────────────────>│               │               │
    │                │               │               │               │               │
    │                │  VIOLATED:    │               │               │               │
    │                │  prod-guard   │               │               │               │
    │                │◄──────────────────────────────│               │               │
    │                │               │               │               │               │
    │                │  generate     │               │               │               │
    │                │  evidence     │               │               │               │
    │                │──────────────────────────────────────────────>│               │
    │                │               │               │               │               │
    │                │               │               │               │  evp_abc123   │
    │                │               │               │               │◄──────────────│
    │                │               │               │               │               │
    │                │  emit InvariantViolation      │               │               │
    │                │──────────────────────────────────────────────────────────────>│
    │                │               │               │               │               │
    │  DENIED        │               │               │               │               │
    │◄───────────────│               │               │               │               │
    │                │               │               │               │               │
    │                │               │               │   Events persisted to JSONL   │
    │                │               │               │   + rendered to TUI           │
```

## 2. Event Replay for Audit

Replaying a stored JSONL event stream to reconstruct and audit a past governance session.

```
Operator         Replay Engine    Event Store      Analyzer         Comparator
    │                │               │               │               │
    │  replay        │               │               │               │
    │  run #47       │               │               │               │
    │───────────────>│               │               │               │
    │                │               │               │               │
    │                │  load events  │               │               │
    │                │  for run #47  │               │               │
    │                │──────────────>│               │               │
    │                │               │               │               │
    │                │  event stream │               │               │
    │                │  (ordered)    │               │               │
    │                │◄──────────────│               │               │
    │                │               │               │               │
    │                │               │               │               │
    │                │  ─── for each event ───       │               │
    │                │               │               │               │
    │                │  feed event   │               │               │
    │                │──────────────────────────────>│               │
    │                │               │               │               │
    │                │               │               │  governance   │
    │                │               │               │  decision     │
    │                │               │               │  analyzed     │
    │                │               │               │               │
    │                │  ─── end loop ───             │               │
    │                │               │               │               │
    │                │  compare with │               │               │
    │                │  original     │               │               │
    │                │──────────────────────────────────────────────>│
    │                │               │               │               │
    │                │               │               │  match /      │
    │                │               │               │  divergence   │
    │                │               │               │  report       │
    │                │◄──────────────────────────────────────────────│
    │                │               │               │               │
    │  replay        │               │               │               │
    │  report        │               │               │               │
    │◄───────────────│               │               │               │
```

**Use cases for replay:**
- Verify governance decision determinism (same events + same policies = same decisions)
- Debug unexpected policy evaluation behavior
- Post-session analysis of agent actions
- Compliance audit of governance decisions
- Regression testing of policy changes
