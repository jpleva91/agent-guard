# Feature Spec: Execution Event Log

> Universal execution event stream that records all development environment actions,
> enabling causal chain reconstruction, replay, root-cause tracing, and risk scoring.

## Summary

The Execution Event Log introduces a universal event stream that records not just errors
but all significant actions in the development environment. Every event
becomes part of a causal chain: agent edits, test runs, deployments, and failures are
linked together, enabling replay, root-cause tracing, anomaly detection, and risk scoring.

## Requirements

- [x] Define `ExecutionEvent` schema with actor, source, context, and payload
- [x] Define execution event kinds (agent actions, CI, git, runtime)
- [x] Implement append-only execution event log
- [x] Support NDJSON serialization for persistence
- [x] Support causal chain linking via `causedBy` references
- [x] Implement projections: active bugs, agent risk score, failure clusters
- [x] Implement replay (reconstruct event sequence from a point)
- [x] Implement trace (walk causal chain from an event back to root cause)
- [x] Implement risk scoring (score an agent run based on event patterns)
- [x] Add CLI commands: `replay`, `trace`, `score`
- [x] Integrate with existing EventBus and domain event system

## Events Produced

| Event Kind | When Emitted | Required Data |
|------------|-------------|---------------|
| `ExecutionEventRecorded` | New execution event appended | `{ executionEvent }` |

## Events Consumed

| Event Kind | Reaction |
|------------|----------|
| `ActionExecuted` | Record as execution event |
| `ActionFailed` | Record as execution event |
| `ErrorObserved` | Record as execution event |
| `TestCompleted` | Record as execution event |
| `BuildCompleted` | Record as execution event |
| `CommitCreated` | Record as execution event |
| `DeployCompleted` | Record as execution event |
| All governance events | Record as execution events |

## Interface Contract

```typescript
// event-schema.ts — ExecutionEvent type and kinds
export type Actor = 'human' | 'agent' | 'system';
export type EventSource = 'cli' | 'ci' | 'git' | 'runtime' | 'editor' | 'governance';
export interface ExecutionContext { repo?, branch?, commit?, file?, agentRunId? }
export interface ExecutionEvent { id, timestamp, actor, source, kind, context, payload, causedBy? }
export function createExecutionEvent(kind, opts): ExecutionEvent;
export function validateExecutionEvent(event): ValidationResult;

// event-log.ts — Append-only event log with causal chain support
export interface ExecutionEventLog { append, query, replay, trace, count, clear, toNDJSON, fromNDJSON }
export function createExecutionEventLog(): ExecutionEventLog;

// event-projections.ts — Derived views from the event stream
export function buildCausalChain(log, eventId): ExecutionEvent[];
export function scoreAgentRun(log, agentRunId): RiskScore;
export function clusterFailures(log, opts?): FailureCluster[];
export function mapToEncounter(event): EncounterMapping | null;
```

## Dependencies

| Module | Why Needed |
|--------|-----------|
| `domain/hash` | Fingerprint generation |
| `domain/events` | Domain event integration |
| `core/types` | Shared type definitions |

## Layer Placement

- [x] `domain/` — Pure logic, no environment dependencies

## Constraints

- Must remain zero-dependency (no DOM, no Node.js APIs)
- Must be deterministic when timestamp/id injection is provided
- NDJSON serialization must be lossless
- Causal chains must be acyclic (DAG)

## Verification

```bash
npm run ts:test -- --grep "execution-event"
npm run contracts:check
npm run ts:check
```

## Open Questions

None — initial implementation covers core primitives.
