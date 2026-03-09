# Canonical Event Model

The canonical event model is the architectural spine of the AgentGuard system. All system activity — developer tooling failures, runtime errors, CI failures, agent actions, governance violations — is normalized into a single event schema. These events feed the governance runtime and its subscribers (TUI renderer, JSONL sink, CLI inspect).

## Event Schema

Every event in the system conforms to this structure:

```json
{
  "id": "evt_a1b2c3d4",
  "fingerprint": "fp_8f3e2a1b",
  "type": "TestFailure",
  "severity": 3,
  "source": "jest",
  "file": "src/auth/login.test.js",
  "line": 42,
  "message": "Expected status 200, received 401",
  "metadata": {
    "framework": "jest",
    "testName": "should authenticate valid user",
    "stack": ["at Object.<anonymous> (login.test.js:42:5)"]
  },
  "timestamp": 1709856000000,
  "resolved": false,
  "sessionId": "run_x7y8z9"
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique event identifier. Generated from fingerprint + timestamp. |
| `fingerprint` | string | yes | Stable hash for deduplication. Same error type + message + location = same fingerprint. |
| `type` | string | yes | Canonical event type (see taxonomy below). |
| `severity` | number | yes | 1-5 scale. Determines event priority and escalation behavior. |
| `source` | string | yes | Origin system (e.g., `jest`, `eslint`, `tsc`, `agentguard`, `ci`). |
| `file` | string | no | Source file path where the event originated. |
| `line` | number | no | Line number in source file. |
| `message` | string | yes | Human-readable description. |
| `metadata` | object | no | Source-specific data. Schema varies by event type. |
| `timestamp` | number | yes | Unix millisecond timestamp. |
| `resolved` | boolean | yes | Whether this event has been addressed. |
| `sessionId` | string | no | Run/session identifier for grouping. |

## Event Type Taxonomy

### Developer Signal Events

Events originating from developer tooling, build systems, and runtime errors.

| Type | Severity | Description |
|------|----------|-------------|
| `LintWarning` | 1 | Linter warning (non-blocking) |
| `Deprecation` | 1 | Deprecated API usage |
| `LintError` | 2 | Linter error (blocking) |
| `TypeError` | 2 | Type mismatch or coercion failure |
| `ReferenceError` | 2 | Undefined variable or import |
| `SyntaxError` | 3 | Unparseable code |
| `TestFailure` | 3 | Test assertion failure |
| `RuntimeCrash` | 3 | Unhandled exception at runtime |
| `NetworkError` | 3 | Connection refused, timeout, DNS failure |
| `MergeConflict` | 3 | Git merge conflict markers |
| `BuildFailure` | 4 | Build system failure (webpack, esbuild, tsc) |
| `StackOverflow` | 4 | Call stack exceeded |
| `MemoryError` | 4 | Heap out of memory |
| `SecurityFinding` | 4 | Vulnerability detected |
| `CIFailure` | 4 | CI pipeline failure |
| `DependencyConflict` | 4 | Package resolution failure |

### Governance Events

Events produced by AgentGuard when evaluating agent actions.

| Type | Severity | Description |
|------|----------|-------------|
| `PolicyDenied` | 3 | Agent action denied by policy rule |
| `UnauthorizedAction` | 4 | Agent attempted action outside scope |
| `InvariantViolation` | 5 | System invariant broken |
| `BlastRadiusExceeded` | 4 | Action affects too many files/systems |
| `MergeGuardFailure` | 4 | Protected branch modification attempted |
| `EvidencePackGenerated` | 1 | Governance evaluation completed (informational) |

### Session Events

Events tracking run lifecycle. Not directly mapped to encounters.

| Type | Severity | Description |
|------|----------|-------------|
| `RunStarted` | 0 | Coding session / run began |
| `RunEnded` | 0 | Coding session / run concluded |
| `CheckpointReached` | 0 | Stability milestone during run |

## Severity Scale

| Level | Label | Meaning |
|-------|-------|---------|
| 0 | Informational | System lifecycle events |
| 1 | Minor | Warnings, deprecations |
| 2 | Low | Non-critical errors |
| 3 | Medium | Blocking errors, test failures |
| 4 | High | Build/CI failures, security findings |
| 5 | Critical | Invariant violations, system-level failures |

## Event Lifecycle

```
Source (stderr, CI, agent action)
    │
    ▼
  Created ──── raw signal detected
    │
    ▼
  Parsed ───── structured error extracted (type, message, location)
    │
    ▼
  Fingerprinted ── stable hash computed for deduplication
    │
    ▼
  Classified ── severity assigned, metadata enriched
    │
    ▼
  Persisted ── written to event store
    │
    ▼
  Emitted ──── broadcast to subscribers via EventBus
    │
    ▼
  Consumed ─── subscribers react (TUI display, JSONL persistence, CLI inspect)
    │
    ▼
  Resolved ─── developer fixes the underlying issue
