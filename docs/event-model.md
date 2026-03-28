# Canonical Event Model

The canonical event model is the architectural spine of the AgentGuard system. All system activity — agent actions, governance decisions, CI pipeline results, developer activity — is normalized into a single event schema. These events feed the governance runtime and its subscribers (TUI renderer, SQLite sink, CLI inspect).

## Event Schema

Every event in the system conforms to this structure:

```json
{
  "id": "evt_1709856000000_1",
  "kind": "InvariantViolation",
  "timestamp": 1709856120000,
  "fingerprint": "fp_2b8e3f",
  "invariant": "no-production-schema-changes",
  "expected": "no schema modifications in prod scope",
  "actual": "file.write to src/database/schema.sql",
  "file": "src/database/schema.sql",
  "metadata": {
    "agent": "code-assistant",
    "evidence": "evp_abc123"
  }
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique event identifier. Generated from timestamp + counter. |
| `kind` | string | yes | Canonical event kind (see taxonomy below). |
| `timestamp` | number | yes | Unix millisecond timestamp. |
| `fingerprint` | string | yes | Stable hash for deduplication. Same kind + data = same fingerprint. |
| *kind-specific fields* | varies | varies | Additional fields declared in the event schema for each kind. |

Event-kind-specific required and optional fields are defined in `packages/events/src/schema.ts`.

## Event Type Taxonomy

### Session Events

Events tracking run lifecycle.

| Kind | Description |
|------|-------------|
| `RunStarted` | Governance session began |
| `RunEnded` | Governance session concluded |
| `CheckpointReached` | Stability milestone during run |
| `StateChanged` | Escalation state machine transitioned |

### Governance Events

Events produced by AgentGuard when evaluating agent actions.

| Kind | Description |
|------|-------------|
| `PolicyDenied` | Agent action denied by a policy rule |
| `UnauthorizedAction` | Agent attempted action outside scope |
| `InvariantViolation` | System invariant broken |
| `BlastRadiusExceeded` | Action affects too many files/systems |
| `MergeGuardFailure` | Protected branch modification attempted |
| `EvidencePackGenerated` | Governance evaluation completed (informational) |

### Reference Monitor Events

Emitted at each stage of the governed action lifecycle.

| Kind | Description |
|------|-------------|
| `ActionRequested` | Agent proposed an action |
| `ActionAllowed` | Action passed policy and invariant evaluation |
| `ActionDenied` | Action denied by policy or invariant |
| `ActionEscalated` | Action escalated for additional review |
| `ActionExecuted` | Allowed action completed execution |
| `ActionFailed` | Allowed action failed during execution |

### Decision Records

| Kind | Description |
|------|-------------|
| `DecisionRecorded` | Typed governance decision record persisted |

### Policy Events

| Kind | Description |
|------|-------------|
| `PolicyComposed` | Multiple policy sources merged into a composite policy |
| `PolicyTraceRecorded` | Policy evaluation trace captured for a decision |

### Simulation Events

| Kind | Description |
|------|-------------|
| `SimulationCompleted` | Pre-execution impact simulation finished |

### Pipeline Events

Events tracking multi-agent pipeline execution.

| Kind | Description |
|------|-------------|
| `PipelineStarted` | Multi-stage agent pipeline began |
| `StageCompleted` | Pipeline stage finished successfully |
| `StageFailed` | Pipeline stage failed |
| `PipelineCompleted` | All pipeline stages finished |
| `PipelineFailed` | Pipeline terminated due to stage failure |
| `FileScopeViolation` | Agent modified files outside declared scope |

### Dev Activity Events

Events capturing developer and agent tool activity.

| Kind | Description |
|------|-------------|
| `FileSaved` | A file was saved (editor or agent) |
| `TestCompleted` | A test run completed |
| `BuildCompleted` | A build completed |
| `CommitCreated` | A git commit was created |
| `CodeReviewed` | A code review action occurred |
| `DeployCompleted` | A deployment completed |
| `LintCompleted` | A lint run completed |

### Token Optimization Events

| Kind | Description |
|------|-------------|
| `TokenOptimizationApplied` | RTK token optimization rewrite applied to a command |

### Agent Liveness Events

| Kind | Description |
|------|-------------|
| `HeartbeatEmitted` | Agent heartbeat received |
| `HeartbeatMissed` | Expected agent heartbeat not received |
| `AgentUnresponsive` | Agent exceeded unresponsive threshold |

### Integrity & Trust Events

| Kind | Description |
|------|-------------|
| `HookIntegrityVerified` | Claude Code hook settings verified as untampered |
| `HookIntegrityFailed` | Hook settings failed integrity check |
| `PolicyTrustVerified` | Policy file passed trust verification |
| `PolicyTrustDenied` | Policy file failed trust verification |

### Adoption Analytics Events

| Kind | Description |
|------|-------------|
| `AdoptionAnalyzed` | Governance coverage analysis completed for a session |
| `AdoptionAnalysisFailed` | Governance coverage analysis failed |

### Denial Learning Events

| Kind | Description |
|------|-------------|
| `DenialPatternDetected` | Recurring denial pattern identified for a policy suggestion |

### Intent Drift Events

| Kind | Description |
|------|-------------|
| `IntentDriftDetected` | Agent action deviated from declared session intent |

### Capability Validation Events

| Kind | Description |
|------|-------------|
| `CapabilityValidated` | Action matched a declared capability grant |

### Environmental Enforcement Events

| Kind | Description |
|------|-------------|
| `IdeSocketAccessBlocked` | IDE socket access blocked by the no-ide-socket-access invariant |

## Event Lifecycle

```
Source (agent tool call, CI webhook, file watcher)
    │
    ▼
  Proposed ── raw action or signal detected
    │
    ▼
  Evaluated ─ policy + invariant checked (governance events emitted here)
    │
    ▼
  Decided ─── ActionAllowed or ActionDenied emitted
    │
    ▼
  Executed ── action runs (ActionExecuted or ActionFailed emitted)
    │
    ▼
  Persisted ─ written to SQLite event store
    │
    ▼
  Emitted ─── broadcast to subscribers via EventBus
    │
    ▼
  Consumed ── subscribers react (TUI display, SQLite sink, CLI inspect)
