# Roadmap

> Deterministic governance for AI coding agents.

## Vision

AgentGuard provides deterministic governance for AI coding agents — policy evaluation, invariant monitoring, blast radius limits, and evidence generation. Every agent action passes through a governed action kernel that produces a complete, replayable audit trail.

### Core Loop

```
agent proposes action
    ↓
AAB normalizes intent (tool → action type)
    ↓
policy evaluator matches rules (deny/allow)
    ↓
invariant checker verifies system state
    ↓
if allowed: execute via adapter
    ↓
emit lifecycle events (JSONL audit trail)
```

---

## Phase 0 — Architecture Clarity `COMPLETE`

> **Theme:** Define the unified system model

Establish the conceptual architecture, documentation, and event model.

- [x] Canonical event model documentation (`docs/event-model.md`)
- [x] AgentGuard governance runtime specification (`docs/agentguard.md`)
- [x] Unified architecture document (`docs/unified-architecture.md`)
- [x] Plugin API specification (`docs/plugin-api.md`)
- [x] Product positioning (`docs/product-positioning.md`)
- [x] Rewritten README, ARCHITECTURE, ROADMAP

## Phase 1 — Canonical Event Model `COMPLETE`

> **Theme:** Formalize the event spine

Extend the event system into the formal canonical event model.

- [x] Full event type taxonomy (developer signals, governance events, session events)
- [x] Event schema validation
- [x] Governance event types: `InvariantViolation`, `UnauthorizedAction`, `PolicyDenied`, `BlastRadiusExceeded`, `MergeGuardFailure`
- [x] Session event types: `RunStarted`, `RunEnded`, `CheckpointReached`
- [x] Developer signal event types: `FileSaved`, `TestCompleted`, `BuildCompleted`, `CommitCreated`, `CodeReviewed`, `DeployCompleted`, `LintCompleted`
- [x] Event factory with fingerprint generation
- [x] Event store interface (persist, query, replay)
- [x] Tests for all event types and lifecycle

## Phase 2 — AgentGuard Governance Runtime `COMPLETE`

> **Theme:** Deterministic agent governance

Build the governance runtime that evaluates agent actions against policies and invariants.

- [x] Action Authorization Boundary (AAB) implementation (`src/kernel/aab.ts`)
- [x] Policy definition format (JSON + YAML) (`policy/action_rules.json`)
- [x] Policy loader and parser (`src/policy/loader.ts`)
- [x] Deterministic policy evaluator (`src/policy/evaluator.ts`)
- [x] Invariant monitoring engine (`src/invariants/checker.ts`)
- [x] Built-in invariants (`src/invariants/definitions.ts`)
- [x] Blast radius computation (`src/kernel/blast-radius.ts`)
- [x] Evidence pack generation and persistence (`src/kernel/evidence.ts`)
- [x] CLI governance commands (`agentguard guard`, `agentguard inspect`)
- [x] Governance event emission into canonical event model
- [x] Integration with Claude Code hook (`src/adapters/claude-code.ts`, `src/cli/commands/claude-hook.ts`)

## Phase 3 — Event Persistence + Replay `PARTIALLY COMPLETE`

> **Theme:** Every session is replayable

Implement durable event storage and deterministic replay.

- [x] File-based event store (`src/cli/file-event-store.ts`)
- [x] Event stream serialization (NDJSON/JSONL)
- [x] Session metadata (run ID, timestamps)
- [x] Execution event log (`src/core/execution-log/`)
- [x] CLI replay command (`agentguard replay`)
- [ ] Deterministic replay with seeded RNG
- [ ] Replay comparator (verify original vs replayed outcomes)
- [ ] Event export/import for sharing sessions

## Phase 4 — Plugin Ecosystem

> **Theme:** Extensible by design

Formalize the plugin system for third-party extensions.

- [ ] Policy pack loading system (community policy sets)
- [ ] Renderer plugin interface
- [ ] Replay processor interface
- [ ] Plugin validation and sandboxing
- [ ] Plugin registry / discovery mechanism

## Phase 5 — Editor Integrations

> **Theme:** Governance moves into the editor

Bring AgentGuard governance into editor environments.

- [ ] VS Code extension: sidebar panel with run status
- [ ] VS Code: governance notifications for policy violations
- [ ] VS Code: inline invariant violation indicators
- [ ] JetBrains plugin (IntelliJ/WebStorm)
- [ ] Claude Code deep integration (full governance kernel in hook pipeline)

## Phase 6 — AI-Assisted Governance

> **Theme:** Explicitly deferred. Requires Phase 2 + 3.

AI features are intentionally placed last. The system must be useful without AI before AI is layered on.

- [ ] Context-aware policy suggestions based on action patterns
- [ ] Automated fix verification (does a policy change resolve violations?)
- [ ] AI pattern detection (recurring violation clusters across sessions)
- [ ] Team observability (aggregate governance reports across a dev team)

---

## Legend

- **Status:** `COMPLETE` | `MOSTLY COMPLETE` | `PARTIALLY COMPLETE` | `PLANNED`