```

## Deduplication

Events are deduplicated using stable fingerprints. The fingerprint is computed as:

```
fingerprint = hash(type + ":" + normalizedMessage + ":" + file + ":" + line)
```

Rules:
- Same fingerprint within a session = same event (frequency counter incremented)
- When duplicates are found, the version with the richest metadata (most stack trace frames) is kept
- Fingerprints are stable across sessions — the same error in the same location always produces the same fingerprint

Implementation: `domain/ingestion/fingerprint.js`

## Replay Semantics

Events are immutable and ordered. A stored event stream can be replayed to reconstruct any past session:

- Events are append-only. Once persisted, an event is never modified (except `resolved` status).
- Ordering is by `timestamp`. Ties are broken by `id`.
- Replay produces identical event sequences given the same event stream.
- This enables: post-session analysis, debugging governance decisions, and audit trail verification.

## Current Implementation

The canonical event model builds on existing infrastructure:

| Concept | Current Implementation | Path |
|---------|----------------------|------|
| Event kinds | `Events` constant | `domain/events.js` |
| Event bus | `EventBus` class | `domain/event-bus.js` |
| Fingerprinting | `fingerprint()`, `deduplicateErrors()` | `domain/ingestion/fingerprint.js` |
| Classification | `createBugEvent()` | `core/bug-event.js` |
| Severity mapping | `TYPE_SEVERITY` | `core/bug-event.js` |
| Error parsing | `parseErrors()` | `core/error-parser.js` |
| Pipeline orchestration | `ingestErrors()` | `domain/ingestion/pipeline.js` |

## Examples

### Developer fixes a TypeError

```json
{
  "id": "evt_TypeError_auth_42",
  "fingerprint": "fp_3a7f2e",
  "type": "TypeError",
  "severity": 2,
  "source": "node",
  "file": "src/auth/session.js",
  "line": 42,
  "message": "Cannot read properties of undefined (reading 'token')",
  "metadata": {
    "stack": ["at getSession (session.js:42:15)", "at handleRequest (server.js:88:3)"]
  },
  "timestamp": 1709856000000,
  "resolved": false,
  "sessionId": "run_morning_001"
}
```

This event has severity 2 (Low) and would be captured in the JSONL audit trail.

### CI pipeline fails

```json
{
  "id": "evt_CIFailure_deploy_1",
  "fingerprint": "fp_9c4d1b",
  "type": "CIFailure",
  "severity": 4,
  "source": "github-actions",
  "file": ".github/workflows/deploy.yml",
  "message": "Pipeline failed: deploy job exited with code 1",
  "metadata": {
    "workflow": "deploy",
    "job": "build-and-deploy",
    "runId": 12345
  },
  "timestamp": 1709856060000,
  "resolved": false,
  "sessionId": "run_morning_001"
}
```

This event has severity 4 (High) and triggers escalation tracking in the runtime monitor.

### Agent governance violation

```json
{
  "id": "evt_Invariant_scope_1",
  "fingerprint": "fp_2b8e3f",
  "type": "InvariantViolation",
  "severity": 5,
  "source": "agentguard",
  "file": "src/database/schema.sql",
  "message": "Agent attempted to modify production database schema outside authorized scope",
  "metadata": {
    "agent": "code-assistant",
    "action": "file_write",
    "policy": "production-scope-guard",
    "evidence": "evp_abc123"
  },
  "timestamp": 1709856120000,
  "resolved": false,
  "sessionId": "run_morning_001"
}
```

This event has severity 5 (Critical) and contributes to escalation toward LOCKDOWN state.
