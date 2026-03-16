# Design: `formatPass` State Flag + `requireFormat` Policy Condition

**Date:** 2026-03-15
**Status:** Approved
**Scope:** Policy-driven formatting gate for `git.commit` actions

## Problem

`pnpm format` (Prettier `--check`) fails in CI because the kernel has no mechanism to
enforce formatting before commit. The existing `agentguard.yaml` rule attempts this:

```yaml
- action: git.commit
  effect: deny
  requireTests: true
  reason: Run pnpm format:fix before committing
```

Two bugs:
1. **Wrong field** -- uses `requireTests` but the intent is formatting.
2. **Evaluator ignores `requireTests`** -- `matchConditions()` in `evaluator.ts` checks
   `scope`, `limit`, `branches`, and `persona` but never reads `requireTests`. The
   condition is parsed and stored but has no effect, so the deny rule fires
   unconditionally on all `git.commit` actions.

## Solution

Add a `formatPass` state flag (mirrors `testsPass`) and a `requireFormat` policy
condition (mirrors `requireTests`). Fix the evaluator to actually check both
`requireTests` and `requireFormat`.

### Data Flow

```
Agent runs `pnpm format` -> kernel observes shell.exec -> session tracks formatPass=true
                                                           |
Agent attempts git.commit -> policy evaluator checks requireFormat condition
                                                           |
                          formatPass=true? -> allow    formatPass=false? -> deny
```

### Key wiring detail: `systemContext` -> `intent.metadata`

The evaluator reads `intent.metadata` but `formatPass`/`testsPass` arrive via
`systemContext` (passed by CLI callers). These are two separate paths:

- `rawAction.metadata` -- set by the adapter from the hook payload
- `systemContext` -- set by the CLI from session-level state

The kernel's `decision.ts` `evaluate()` method must merge relevant `systemContext` flags
into `rawAction.metadata` before calling `authorize()`, so that the policy evaluator can
read them from `intent.metadata`. This is change #9.

## Changes

### 1. `SystemState` -- add `formatPass` field

**`packages/invariants/src/definitions.ts`** `SystemState` interface:
```typescript
formatPass?: boolean;
```

**`packages/core/src/types.ts`** `SystemState` interface (line ~836):
```typescript
readonly formatPass?: boolean;
```

### 2. `buildSystemState()` -- wire `formatPass`

**`packages/invariants/src/checker.ts`** `buildSystemState()`:
```typescript
formatPass: context.formatPass as boolean | undefined,
```

### 3. Policy condition types -- add `requireFormat`

**`packages/policy/src/evaluator.ts`** `PolicyRule.conditions`:
```typescript
requireFormat?: boolean;
```

### 4. Evaluator -- fix `matchConditions()` (bug fix + new feature)

**`packages/policy/src/evaluator.ts`** `matchConditions()`:

Add BEFORE the existing `scope` check (so these gate conditions short-circuit before
other conditions are evaluated):

```typescript
// requireTests: skip this rule entirely when tests have passed (gate condition)
if (conditions.requireTests && intent.metadata?.testsPass === true) {
  return { matched: false };
}

// requireFormat: skip this rule entirely when formatting has passed (gate condition)
if (conditions.requireFormat && intent.metadata?.formatPass === true) {
  return { matched: false };
}
```

Semantics: For a deny rule with `requireFormat: true`, the rule matches (denies) by
default. The ONLY way to skip the deny is if `formatPass === true` in the intent
metadata. This means:
- `formatPass` missing/undefined -> deny fires (safe default)
- `formatPass: false` -> deny fires
- `formatPass: true` -> deny skipped, action proceeds to next rule

By placing these checks first and only returning `matched: false` (skip), all
subsequent conditions (scope, branches, limit, persona) still compose correctly when
the gate condition is not satisfied. The function falls through to normal evaluation.

### 5. YAML parser -- parse `requireFormat`

**`packages/policy/src/yaml-loader.ts`**:

Add to `YamlRule` interface:
```typescript
requireFormat?: boolean;
```

