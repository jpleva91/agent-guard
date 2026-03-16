# formatPass Policy Condition Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `formatPass` state flag and `requireFormat` policy condition so the kernel can block `git.commit` when formatting hasn't passed. Also fix the existing bug where `requireTests` is parsed but never evaluated.

**Architecture:** Mirror the existing `testsPass`/`requireTests` pattern. Add `formatPass` to `SystemState`, `requireFormat` to policy conditions, fix `matchConditions()` to check both gate conditions, and bridge `systemContext` flags into `rawAction.metadata` so the evaluator can read them.

**Tech Stack:** TypeScript, vitest, pnpm monorepo (Turbo), YAML policy files

**Spec:** `docs/superpowers/specs/2026-03-15-format-pass-policy-condition-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/invariants/src/definitions.ts:29-63` | Add `formatPass` to `SystemState` |
| Modify | `packages/core/src/types.ts:836-851` | Add `formatPass` to core `SystemState` |
| Modify | `packages/invariants/src/checker.ts:62-85` | Wire `formatPass` in `buildSystemState()` |
| Modify | `packages/policy/src/evaluator.ts:14-25` | Add `requireFormat` to `PolicyRule.conditions` |
| Modify | `packages/policy/src/evaluator.ts:157-194` | Fix `matchConditions()` to check gate conditions |
| Modify | `packages/policy/src/yaml-loader.ts:30-39` | Add `requireFormat` to `YamlRule` |
| Modify | `packages/policy/src/yaml-loader.ts:359-361` | Parse `requireFormat` field |
| Modify | `packages/policy/src/yaml-loader.ts:389-392` | Convert `requireFormat` in `convertRule()` |
| Modify | `packages/kernel/src/decision.ts:105-110` | Merge `systemContext` flags into metadata |
| Modify | `apps/mcp-server/src/tools/governance.ts:188` | Add `formatPass` to MCP schema |
| Modify | `apps/cli/src/commands/policy.ts:71-73` | Serialize `requireFormat` conditions |
| Modify | `apps/cli/src/commands/init.ts:287-301` | Update scaffold `SystemState` |
| Modify | `apps/cli/src/commands/init.ts:436-441` | Update scaffold policy-pack example |
| Modify | `agentguard.yaml:64-68` | Fix default policy rule |
| Create | `packages/policy/tests/evaluator-gate-conditions.test.ts` | Gate condition tests |
| Modify | `packages/policy/tests/yaml-loader.test.ts` | `requireFormat` YAML parsing test |
| Modify | `packages/kernel/tests/agentguard-engine.test.ts` | Decision engine bridge + e2e gate test |
| Modify | `packages/kernel/tests/benchmarks/policy-evaluation.bench.ts:28-32` | Add comment re: semantic change |

---

## Chunk 1: Core Types and State

### Task 1: Add `formatPass` to `SystemState` interfaces

**Files:**
- Modify: `packages/invariants/src/definitions.ts:29-63`
- Modify: `packages/core/src/types.ts:836-851`

- [ ] **Step 1: Add `formatPass` to invariants `SystemState`**

In `packages/invariants/src/definitions.ts`, add after `testsPass?: boolean;` (line 35):

```typescript
  formatPass?: boolean;
```

- [ ] **Step 2: Add `formatPass` to core `SystemState`**

In `packages/core/src/types.ts`, add after `readonly testsPass?: boolean;` (line 844):

```typescript
  readonly formatPass?: boolean;
```

- [ ] **Step 3: Wire `formatPass` in `buildSystemState()`**

In `packages/invariants/src/checker.ts`, add after `testsPass: context.testsPass as boolean | undefined,` (line 69):

```typescript
    formatPass: context.formatPass as boolean | undefined,
```

- [ ] **Step 4: Run type check to verify**

Run: `pnpm ts:check --filter=@red-codes/invariants --filter=@red-codes/core`
Expected: PASS (no type errors)

- [ ] **Step 5: Commit**

```bash
git add packages/invariants/src/definitions.ts packages/core/src/types.ts packages/invariants/src/checker.ts
git commit -m "feat: add formatPass to SystemState interfaces and buildSystemState"
```

