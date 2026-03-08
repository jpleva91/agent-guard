# Bug Event Pipeline

The bug event pipeline transforms raw signals (stderr output, CI logs, agent action traces) into canonical events. This is the normalization layer that feeds both AgentGuard and BugMon.

## Pipeline Stages

```
Source → Parse → Normalize → Classify → Deduplicate → Persist → Emit
```

Each stage is independently testable and replaceable. The pipeline is implemented in `domain/ingestion/` with supporting modules in `core/`.

## Stage 1: Source

Raw signals enter the pipeline from multiple sources:

| Source | Signal Type | Entry Point |
|--------|------------|-------------|
| stderr | Runtime errors, warnings | CLI watch adapter (`core/cli/adapter.js`) |
| Test runner output | Assertion failures, test errors | CLI watch adapter |
| Linter output | Lint warnings and errors | CLI watch adapter |
| CI logs | Pipeline failures, build errors | CI event webhook (planned) |
| Agent action traces | File modifications, git operations | AgentGuard AAB (planned) |
| Claude Code hook | Bash tool stderr | PostToolUse hook (`core/cli/claude-hook.js`) |

The source stage captures raw text and passes it to parsing. No transformation occurs at this stage.

## Stage 2: Parse

The parser extracts structured error objects from raw text. It detects 40+ error patterns across 6+ languages.

**Implementation:** `core/error-parser.js` (re-exported via `domain/ingestion/parser.js`)

### Supported Languages and Patterns

**JavaScript / Node.js:**
- `TypeError`, `SyntaxError`, `ReferenceError`, `RangeError`
- `UnhandledPromiseRejection`
- Network errors: `ECONNREFUSED`, `ETIMEDOUT`, `EADDRINUSE`, `ENOENT`, `EACCES`
- Module errors: `ERR_MODULE_NOT_FOUND`, `Cannot find module`
- Memory: `out of memory`, `heap out of memory`

**TypeScript:**
- `error TS####:` diagnostic codes

**ESLint:**
- `path:line:col: error|warning` format

**Testing frameworks:**
- `Assertion`, `AssertionError`
- Jest, Vitest, Mocha output patterns

**Git:**
- Merge conflict markers (`<<<<<<<`, `>>>>>>>`)

**Security:**
- `vulnerabilit`, `high severity`

**CI/CD:**
- `::error::`, `Build failed`, `Pipeline failed`

**Python:**
- `NameError`, `ImportError`, `AttributeError`, `ValueError`, `KeyError`
- Traceback merging (`File "path.py", line N`)

**Go:**
- `panic:`, compile errors

**Rust:**
- `error[E####]:`, `warning[...]:`

**Java / Kotlin:**
- `NullPointerException`, `ClassNotFoundException`, `IOException`

### Parse Output

```javascript
{
  type: 'null-reference',       // Normalized error type
  message: 'Cannot read properties of undefined (reading \'token\')',
  rawLines: [
    'TypeError: Cannot read properties of undefined (reading \'token\')',
    '    at getSession (src/auth/session.js:42:15)',
    '    at handleRequest (src/server.js:88:3)'
  ]
}
```

## Stage 3: Normalize

Stack traces are extracted and normalized to produce source location information.

**Implementation:** `core/stacktrace-parser.js`

### Stack Frame Formats

| Language | Format |
|----------|--------|
| Node.js | `at functionName (/path/file.js:42:15)` |
| TypeScript | `/path/file.ts(42,15): error` |
| Python | `File "path.py", line 42` |
| Go | `path/file.go:42` |
| Rust | `→ src/main.rs:42:15` |
| Java | `at com.Example.method(File.java:42)` |

### Filtering

Internal frames are filtered out:
- `node:` internal modules
- `internal/` Node.js internals
- `node_modules/` third-party code
- `<anonymous>` synthetic frames

The first non-internal frame becomes the **user frame** — the source location shown in encounters and events.

### Normalize Output

```javascript
{
  type: 'null-reference',
  message: 'Cannot read properties of undefined (reading \'token\')',
  file: 'src/auth/session.js',
  line: 42,
  column: 15,
  fn: 'getSession',
  rawLines: [...]
}
```

## Stage 4: Classify

Classification assigns severity, maps error types to BugMon types, and produces a canonical BugEvent.

**Implementation:** `core/bug-event.js` (re-exported via `domain/ingestion/classifier.js`)

### Severity Mapping

