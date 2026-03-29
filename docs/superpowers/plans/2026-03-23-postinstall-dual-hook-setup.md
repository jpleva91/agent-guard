# Postinstall Dual-Hook Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When users `npm install @red-codes/agentguard`, automatically configure governance hooks for both Claude Code and Copilot CLI with safe defaults (monitor mode, essentials pack), and print a summary showing what was set up. Include comprehensive E2E tests that verify the full install → hook setup → policy evaluation → deny/allow pipeline for both environments.

**Architecture:** A new lightweight `postinstall.ts` script runs after npm install. It resolves the project root, writes `.claude/settings.json` and `.github/hooks/hooks.json` with AgentGuard hooks (merging with existing configs), generates a starter `agentguard.yaml` if none exists, and prints a summary. Separately, `auto-setup.ts` is updated to call `copilotInit()` alongside `claudeInit()` for the interactive path. E2E tests simulate the full pipeline: postinstall writes configs → kernel loads policy → Claude/Copilot hook payloads are evaluated → protected branch pushes denied, safe reads allowed.

**Tech Stack:** TypeScript, Node.js fs APIs, esbuild bundling, vitest

---

## File Structure

- **Create:** `apps/cli/src/postinstall.ts` — lightweight postinstall entry point (hooks-only, no scaffolding)
- **Modify:** `apps/cli/src/commands/auto-setup.ts` — add Copilot CLI hook setup alongside Claude Code
- **Modify:** `apps/cli/package.json` — add `"postinstall"` script
- **Modify:** `apps/cli/esbuild.config.ts` — add `postinstall.ts` entry point
- **Create:** `apps/cli/tests/cli-postinstall.test.ts` — unit tests for postinstall logic
- **Modify:** `apps/cli/tests/cli-auto-setup.test.ts` — add Copilot detection tests
- **Create:** `apps/cli/tests/e2e-postinstall-pipeline.test.ts` — E2E tests: install → policy eval → deny/allow for both Claude Code and Copilot CLI

---

### Task 1: Create postinstall.ts — hook writing logic

**Files:**
- Create: `apps/cli/src/postinstall.ts`
- Create: `apps/cli/tests/cli-postinstall.test.ts`

The postinstall script is a standalone entry point (not imported by bin.ts). It uses ONLY Node.js built-ins (`node:fs`, `node:path`, `node:url`) — no `@red-codes/*` imports, no `child_process` — so it runs reliably in user environments after install. Must never fail `npm install` — all errors caught and silently ignored.

**Key behaviors:**
- Resolves project root by walking up from `__dirname` past `node_modules/`. Algorithm: starting from startDir, walk up directory tree; skip any directory whose resolved absolute path contains a path segment that IS `node_modules`; return the first ancestor directory that (a) is NOT inside any `node_modules/` and (b) contains a `package.json`. Return null if reaching filesystem root.
- Writes `.claude/settings.json` with Claude Code hooks (PreToolUse, PostToolUse, Notification, Stop). All hook commands reference the installed `agentguard` binary (e.g. `agentguard claude-hook pre --store sqlite`), which is available after npm install puts the package's bin on PATH.
- Writes `.github/hooks/hooks.json` with Copilot CLI hooks (preToolUse, postToolUse). Hook commands reference `agentguard copilot-hook pre --store sqlite`.
- Generates `agentguard.yaml` with monitor mode + essentials pack if no policy file exists. Template mirrors `STARTER_POLICY_TEMPLATE` from `claude-init.ts` (includes `mode: monitor`, `pack: essentials`, and the standard deny rules).
- Merges with existing settings/hooks configs — never overwrites user config, only appends.
- Skips if AgentGuard hooks already present (checks for marker strings).
- Prints summary to stderr with status for each environment.
- Detects tool presence by checking if `.claude/` directory exists (no shell commands).
- Exits 0 even on failure (postinstall must never break `npm install`).
- Skips entirely if running inside the agentguard dev repo (check for `apps/cli/src/bin.ts`).

