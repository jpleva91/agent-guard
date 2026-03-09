# Test Coverage Analysis

**Date:** 2026-03-09
**Test suite:** 495 passing tests across 36 vitest files + 14 JS test files

## Current Coverage Summary

| Area | Source Files | With Tests | Coverage |
|------|-------------|------------|----------|
| kernel/ | 7 + 5 simulation | All | Strong |
| events/ | 5 | 4 of 5 | Good |
| policy/ | 3 | 3 | Strong |
| invariants/ | 2 | 2 | Strong |
| adapters/ | 5 | 4 of 5 | Good |
| cli/ | 10 | 7 of 10 | Gaps |
| core/ | 8 | 4 of 8 | Gaps |

## Priority 1: Untested Business Logic

### `core/execution-log/event-projections.ts` — NO TESTS

This is the highest-priority gap. It contains ~270 lines of pure domain logic with zero test coverage:

- **`scoreAgentRun()`** — Risk scoring algorithm with weighted factors (failures, violations, skipped tests, sensitive file edits, action velocity). Bugs here silently produce wrong risk assessments. Needs tests for:
  - Zero-event runs (score = 0, level = "low")
  - Runs with only failures, only violations, mixed
  - Sensitive file detection (`.env`, `auth`, `password`, `token`, etc.)
  - High action rate threshold (>50 actions)
  - Risk level boundaries: low (<15), medium (15-39), high (40-74), critical (>=75)

- **`clusterFailures()`** — Groups failures by file and time proximity. Complex windowing logic with two code paths (file-based and time-based). Needs tests for:
  - Empty failure set
  - Single failure (single cluster)
  - Multiple failures in same file within window (one cluster)
  - Multiple failures in same file outside window (two clusters)
  - Failures without file context (time-based clustering)
  - Severity capping at 5
  - Sort order (highest severity first)

- **`mapToEncounter()`** — Maps events to game encounters. Needs tests for:
  - Each mapped kind (RUNTIME_EXCEPTION, TEST_SUITE_FAILED, BUILD_FAILED, DEPLOYMENT_FAILED)
  - Non-failure events returning null
  - Description fallback when no message in payload

### `events/decision-jsonl.ts` — NO TESTS

File I/O persistence for governance decisions. Needs tests for:
- Writing a record produces valid JSONL
- Directory creation on first write (lazy init)
- Multiple writes append correctly
- `getDecisionFilePath()` produces correct path
- Write errors are swallowed (doesn't crash kernel)

## Priority 2: Thin Coverage on Critical Paths

### `cli/commands/guard.ts` — 5 TESTS (minimal)

The guard command is the primary entry point for the runtime. Current tests only verify policy file extension detection and basic kernel creation. Missing:
- Stdin JSON parsing and action processing loop
- Policy file loading from YAML vs JSON
- `findDefaultPolicy()` searching candidate filenames
- `--dry-run` flag propagation
- Error handling: invalid JSON input, missing policy file, malformed policy
- Exit code behavior (0 for success, non-zero for violations)
- Integration with TUI rendering output

### `kernel/kernel.ts` — Missing edge cases

The kernel has 17 + 9 integration tests but is missing:
- Concurrent `propose()` calls (race conditions in event emission)
- Adapter execution failures (error propagation, event emission)
- Monitor lockdown blocking all subsequent actions
- Simulation result integration into decision records

## Priority 3: Untested Utility Modules

### `core/hash.ts` — NO TESTS

Exports `simpleHash()` used for fingerprints across the system. Small module but used pervasively. Needs tests for:
- Deterministic output for same input
- Different output for different inputs
- Empty string handling
- Return type/format validation

### `core/execution-log/event-schema.ts` — NO TESTS

Defines execution event kinds (constants) and creation functions. Needs tests for:
- Event kind constant values
- Event creation produces valid structure
- Required field validation

### `adapters/registry.ts` — NO TESTS

`createLiveRegistry()` wires up file/shell/git adapters. Needs integration tests verifying:
- Registry returns correct adapter for each action class
- Unknown action classes return undefined/null
- Dry-run registry vs live registry behavior difference

## Priority 4: CLI Presentation Layer

### `cli/bin.ts` — NO TESTS

Main CLI entry point. Lower priority since it's thin orchestration, but needs tests for:
- Command routing (guard, inspect, events, replay, claude-hook, claude-init)
- Unknown command handling
- `--help` and `--version` flags

### `cli/colors.ts` — NO TESTS

ANSI color utilities (`color()`, `bold()`, `dim()`, `visLen()`, `padVis()`). Lower risk but `visLen()` and `padVis()` have logic that strips ANSI codes for visual length calculation — bugs here misalign TUI output.

### `cli/commands/replay.ts` — NO TESTS

Replay command registration and handler.

## Recommendations

1. **Start with `event-projections.ts`** — It's pure domain logic (no I/O mocking needed), high-risk (risk scoring affects governance decisions), and completely untested. Easiest high-value win.

2. **Add `decision-jsonl.ts` tests** — Follow the pattern already established in `jsonl-sink.test.ts` (the event JSONL sink tests). Use tmp directories for file I/O.

3. **Expand `cli-guard.test.ts`** — The guard command is the user-facing entry point. Add tests for stdin processing, policy loading, and error paths. Mock fs/stdin rather than testing extension strings.

4. **Add `core/hash.ts` tests** — Quick win, 15 minutes of work, removes a gap in a widely-used utility.

5. **Add `event-schema.ts` tests** — Another quick pure-logic test file.

6. **Consider integration tests** — The existing `kernel-integration.test.ts` is good but could be expanded to test the full pipeline: raw agent action → AAB → policy → invariants → adapter → events → JSONL persistence.