---

### Task 2: Add `formatPass` to MCP server schema

**Files:**
- Modify: `apps/mcp-server/src/tools/governance.ts:188`

- [ ] **Step 1: Add `formatPass` to check_invariants schema**

In `apps/mcp-server/src/tools/governance.ts`, add after the `testsPass` line (line 188):

```typescript
      formatPass: z.boolean().optional().describe('Has formatting (Prettier) passed?'),
```

- [ ] **Step 2: Run type check**

Run: `pnpm ts:check --filter=@red-codes/mcp-server`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/mcp-server/src/tools/governance.ts
git commit -m "feat: add formatPass to MCP check_invariants schema"
```

---

## Chunk 2: Policy Evaluator (Bug Fix + New Feature)

### Task 3: Write failing tests for gate conditions

**Files:**
- Create: `packages/policy/tests/evaluator-gate-conditions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/policy/tests/evaluator-gate-conditions.test.ts`:

```typescript
// Tests for requireTests and requireFormat gate conditions in policy evaluator
import { describe, it, expect } from 'vitest';
import { evaluate } from '@red-codes/policy';
import type { NormalizedIntent, LoadedPolicy } from '@red-codes/policy';

function makeIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
  return {
    action: 'git.commit',
    target: '',
    agent: 'test-agent',
    destructive: false,
    ...overrides,
  };
}

function makePolicyWithGate(gate: Record<string, boolean>): LoadedPolicy {
  return {
    id: 'gate-policy',
    name: 'Gate Policy',
    rules: [
      {
        action: 'git.commit',
        effect: 'deny' as const,
        conditions: gate,
        reason: 'Gate condition not met',
      },
      {
        action: 'git.commit',
        effect: 'allow' as const,
        reason: 'Default allow commits',
      },
    ],
    severity: 3,
  };
}

describe('requireFormat gate condition', () => {
  const policy = makePolicyWithGate({ requireFormat: true });

  it('denies git.commit when formatPass is missing', () => {
    const intent = makeIntent();
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Gate condition not met');
  });

  it('denies git.commit when formatPass is false', () => {
    const intent = makeIntent({ metadata: { formatPass: false } });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
  });

  it('allows git.commit when formatPass is true', () => {
    const intent = makeIntent({ metadata: { formatPass: true } });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(true);
  });
});

describe('requireTests gate condition', () => {
  const policy = makePolicyWithGate({ requireTests: true });

  it('denies git.commit when testsPass is missing', () => {
    const intent = makeIntent();
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Gate condition not met');
  });

  it('denies git.commit when testsPass is false', () => {
    const intent = makeIntent({ metadata: { testsPass: false } });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
  });

  it('allows git.commit when testsPass is true', () => {
    const intent = makeIntent({ metadata: { testsPass: true } });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(true);
  });
});

