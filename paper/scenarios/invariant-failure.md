# Scenario: Invariant Failure (Blast Radius Exceeded)

## Overview

An agent modifies 25 files in a single operation, exceeding the default blast radius limit of 20. The `blast-radius-limit` invariant fires, and a `BLAST_RADIUS_EXCEEDED` event is also emitted by the AAB. This demonstrates invariant-based safety that is independent of action type.

## Setup

- **Engine**: Configured with a permissive policy (allow file.write)
- **Invariants**: `DEFAULT_INVARIANTS` (6 invariants, blast-radius-limit default: 20)
- **Policies**:
  ```json
  [{
    "id": "dev-policy",
    "name": "Development Policy",
    "severity": 2,
    "rules": [
      { "action": "file.*", "effect": "allow", "conditions": { "limit": 20 } }
    ]
  }]
  ```

## Agent Action

```json
{
  "tool": "Write",
  "file": "src/refactored-module.ts",
  "agent": "optimizer-agent",
  "filesAffected": 25
}
```

## Step 1: Intent Normalization

1. `TOOL_ACTION_MAP["Write"]` → `file.write`
2. Not a shell command, so no git detection or destructive check
3. `filesAffected: 25` carried through from raw action

**Output:**
```json
{
  "action": "file.write",
  "target": "src/refactored-module.ts",
  "agent": "optimizer-agent",
  "filesAffected": 25,
  "destructive": false
}
```

## Step 2: Policy Evaluation

1. No deny rules match `file.write`
2. Allow rule matches: `file.*` → `file.write` (wildcard prefix match)
3. Condition check: `limit: 20`, `filesAffected: 25` → 25 > 20 → condition triggers but action still matches the allow rule

**Result:**
```json
{
  "allowed": true,
  "decision": "allow",
  "matchedRule": { "action": "file.*", "effect": "allow" },
  "matchedPolicy": { "id": "dev-policy" },
  "reason": "Allowed by policy \"Development Policy\"",
  "severity": 0
}
```

**However**, the AAB also checks blast radius independently:

```typescript
// aab.ts:169-188
if (intent.filesAffected > tightestLimit) {
  events.push(createEvent(BLAST_RADIUS_EXCEEDED, {
    filesAffected: 25, limit: 20, action: 'file.write'
  }));
}
```

A `BLAST_RADIUS_EXCEEDED` event is emitted.

## Step 3: System State Construction

```json
{
  "modifiedFiles": [],
  "targetBranch": "",
  "directPush": false,
  "forcePush": false,
  "isPush": false,
  "testsPass": undefined,
  "filesAffected": 25,
  "blastRadiusLimit": 20,
  "protectedBranches": ["main", "master"]
}
```

## Step 4: Invariant Checking

| Invariant | Check | Result |
|-----------|-------|--------|
| `no-secret-exposure` | No modified files list | HOLDS |
| `protected-branch` | Not a push | HOLDS |
| `blast-radius-limit` | `25 > 20` | **VIOLATED** |
| `test-before-push` | Not a push | HOLDS |
| `no-force-push` | Not a force push | HOLDS |
| `lockfile-integrity` | No manifest changes | HOLDS |

**1 invariant violation:**
```json
{
  "invariant": "blast-radius-limit",
  "severity": 3,
  "expected": "At most 20 files modified",
  "actual": "25 files modified"
}
```

## Step 5: Combined Decision

The policy allowed the action (`authResult.allowed = true`), but the invariant was violated (`allHold = false`):

```typescript
// engine.ts:115
const allowed = authResult.allowed && allHold;  // true && false = false
```

**The invariant overrides the policy.** The action is denied even though the policy allowed it. This demonstrates that invariants provide a safety floor that policies cannot override.

## Step 6: Intervention Selection

```
maxSeverity = max(0, 3) = 3
3 >= 3 → ROLLBACK
```

## Step 7: Evidence Pack

```json
{
  "packId": "pack_c9f5d4...",
  "timestamp": 1709913600000,
  "intent": { "action": "file.write", "target": "src/refactored-module.ts", "filesAffected": 25 },
  "decision": { "allowed": true, "reason": "Allowed by policy", "severity": 0 },
  "violations": [
    { "invariantId": "blast-radius-limit", "name": "Blast Radius Limit", "severity": 3,
      "expected": "At most 20 files modified", "actual": "25 files modified" }
  ],
  "events": ["evt_1", "evt_2"],
  "summary": "Action: file.write on src/refactored-module.ts | Decision: ALLOW | Violations: Blast Radius Limit",
  "severity": 3
}
```

## Events Emitted

| # | Event Kind | Key Data |
|---|-----------|----------|
| 1 | `BLAST_RADIUS_EXCEEDED` | filesAffected: 25, limit: 20, action: file.write |
| 2 | `INVARIANT_VIOLATION` | invariant: blast-radius-limit, expected: 20, actual: 25 |
| 3 | `EVIDENCE_PACK_GENERATED` | packId, severity: 3, violationCount: 1 |

## Key Properties Demonstrated

1. **Invariants override policies**: Even when a policy allows an action, invariant violations can deny it
2. **State-based safety**: The blast radius limit checks the *number of files affected*, not the specific action type
3. **Action-independent enforcement**: The same invariant fires regardless of whether files are modified via `file.write`, `git.merge`, or any other action
4. **ROLLBACK intervention**: Severity 3 suggests the system should roll back the changes, not just block them
5. **Composable governance**: Policy evaluation and invariant checking are independent subsystems that compose via `allowed = authResult.allowed && allHold`

## Source References

- Blast radius invariant: `src/invariants/definitions.ts`
- AAB blast radius check: `src/kernel/aab.ts`
- Combined decision: `src/kernel/decision.ts`
- Runnable example: `examples/governance/invariant-failure.ts`