| Error Type | Severity |
|-----------|----------|
| `deprecation`, `lint-warning` | 1 (Minor) |
| `type-mismatch`, `undefined-reference`, `type-error`, `file-not-found`, `import`, `key-error`, `lint-error`, `generic` | 2 (Low) |
| `null-reference`, `syntax`, `range-error`, `network`, `permission`, `assertion`, `merge-conflict`, `test-failure`, `unhandled-promise`, `ci-failure` | 3 (Medium) |
| `stack-overflow`, `broken-pipe`, `memory-leak`, `concurrency`, `security-finding` | 4 (High) |
| (reserved for system-level failures) | 5 (Critical) |

### Error Type to BugMon Type Mapping

| Error Type | BugMon Type |
|-----------|-------------|
| `null-reference`, `type-mismatch`, `type-error`, `stack-overflow`, `range-error`, `network`, `memory-leak`, `concurrency` | backend |
| `syntax` | frontend |
| `file-not-found`, `import`, `merge-conflict`, `ci-failure` | devops |
| `permission`, `security-finding` | security |
| `assertion`, `test-failure`, `lint-*` | testing |
| `deprecated` | architecture |

### Classify Output (BugEvent)

```javascript
{
  id: 'hash_of_type_message_file_line',
  type: 'null-reference',
  message: 'Cannot read properties of undefined (reading \'token\')',
  file: 'src/auth/session.js',
  line: 42,
  severity: 3,
  frequency: 1
}
```

## Stage 5: Deduplicate

Events are deduplicated using stable fingerprints. Same error in the same location within a session is the same event.

**Implementation:** `domain/ingestion/fingerprint.js`

### Fingerprint Computation

```
fingerprint = simpleHash(type + ":" + message + ":" + file + ":" + line)
```

### Deduplication Rules

- If a new event has the same fingerprint as an existing event in the session:
  - Increment frequency counter on the existing event
  - Keep the version with more stack trace frames (richer metadata)
  - Do not create a new event
- If the fingerprint is new, create a new event

This prevents the same error from spawning multiple encounters while tracking how often it recurs.

## Stage 6: Persist

Events are written to the event store for the current session.

**Current implementation:** localStorage via `ecosystem/storage.js`

**Target implementation:** File-based event store (`.bugmon/events/`) + localStorage for browser, enabling:
- Cross-session persistence
- Event stream export for replay
- Audit trail for governance events

## Stage 7: Emit

Events are broadcast to subscribers via the EventBus.

**Implementation:** `domain/event-bus.js`

### Current Subscribers

| Subscriber | Purpose | Path |
|-----------|---------|------|
| Terminal encounter renderer | Display encounter UI | `core/cli/encounter.js` |
| Browser battle engine | Trigger battle state | `game/battle/battleEngine.js` |
| Bug Grimoire | Record enemy types defeated | `ecosystem/bugdex.js` |
| Dev activity tracker | Track events for evolution | `game/evolution/tracker.js` |
| Sync protocol | Broadcast to browser | `core/cli/sync-server.js` |

### Planned Subscribers

| Subscriber | Purpose |
|-----------|---------|
| Run engine | Track run statistics and difficulty |
| Replay recorder | Persist event stream for replay |
| Stats engine | Aggregate lifetime statistics |
| AgentGuard feedback | Notify agent of governance decisions |

## Full Pipeline Example

```
1. Developer runs: npx bugmon watch -- npm test

2. Test output contains:
   "TypeError: Cannot read properties of undefined (reading 'token')
       at getSession (src/auth/session.js:42:15)"

3. SOURCE: stderr captured by watch adapter

4. PARSE: → { type: 'null-reference',
               message: "Cannot read properties...",
               rawLines: [...] }

5. NORMALIZE: → adds file: 'src/auth/session.js',
                     line: 42, fn: 'getSession'

6. CLASSIFY: → { severity: 3, bugmonType: 'backend' }

7. DEDUPLICATE: → fingerprint: 'fp_3a7f2e' (new, create event)

8. PERSIST: → written to event store

9. EMIT: → EventBus.emit('ERROR_OBSERVED', event)
          → Terminal shows: "A wild NullPointer appeared!"
          → Grimoire records enemy type
          → Run engine updates difficulty
```

## Extending the Pipeline

New event sources can be added by implementing a source adapter that feeds raw text into Stage 2. The remaining stages operate generically on parsed output.

New error patterns can be added by extending the pattern list in `core/error-parser.js`. No changes to downstream stages are required.

New classification rules can be added by extending the severity and type mappings in `core/bug-event.js`.

See [Plugin API](plugin-api.md) for the formal extension point definitions.