- [ ] **Step 1: Write the test file**

Create `apps/cli/tests/cli-postinstall.test.ts` (follows `cli-*.test.ts` naming convention). Test the four exported functions: `resolveProjectRoot`, `writeClaudeCodeHooks`, `writeCopilotCliHooks`, `writeStarterPolicy`.

Tests should cover:
- `resolveProjectRoot`:
  - Simulates npm install layout: `<project>/node_modules/@red-codes/agentguard/dist/` → returns `<project>/`
  - Returns null if no `package.json` found walking up
- `writeClaudeCodeHooks`:
  - Creates `.claude/settings.json` with hooks when none exists; verify PreToolUse and PostToolUse present
  - Merges with existing `settings.json` that has `permissions` — preserves existing keys
  - Returns `'skipped'` when AgentGuard hook already present in PreToolUse
- `writeCopilotCliHooks`:
  - Creates `.github/hooks/hooks.json` with hooks when none exists; verify preToolUse and postToolUse
  - Merges with existing `hooks.json` that has `sessionStart` hooks — preserves them
  - Returns `'skipped'` when AgentGuard copilot-hook already present
- `writeStarterPolicy`:
  - Creates `agentguard.yaml` when no policy exists; verify `mode: monitor` and `pack: essentials`
  - Returns `'skipped'` when `agentguard.yaml` already exists
  - Returns `'skipped'` when `agentguard.yml` exists (alternate extension)

Use `tmpdir()` with unique names for temp project directories. Clean up in `afterEach`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/jared/agentguard-workspace/agent-guard && pnpm test --filter=@red-codes/agentguard -- --testPathPattern=cli-postinstall`
Expected: FAIL — cannot resolve `../src/postinstall.js` module

- [ ] **Step 3: Write postinstall.ts implementation**

Create `apps/cli/src/postinstall.ts`:

```
Exports (for testability):
  - resolveProjectRoot(startDir: string): string | null
  - writeClaudeCodeHooks(projectRoot: string): 'created' | 'skipped'
  - writeCopilotCliHooks(projectRoot: string): 'created' | 'skipped'
  - writeStarterPolicy(projectRoot: string): 'created' | 'skipped'

Private:
  - printSummary(claudeResult, copilotResult, policyResult, projectRoot): void
  - main(): void (entry point, wrapped in try/catch)

Constants:
  - HOOK_MARKER = 'claude-hook'
  - COPILOT_HOOK_MARKER = 'copilot-hook'
  - POLICY_CANDIDATES = ['agentguard.yaml', 'agentguard.yml', 'agentguard.json', '.agentguard.yaml', '.agentguard.yml']
  - STARTER_POLICY (template string — mode: monitor, pack: essentials, standard deny rules)
