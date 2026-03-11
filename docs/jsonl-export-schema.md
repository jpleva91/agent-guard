# JSONL Export Schema (v1)

The AgentGuard JSONL export format is the portable interchange format for governance sessions. It allows sessions to be exported from any storage backend (JSONL files or SQLite) and imported into any backend, preserving full fidelity.

## File Structure

An exported `.agentguard.jsonl` file contains three sections, each as newline-delimited JSON:

```
Line 1:         Header (metadata)
Lines 2..N:     Events (DomainEvent objects)
Lines N+1..M:   Decisions (GovernanceDecisionRecord objects)
```

The boundary between events and decisions is determined by `header.eventCount`.

## Header (Line 1)

| Field            | Type                   | Required | Description                                             |
|------------------|------------------------|----------|---------------------------------------------------------|
| `__agentguard_export` | `true` (literal)  | Yes      | Marker identifying this as an AgentGuard export         |
| `version`        | `1` (literal)          | Yes      | Export wrapper format version                           |
| `schemaVersion`  | `number`               | Yes*     | Event/decision data schema version (currently `1`)      |
| `runId`          | `string`               | Yes      | Governance session identifier                           |
| `exportedAt`     | `number`               | Yes      | Unix timestamp (ms) when the export was created         |
| `eventCount`     | `number`               | Yes      | Number of event lines following the header              |
| `decisionCount`  | `number`               | Yes      | Number of decision lines following the events           |
| `sourceBackend`  | `"jsonl"` or `"sqlite"` | No      | Storage backend the session was exported from           |

*`schemaVersion` was added in AgentGuard v0.8.0. Exports without this field are treated as schema version 1 during import.

## Events (Lines 2 through `eventCount + 1`)

Each event line is a JSON-serialized `DomainEvent` object with these required fields:

| Field         | Type     | Description                                    |
|---------------|----------|------------------------------------------------|
| `id`          | `string` | Unique event identifier (e.g., `evt_170...`)   |
| `kind`        | `string` | Event type (e.g., `ActionRequested`)           |
| `timestamp`   | `number` | Unix timestamp in milliseconds                 |
| `fingerprint` | `string` | Content hash for deduplication                 |

Additional fields vary by event kind. See `src/events/schema.ts` for the full event kind catalog.

## Decisions (Lines `eventCount + 2` through end)

Each decision line is a JSON-serialized `GovernanceDecisionRecord` with these required fields:

| Field         | Type     | Description                                    |
|---------------|----------|------------------------------------------------|
| `recordId`    | `string` | Unique decision identifier                     |
| `runId`       | `string` | Session this decision belongs to               |
| `timestamp`   | `number` | Unix timestamp in milliseconds                 |
| `action`      | `object` | Action that was evaluated                      |
| `outcome`     | `string` | Decision outcome (`allow`, `deny`, `escalate`) |
| `reason`      | `string` | Human-readable explanation                     |
| `policy`      | `object` | Policy match details                           |
| `invariants`  | `object` | Invariant check results                        |
| `monitor`     | `object` | Escalation state at decision time              |
| `execution`   | `object` | Execution result (if action was executed)      |

See `src/kernel/decisions/types.ts` for the full type definition.

## Versioning Contract

- **`version`** tracks the export wrapper structure (header fields, line ordering). Bumped when the export format itself changes.
- **`schemaVersion`** tracks the event/decision data shape. Bumped when `DomainEvent` or `GovernanceDecisionRecord` fields change in a breaking way.

Import behavior:
- Missing `schemaVersion` is treated as `1` (backward compatibility)
- Imports reject files with `schemaVersion` higher than the current AgentGuard version supports
- `sourceBackend` is informational only and does not affect import behavior

## Example

```jsonl
{"__agentguard_export":true,"version":1,"schemaVersion":1,"runId":"run_abc123","exportedAt":1710000000000,"eventCount":2,"decisionCount":1,"sourceBackend":"sqlite"}
{"id":"evt_1","kind":"ActionRequested","timestamp":1710000001000,"fingerprint":"fp_abc","actionType":"file.write","target":"src/app.ts"}
{"id":"evt_2","kind":"ActionAllowed","timestamp":1710000002000,"fingerprint":"fp_def","actionType":"file.write","target":"src/app.ts"}
{"recordId":"dec_1","runId":"run_abc123","timestamp":1710000002500,"action":{"type":"file.write","target":"src/app.ts","agent":"claude","destructive":false},"outcome":"allow","reason":"Default allow","policy":{"matchedPolicyId":null},"invariants":{"allHold":true,"violations":[]},"monitor":{"escalationLevel":0},"execution":{"executed":true,"success":true}}
```

## CLI Usage

```bash
# Export from default JSONL backend
agentguard export --last -o session.jsonl

# Export from SQLite backend
agentguard export --last --store sqlite -o session.jsonl

# Import into JSONL backend
agentguard import session.jsonl

# Import into SQLite backend
agentguard import session.jsonl --store sqlite

# Import with a different run ID
agentguard import session.jsonl --as custom_run_id
```