Add case to `applyRuleField()`:
```typescript
case 'requireFormat':
  rule.requireFormat = val === 'true';
  break;
```

Add to `convertRule()`:
```typescript
if (yamlRule.requireFormat !== undefined) {
  conditions.requireFormat = yamlRule.requireFormat;
  hasConditions = true;
}
```

### 6. MCP server schema -- add `formatPass`

**`apps/mcp-server/src/tools/governance.ts`**:
```typescript
formatPass: z.boolean().optional().describe('Has formatting (Prettier) passed?'),
```

### 7. Default policy -- fix the rule

**`agentguard.yaml`**:
```yaml
# Code quality -- require formatting before commit
- action: git.commit
  effect: deny
  requireFormat: true
  reason: Run pnpm format:fix before committing -- all files must pass Prettier
```

### 8. CLI policy command -- serialize `requireFormat`

**`apps/cli/src/commands/policy.ts`** (after the existing `requireTests` block):
```typescript
if (r.requireFormat !== undefined) {
  rule.conditions = { ...(rule.conditions as object), requireFormat: r.requireFormat };
}
```

### 9. Decision engine -- merge `systemContext` flags into `rawAction.metadata`

**`packages/kernel/src/decision.ts`** `evaluate()` method:

Before calling `authorize(rawAction, policies)`, merge session-level flags:

```typescript
// Merge session-level state flags into rawAction.metadata so the policy
// evaluator can read them via intent.metadata (evaluator has no access to systemContext)
const enrichedAction = {
  ...rawAction,
  metadata: {
    ...rawAction?.metadata,
    testsPass: systemContext.testsPass ?? rawAction?.metadata?.testsPass,
    formatPass: systemContext.formatPass ?? rawAction?.metadata?.formatPass,
  },
};
```

Then pass `enrichedAction` to `authorize()` instead of `rawAction`.

### 10. CLI init scaffold -- update templates

**`apps/cli/src/commands/init.ts`**:
- Add `formatPass?: boolean` to the scaffolded `SystemState` interface (~line 293)
- Update the example policy-pack template to show `requireFormat` alongside `requireTests`

## How `formatPass` gets set

The CLI session tracker observes `shell.exec` actions. When a command matching
`prettier` or `pnpm format` succeeds (exit code 0), the session sets
`formatPass = true` in the system context for subsequent evaluations.

This mirrors how `testsPass` is tracked -- lightweight, no extra subprocess, just
observing what the agent already does.

## Test Plan

1. **Unit: evaluator** -- `requireFormat: true` denies `git.commit` when `formatPass` is
   falsy; allows when `formatPass: true` in metadata.
2. **Unit: evaluator** -- `requireTests: true` denies `git.commit` when `testsPass` is
   falsy; allows when `testsPass: true` (fixes existing bug).
3. **Unit: evaluator** -- Gate conditions compose with other conditions: a rule with both
   `requireFormat: true` and `branches: [main]` skips correctly when format passes,
   regardless of branch.
4. **Unit: YAML loader** -- `requireFormat` parsed correctly from YAML.
5. **Unit: checker** -- `buildSystemState()` includes `formatPass`.
6. **Unit: decision engine** -- `systemContext.formatPass` is merged into
   `rawAction.metadata` before policy evaluation.
7. **Integration: e2e pipeline** -- `git.commit` action denied when `formatPass` not set,
   allowed when `formatPass: true` passed in context.
8. **Integration: policy command** -- `requireFormat` conditions round-trip through
   policy serialization.
9. **Policy validation** -- `agentguard.yaml` loads without errors after change.
10. **Benchmark check** -- Verify `policy-evaluation.bench.ts` fixture using
    `requireTests: true` still works correctly after evaluator fix (semantic change:
    it will now always fire the deny since no `testsPass` is provided).

## Non-Goals

- No new built-in invariant (this is policy-driven, not baked into the kernel).
- No automatic formatter execution (the kernel observes, it doesn't run formatters).
- No changes to CI workflows (this catches the problem *before* push).
