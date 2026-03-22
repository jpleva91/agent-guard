# Claude Init Identity Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `agentguard claude-init` with role prompt, auto-detected identity, starter skill scaffolding, and tests.

**Architecture:** Add identity prompting and skill scaffolding to the existing `claudeInit()` function. Bundle template scripts and skills as embedded strings (same pattern as `STARTER_POLICY_TEMPLATE`). Update PreToolUse hook to use wrapper script. Add SessionStart persona check hook. Tests extend the existing `cli-claude-init.test.ts` with vitest.

**Tech Stack:** TypeScript, Node.js fs/execFileSync, vitest, existing CLI arg parser

**Spec:** `docs/superpowers/specs/2026-03-21-claude-init-identity-wizard-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/cli/src/commands/claude-init.ts` | Modify | Add role prompt, identity writing, skill scaffolding, hook wrapper setup |
| `apps/cli/src/templates/scripts.ts` | Create | Embedded script templates (agent-identity-bridge, write-persona, session-persona-check, claude-hook-wrapper) |
| `apps/cli/src/templates/skills.ts` | Create | Embedded starter skill templates (run-tests, implement-issue, governance-audit) |
| `apps/cli/src/identity.ts` | Create | Auto-detection helpers (driver, model, project) |
| `apps/cli/tests/cli-claude-init.test.ts` | Modify | Add identity + skills + wrapper tests |
| `apps/cli/tests/identity.test.ts` | Create | Unit tests for auto-detection |
| `apps/mcp-server/src/config.ts` | Modify | Add persona fields (Phase 2) |
| `apps/mcp-server/src/tools/governance.ts` | Modify | Persona fallback for propose_action (Phase 2) |
| `apps/mcp-server/src/__tests__/persona.test.ts` | Create | MCP persona tests (Phase 2) |

---

### Task 1: Auto-Detection Helpers

**Files:**
- Create: `apps/cli/src/identity.ts`
- Test: `apps/cli/tests/identity.test.ts`

- [ ] **Step 1: Write failing tests for driver auto-detection**

```typescript
// apps/cli/tests/identity.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectDriver, detectModel, detectProject } from '../src/identity.js';

describe('detectDriver', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns ci when GITHUB_ACTIONS is true', () => {
    process.env.GITHUB_ACTIONS = 'true';
    expect(detectDriver()).toBe('ci');
  });

  it('returns copilot when COPILOT_AGENT is set', () => {
    process.env.COPILOT_AGENT = '1';
    expect(detectDriver()).toBe('copilot');
  });

  it('returns claude-code when CLAUDE_MODEL is set', () => {
    process.env.CLAUDE_MODEL = 'claude-opus-4-6';
    expect(detectDriver()).toBe('claude-code');
  });

  it('returns human as fallback', () => {
    expect(detectDriver()).toBe('human');
  });

  it('respects priority: GITHUB_ACTIONS over CLAUDE_MODEL', () => {
    process.env.GITHUB_ACTIONS = 'true';
    process.env.CLAUDE_MODEL = 'claude-opus-4-6';
    expect(detectDriver()).toBe('ci');
  });
});

describe('detectModel', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('simplifies opus model name', () => {
    process.env.CLAUDE_MODEL = 'claude-opus-4-6';
    expect(detectModel()).toBe('opus');
  });

  it('simplifies sonnet model name', () => {
    process.env.CLAUDE_MODEL = 'claude-sonnet-4-6';
    expect(detectModel()).toBe('sonnet');
  });

  it('simplifies haiku model name', () => {
    process.env.CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
    expect(detectModel()).toBe('haiku');
  });

  it('returns unknown when no model set', () => {
    delete process.env.CLAUDE_MODEL;
    expect(detectModel()).toBe('unknown');
  });
});

describe('detectProject', () => {
  it('returns a string', () => {
    const result = detectProject();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/cli && pnpm vitest run tests/identity.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement identity.ts**

```typescript
// apps/cli/src/identity.ts
import { execFileSync } from 'node:child_process';

export type Driver = 'human' | 'claude-code' | 'copilot' | 'ci';
export type Role = 'developer' | 'reviewer' | 'ops' | 'security' | 'planner';