```

Imports: ONLY `node:fs`, `node:path`, `node:url`. No `@red-codes/*`. No `child_process`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/jared/agentguard-workspace/agent-guard && pnpm test --filter=@red-codes/agentguard -- --testPathPattern=cli-postinstall`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/postinstall.ts apps/cli/tests/cli-postinstall.test.ts
git commit -m "feat: add postinstall script for dual-hook setup (Claude Code + Copilot CLI)"
```

---

### Task 2: Add postinstall entry to esbuild and package.json

**Files:**
- Modify: `apps/cli/esbuild.config.ts`
- Modify: `apps/cli/package.json`

- [ ] **Step 1: Add postinstall entry point to esbuild.config.ts**

In `apps/cli/esbuild.config.ts`, change the entryPoints on line 34 from:

```typescript
  entryPoints: ['src/bin.ts'],
```

to:

```typescript
  entryPoints: ['src/bin.ts', 'src/postinstall.ts'],
```

- [ ] **Step 2: Add postinstall script to package.json**

In `apps/cli/package.json`, add to `"scripts"`. Use `|| true` to prevent breakage during local dev when dist doesn't exist yet:

```json
"postinstall": "node dist/postinstall.js || true"
```

**Note:** The `"files"` array already includes `"dist/"`, so `postinstall.js` will be included in the published npm package.

- [ ] **Step 3: Build and verify**

Run: `cd /home/jared/agentguard-workspace/agent-guard && pnpm build --filter=@red-codes/agentguard && ls -la apps/cli/dist/postinstall.js`
Expected: File exists with reasonable size.

Also verify no `@red-codes` workspace imports leaked in:
Run: `grep -c '@red-codes' apps/cli/dist/postinstall.js || echo "clean: 0 workspace refs"`
Expected: 0 references (all code is self-contained Node.js built-ins)

- [ ] **Step 4: Commit**

```bash
git add apps/cli/esbuild.config.ts apps/cli/package.json
git commit -m "build: add postinstall.ts to esbuild bundle and package.json"
```

---

### Task 3: Update auto-setup to configure both Claude Code and Copilot CLI

**Files:**
- Modify: `apps/cli/src/commands/auto-setup.ts`
- Modify: `apps/cli/tests/cli-auto-setup.test.ts`

- [ ] **Step 1: Write failing test for new Copilot detection**

In `apps/cli/tests/cli-auto-setup.test.ts`, add a new test in the `detectExistingHooks` describe block:

```typescript
it('returns true when copilot-hook found in .github/hooks/hooks.json', () => {
  vi.mocked(existsSync).mockImplementation((p: unknown) => {
    const path = String(p);
    return path.includes('.github/hooks/hooks.json');
  });
  vi.mocked(readFileSync).mockReturnValue(
    JSON.stringify({
      version: 1,
      hooks: { preToolUse: [{ bash: 'agentguard copilot-hook pre' }] },
    })
  );

  expect(detectExistingHooks('/mock-cwd')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/jared/agentguard-workspace/agent-guard && pnpm test --filter=@red-codes/agentguard -- --testPathPattern=cli-auto-setup`
Expected: FAIL — `detectExistingHooks` currently only checks `.claude/settings.json`, not `.github/hooks/hooks.json`

- [ ] **Step 3: Update auto-setup.ts**

In `apps/cli/src/commands/auto-setup.ts`:

1. Add import at top:
   ```typescript
   import { copilotInit } from './copilot-init.js';
   ```

2. In `detectExistingHooks()`, after the existing Claude Code settings.json check loop, add a check for `.github/hooks/hooks.json`:
   ```typescript
   const copilotHooksPath = join(cwd, '.github', 'hooks', 'hooks.json');
   if (existsSync(copilotHooksPath)) {
     try {
       const config = JSON.parse(readFileSync(copilotHooksPath, 'utf8'));
       const preToolUse = config?.hooks?.preToolUse ?? [];
       const hasCopilotHook = preToolUse.some((entry: { bash?: string }) =>
         entry.bash?.includes('copilot-hook')
       );
       if (hasCopilotHook) return true;
     } catch { /* ignore */ }
   }
   ```

3. After line 202 (`await claudeInit(forwardArgs);`), add:
   ```typescript
   // Also configure Copilot CLI hooks
   await copilotInit(forwardArgs);
   ```

4. Update the status message on line 161 from `"Claude Code hooks already installed"` to `"Governance hooks already installed"`.

5. Update the JSDoc on lines 96-104 to mention both Claude Code and Copilot CLI.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/jared/agentguard-workspace/agent-guard && pnpm test --filter=@red-codes/agentguard -- --testPathPattern=cli-auto-setup`
Expected: All tests PASS including the new Copilot detection test

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/auto-setup.ts apps/cli/tests/cli-auto-setup.test.ts
git commit -m "feat: auto-setup configures both Claude Code and Copilot CLI hooks"
```

---

### Task 4: E2E tests — full install → policy evaluation pipeline

**Files:**
- Create: `apps/cli/tests/e2e-postinstall-pipeline.test.ts`

This is the paramount test. It simulates the complete user journey: postinstall writes configs → kernel loads the generated policy → Claude Code and Copilot CLI hook payloads are evaluated → protected branch pushes are DENIED, safe reads are ALLOWED. Tests use real kernel, real policy evaluator, real adapters — no mocks.

Follow the pattern established in `apps/cli/tests/e2e-kernel-pipeline.test.ts` which uses `createKernel`, `processClaudeCodeHook`, and real sinks.

- [ ] **Step 1: Write failing E2E test**

Create `apps/cli/tests/e2e-postinstall-pipeline.test.ts`:

```typescript
// E2E: postinstall → policy load → hook evaluation for Claude Code + Copilot CLI.
// Simulates the full user journey after npm install.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeClaudeCodeHooks, writeCopilotCliHooks, writeStarterPolicy } from '../src/postinstall.js';
import { processClaudeCodeHook } from '@red-codes/adapters';
import { processCopilotCliHook } from '@red-codes/adapters';
import type { ClaudeCodeHookPayload, CopilotCliHookPayload } from '@red-codes/adapters';
import { createKernel } from '@red-codes/kernel';
import type { EventSink, KernelResult } from '@red-codes/kernel';
import type { GovernanceDecisionRecord, DecisionSink, DomainEvent } from '@red-codes/core';
import { loadYaml } from '@red-codes/policy';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';

