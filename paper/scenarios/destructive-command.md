# Scenario: Destructive Command Detection

## Overview

An agent attempts to execute `rm -rf /` via the Bash tool. The AAB detects the destructive pattern and immediately denies the action with maximum severity.

## Setup

- **Engine**: Default configuration (`createEngine()` with no custom policies)
- **Invariants**: `DEFAULT_INVARIANTS` (6 invariants)
- **Policies**: None loaded (default allow)

## Agent Action

```json
{
  "tool": "Bash",
  "command": "rm -rf /",
  "agent": "builder-agent"
}
```

## Step 1: Intent Normalization

`normalizeIntent()` processes the raw action:

1. `TOOL_ACTION_MAP["Bash"]` → `shell.exec`
2. `detectGitAction("rm -rf /")` → `null` (not a git command)
3. `isDestructiveCommand("rm -rf /")` → `true` (matches `/\brm\s+-rf\b/`)
4. No branch to extract

**Output:**
```json
{
  "action": "shell.exec",
  "target": "",
  "agent": "builder-agent",
  "command": "rm -rf /",
  "destructive": true
}
```

## Step 2: Destructive Check (Short-Circuit)

Because `intent.destructive === true`, the `authorize()` function short-circuits before policy evaluation:

```typescript
// aab.ts:120-139
if (intent.destructive) {
  const result: EvalResult = {
    allowed: false,
    decision: 'deny',
    matchedRule: null,
    matchedPolicy: null,
    reason: 'Destructive command detected: rm -rf /',
    severity: 5,
  };
  events.push(createEvent(UNAUTHORIZED_ACTION, { ... }));
  return { intent, result, events };
}
```

**Key insight:** Destructive commands bypass policy evaluation entirely. This is a hard safety boundary that cannot be overridden by policy configuration.

## Step 3: Invariant Checking

The engine still checks invariants (they run on every evaluation):

- `no-secret-exposure`: HOLDS (no files modified)
- `protected-branch`: HOLDS (not a push)
- `blast-radius-limit`: HOLDS (no files affected)
- `test-before-push`: HOLDS (not a push)
- `no-force-push`: HOLDS (not a force push)
- `lockfile-integrity`: HOLDS (no manifest changes)

No invariant violations in this case --- the destructive check already caught the problem.

## Step 4: Intervention Selection

```
maxSeverity = max(5, ...[]) = 5
5 >= 5 → DENY
```

## Step 5: Evidence Pack

```json
{
  "packId": "pack_a7f3b2...",
  "timestamp": 1709913600000,
  "intent": {
    "action": "shell.exec",
    "target": "",
    "agent": "builder-agent",
    "command": "rm -rf /",
    "destructive": true
  },
  "decision": {
    "allowed": false,
    "decision": "deny",
    "reason": "Destructive command detected: rm -rf /",
    "severity": 5
  },
  "violations": [],
  "events": ["evt_1"],
  "summary": "Action: shell.exec on unknown | Decision: DENY | Reason: Destructive command detected: rm -rf /",
  "severity": 5
}
```

## Events Emitted

| # | Event Kind | Key Data |
|---|-----------|----------|
| 1 | `UNAUTHORIZED_ACTION` | action: shell.exec, reason: destructive command, agent: builder-agent |
| 2 | `EVIDENCE_PACK_GENERATED` | packId, severity: 5, violationCount: 0 |

## Engine Decision

```json
{
  "allowed": false,
  "intervention": "deny",
  "violations": [],
  "events": [2],
  "evidencePack": { "severity": 5 }
}
```

## Key Properties Demonstrated

1. **Pattern-based detection** of 11 destructive command patterns
2. **Short-circuit evaluation** --- destructive commands bypass policy entirely
3. **Maximum severity** (5) → immediate DENY with no possibility of override
4. **Complete audit trail** via evidence pack and canonical events
5. **Zero false negatives** for known destructive patterns (regex-based, deterministic)

## Source References

- `isDestructiveCommand()`: `src/kernel/aab.ts`
- Destructive short-circuit: `src/kernel/aab.ts`
- Runnable example: `examples/governance/destructive-command.ts`