export const VALID_DRIVERS: Driver[] = ['human', 'claude-code', 'copilot', 'ci'];
export const VALID_ROLES: Role[] = ['developer', 'reviewer', 'ops', 'security', 'planner'];

export function detectDriver(): Driver {
  if (process.env.GITHUB_ACTIONS === 'true') return 'ci';
  if (process.env.COPILOT_AGENT) return 'copilot';
  if (process.env.CLAUDE_MODEL) return 'claude-code';
  return 'human';
}

export function detectModel(): string {
  const model = process.env.CLAUDE_MODEL ?? '';
  if (model.includes('opus')) return 'opus';
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('haiku')) return 'haiku';
  return model || 'unknown';
}

export function detectProject(): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })
      .trim()
      .split(/[\\/]/)
      .pop() ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/cli && pnpm vitest run tests/identity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
rtk git add apps/cli/src/identity.ts apps/cli/tests/identity.test.ts
rtk git commit -m "feat(cli): add identity auto-detection helpers"
```

---

### Task 2: Script Templates

**Files:**
- Create: `apps/cli/src/templates/scripts.ts`

- [ ] **Step 1: Create script templates module**

Contains the 4 identity scripts as exported template strings. Each is a function or constant that returns the script content. Use the existing scripts from `scripts/` directory as the source — embed them as template literals.

```typescript
// apps/cli/src/templates/scripts.ts

export const AGENT_IDENTITY_BRIDGE = `#!/usr/bin/env bash
# agent-identity-bridge.sh — Sets both cloud telemetry and hook persona identity
# Usage: source scripts/agent-identity-bridge.sh <agent-name> [trust-tier] [autonomy]
# ... (full content from scripts/agent-identity-bridge.sh)
`;

export const WRITE_PERSONA = `#!/usr/bin/env bash
# write-persona.sh — Writes .agentguard/persona.env for session identity
# ... (full content from scripts/write-persona.sh)
`;

export const SESSION_PERSONA_CHECK = `#!/usr/bin/env bash
# session-persona-check.sh — SessionStart hook: checks for agent identity
# ... (full content from scripts/session-persona-check.sh)
`;

export function claudeHookWrapper(cliPrefix: string): string {
  return `#!/usr/bin/env bash
# claude-hook-wrapper.sh — Sources persona identity before running governance hook

if [ -f .agentguard/persona.env ]; then
  set -a
  source .agentguard/persona.env
  set +a
fi

exec ${cliPrefix} claude-hook pre --store sqlite
`;
}
```

Note: Copy the FULL content of each script from the `scripts/` directory into the template strings. Do not abbreviate.

- [ ] **Step 2: Commit**

```bash
rtk git add apps/cli/src/templates/scripts.ts
rtk git commit -m "feat(cli): add embedded identity script templates"
```

---

### Task 3: Skill Templates

**Files:**
- Create: `apps/cli/src/templates/skills.ts`

- [ ] **Step 1: Create skill templates module**

```typescript
// apps/cli/src/templates/skills.ts

export interface SkillTemplate {
  filename: string;
  content: string;
}

