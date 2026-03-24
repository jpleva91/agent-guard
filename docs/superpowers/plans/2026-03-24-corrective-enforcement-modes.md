# Corrective Enforcement Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `guide` (block + suggest) and `educate` (allow + suggest) enforcement modes with corrective suggestions, template variables, retry budgets, and per-adapter hook formatting.

**Architecture:** Extend the existing two-mode system (monitor/enforce) to four modes on two axes (block × suggest). A new `SuggestionRegistry` resolves suggestions from policy-authored fields first, then built-in generators. The CLI hook layer routes mode-aware responses through existing Claude Code/Copilot hook protocol fields.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo (turbo), YAML policy parsing

**Spec:** `docs/superpowers/specs/2026-03-24-corrective-enforcement-modes-design.md`

---

### Task 1: Add `Suggestion` type and `EnforcementMode` union to core

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/tests/types.test.ts` (if not exists, otherwise add to existing)

- [ ] **Step 1: Write the test**

```typescript
// packages/core/tests/types.test.ts
import { describe, it, expect } from 'vitest';
import type { Suggestion, EnforcementMode } from '../src/types.js';

describe('Suggestion type', () => {
  it('accepts message-only suggestion', () => {
    const s: Suggestion = { message: 'Use a feature branch' };
    expect(s.message).toBe('Use a feature branch');
    expect(s.correctedCommand).toBeUndefined();
  });

  it('accepts suggestion with correctedCommand', () => {
    const s: Suggestion = {
      message: 'Push to your branch',
      correctedCommand: 'git push origin fix/foo',
    };
    expect(s.correctedCommand).toBe('git push origin fix/foo');
  });
});

