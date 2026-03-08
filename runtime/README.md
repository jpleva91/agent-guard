# Runtime Layer

This directory stores execution telemetry produced during BugMon sessions.

## Structure

```
runtime/
├── events/     # Canonical events emitted during sessions
└── replay/     # Session traces for debugging and analysis
```

## Events

Event files are written as newline-delimited JSON (NDJSON). Each line is a canonical event:

```json
{"kind": "ERROR_OBSERVED", "source": "vitest", "message": "Cannot read property 'x' of null", "file": "auth.test.ts", "severity": 3, "fingerprint": "a1b2c3", "timestamp": 1710000000}
{"kind": "BATTLE_STARTED", "monsterId": 1, "monsterName": "NullPointer", "timestamp": 1710000001}
{"kind": "MOVE_USED", "move": "segfault", "damage": 12, "timestamp": 1710000002}
{"kind": "BATTLE_WON", "monsterId": 1, "timestamp": 1710000005}
```

## Replay

Replay files capture full session traces for debugging and agent analysis:

```json
[
  {"kind": "ERROR_OBSERVED", "timestamp": 1710000000},
  {"kind": "BATTLE_STARTED", "timestamp": 1710000001},
  {"kind": "MOVE_USED", "timestamp": 1710000002},
  {"kind": "BATTLE_WON", "timestamp": 1710000005}
]
```

## Usage by Agents

Agents can:
- Read `events/` to understand recent system activity
- Analyze `replay/` traces to debug session behavior
- Use event patterns to identify recurring issues

## Gitignore

Event and replay data files are gitignored (only `.gitkeep` is tracked). Session data stays local.
