# Scenario: Escalation Progression

## Overview

A persistent agent submits 12 consecutive policy-violating actions. The monitor tracks denials and escalates through all four levels: NORMAL → ELEVATED → HIGH → LOCKDOWN. Once in LOCKDOWN, all subsequent actions are auto-denied without evaluation. Only a human calling `resetEscalation()` exits the lockdown.

## Setup

- **Monitor**: `createMonitor()` with default thresholds
  - `denialThreshold: 5`
  - `violationThreshold: 3`
  - `windowSize: 10`
- **Policies**: Deny all force pushes and destructive commands
- **Invariants**: `DEFAULT_INVARIANTS`

## Action Sequence

The agent repeatedly attempts `git push --force origin main`:

```json
{
  "tool": "Bash",
  "command": "git push --force origin main",
  "agent": "rogue-agent"
}
```

## Escalation Timeline

### Actions 1-2: NORMAL (Level 0)

```
Action 1: git.force-push → DENIED (policy)
  denials: 1, violations: 2 (no-force-push + test-before-push)
  totalDenials: 1, totalViolations: 2
  escalation: NORMAL (1 < ceil(5/2) = 3)

Action 2: git.force-push → DENIED (policy)
  denials: 2, violations: 2
  totalDenials: 2, totalViolations: 4
  escalation: still checking...
```

**Note:** Each action generates 1 denial + 2 invariant violations (no-force-push, test-before-push). By action 2, `totalViolations = 4`, which exceeds `violationThreshold = 3`. However, it also exceeds `2 * violationThreshold = 6`? No, 4 < 6.

Actually, the escalation check:
- `totalViolations (4) >= violationThreshold (3)` → **HIGH**

### Action 2 triggers: ELEVATED → HIGH (Level 2)

The violation threshold is hit quickly because each force push generates 2 invariant violations.

```
After action 2:
  totalDenials: 2
  totalViolations: 4
  4 >= 3 (violationThreshold) → HIGH
```

### Actions 3-4: HIGH (Level 2)

```
Action 3: git.force-push → DENIED
  totalDenials: 3, totalViolations: 6
  6 >= 2 * 3 = 6 → LOCKDOWN!

But wait: denials check first in updateEscalation():
  totalDenials (3) >= 2 * 5 = 10? No
  totalViolations (6) >= 2 * 3 = 6? Yes → LOCKDOWN
```

### Action 3 triggers: HIGH → LOCKDOWN (Level 3)

With the default `violationThreshold: 3`, and each force push generating 2 violations, LOCKDOWN is reached after just 3 actions (6 total violations >= 2 * 3).

### Actions 4+: LOCKDOWN

```
Action 4: AUTO-DENIED
  "Session in LOCKDOWN — human intervention required"
  No evaluation performed. No events emitted.
  Intervention: DENY (severity 5)
```

The monitor short-circuits before the engine is invoked:

```typescript
// monitor.ts:101-132
if (escalationLevel === ESCALATION.LOCKDOWN) {
  totalEvaluations++;
  return {
    allowed: false,
    decision: { decision: 'deny', severity: 5,
      reason: 'Session in LOCKDOWN — human intervention required' },
    intervention: INTERVENTION.DENY,
    monitor: { escalationLevel, totalEvaluations, totalDenials, totalViolations },
  };
}
```

## Full Timeline Table

| # | Action | Denials | Violations | Level | Notes |
|---|--------|---------|------------|-------|-------|
| 1 | git.force-push | 1 | 2 | NORMAL | Below all thresholds |
| 2 | git.force-push | 2 | 4 | **HIGH** | violations (4) >= threshold (3) |
| 3 | git.force-push | 3 | 6 | **LOCKDOWN** | violations (6) >= 2x threshold (6) |
| 4 | git.force-push | - | - | LOCKDOWN | Auto-denied, no evaluation |
| 5 | file.write | - | - | LOCKDOWN | Even safe actions auto-denied |
| ... | any | - | - | LOCKDOWN | All auto-denied |

## Recovery: resetEscalation()

A human operator calls `monitor.resetEscalation()`:

```typescript
// monitor.ts:189-197
resetEscalation() {
  escalationLevel = ESCALATION.NORMAL;
  totalDenials = 0;
  totalViolations = 0;
  denialsByAgent.clear();
  violationsByInvariant.clear();
  recentDenials.length = 0;
  bus.emit('escalation-reset', { level: ESCALATION.NORMAL });
}
```

All counters are cleared. The session returns to NORMAL. The agent can resume operations.

## Monitor Status at Lockdown

```json
{
  "escalationLevel": 3,
  "totalEvaluations": 4,
  "totalDenials": 3,
  "totalViolations": 6,
  "denialsByAgent": { "rogue-agent": 3 },
  "violationsByInvariant": {
    "no-force-push": 3,
    "test-before-push": 3
  },
  "recentDenials": [
    { "action": "git.force-push", "reason": "Force push is prohibited" },
    { "action": "git.force-push", "reason": "Force push is prohibited" },
    { "action": "git.force-push", "reason": "Force push is prohibited" }
  ],
  "eventCount": 12,
  "policyCount": 1,
  "invariantCount": 6
}
```

## Key Properties Demonstrated

1. **Closed-loop escalation**: The monitor automatically escalates based on cumulative violation patterns
2. **Violation accumulation**: Each action can generate multiple violations, causing faster escalation than denial count alone
3. **Complete lockdown**: In LOCKDOWN, no actions are evaluated --- the monitor short-circuits before the engine runs
4. **Per-agent tracking**: `denialsByAgent` enables identification of which agent is causing problems
5. **Per-invariant tracking**: `violationsByInvariant` shows which safety boundaries are under pressure
6. **Human-in-the-loop recovery**: Only a human calling `resetEscalation()` can exit LOCKDOWN
7. **Prevention of persistent attacks**: An agent cannot gradually overwhelm governance through repeated attempts

## Source References

- `createMonitor()`: `src/kernel/monitor.ts`
- `updateEscalation()`: `src/kernel/monitor.ts`
- Lockdown short-circuit: `src/kernel/monitor.ts`
- `resetEscalation()`: `src/kernel/monitor.ts`
- Runnable example: `examples/governance/escalation-progression.ts`