function makeTempProject(): string {
  const dir = join(tmpdir(), `ag-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    dependencies: { '@red-codes/agentguard': '^2.0.0' },
  }));
  return dir;
}

function createTestSinks() {
  const events: DomainEvent[] = [];
  const decisions: GovernanceDecisionRecord[] = [];
  const eventSink: EventSink = { write: (e) => events.push(e) };
  const decisionSink: DecisionSink = { write: (r) => decisions.push(r) };
  return { events, decisions, eventSink, decisionSink };
}

describe('E2E: postinstall → policy evaluation pipeline', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTempProject();
    resetActionCounter();
    resetEventCounter();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  // ── Setup verification ──

  it('postinstall creates valid policy that loads without error', () => {
    writeClaudeCodeHooks(projectDir);
    writeCopilotCliHooks(projectDir);
    writeStarterPolicy(projectDir);

    const policyContent = readFileSync(join(projectDir, 'agentguard.yaml'), 'utf8');
    const policies = loadYaml(policyContent);
    expect(policies).toBeDefined();
    expect(policies.rules.length).toBeGreaterThan(0);
  });

  // ── Claude Code: deny git push to main ──

  it('Claude Code: denies git push to main with postinstall policy', async () => {
    writeStarterPolicy(projectDir);
    const policyContent = readFileSync(join(projectDir, 'agentguard.yaml'), 'utf8');
    const policy = loadYaml(policyContent);

    const { events, decisions, eventSink, decisionSink } = createTestSinks();
    const kernel = createKernel({
      policies: [policy],
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      sinks: [eventSink],
      decisionSinks: [decisionSink],
    });

    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git push origin main' },
    };
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(false);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].outcome).toBe('deny');
    expect(decisions[0].action.type).toBe('git.push');

    const denyEvents = events.filter(e => e.kind === 'PolicyDenied');
    expect(denyEvents.length).toBeGreaterThan(0);
  });

  // ── Claude Code: allow safe read ──

  it('Claude Code: allows file read with postinstall policy', async () => {
    writeStarterPolicy(projectDir);
    const policyContent = readFileSync(join(projectDir, 'agentguard.yaml'), 'utf8');
    const policy = loadYaml(policyContent);

    const { decisions, decisionSink } = createTestSinks();
    const kernel = createKernel({
      policies: [policy],
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'src/index.ts' },
    };
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(true);
    expect(decisions[0].outcome).toBe('allow');
    expect(decisions[0].action.type).toBe('file.read');
  });

  // ── Claude Code: deny force push ──

  it('Claude Code: denies force push with postinstall policy', async () => {
    writeStarterPolicy(projectDir);
    const policyContent = readFileSync(join(projectDir, 'agentguard.yaml'), 'utf8');
    const policy = loadYaml(policyContent);

    const { decisions, decisionSink } = createTestSinks();
    const kernel = createKernel({
      policies: [policy],
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git push --force origin main' },
    };
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(false);
  });

  // ── Claude Code: deny .env write ──

  it('Claude Code: denies .env file write with postinstall policy', async () => {
    writeStarterPolicy(projectDir);
    const policyContent = readFileSync(join(projectDir, 'agentguard.yaml'), 'utf8');
    const policy = loadYaml(policyContent);

    const { decisions, decisionSink } = createTestSinks();
    const kernel = createKernel({
      policies: [policy],
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '.env', content: 'SECRET=abc' },
    };
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(false);
    expect(decisions[0].action.type).toBe('file.write');
  });

  // ── Copilot CLI: deny git push to main ──

  it('Copilot CLI: denies git push to main with postinstall policy', async () => {
    writeStarterPolicy(projectDir);
    const policyContent = readFileSync(join(projectDir, 'agentguard.yaml'), 'utf8');
    const policy = loadYaml(policyContent);

    const { events, decisions, eventSink, decisionSink } = createTestSinks();
    const kernel = createKernel({
      policies: [policy],
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      sinks: [eventSink],
      decisionSinks: [decisionSink],
    });

    const payload: CopilotCliHookPayload = {
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'git push origin main' }),
    };
    const result = await processCopilotCliHook(kernel, payload);

    expect(result.allowed).toBe(false);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].outcome).toBe('deny');
    expect(decisions[0].action.type).toBe('git.push');

    const denyEvents = events.filter(e => e.kind === 'PolicyDenied');
    expect(denyEvents.length).toBeGreaterThan(0);
  });

  // ── Copilot CLI: allow safe read ──

  it('Copilot CLI: allows file read with postinstall policy', async () => {
    writeStarterPolicy(projectDir);
    const policyContent = readFileSync(join(projectDir, 'agentguard.yaml'), 'utf8');
    const policy = loadYaml(policyContent);

    const { decisions, decisionSink } = createTestSinks();
    const kernel = createKernel({
      policies: [policy],
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload: CopilotCliHookPayload = {
      toolName: 'view',
      toolArgs: JSON.stringify({ file_path: 'README.md' }),
    };
    const result = await processCopilotCliHook(kernel, payload);

    expect(result.allowed).toBe(true);
    expect(decisions[0].outcome).toBe('allow');
    expect(decisions[0].action.type).toBe('file.read');
  });

  // ── Copilot CLI: deny .env write ──

  it('Copilot CLI: denies .env file creation with postinstall policy', async () => {
    writeStarterPolicy(projectDir);
    const policyContent = readFileSync(join(projectDir, 'agentguard.yaml'), 'utf8');
    const policy = loadYaml(policyContent);

    const { decisions, decisionSink } = createTestSinks();
    const kernel = createKernel({
      policies: [policy],
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload: CopilotCliHookPayload = {
      toolName: 'create',
      toolArgs: JSON.stringify({ file_path: '.env', content: 'SECRET=abc' }),
    };
    const result = await processCopilotCliHook(kernel, payload);

    expect(result.allowed).toBe(false);
  });

  // ── Copilot CLI: deny force push ──

  it('Copilot CLI: denies force push with postinstall policy', async () => {
    writeStarterPolicy(projectDir);
    const policyContent = readFileSync(join(projectDir, 'agentguard.yaml'), 'utf8');
    const policy = loadYaml(policyContent);

    const { decisions, decisionSink } = createTestSinks();
    const kernel = createKernel({
      policies: [policy],
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload: CopilotCliHookPayload = {
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'git push --force origin master' }),
    };
    const result = await processCopilotCliHook(kernel, payload);

    expect(result.allowed).toBe(false);
  });

  // ── Push to non-protected branch: allowed ──

  it('Claude Code: allows push to feature branch', async () => {
    writeStarterPolicy(projectDir);
    const policyContent = readFileSync(join(projectDir, 'agentguard.yaml'), 'utf8');
    const policy = loadYaml(policyContent);

    const { decisions, decisionSink } = createTestSinks();
    const kernel = createKernel({
      policies: [policy],
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload: ClaudeCodeHookPayload = {
      hook: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git push origin feat/my-feature' },
    };
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(true);
  });

  it('Copilot CLI: allows push to feature branch', async () => {
    writeStarterPolicy(projectDir);
    const policyContent = readFileSync(join(projectDir, 'agentguard.yaml'), 'utf8');
    const policy = loadYaml(policyContent);

    const { decisions, decisionSink } = createTestSinks();
    const kernel = createKernel({
      policies: [policy],
      evaluateOptions: { defaultDeny: false },
      dryRun: true,
      decisionSinks: [decisionSink],
    });

    const payload: CopilotCliHookPayload = {
      toolName: 'bash',
      toolArgs: JSON.stringify({ command: 'git push origin feat/my-feature' }),
    };
    const result = await processCopilotCliHook(kernel, payload);

    expect(result.allowed).toBe(true);
  });

  // ── Essentials pack policy tests ──

  it('generated policy includes all essential deny rules', () => {
    writeStarterPolicy(projectDir);
    const policyContent = readFileSync(join(projectDir, 'agentguard.yaml'), 'utf8');

    // Verify all core protections are present
    expect(policyContent).toContain('git.push');
    expect(policyContent).toContain('git.force-push');
    expect(policyContent).toContain('.env');
    expect(policyContent).toContain('rm -rf');
    expect(policyContent).toContain('deploy.trigger');
    expect(policyContent).toContain('infra.destroy');
    expect(policyContent).toContain('mode: monitor');
    expect(policyContent).toContain('pack: essentials');
  });

  // ── Hook config structure tests ──

  it('Claude Code hooks config has correct structure', () => {
    writeClaudeCodeHooks(projectDir);
    const settings = JSON.parse(readFileSync(join(projectDir, '.claude', 'settings.json'), 'utf8'));

    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain('claude-hook pre');
    expect(settings.hooks.PostToolUse[0].matcher).toBe('Bash');
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toContain('claude-hook post');
    expect(settings.hooks.Notification).toBeDefined();
    expect(settings.hooks.Stop).toBeDefined();
  });

  it('Copilot CLI hooks config has correct structure', () => {
    writeCopilotCliHooks(projectDir);
    const config = JSON.parse(readFileSync(join(projectDir, '.github', 'hooks', 'hooks.json'), 'utf8'));

    expect(config.version).toBe(1);
    expect(config.hooks.preToolUse[0].bash).toContain('copilot-hook pre');
    expect(config.hooks.preToolUse[0].timeoutSec).toBe(30);
    expect(config.hooks.postToolUse[0].bash).toContain('copilot-hook post');
    expect(config.hooks.postToolUse[0].timeoutSec).toBe(10);
  });
});
```

**Note:** The test code above is the full test — implement it as-is. The `loadYaml` import may need adjustment based on the actual export from `@red-codes/policy`. Check `packages/policy/src/yaml-loader.ts` for the correct export name.

- [ ] **Step 2: Run E2E tests to verify they fail**

Run: `cd /home/jared/agentguard-workspace/agent-guard && pnpm test --filter=@red-codes/agentguard -- --testPathPattern=e2e-postinstall`
Expected: FAIL — `../src/postinstall.js` not found (Task 1 must be completed first)

- [ ] **Step 3: After Task 1 is complete, run to verify they pass**

Run: `cd /home/jared/agentguard-workspace/agent-guard && pnpm build && pnpm test --filter=@red-codes/agentguard -- --testPathPattern=e2e-postinstall`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/cli/tests/e2e-postinstall-pipeline.test.ts
git commit -m "test: add E2E pipeline tests for postinstall — Claude Code + Copilot CLI policy evaluation"
```

---

### Task 5: Integration test — idempotency and merge behavior

**Files:**
- Modify: `apps/cli/tests/cli-postinstall.test.ts` (add integration test block)

- [ ] **Step 1: Add integration tests**

Append a `describe('postinstall integration')` block to `cli-postinstall.test.ts`:

- `full postinstall creates all three files from scratch`: Call all three write functions on a fresh temp dir. Verify Claude Code hooks contain `claude-hook pre`, Copilot hooks contain `copilot-hook pre`, policy contains `mode: monitor` and `pack: essentials`.
- `second run skips everything (idempotent)`: Run twice, verify second run returns `'skipped'` for all three.
- `merges with existing Claude Code settings without losing data`: Pre-populate `.claude/settings.json` with permissions, run `writeClaudeCodeHooks`, verify permissions preserved.
- `merges with existing Copilot hooks without losing data`: Pre-populate `.github/hooks/hooks.json` with sessionStart hooks, run `writeCopilotCliHooks`, verify sessionStart preserved.

- [ ] **Step 2: Run all unit + integration tests**

Run: `cd /home/jared/agentguard-workspace/agent-guard && pnpm test --filter=@red-codes/agentguard -- --testPathPattern=cli-postinstall`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/cli/tests/cli-postinstall.test.ts
git commit -m "test: add integration tests for postinstall idempotency and config merge"
```

---

### Task 6: Final build verification

- [ ] **Step 1: Full build**

Run: `cd /home/jared/agentguard-workspace/agent-guard && pnpm build`
Expected: All packages build successfully

- [ ] **Step 2: Full test suite**

Run: `cd /home/jared/agentguard-workspace/agent-guard && pnpm test`
Expected: All tests pass, no regressions

- [ ] **Step 3: Verify bundled postinstall.js has no workspace imports**

Run: `grep '@red-codes' /home/jared/agentguard-workspace/agent-guard/apps/cli/dist/postinstall.js | wc -l`
Expected: 0 (the bundled postinstall must be self-contained)

- [ ] **Step 4: Verify postinstall.js runs in simulated npm install layout**

Create a temp dir that mimics the npm install structure to verify `resolveProjectRoot` works correctly:

```bash
TMPDIR=$(mktemp -d)
mkdir -p "$TMPDIR/node_modules/@red-codes/agentguard/dist"
echo '{}' > "$TMPDIR/package.json"
cp /home/jared/agentguard-workspace/agent-guard/apps/cli/dist/postinstall.js "$TMPDIR/node_modules/@red-codes/agentguard/dist/"
cd "$TMPDIR/node_modules/@red-codes/agentguard/dist" && node postinstall.js
cat "$TMPDIR/.claude/settings.json"
cat "$TMPDIR/.github/hooks/hooks.json"
cat "$TMPDIR/agentguard.yaml"
rm -rf "$TMPDIR"
```

Expected: All three files created at `$TMPDIR/`, summary printed to stderr

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/postinstall.ts apps/cli/tests/cli-postinstall.test.ts apps/cli/tests/e2e-postinstall-pipeline.test.ts apps/cli/tests/cli-auto-setup.test.ts apps/cli/src/commands/auto-setup.ts apps/cli/esbuild.config.ts apps/cli/package.json
git commit -m "feat: postinstall dual-hook setup for Claude Code + Copilot CLI with E2E tests"
```