export const STARTER_SKILLS: SkillTemplate[] = [
  {
    filename: 'run-tests.md',
    content: `---
name: run-tests
description: "Run the project test suite"
---
# Run Tests

## Agent Identity

\\\`\\\`\\\`bash
source scripts/agent-identity-bridge.sh "run-tests"
\\\`\\\`\\\`

## Steps

1. Detect the project's test framework (package.json scripts, Cargo.toml, pytest, etc.)
2. Run the full test suite
3. Report failures with file paths and line numbers
4. If all tests pass, report success with count
`,
  },
  {
    filename: 'implement-issue.md',
    content: `---
name: implement-issue
description: "Implement a GitHub issue end-to-end"
---
# Implement Issue

## Agent Identity

\\\`\\\`\\\`bash
source scripts/agent-identity-bridge.sh "implement-issue"
\\\`\\\`\\\`

## Steps

1. Read the GitHub issue (use \\\`gh issue view\\\`)
2. Understand the requirements and acceptance criteria
3. Plan the implementation
4. Write code and tests
5. Run tests to verify
6. Open a PR linking the issue
`,
  },
  {
    filename: 'governance-audit.md',
    content: `---
name: governance-audit
description: "Analyze governance logs for violations and trends"
---
# Governance Audit

## Agent Identity

\\\`\\\`\\\`bash
source scripts/agent-identity-bridge.sh "governance-audit" standard semi-autonomous
\\\`\\\`\\\`

## Steps

1. Check for governance log files: \\\`ls .agentguard/events/*.jsonl\\\`
2. Count events by type (ActionDenied, PolicyDenied, InvariantViolation)
3. Compute denial rate and risk score trends
4. If violations found, create a GitHub issue with findings
5. Report "Governance logs nominal" if no actionable findings
`,
  },
];
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/cli/src/templates/skills.ts
rtk git commit -m "feat(cli): add starter skill templates for claude-init"
```

---

### Task 4: Extend claude-init with Identity + Skills

**Files:**
- Modify: `apps/cli/src/commands/claude-init.ts`

- [ ] **Step 1: Add imports**

At the top of `claude-init.ts`, add:

```typescript
import { detectDriver, detectModel, detectProject, VALID_ROLES, type Role } from '../identity.js';
import {
  AGENT_IDENTITY_BRIDGE,
  WRITE_PERSONA,
  SESSION_PERSONA_CHECK,
  claudeHookWrapper,
} from '../templates/scripts.js';
import { STARTER_SKILLS } from '../templates/skills.js';
```

Add `unlinkSync` to the existing `node:fs` import.

- [ ] **Step 2: Add flag parsing for --role, --driver, --no-skills**

After the `--db-path` flag parsing (~line 83), add:

```typescript
const roleArgIdx = args.findIndex((a) => a === '--role');
const roleArg = roleArgIdx !== -1 ? args[roleArgIdx + 1] as Role : undefined;

const driverArgIdx = args.findIndex((a) => a === '--driver');
const driverArg = driverArgIdx !== -1 ? args[driverArgIdx + 1] : undefined;

const noSkills = args.includes('--no-skills');
```

- [ ] **Step 3: Add role prompt after pack prompt**

After the pack prompt block (~line 165), add role selection:

```typescript
let selectedRole: Role = 'developer';