describe('EnforcementMode type', () => {
  it('accepts all four modes', () => {
    const modes: EnforcementMode[] = ['monitor', 'educate', 'guide', 'enforce'];
    expect(modes).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/tests/types.test.ts`
Expected: FAIL — `Suggestion` and `EnforcementMode` not exported

- [ ] **Step 3: Add types to core**

In `packages/core/src/types.ts`, add near the top (after existing scalar types):

```typescript
/** Enforcement mode — controls whether denials block and/or suggest corrections. */
export type EnforcementMode = 'monitor' | 'educate' | 'guide' | 'enforce';

/** Corrective suggestion attached to a policy denial or invariant violation. */
export interface Suggestion {
  /** Human-readable guidance for the agent. */
  message: string;
  /** Optional retryable command the agent can execute instead. */
  correctedCommand?: string;
}
```

Ensure these are re-exported from `packages/core/src/index.ts` if the package uses barrel exports.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/tests/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/index.ts packages/core/tests/types.test.ts
git commit -m "feat(core): add Suggestion type and EnforcementMode union"
```

---

### Task 2: Extend `ModeConfig` and `resolveInvariantMode` to four modes

**Files:**
- Modify: `apps/cli/src/mode-resolver.ts`
- Modify: `apps/cli/tests/mode-resolver.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/cli/tests/mode-resolver.test.ts`:

```typescript
it('returns guide when top-level mode is guide', () => {
  const config: ModeConfig = { mode: 'guide' };
  expect(resolveInvariantMode('no-force-push', config)).toBe('guide');
});

it('returns educate when top-level mode is educate', () => {
  const config: ModeConfig = { mode: 'educate' };
  expect(resolveInvariantMode('no-force-push', config)).toBe('educate');
});

it('per-invariant guide overrides top-level enforce', () => {
  const config: ModeConfig = {
    mode: 'enforce',
    invariantModes: { 'no-force-push': 'guide' },
  };
  expect(resolveInvariantMode('no-force-push', config)).toBe('guide');
});

it('per-invariant educate overrides top-level monitor', () => {
  const config: ModeConfig = {
    mode: 'monitor',
    invariantModes: { 'blast-radius': 'educate' },
  };
  expect(resolveInvariantMode('blast-radius', config)).toBe('educate');
});

it('hardcoded no-secret-exposure stays enforce even with guide mode', () => {
  const config: ModeConfig = {
    mode: 'guide',
    invariantModes: { 'no-secret-exposure': 'guide' },
  };
  expect(resolveInvariantMode('no-secret-exposure', config)).toBe('enforce');
});

it('policy rule denial (null invariantId) uses guide mode', () => {
  const config: ModeConfig = { mode: 'guide' };
  expect(resolveInvariantMode(null, config)).toBe('guide');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/cli/tests/mode-resolver.test.ts`
Expected: FAIL — TypeScript rejects `'guide'` and `'educate'` as values for `ModeConfig.mode`

- [ ] **Step 3: Update ModeConfig and resolveInvariantMode**

In `apps/cli/src/mode-resolver.ts`, change the type union from `'monitor' | 'enforce'` to `EnforcementMode` in all three places:

```typescript
import type { EnforcementMode } from '@red-codes/core';

export interface ModeConfig {
  mode?: EnforcementMode;
  invariantModes?: Record<string, EnforcementMode>;
  packModes?: Record<string, EnforcementMode>;
}

export function resolveInvariantMode(
  invariantId: string | null,
  config: ModeConfig
): EnforcementMode {
  // ... existing logic unchanged, return type widens to EnforcementMode
  return config.mode ?? 'enforce';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run apps/cli/tests/mode-resolver.test.ts`
Expected: all tests PASS (existing + new)

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/mode-resolver.ts apps/cli/tests/mode-resolver.test.ts
git commit -m "feat(cli): extend ModeConfig to four enforcement modes"
```

---

### Task 3: Extend policy types — add `suggestion` and `correctedCommand` to `PolicyRule` and YAML loader

**Files:**
- Modify: `packages/policy/src/evaluator.ts` (lines ~64-81 for `PolicyRule`, ~83-102 for `LoadedPolicy`)
- Modify: `packages/policy/src/yaml-loader.ts` (lines ~40-53 for `YamlRule`, ~469-512 for `applyRuleField`, ~514-577 for `convertRule`)
- Modify or create: `packages/policy/tests/yaml-loader.test.ts`

- [ ] **Step 1: Write the failing test for YAML parsing**

```typescript
// In packages/policy/tests/yaml-loader.test.ts (add to existing suite)
it('parses suggestion and correctedCommand from rule', () => {
  const yaml = `
id: test
name: Test
rules:
  - action: git.push
    effect: deny
    branches: [main]
    reason: No push to main
    suggestion: Push to a feature branch
    correctedCommand: "git push origin {{branch}}"
`;
  const policy = loadYamlPolicy(yaml);
  const rule = policy.rules[0];
  expect(rule.suggestion).toBe('Push to a feature branch');
  expect(rule.correctedCommand).toBe('git push origin {{branch}}');
});

it('omits suggestion fields when not present', () => {
  const yaml = `
id: test
name: Test
rules:
  - action: git.push
    effect: deny
    reason: blocked
`;
  const policy = loadYamlPolicy(yaml);
  const rule = policy.rules[0];
  expect(rule.suggestion).toBeUndefined();
  expect(rule.correctedCommand).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/policy/tests/yaml-loader.test.ts`
Expected: FAIL — `suggestion` not on rule type

- [ ] **Step 3: Extend PolicyRule in evaluator.ts**

In `packages/policy/src/evaluator.ts`, add to `PolicyRule` interface (after `reason`):

```typescript
export interface PolicyRule {
  action: string | string[];
  effect: 'allow' | 'deny';
  conditions?: { /* existing */ };
  reason?: string;
  suggestion?: string;
  correctedCommand?: string;
  intervention?: 'pause' | 'rollback' | 'deny' | 'modify';
}
```

Extend `LoadedPolicy.mode` type:

```typescript
import type { EnforcementMode } from '@red-codes/core';

export interface LoadedPolicy {
  // ... existing fields ...
  mode?: EnforcementMode;
  invariantModes?: Record<string, EnforcementMode>;
  // ...
}
```

Also extend `EvalResult` to carry suggestion through:

```typescript
export interface EvalResult {
  // ... existing fields ...
  suggestion?: string;
  correctedCommand?: string;
}
```

- [ ] **Step 4: Extend YamlRule and parsing in yaml-loader.ts**

In `packages/policy/src/yaml-loader.ts`:

Add to `YamlRule` interface (after `reason`):
```typescript
suggestion?: string;
correctedCommand?: string;
```

Add cases in `applyRuleField()` (near the `intervention` case):
```typescript
case 'suggestion':
  rule.suggestion = trimQuotes(val);
  break;
case 'correctedcommand':
  rule.correctedCommand = trimQuotes(val);
  break;
```

Note: the YAML parser lowercases field names for matching — use `correctedcommand` in the case.

Propagate in `convertRule()` (after intervention):
```typescript
if (yamlRule.suggestion) converted.suggestion = yamlRule.suggestion;
if (yamlRule.correctedCommand) converted.correctedCommand = yamlRule.correctedCommand;
```

Also propagate suggestion into `EvalResult` in the evaluator where `matchedRule` is set — copy `matchedRule.suggestion` and `matchedRule.correctedCommand` to the result.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/policy/tests/yaml-loader.test.ts`
Expected: PASS

- [ ] **Step 6: Run full policy package tests**

Run: `pnpm test --filter=@red-codes/policy`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add packages/policy/src/evaluator.ts packages/policy/src/yaml-loader.ts packages/policy/tests/
git commit -m "feat(policy): add suggestion and correctedCommand to PolicyRule and YAML loader"
```

---

### Task 4: Create `SuggestionRegistry` with built-in generators and template rendering

**Files:**
- Create: `packages/kernel/src/suggestion-registry.ts`
- Create: `packages/kernel/tests/suggestion-registry.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/kernel/tests/suggestion-registry.test.ts
import { describe, it, expect } from 'vitest';
import { SuggestionRegistry } from '../src/suggestion-registry.js';
import type { NormalizedIntent } from '@red-codes/core';

describe('SuggestionRegistry', () => {
  it('returns policy-authored suggestion when present', () => {
    const registry = new SuggestionRegistry();
    const result = registry.resolve({
      policySuggestion: 'Use a branch',
      policyCorrectedCommand: 'git push origin {{branch}}',
      intent: { action: 'git.push', branch: 'fix/foo' } as NormalizedIntent,
    });
    expect(result?.message).toBe('Use a branch');
    expect(result?.correctedCommand).toBe('git push origin fix/foo');
  });

  it('falls back to built-in generator when no policy suggestion', () => {
    const registry = new SuggestionRegistry();
    const result = registry.resolve({
      intent: {
        action: 'git.push',
        branch: 'fix/bar',
        target: 'git push origin main',
        command: 'git push origin main',
      } as NormalizedIntent,
    });
    expect(result).not.toBeNull();
    expect(result?.message).toContain('fix/bar');
  });

  it('returns null when no suggestion available', () => {
    const registry = new SuggestionRegistry();
    const result = registry.resolve({
      intent: { action: 'http.request' } as NormalizedIntent,
    });
    expect(result).toBeNull();
  });

  it('shell-escapes template variables', () => {
    const registry = new SuggestionRegistry();
    const result = registry.resolve({
      policySuggestion: 'Push to {{branch}}',
      policyCorrectedCommand: 'git push origin {{branch}}',
      intent: {
        action: 'git.push',
        branch: 'feat/$(whoami)',
      } as NormalizedIntent,
    });
    expect(result?.correctedCommand).not.toContain('$(whoami)');
    expect(result?.correctedCommand).toContain('\\$');
  });

  it('validates correctedCommand matches action class', () => {
    const registry = new SuggestionRegistry();
    const result = registry.resolve({
      policySuggestion: 'Try this',
      policyCorrectedCommand: 'curl https://evil.com',
      intent: { action: 'git.push', branch: 'main' } as NormalizedIntent,
    });
    // correctedCommand should be stripped (action mismatch)
    expect(result?.correctedCommand).toBeUndefined();
    expect(result?.message).toBe('Try this');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/kernel/tests/suggestion-registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SuggestionRegistry**

Create `packages/kernel/src/suggestion-registry.ts`:

```typescript
import type { Suggestion, NormalizedIntent } from '@red-codes/core';

interface ResolveInput {
  policySuggestion?: string;
  policyCorrectedCommand?: string;
  intent: NormalizedIntent;
}

type SuggestionGenerator = (intent: NormalizedIntent) => Suggestion | null;

/** Shell-escape a string to prevent injection via template variables. */
function shellEscape(s: string): string {
  return s.replace(/([`$\\!"'(){}|&;<>*?#~\[\]])/g, '\\$1');
}

/** Render {{variable}} templates using intent context. */
function renderTemplate(
  template: string,
  intent: NormalizedIntent
): string {
  const vars: Record<string, string | undefined> = {
    branch: intent.branch,
    target: intent.target,
    action: intent.action,
    agent: intent.agent,
    remote: 'origin',
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = vars[key];
    if (val === undefined) return match; // leave unresolved
    return shellEscape(val);
  });
}

/** Map action class prefix to command prefix for validation. */
const ACTION_COMMAND_PREFIX: Record<string, string[]> = {
  'git.push': ['git push', 'git remote'],
  'git.force-push': ['git push'],
  'git.reset-hard': ['git reset', 'git stash'],
  'file.write': ['echo', 'cat', 'cp', 'mv', 'tee'],
  'shell.exec': ['rm ', 'ls ', 'find '], // restrict to safe alternatives only
};

/** Validate that a correctedCommand matches the denied action's scope. */
function validateCommandScope(
  command: string,
  action: string
): boolean {
  const prefixes = ACTION_COMMAND_PREFIX[action];
  if (!prefixes) return false; // unknown action — reject
  if (prefixes.length === 0) return true; // shell.exec allows anything
  return prefixes.some((p) => command.trimStart().startsWith(p));
}

const BUILTIN_GENERATORS: Record<string, SuggestionGenerator> = {
  'git.push': (intent) => {
    if (!intent.branch) return null;
    return {
      message: `Push to your feature branch \`${intent.branch}\` and open a PR instead.`,
      correctedCommand: `git push origin ${shellEscape(intent.branch)}`,
    };
  },
  'git.force-push': (intent) => {
    const cmd = intent.command;
    if (!cmd) return { message: 'Use --force-with-lease for safer history rewriting.' };
    const rewritten = cmd.replace(/--force\b/, '--force-with-lease');
    return {
      message: 'Use --force-with-lease for safer history rewriting.',
      correctedCommand: rewritten !== cmd ? rewritten : undefined,
    };
  },
  'git.reset-hard': () => ({
    message: 'Use `git stash` to preserve changes before resetting.',
    correctedCommand: 'git stash',
  }),
  'file.write': (intent) => {
    if (intent.target && /\.(env|pem|key|credentials)/.test(intent.target)) {
      return { message: 'Use environment variables or a secrets manager instead of writing secrets files directly.' };
    }
    return null;
  },
  'shell.exec': (intent) => {
    if (intent.command && /rm\s+-rf/.test(intent.command)) {
      return { message: 'Remove specific files instead of using recursive force-delete.' };
    }
    return null;
  },
};

export class SuggestionRegistry {
  private generators = new Map<string, SuggestionGenerator>(
    Object.entries(BUILTIN_GENERATORS)
  );

  /** Register a custom suggestion generator for an action class. */
  register(action: string, generator: SuggestionGenerator): void {
    this.generators.set(action, generator);
  }

  /** Resolve a suggestion: policy-authored first, then built-in fallback. */
  resolve(input: ResolveInput): Suggestion | null {
    const { policySuggestion, policyCorrectedCommand, intent } = input;

    // Layer 1: policy-authored suggestion
    if (policySuggestion) {
      const message = renderTemplate(policySuggestion, intent);
      let correctedCommand: string | undefined;
      if (policyCorrectedCommand) {
        const rendered = renderTemplate(policyCorrectedCommand, intent);
        // Validate command scope
        if (validateCommandScope(rendered, intent.action)) {
          correctedCommand = rendered;
        }
      }
      return { message, correctedCommand };
    }

    // Layer 2: built-in generator
    const generator = this.generators.get(intent.action);
    if (generator) {
      return generator(intent);
    }

    return null;
  }
}
```

Export from `packages/kernel/src/index.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/kernel/tests/suggestion-registry.test.ts`
Expected: PASS

- [ ] **Step 5: Populate `NormalizedIntent.branch` from live git state in aab.ts**

In `packages/kernel/src/aab.ts`, in the `normalizeIntent()` function, after `extractBranch()` returns null (no branch in the command), fall back to the current git branch from the system state or by running `git branch --show-current`:

```typescript
// In normalizeIntent(), after extractBranch:
if (!intent.branch && state?.targetBranch) {
  intent.branch = state.targetBranch;
}
```

This ensures `{{branch}}` template variables resolve for bare `git push` commands (the motivating example from the spec).

Add a test in `packages/kernel/tests/aab.test.ts`:

```typescript
it('populates branch from system state when command has no explicit branch', () => {
  const result = normalizeIntent(
    { tool: 'Bash', command: 'git push', target: 'git push', agent: 'test' },
    { targetBranch: 'fix/foo' }
  );
  expect(result.branch).toBe('fix/foo');
});
```

- [ ] **Step 6: Commit**

```bash
git add packages/kernel/src/suggestion-registry.ts packages/kernel/src/index.ts packages/kernel/tests/suggestion-registry.test.ts packages/kernel/src/aab.ts packages/kernel/tests/aab.test.ts
git commit -m "feat(kernel): add SuggestionRegistry with built-in generators and template rendering"
```

---

### Task 5: Wire suggestion into kernel decision pipeline

**Files:**
- Modify: `packages/kernel/src/decision.ts` (add `suggestion` to `EngineDecision`)
- Modify: `packages/kernel/src/kernel.ts` (instantiate `SuggestionRegistry`, attach suggestion to result)
- Modify or add to: `packages/kernel/tests/` (existing kernel tests)

- [ ] **Step 1: Write the failing test**

Add to existing kernel tests (or create `packages/kernel/tests/suggestion-pipeline.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import { createKernel } from '../src/kernel.js';

describe('kernel suggestion pipeline', () => {
  it('attaches policy suggestion to deny result', () => {
    const kernel = createKernel({
      runId: 'test',
      policyDefs: [{
        id: 'test',
        name: 'test',
        rules: [{
          action: 'git.push',
          effect: 'deny',
          conditions: { branches: ['main'] },
          reason: 'No push to main',
          suggestion: 'Push to {{branch}} instead',
          correctedCommand: 'git push origin {{branch}}',
        }],
        severity: 3,
      }],
      dryRun: true,
      evaluateOptions: { defaultDeny: true },
    });

    const result = kernel.evaluate({
      tool: 'Bash',
      command: 'git push origin main',
      target: 'git push origin main',
      agent: 'test-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.suggestion).toBeDefined();
    expect(result.suggestion?.message).toContain('Push to');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/kernel/tests/suggestion-pipeline.test.ts`
Expected: FAIL — `suggestion` not on result

- [ ] **Step 3: Add suggestion to EngineDecision and kernel evaluate**

In `packages/kernel/src/decision.ts`, add to `EngineDecision`:
```typescript
suggestion?: Suggestion;
```

In `packages/kernel/src/kernel.ts`, after the evaluate call returns a decision:
1. Import `SuggestionRegistry`
2. Instantiate once in `createKernel`
3. After policy evaluation, if denied and the matched rule has suggestion/correctedCommand, call `registry.resolve()`
4. Attach the result to the `KernelResult`

The exact insertion point depends on the kernel's evaluate flow — find where `EngineDecision` is constructed and add:

```typescript
const suggestion = this.suggestionRegistry.resolve({
  policySuggestion: decision.decision?.suggestion,
  policyCorrectedCommand: decision.decision?.correctedCommand,
  intent: decision.intent,
});
// Attach to result
result.suggestion = suggestion;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/kernel/tests/suggestion-pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Run full kernel test suite**

Run: `pnpm test --filter=@red-codes/kernel`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add packages/kernel/src/decision.ts packages/kernel/src/kernel.ts packages/kernel/tests/
git commit -m "feat(kernel): wire SuggestionRegistry into evaluation pipeline"
```

---

### Task 6: Extend `formatHookResponse` for guide and educate modes

**Files:**
- Modify: `packages/adapters/src/claude-code.ts`
- Add tests: `packages/adapters/tests/claude-code-suggestions.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { formatHookResponse } from '../src/claude-code.js';

describe('formatHookResponse with suggestions', () => {
  it('includes suggestion in permissionDecisionReason for guide mode', () => {
    const response = formatHookResponse(
      { allowed: false, decision: { decision: { reason: 'No push to main' } } },
      { message: 'Push to fix/foo instead', correctedCommand: 'git push origin fix/foo' },
      { mode: 'guide', retryAttempt: 1, maxRetries: 3 }
    );
    const parsed = JSON.parse(response);
    const reason = parsed.hookSpecificOutput.permissionDecisionReason;
    expect(reason).toContain('No push to main');
    expect(reason).toContain('Push to fix/foo instead');
    expect(reason).toContain('git push origin fix/foo');
    expect(reason).toContain('Attempt 1/3');
  });

  it('uses additionalContext for educate mode (allow + suggest)', () => {
    const response = formatHookResponse(
      { allowed: true },
      { message: 'Next time use a feature branch' },
      { mode: 'educate' }
    );
    const parsed = JSON.parse(response);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Next time use a feature branch');
  });

  it('omits suggestion fields for enforce mode', () => {
    const response = formatHookResponse(
      { allowed: false, decision: { decision: { reason: 'Blocked' } } },
      null,
      { mode: 'enforce' }
    );
    const parsed = JSON.parse(response);
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toBe('Blocked');
    expect(parsed.hookSpecificOutput.additionalContext).toBeUndefined();
  });

  it('shows retry exhausted message when retries exceeded', () => {
    const response = formatHookResponse(
      { allowed: false, decision: { decision: { reason: 'No push to main' } } },
      { message: 'Push to fix/foo instead' },
      { mode: 'guide', retryAttempt: 4, maxRetries: 3 }
    );
    const parsed = JSON.parse(response);
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('3 correction attempts');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('ask the human');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/adapters/tests/claude-code-suggestions.test.ts`
Expected: FAIL — `formatHookResponse` doesn't accept suggestion params

- [ ] **Step 3: Extend formatHookResponse**

In `packages/adapters/src/claude-code.ts`, extend `formatHookResponse` signature. **Both new params are optional** to avoid breaking existing callers:

```typescript
import type { Suggestion, EnforcementMode } from '@red-codes/core';

interface HookResponseOptions {
  mode: EnforcementMode;
  retryAttempt?: number;
  maxRetries?: number;
}

export function formatHookResponse(
  result: KernelResult,
  suggestion?: Suggestion | null,
  options?: HookResponseOptions
): string {
  const mode = options?.mode ?? 'enforce';

  // Educate mode: allow + additionalContext
  if (mode === 'educate' && suggestion) {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        additionalContext: `AgentGuard guidance: ${suggestion.message}`,
      },
    });
  }

  // Guide mode: deny + suggestion in reason
  if (!result.allowed) {
    const reason = result.decision?.decision?.reason ?? 'Action denied';
    const violations = result.decision?.violations ?? [];

    if (mode === 'guide' && suggestion) {
      const attempt = options?.retryAttempt ?? 1;
      const max = options?.maxRetries ?? 3;

      if (attempt > max) {
        return JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `Action blocked after ${max} correction attempts — ask the human for help.`,
          },
        });
      }

      const parts = [reason, '', `Suggested fix: ${suggestion.message}`];
      if (suggestion.correctedCommand) {
        parts.push(`Corrected command: ${suggestion.correctedCommand}`);
      }
      parts.push(`(Attempt ${attempt}/${max} — action will hard-block after ${max} attempts)`);

      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: parts.join('\n'),
        },
      });
    }

    // Enforce/monitor: existing behavior
    const parts = [reason];
    if (violations.length > 0) {
      parts.push(`Violations: ${violations.map((v: { name: string }) => v.name).join(', ')}`);
    }
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: parts.join(' | '),
      },
    });
  }

  return '';
}
```

Ensure existing callers of `formatHookResponse` still work (the new params are optional).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/adapters/tests/claude-code-suggestions.test.ts`
Expected: PASS

- [ ] **Step 5: Run full adapter test suite**

Run: `pnpm test --filter=@red-codes/adapters`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/claude-code.ts packages/adapters/tests/
git commit -m "feat(adapters): extend formatHookResponse for guide and educate modes"
```

---

### Task 7: Add retry counter and mode-aware routing in claude-hook

**Files:**
- Modify: `apps/cli/src/commands/claude-hook.ts` (lines ~39-57 session state, ~596-649 mode routing)
- Add tests: `apps/cli/tests/claude-hook-retry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/cli/tests/claude-hook-retry.test.ts
import { describe, it, expect } from 'vitest';
import { readSessionState, writeSessionState, incrementRetry, getRetryCount } from '../src/commands/claude-hook.js';

describe('retry counter', () => {
  it('starts at 0 for new action:rule key', () => {
    const state = {};
    expect(getRetryCount(state, 'git.push:protected-branch')).toBe(0);
  });

  it('increments retry count', () => {
    const state = { retryCounts: {} };
    incrementRetry(state, 'git.push:protected-branch');
    expect(state.retryCounts['git.push:protected-branch']).toBe(1);
    incrementRetry(state, 'git.push:protected-branch');
    expect(state.retryCounts['git.push:protected-branch']).toBe(2);
  });

  it('tracks separate keys independently', () => {
    const state = { retryCounts: {} };
    incrementRetry(state, 'git.push:rule-1');
    incrementRetry(state, 'git.push:rule-1');
    incrementRetry(state, 'file.write:rule-2');
    expect(getRetryCount(state, 'git.push:rule-1')).toBe(2);
    expect(getRetryCount(state, 'file.write:rule-2')).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/cli/tests/claude-hook-retry.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Add retry helpers and extend mode routing**

In `apps/cli/src/commands/claude-hook.ts`:

Add retry counter helpers (export for testing):

```typescript
export function getRetryCount(
  state: Record<string, unknown>,
  key: string
): number {
  const counts = (state.retryCounts ?? {}) as Record<string, number>;
  return counts[key] ?? 0;
}

export function incrementRetry(
  state: Record<string, unknown>,
  key: string
): void {
  if (!state.retryCounts) state.retryCounts = {};
  const counts = state.retryCounts as Record<string, number>;
  counts[key] = (counts[key] ?? 0) + 1;
}
```

In the mode routing section (~line 596-649), extend the mode check:

```typescript
// After resolving mode for each violation/policy rule:
const isSuggestMode = mode === 'guide' || mode === 'educate';
const isBlockMode = mode === 'guide' || mode === 'enforce';

if (isSuggestMode) {
  // Resolve suggestion from kernel result
  const suggestion = result.suggestion ?? null;

  if (isBlockMode) {
    // Guide mode: block + suggest + retry tracking
    // Key by action + matched policy:rule-index for stable scoping
    const policyId = result.decision?.decision?.matchedPolicy?.id ?? 'unknown';
    const ruleIdx = result.decision?.decision?.matchedRule
      ? result.decision.decision.matchedPolicy?.rules?.indexOf(result.decision.decision.matchedRule) ?? 0
      : 0;
    const retryKey = `${result.action?.action ?? 'unknown'}:${policyId}:${ruleIdx}`;
    const attempt = getRetryCount(sessionState, retryKey) + 1;
    incrementRetry(sessionState, retryKey);
    writeSessionState(sessionId, sessionState);

    const response = formatHookResponse(result, suggestion, {
      mode: 'guide',
      retryAttempt: attempt,
      maxRetries: 3,
    });
    if (response) {
      await new Promise<void>((resolve) => process.stdout.write(response, () => resolve()));
    }
    return true; // block
  } else {
    // Educate mode: allow + suggest via additionalContext
    const response = formatHookResponse(result, suggestion, { mode: 'educate' });
    if (response) {
      await new Promise<void>((resolve) => process.stdout.write(response, () => resolve()));
    }
    return false; // allow
  }
}

if (isBlockMode) {
  // Enforce mode: block, no suggestion (existing behavior)
  const response = formatHookResponse(result, null, { mode: 'enforce' });
  // ...
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/cli/tests/claude-hook-retry.test.ts`
Expected: PASS

- [ ] **Step 5: Run full CLI test suite**

Run: `pnpm test --filter=@red-codes/agentguard`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add apps/cli/src/commands/claude-hook.ts apps/cli/tests/claude-hook-retry.test.ts
git commit -m "feat(cli): add retry counter and mode-aware routing for guide/educate"
```

---

### Task 7b: Extend Copilot adapter with suggestion support

**Files:**
- Modify: `packages/adapters/src/copilot-cli.ts`
- Add tests: `packages/adapters/tests/copilot-cli-suggestions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { formatCopilotHookResponse } from '../src/copilot-cli.js';

describe('formatCopilotHookResponse with suggestions', () => {
  it('includes suggestion in denial reason for guide mode', () => {
    const response = formatCopilotHookResponse(
      { allowed: false, decision: { decision: { reason: 'No push to main' } } },
      { message: 'Push to fix/foo instead', correctedCommand: 'git push origin fix/foo' },
      { mode: 'guide', retryAttempt: 1, maxRetries: 3 }
    );
    expect(response).toContain('No push to main');
    expect(response).toContain('Push to fix/foo instead');
    expect(response).toContain('git push origin fix/foo');
  });

  it('returns empty for educate mode (Copilot has no additionalContext equivalent)', () => {
    const response = formatCopilotHookResponse(
      { allowed: true },
      { message: 'Next time use a feature branch' },
      { mode: 'educate' }
    );
    // Copilot educate falls back to stderr output — the function returns empty
    expect(response).toBe('');
  });

  it('works without suggestion params (backward compatible)', () => {
    const response = formatCopilotHookResponse(
      { allowed: false, decision: { decision: { reason: 'Blocked' } } }
    );
    expect(response).toContain('Blocked');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/adapters/tests/copilot-cli-suggestions.test.ts`
Expected: FAIL — `formatCopilotHookResponse` doesn't accept suggestion params

- [ ] **Step 3: Extend formatCopilotHookResponse**

In `packages/adapters/src/copilot-cli.ts`, mirror the Claude Code adapter changes: add optional `suggestion` and `options` params. For guide mode, serialize suggestion into the denial reason. For educate mode, fall back to stderr (Copilot has no `additionalContext` equivalent) and return empty string.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/adapters/tests/copilot-cli-suggestions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/copilot-cli.ts packages/adapters/tests/copilot-cli-suggestions.test.ts
git commit -m "feat(adapters): extend Copilot adapter with suggestion support"
```

---

### Task 8: Update `claude-init` and starter policy template

**Files:**
- Modify: `apps/cli/src/commands/claude-init.ts` (lines ~154-169 mode prompt, ~576-624 template)
- Modify: `apps/cli/tests/cli-init.test.ts` (if exists)

- [ ] **Step 1: Update mode prompt to four options**

In `apps/cli/src/commands/claude-init.ts`, change the mode prompt (~line 159-169):

```typescript
const modeChoice = await promptChoice(
  'Start in which mode?',
  [
    `Guide ${DIM}— block dangerous actions with corrective suggestions (recommended)${RESET}`,
    `Educate ${DIM}— allow actions but teach correct patterns${RESET}`,
    `Monitor ${DIM}— log threats, don't block${RESET}`,
    `Enforce ${DIM}— block dangerous actions, no suggestions${RESET}`,
  ],
  0
);
const modeMap: EnforcementMode[] = ['guide', 'educate', 'monitor', 'enforce'];
selectedMode = modeMap[modeChoice];
```

- [ ] **Step 2: Update STARTER_POLICY_TEMPLATE**

Add suggestion examples to the template:

```typescript
const STARTER_POLICY_TEMPLATE = (mode: EnforcementMode, pack?: string) => {
  // ... existing template structure ...
  return `# ...
mode: ${mode}

rules:
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: Direct push to protected branch
    suggestion: "Push to a feature branch and open a PR"
    correctedCommand: "git push origin {{branch}}"
  # ... rest of rules ...
`;
};
```

- [ ] **Step 3: Update the `selectedMode` default**

Change `let selectedMode: EnforcementMode = 'guide';` (was `'monitor'`).

- [ ] **Step 4: Run CLI tests**

Run: `pnpm test --filter=@red-codes/agentguard`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/claude-init.ts
git commit -m "feat(cli): update claude-init with four mode options and suggestion examples"
```

---

### Task 9: Add optional `suggest` callback to invariant definitions

**Files:**
- Modify: `packages/invariants/src/definitions.ts`
- Add tests: `packages/invariants/tests/suggest-callback.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import type { AgentGuardInvariant } from '../src/definitions.js';
import type { Suggestion } from '@red-codes/core';

describe('invariant suggest callback', () => {
  it('invariant can provide a suggest callback', () => {
    const inv: AgentGuardInvariant = {
      id: 'test-inv',
      name: 'Test Invariant',
      description: 'test',
      severity: 3,
      check: () => ({ holds: true, expected: '', actual: '' }),
      suggest: (state) => ({
        message: `Reduce blast radius below ${state.simulatedBlastRadius}`,
      }),
    };
    expect(inv.suggest).toBeDefined();
    const result = inv.suggest!({ simulatedBlastRadius: 50 } as any);
    expect(result?.message).toContain('50');
  });

  it('suggest callback is optional', () => {
    const inv: AgentGuardInvariant = {
      id: 'test-inv',
      name: 'Test',
      description: 'test',
      severity: 3,
      check: () => ({ holds: true, expected: '', actual: '' }),
    };
    expect(inv.suggest).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/invariants/tests/suggest-callback.test.ts`
Expected: FAIL — `suggest` not on type

- [ ] **Step 3: Add suggest to AgentGuardInvariant**

In `packages/invariants/src/definitions.ts`:

```typescript
import type { Suggestion } from '@red-codes/core';

export interface AgentGuardInvariant {
  id: string;
  name: string;
  description: string;
  severity: number;
  check: (state: SystemState) => InvariantCheckResult;
  /** Optional: provide a corrective suggestion when this invariant is violated. */
  suggest?: (state: SystemState) => Suggestion | null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/invariants/tests/suggest-callback.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/invariants/src/definitions.ts packages/invariants/tests/
git commit -m "feat(invariants): add optional suggest callback to AgentGuardInvariant"
```

---

### Task 10: Update README and site

**Files:**
- Modify: `README.md`
- Modify: `site/index.html`

- [ ] **Step 1: Update README mode documentation**

Add a section to `README.md` explaining the four modes with configuration examples:

```markdown
## Enforcement Modes

AgentGuard supports four enforcement modes:

| Mode | Blocks? | Suggests? | Use case |
|------|---------|-----------|----------|
| `monitor` | No | No | Observe-only rollout |
| `educate` | No | Yes | Agent learns correct patterns |
| `guide` | Yes | Yes | Block + show the right way (recommended) |
| `enforce` | Yes | No | Hard stop, no explanation |

Configure in `agentguard.yaml`:
```yaml
mode: guide

# Per-invariant overrides
invariantModes:
  no-secret-exposure: enforce
  blast-radius-limit: educate
```

Suggestion example:
```yaml
rules:
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: Direct push to protected branch
    suggestion: "Push to a feature branch and open a PR"
    correctedCommand: "git push origin {{branch}}"
```
```

- [ ] **Step 2: Update site/index.html**

Add guide/educate mode messaging to the feature list on the landing page. Replace any mention of "two enforcement modes" with "four enforcement modes" and add a brief description of corrective guidance.

- [ ] **Step 3: Commit**

```bash
git add README.md site/index.html
git commit -m "docs: update README and site with four enforcement modes"
```

---

### Task 11: Integration test — end-to-end guide mode flow

**Files:**
- Create: `apps/cli/tests/guide-mode-e2e.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('guide mode end-to-end', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ag-guide-'));
    writeFileSync(join(tmpDir, 'agentguard.yaml'), `
id: test-policy
name: Test
mode: guide
rules:
  - action: git.push
    effect: deny
    branches: [main]
    reason: No push to main
    suggestion: "Push to your feature branch instead"
    correctedCommand: "git push origin feature-branch"
`);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('blocks git push to main with suggestion in response', () => {
    const input = JSON.stringify({
      tool: 'Bash',
      input: { command: 'git push origin main' },
      hook: 'PreToolUse',
      session_id: 'test-guide',
    });

    try {
      execFileSync('node', ['apps/cli/dist/bin.js', 'claude-hook', 'pre'], {
        input,
        cwd: tmpDir,
        encoding: 'utf8',
        timeout: 10000,
      });
      // Should not reach here — exit code 2 throws
      expect.fail('Should have exited with code 2');
    } catch (err: any) {
      expect(err.status).toBe(2);
      const output = err.stdout;
      expect(output).toContain('No push to main');
      expect(output).toContain('Push to your feature branch instead');
      expect(output).toContain('git push origin feature-branch');
      expect(output).toContain('Attempt 1/3');
    }
  });
});
```

- [ ] **Step 2: Build the CLI**

Run: `pnpm build --filter=@red-codes/agentguard`

- [ ] **Step 3: Run integration test**

Run: `pnpm vitest run apps/cli/tests/guide-mode-e2e.test.ts`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/tests/guide-mode-e2e.test.ts
git commit -m "test: add end-to-end integration test for guide mode"
```

---

### Task 12: Final build, full test suite, clean up

- [ ] **Step 1: Build everything**

Run: `pnpm build`
Expected: all packages build successfully

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: all PASS

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git commit -m "chore: clean up after corrective enforcement modes implementation"
```