```

## Deduplication

Events are deduplicated using stable fingerprints. The fingerprint is computed as:

```
fingerprint = simpleHash(kind + ":" + sorted key=value pairs from data)
```

Rules:
- Same fingerprint within a session = same event (counted once)
- Fingerprints are stable across sessions — the same event kind with the same data always produces the same fingerprint

Implementation: `packages/events/src/schema.ts` (`fingerprintEvent`)

## Replay Semantics

Events are immutable and ordered. A stored event stream can be replayed to reconstruct any past session:

- Events are append-only. Once persisted, an event is never modified.
- Ordering is by `timestamp`. Ties are broken by `id`.
- Replay produces identical event sequences given the same event stream.
- This enables: post-session analysis, debugging governance decisions, and audit trail verification.

## Governance Event Envelope

For cross-adapter interoperability, DomainEvents are wrapped in a `GovernanceEventEnvelope` that adds runtime-agnostic metadata:

```json
{
  "schemaVersion": "1.0",
  "envelopeId": "env_1709856000000_1",
  "timestamp": "2024-03-08T00:00:00.000Z",
  "source": "claude-code",
  "policyVersion": "abc123",
  "decisionCodes": ["DENY_INVARIANT"],
  "performanceMetrics": { "evalMs": 2 },
  "event": { ... }
}
```

Claude Code, Copilot CLI, and other adapters produce identical envelope structures, differing only in the `source` field. Implementation: `packages/events/src/schema.ts` (`createEnvelope`).

## Current Implementation

The canonical event model is implemented in the TypeScript monorepo:

| Concept | Implementation | Path |
|---------|----------------|------|
| Event kinds | `EventKind` constants | `packages/events/src/schema.ts` |
| Event factory | `createEvent()` | `packages/events/src/schema.ts` |
| Event validation | `validateEvent()` | `packages/events/src/schema.ts` |
| Event envelope | `createEnvelope()` | `packages/events/src/schema.ts` |
| Event bus | `EventBus` class | `packages/events/src/bus.ts` |
| In-memory store | `InMemoryEventStore` | `packages/events/src/store.ts` |
| SQLite sink | `SqliteEventSink` | `packages/storage/src/sqlite-sink.ts` |
| SQLite store | `SqliteEventStore` | `packages/storage/src/sqlite-store.ts` |

## Examples

### Agent governance violation

```json
{
  "id": "evt_1709856120000_1",
  "kind": "InvariantViolation",
  "timestamp": 1709856120000,
  "fingerprint": "fp_2b8e3f",
  "invariant": "no-production-schema-changes",
  "expected": "no schema modifications in prod scope",
  "actual": "file.write targeting src/database/schema.sql",
  "file": "src/database/schema.sql",
  "metadata": {
    "agent": "code-assistant",
    "action": "file.write",
    "evidence": "evp_abc123"
  }
}
```

This event contributes to escalation toward LOCKDOWN state.

### Action denied by policy

```json
{
  "id": "evt_1709856060000_2",
  "kind": "PolicyDenied",
  "timestamp": 1709856060000,
  "fingerprint": "fp_9c4d1b",
  "policy": "production-scope-guard",
  "action": "git.push",
  "reason": "Direct push to protected branch blocked by policy rule"
}
```

### Action allowed through governance

```json
{
  "id": "evt_1709856000000_3",
  "kind": "ActionAllowed",
  "timestamp": 1709856000000,
  "fingerprint": "fp_3a7f2e",
  "actionType": "file.write",
  "target": "docs/README.md",
  "capability": "file:write:docs"
}
```