if (roleArg && VALID_ROLES.includes(roleArg)) {
  selectedRole = roleArg;
} else if (process.stdin.isTTY && !isRefresh) {
  const roleChoice = await promptChoice(
    'Your role (for governance telemetry)',
    [
      `developer ${DIM}— writing and shipping code${RESET}`,
      `reviewer ${DIM}— reviewing PRs and auditing${RESET}`,
      `ops ${DIM}— deployment, releases, infrastructure${RESET}`,
      `security ${DIM}— security scanning and hardening${RESET}`,
      `planner ${DIM}— sprint planning and roadmap${RESET}`,
    ],
    0
  );
  selectedRole = VALID_ROLES[roleChoice] ?? 'developer';
}
```

- [ ] **Step 4: Change PreToolUse hook to use wrapper**

Replace the PreToolUse push (~lines 172-180) with:

```typescript
settings.hooks.PreToolUse.push({
  hooks: [
    {
      type: 'command',
      command: 'bash scripts/claude-hook-wrapper.sh',
    },
  ],
});
```

- [ ] **Step 5: Add SessionStart persona check hook**

In the SessionStart hooks section, add persona check as the first hook (before build/status):

```typescript
sessionStartHooks.unshift({
  type: 'command',
  command: 'bash scripts/session-persona-check.sh',
  timeout: 5000,
  blocking: true,
});
```

- [ ] **Step 6: Add script installation after settings write**

After `writeFileSync(settingsPath, ...)` (~line 245), add script copying, identity writing, skill scaffolding, and CLAUDE.md setup. See spec for full details:

- Copy 4 scripts to `scripts/` (skip existing unless `--refresh`)
- Set executable permissions via `chmodSync(path, 0o755)` or write with `{ mode: 0o755 }`
- Call `execFileSync('bash', ['scripts/write-persona.sh', driver, selectedRole])` to create persona
- Print identity confirmation
- Scaffold 3 starter skills to `.claude/skills/` (skip existing)
- Append identity block to CLAUDE.md (create if needed)
- Print Desktop "coming soon" notice

- [ ] **Step 7: Update removeHook() for cleanup**

In `removeHook()`, after removing hooks from settings, clean up:
- Identity scripts in `scripts/`
- `.agentguard/persona.env`
- Filter for session-persona-check and claude-hook-wrapper in SessionStart/PreToolUse removal

- [ ] **Step 8: Commit**

```bash
rtk git add apps/cli/src/commands/claude-init.ts
rtk git commit -m "feat(cli): extend claude-init with identity prompt and skill scaffolding"
```

---

### Task 5: Wizard Tests

**Files:**
- Modify: `apps/cli/tests/cli-claude-init.test.ts`

- [ ] **Step 1: Add tests for identity scripts installation**

Test that init with `--role developer` writes all 4 identity scripts to `scripts/`.

- [ ] **Step 2: Add tests for skill scaffolding**

Test that init scaffolds 3 starter skills to `.claude/skills/`.

- [ ] **Step 3: Add test for --no-skills flag**

Test that `--no-skills` prevents skill file creation.

- [ ] **Step 4: Add test for --role flag**

Test that `--role security` sets identity with security role.

- [ ] **Step 5: Add test for wrapper hook**

Test that PreToolUse uses `claude-hook-wrapper.sh` instead of direct `agentguard` call.

- [ ] **Step 6: Add test for SessionStart persona check**

Test that SessionStart includes `session-persona-check.sh` with `blocking: true`.

- [ ] **Step 7: Add test for idempotency**

Test that running init twice doesn't overwrite existing skills.

- [ ] **Step 8: Add test for CLAUDE.md**

Test that init appends identity block to existing CLAUDE.md.

- [ ] **Step 9: Run all tests**

Run: `cd apps/cli && pnpm vitest run tests/cli-claude-init.test.ts`
Expected: All PASS

- [ ] **Step 10: Commit**

```bash
rtk git add apps/cli/tests/cli-claude-init.test.ts
rtk git commit -m "test(cli): add identity, skills, and wrapper tests for claude-init"
```

---

### Task 6: MCP Server Persona Support (Phase 2)

**Files:**
- Modify: `apps/mcp-server/src/config.ts`
- Modify: `apps/mcp-server/src/tools/governance.ts`
- Create: `apps/mcp-server/src/__tests__/persona.test.ts`

- [ ] **Step 1: Write failing persona config test**

Test that `resolveConfig()` reads `AGENTGUARD_PERSONA_*` env vars into a `persona` object with `compositeId`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mcp-server && pnpm vitest run src/__tests__/persona.test.ts`

- [ ] **Step 3: Add PersonaConfig to McpConfig**

Add `persona?: PersonaConfig` to `McpConfig` interface. Read from `AGENTGUARD_PERSONA_*` env vars in `resolveConfig()`. Build `compositeId` as `driver:model:role`.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Update propose_action to use persona fallback**

In governance.ts, where `agent` parameter is used: `const agentId = agent ?? config.persona?.compositeId ?? 'unknown';`

- [ ] **Step 6: Commit**

```bash
rtk git add apps/mcp-server/src/config.ts apps/mcp-server/src/tools/governance.ts apps/mcp-server/src/__tests__/persona.test.ts
rtk git commit -m "feat(mcp): add persona support to MCP server config and governance tools"
```

---

### Task 7: Full Test Suite & Push

- [ ] **Step 1: Run all CLI tests**

Run: `cd apps/cli && pnpm vitest run`
Expected: All PASS

- [ ] **Step 2: Run all MCP server tests**

Run: `cd apps/mcp-server && pnpm vitest run`
Expected: All PASS

- [ ] **Step 3: Push branch**

```bash
rtk git push origin feat/telemetry-persona-header
```

- [ ] **Step 4: Update PR #707 description**

Update the existing PR to reflect the expanded scope (identity wizard + MCP persona).