describe('gate conditions compose with other conditions', () => {
  it('skips deny when formatPass is true even with branch condition', () => {
    const policy: LoadedPolicy = {
      id: 'composed-policy',
      name: 'Composed Policy',
      rules: [
        {
          action: 'git.commit',
          effect: 'deny' as const,
          conditions: { requireFormat: true, branches: ['main'] },
          reason: 'Format required on main',
        },
        {
          action: 'git.commit',
          effect: 'allow' as const,
          reason: 'Default allow',
        },
      ],
      severity: 3,
    };

    const intent = makeIntent({
      branch: 'main',
      metadata: { formatPass: true },
    });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(true);
  });

  it('denies when formatPass is false and branch matches', () => {
    const policy: LoadedPolicy = {
      id: 'composed-policy',
      name: 'Composed Policy',
      rules: [
        {
          action: 'git.commit',
          effect: 'deny' as const,
          conditions: { requireFormat: true, branches: ['main'] },
          reason: 'Format required on main',
        },
        {
          action: 'git.commit',
          effect: 'allow' as const,
          reason: 'Default allow',
        },
      ],
      severity: 3,
    };

    const intent = makeIntent({ branch: 'main' });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test --filter=@red-codes/policy -- evaluator-gate-conditions`
Expected: FAIL — `requireFormat` not recognized in conditions type, and gate logic not implemented

---

### Task 4: Implement gate conditions in evaluator

**Files:**
- Modify: `packages/policy/src/evaluator.ts:14-25`
- Modify: `packages/policy/src/evaluator.ts:157-194`

- [ ] **Step 1: Add `requireFormat` to `PolicyRule.conditions`**

In `packages/policy/src/evaluator.ts`, add after `requireTests?: boolean;` (line 21):

```typescript
    requireFormat?: boolean;
```

- [ ] **Step 2: Add gate condition checks to `matchConditions()`**

In `packages/policy/src/evaluator.ts`, add after `if (!conditions) return { matched: true };` (line 161) and BEFORE the scope check (line 163):

```typescript

  // Gate conditions: skip this rule when the required flag is satisfied.
  // For deny rules, this means the deny is bypassed when the condition passes.
  if (conditions.requireTests && intent.metadata?.testsPass === true) {
    return { matched: false };
  }

  if (conditions.requireFormat && intent.metadata?.formatPass === true) {
    return { matched: false };
  }

```

- [ ] **Step 3: Run gate condition tests**

Run: `pnpm test --filter=@red-codes/policy -- evaluator-gate-conditions`
Expected: PASS (all 8 tests)

- [ ] **Step 4: Run full policy test suite to check for regressions**

Run: `pnpm test --filter=@red-codes/policy`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/policy/src/evaluator.ts packages/policy/tests/evaluator-gate-conditions.test.ts
git commit -m "feat: implement requireFormat and fix requireTests gate conditions in evaluator"
```

---

## Chunk 3: YAML Parser + Policy Serialization

### Task 5: Write failing YAML parsing test

**Files:**
- Modify: `packages/policy/tests/yaml-loader.test.ts`

- [ ] **Step 1: Add requireFormat YAML parsing test**

Add to end of `packages/policy/tests/yaml-loader.test.ts`:

```typescript

describe('requireFormat parsing', () => {
  it('parses requireFormat from YAML rule', () => {
    const yaml = `
id: format-policy
name: Format Policy
severity: 3
rules:
  - action: git.commit
    effect: deny
    requireFormat: true
    reason: Formatting required
`;
    const result = parseYamlPolicy(yaml);
    expect(result.rules).toHaveLength(1);
    expect(result.rules![0].requireFormat).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --filter=@red-codes/policy -- yaml-loader`
Expected: FAIL — `requireFormat` not in `YamlRule` interface

---

### Task 6: Implement YAML parser changes

**Files:**
- Modify: `packages/policy/src/yaml-loader.ts:30-39`
- Modify: `packages/policy/src/yaml-loader.ts:359-361`
- Modify: `packages/policy/src/yaml-loader.ts:389-392`

- [ ] **Step 1: Add `requireFormat` to `YamlRule` interface**

In `packages/policy/src/yaml-loader.ts`, add after `requireTests?: boolean;` (line 37):

```typescript
  requireFormat?: boolean;
```

- [ ] **Step 2: Add `requireFormat` case to `applyRuleField()`**

In `packages/policy/src/yaml-loader.ts`, add after the `requireTests` case (after line 361):

```typescript
    case 'requireFormat':
      rule.requireFormat = val === 'true';
      break;
```

- [ ] **Step 3: Add `requireFormat` to `convertRule()`**

In `packages/policy/src/yaml-loader.ts`, add after the `requireTests` conversion block (after line 392):

```typescript

  if (yamlRule.requireFormat !== undefined) {
    conditions.requireFormat = yamlRule.requireFormat;
    hasConditions = true;
  }
```

- [ ] **Step 4: Run YAML loader tests**

Run: `pnpm test --filter=@red-codes/policy -- yaml-loader`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/policy/src/yaml-loader.ts packages/policy/tests/yaml-loader.test.ts
git commit -m "feat: parse requireFormat from YAML policy files"
```

---

### Task 7: Add `requireFormat` to policy command serialization

**Files:**
- Modify: `apps/cli/src/commands/policy.ts:71-73`

- [ ] **Step 1: Add `requireFormat` serialization**

In `apps/cli/src/commands/policy.ts`, add after the `requireTests` block (after line 73):

```typescript
          if (r.requireFormat !== undefined) {
            rule.conditions = { ...(rule.conditions as object), requireFormat: r.requireFormat };
          }
```

- [ ] **Step 2: Run type check**

Run: `pnpm ts:check --filter=@red-codes/agentguard`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/cli/src/commands/policy.ts
git commit -m "feat: serialize requireFormat in policy command output"
```

---

## Chunk 4: Decision Engine Bridge + Default Policy

### Task 8: Merge systemContext flags into rawAction.metadata

**Files:**
- Modify: `packages/kernel/src/decision.ts:105-110`

- [ ] **Step 1: Add metadata enrichment before authorize()**

In `packages/kernel/src/decision.ts`, replace lines 105-110:

```typescript
    evaluate(rawAction, systemContext = {}) {
      const {
        intent,
        result: authResult,
        events: authEvents,
      } = authorize(rawAction, policies, evaluateOptions);
```

With:

```typescript
    evaluate(rawAction, systemContext = {}) {
      // Merge session-level state flags into rawAction.metadata so the policy
      // evaluator can read them via intent.metadata (evaluator has no access
      // to systemContext directly).
      const enrichedAction = rawAction
        ? {
            ...rawAction,
            metadata: {
              ...rawAction.metadata,
              testsPass: systemContext.testsPass ?? rawAction.metadata?.testsPass,
              formatPass: systemContext.formatPass ?? rawAction.metadata?.formatPass,
            },
          }
        : rawAction;

      const {
        intent,
        result: authResult,
        events: authEvents,
      } = authorize(enrichedAction, policies, evaluateOptions);
```

- [ ] **Step 2: Run kernel type check**

Run: `pnpm ts:check --filter=@red-codes/kernel`
Expected: PASS

- [ ] **Step 3: Run kernel tests**

Run: `pnpm test --filter=@red-codes/kernel`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/kernel/src/decision.ts
git commit -m "feat: bridge systemContext flags into rawAction.metadata for evaluator access"
```

---

### Task 9: Fix the default policy rule

**Files:**
- Modify: `agentguard.yaml:64-68`

- [ ] **Step 1: Update the policy rule**

In `agentguard.yaml`, replace lines 64-68:

```yaml
  # Code quality — require formatting before commit
  - action: git.commit
    effect: deny
    requireTests: true
    reason: Run pnpm format:fix before committing — all files must pass Prettier
```

With:

```yaml
  # Code quality — require formatting before commit
  - action: git.commit
    effect: deny
    requireFormat: true
    reason: Run pnpm format:fix before committing — all files must pass Prettier
```

- [ ] **Step 2: Verify policy loads without errors**

Run: `pnpm dev -- policy validate agentguard.yaml`
Expected: Policy loads successfully with no errors

- [ ] **Step 3: Commit**

```bash
git add agentguard.yaml
git commit -m "fix: use requireFormat instead of requireTests for formatting gate in default policy"
```

---

## Chunk 5: Integration Tests + Decision Engine Bridge Test

### Task 10: Write decision engine bridge and e2e gate condition tests

**Files:**
- Modify: `packages/kernel/tests/agentguard-engine.test.ts`

- [ ] **Step 1: Add decision engine bridge test**

Add to end of `packages/kernel/tests/agentguard-engine.test.ts`:

```typescript

describe('systemContext → intent.metadata bridge', () => {
  it('bridges formatPass from systemContext into policy evaluation', () => {
    const engine = createEngine({
      policyDefs: [
        {
          id: 'format-gate',
          name: 'Format Gate',
          rules: [
            {
              action: 'git.commit',
              effect: 'deny',
              conditions: { requireFormat: true },
              reason: 'Formatting required',
            },
            { action: 'git.commit', effect: 'allow', reason: 'Allow commits' },
          ],
        },
      ],
    });

    // Without formatPass — should be denied
    const denied = engine.evaluate(
      { tool: 'Bash', command: 'git commit -m "test"' },
      {}
    );
    expect(denied.allowed).toBe(false);

    // With formatPass via systemContext — should be allowed
    const allowed = engine.evaluate(
      { tool: 'Bash', command: 'git commit -m "test"' },
      { formatPass: true }
    );
    expect(allowed.allowed).toBe(true);
  });

  it('bridges testsPass from systemContext into policy evaluation', () => {
    const engine = createEngine({
      policyDefs: [
        {
          id: 'test-gate',
          name: 'Test Gate',
          rules: [
            {
              action: 'git.commit',
              effect: 'deny',
              conditions: { requireTests: true },
              reason: 'Tests required',
            },
            { action: 'git.commit', effect: 'allow', reason: 'Allow commits' },
          ],
        },
      ],
    });

    // Without testsPass — should be denied
    const denied = engine.evaluate(
      { tool: 'Bash', command: 'git commit -m "test"' },
      {}
    );
    expect(denied.allowed).toBe(false);

    // With testsPass via systemContext — should be allowed
    const allowed = engine.evaluate(
      { tool: 'Bash', command: 'git commit -m "test"' },
      { testsPass: true }
    );
    expect(allowed.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run kernel tests**

Run: `pnpm test --filter=@red-codes/kernel -- agentguard-engine`
Expected: PASS (all tests including new ones)

- [ ] **Step 3: Commit**

```bash
git add packages/kernel/tests/agentguard-engine.test.ts
git commit -m "test: add decision engine bridge tests for formatPass and testsPass"
```

---

### Task 11: Add comment to benchmark fixture about semantic change

**Files:**
- Modify: `packages/kernel/tests/benchmarks/policy-evaluation.bench.ts:28-32`

- [ ] **Step 1: Add comment explaining semantic change**

In `packages/kernel/tests/benchmarks/policy-evaluation.bench.ts`, update the `requireTests` rule (lines 27-32) to add a comment:

Replace:
```typescript
    {
      action: 'deploy.trigger',
      effect: 'deny',
      conditions: { requireTests: true },
      reason: 'Tests required before deploy',
    },
```

With:
```typescript
    {
      action: 'deploy.trigger',
      effect: 'deny',
      conditions: { requireTests: true },
      // Note: requireTests gate means this deny fires when testsPass is not true
      // in intent.metadata. Since bench intents don't set testsPass, this always denies.
      reason: 'Tests required before deploy',
    },
```

- [ ] **Step 2: Commit**

```bash
git add packages/kernel/tests/benchmarks/policy-evaluation.bench.ts
git commit -m "docs: annotate benchmark requireTests semantic after gate condition fix"
```

---

## Chunk 6: Scaffold Templates + Final Verification

### Task 12: Update init scaffold templates

**Files:**
- Modify: `apps/cli/src/commands/init.ts:287-301`
- Modify: `apps/cli/src/commands/init.ts:436-441`

- [ ] **Step 1: Add `formatPass` to scaffold `SystemState`**

In `apps/cli/src/commands/init.ts`, add after `testsPass?: boolean;` (line 293):

```typescript
  formatPass?: boolean;
```

- [ ] **Step 2: Add `requireFormat` example to scaffold policy-pack template**

In `apps/cli/src/commands/init.ts`, add after the `requireTests` example (after line 441):

```yaml

  # Deny commit without format check
  - action: "git.commit"
    effect: deny
    conditions:
      requireFormat: true
    reason: "Formatting must pass before committing"
```

- [ ] **Step 3: Run type check**

Run: `pnpm ts:check --filter=@red-codes/agentguard`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/cli/src/commands/init.ts
git commit -m "feat: add formatPass and requireFormat to init scaffold templates"
```

---

### Task 13: Run full test suite and verify

- [ ] **Step 1: Build all packages**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 3: Run linting**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 4: Run formatting check**

Run: `pnpm format`
Expected: PASS

- [ ] **Step 5: Final commit if formatting needed**

If `pnpm format` reports issues:

```bash
pnpm format:fix
git add -u
git commit -m "style: format new code"
```
