# Scenario: Policy Violation (Force Push to Protected Branch)

## Overview

An agent attempts `git push --force origin main`. Multiple governance layers fire simultaneously: a policy deny rule, the `no-force-push` invariant, and the `protected-branch` invariant. This demonstrates how policies and invariants compose.

## Setup

- **Engine**: Configured with a policy denying force pushes
- **Invariants**: `DEFAULT_INVARIANTS` (6 invariants)
- **Policies**:
  ```json
  [{
    "id": "branch-safety",
    "name": "Branch Safety Policy",
    "severity": 4,
    "rules": [
      { "action": "git.force-push", "effect": "deny", "reason": "Force push is prohibited" },
      { "action": "git.push", "effect": "deny", "conditions": { "branches": ["main", "master"] }, "reason": "Direct push to protected branch" }
    ]
  }]
  ```

## Agent Action

```json
{
  "tool": "Bash",
  "command": "git push --force origin main",
  "agent": "builder-agent"
}
```

## Step 1: Intent Normalization

1. `TOOL_ACTION_MAP["Bash"]` → `shell.exec`
2. `detectGitAction("git push --force origin main")` → `git.force-push` (matches `/\bgit\s+push\s+--force\b/`)
3. Action overridden to `git.force-push`
4. `extractBranch()` → `main`
5. `isDestructiveCommand()` → `false` (git push is not in the destructive patterns)

**Output:**
```json
{
  "action": "git.force-push",
  "target": "main",
  "agent": "builder-agent",
  "branch": "main",
  "command": "git push --force origin main",
  "destructive": false
}
```

## Step 2: Policy Evaluation

`evaluate(intent, policies)` processes deny rules first:

1. Rule: `{ action: "git.force-push", effect: "deny" }`
2. `matchAction("git.force-push", "git.force-push")` → `true` (exact match)
3. `matchConditions()` → `true` (no conditions on this rule)
4. **Match found** → deny

**Result:**
```json
{
  "allowed": false,
  "decision": "deny",
  "matchedRule": { "action": "git.force-push", "effect": "deny" },
  "matchedPolicy": { "id": "branch-safety", "severity": 4 },
  "reason": "Force push is prohibited",
  "severity": 4
}
```

A `POLICY_DENIED` event is emitted.

## Step 3: System State Construction

`buildSystemState()` constructs state from the intent and context:

```json
{
  "modifiedFiles": [],
  "targetBranch": "main",
  "directPush": false,
  "forcePush": true,
  "isPush": true,
  "testsPass": undefined,
  "filesAffected": 0,
  "blastRadiusLimit": 20,
  "protectedBranches": ["main", "master"]
}
```

Note: `forcePush` is set because `intent.action === 'git.force-push'`. The engine computes these flags from the normalized intent.

## Step 4: Invariant Checking

| Invariant | Check | Result |
|-----------|-------|--------|
| `no-secret-exposure` | No modified files | HOLDS |
| `protected-branch` | `isPush` but not `directPush` | HOLDS (force push doesn't set directPush) |
| `blast-radius-limit` | 0 <= 20 | HOLDS |
| `test-before-push` | `isPush` but `testsPass` is undefined | **VIOLATED** |
| `no-force-push` | `forcePush === true` | **VIOLATED** |
| `lockfile-integrity` | No manifest changes | HOLDS |

**2 invariant violations** → 2 `INVARIANT_VIOLATION` events emitted.

## Step 5: Intervention Selection

```
maxSeverity = max(
  4,              // policy severity
  3,              // test-before-push severity
  4               // no-force-push severity
) = 4

4 >= 4 → PAUSE
```

## Step 6: Evidence Pack

```json
{
  "packId": "pack_b8e4c3...",
  "timestamp": 1709913600000,
  "intent": { "action": "git.force-push", "target": "main", "branch": "main" },
  "decision": { "allowed": false, "reason": "Force push is prohibited", "severity": 4 },
  "violations": [
    { "invariantId": "test-before-push", "name": "Tests Before Push", "severity": 3,
      "expected": "Tests passing", "actual": "Tests not verified" },
    { "invariantId": "no-force-push", "name": "No Force Push", "severity": 4,
      "expected": "No force push", "actual": "Force push detected" }
  ],
  "events": ["evt_1", "evt_2", "evt_3"],
  "summary": "Action: git.force-push on main | Decision: DENY | Reason: Force push is prohibited | Violations: Tests Before Push, No Force Push",
  "severity": 4
}
```

## Events Emitted

| # | Event Kind | Key Data |
|---|-----------|----------|
| 1 | `POLICY_DENIED` | policy: branch-safety, action: git.force-push, reason: Force push is prohibited |
| 2 | `INVARIANT_VIOLATION` | invariant: test-before-push, expected: Tests passing, actual: Tests not verified |
| 3 | `INVARIANT_VIOLATION` | invariant: no-force-push, expected: No force push, actual: Force push detected |
| 4 | `EVIDENCE_PACK_GENERATED` | packId, severity: 4, violationCount: 2 |

## Key Properties Demonstrated

1. **Multi-layer governance**: Policy deny + invariant violations fire for the same action
2. **Comprehensive violation report**: Evidence pack captures all violations with expected/actual values
3. **Severity composition**: Maximum severity across all governance layers determines intervention
4. **Fail-closed**: Deny rules checked first; a single deny is sufficient
5. **Structured audit**: Every denial and violation has a human-readable reason

## Source References

- `detectGitAction()`: `src/kernel/aab.ts`
- Policy evaluation (deny first): `src/policy/evaluator.ts`
- State construction: `src/kernel/decision.ts`
- Invariant checking: `src/invariants/checker.ts`
- Runnable example: `examples/governance/policy-violation.ts`
