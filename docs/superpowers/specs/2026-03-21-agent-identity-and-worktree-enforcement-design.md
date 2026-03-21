# Agent Identity Hard Gate & Worktree Policy Enforcement

**Date:** 2026-03-21
**Status:** Approved

## Overview

Two features that work together to support governed autonomous agent swarms:

1. **Agent Identity Hard Gate** — Every governance session requires agent identity. No session starts without it.
2. **Worktree Policy Enforcement** — YAML policy can require worktree usage via `requireWorktree` rule condition, with new `git.worktree.*` action types.

---

## Feature 1: Agent Identity Hard Gate

### Problem

AgentGuard sessions start without knowing which agent is running. The kernel never emits a `RUN_STARTED` event. In swarm scenarios, there's no way to distinguish which agent took which actions. The `.agentguard-identity` file exists but nothing reads it.

### Design

#### Identity Resolution (ordered, first wins)

1. `--agent-name <name>` CLI flag on `agentguard guard`
2. `AGENTGUARD_AGENT_NAME` environment variable (per-process)
3. Interactive prompt (writes answer for session duration)

#### Stateless File Contract

- **Session start:** blank `.agentguard-identity` (wipe stale values)
- **After resolution:** write resolved identity to `.agentguard-identity` (read window for other tools)
- **Session end:** blank `.agentguard-identity` again
- File is `.gitignore`d — never committed, purely session-scoped output

#### Changes

| File | Change |
|------|--------|
| `packages/core/src/types.ts` | Add `agentName: string` to `RunManifest` |
| `packages/kernel/src/kernel.ts` | Emit `RUN_STARTED` event with `agentName`; reject `propose()` if no identity |
| `apps/cli/src/commands/guard.ts` | Add `--agent-name` flag; resolve identity before kernel creation; blank/write/blank lifecycle |
| `.gitignore` | Add `.agentguard-identity` |
| `apps/cli/src/bin.ts` or `args.ts` | Wire `--agent-name` option to guard command |

#### RUN_STARTED Event Payload

```typescript
{
  kind: 'RUN_STARTED',
  runId: string,
  timestamp: string,
  payload: {
    agentName: string,
    sessionId: string,
    policy: string | undefined,
    manifest: RunManifest
  }
}
```

#### Autonomous Agent Flow

Orchestrators (swarm scaffolder, CI) pass identity via CLI flag:
```bash
agentguard guard --agent-name "builder-agent-3" --policy agentguard.yaml
```

No need to pre-write files. Each subprocess gets its own `--agent-name`.

#### Interactive Flow

```
$ agentguard guard
⚠ No agent identity set.
Agent name: █
> my-dev-session
✓ Identity set: my-dev-session
```

---

## Feature 2: Worktree Policy Enforcement

### Problem

No way to enforce worktree usage through YAML policy. Agents can `git checkout` freely, which in swarm scenarios causes conflicts in shared repos.

### Design

#### New Action Types

Add to `packages/core/src/data/actions.json`:

| Action Type | Class | Description |
|------------|-------|-------------|
| `git.worktree.add` | git | Create a git worktree |
| `git.worktree.remove` | git | Remove a git worktree |
| `git.worktree.list` | git | List git worktrees |

#### AAB Detection

In `packages/kernel/src/aab.ts`, detect shell commands:
- `git worktree add ...` → `git.worktree.add`
- `git worktree remove ...` / `git worktree prune` → `git.worktree.remove`
- `git worktree list` → `git.worktree.list`

#### Policy Condition: `requireWorktree`

Rule-level condition (like `requireTests`). When `requireWorktree: true` is set on a rule matching `git.checkout` or `git.branch.create`, the action is denied with a message directing the agent to use worktrees instead.

```yaml
rules:
  - action: git.checkout
    effect: deny
    conditions:
      requireWorktree: true
    reason: "Use 'git worktree add <path> <branch>' instead of checkout"

  - action: git.worktree.add
    effect: allow

  - action: git.worktree.list
    effect: allow
```

#### Changes

| File | Change |
|------|--------|
| `packages/core/src/data/actions.json` | Add `git.worktree.add/remove/list` |
| `packages/core/src/actions.ts` | Update action type union if needed |
| `packages/kernel/src/aab.ts` | Detect `git worktree` commands, normalize to action types |
| `packages/policy/src/evaluator.ts` | Add `requireWorktree` condition to rule matching |
| `packages/policy/src/yaml-loader.ts` | Accept `requireWorktree` in YAML schema |
| `packages/adapters/src/git.ts` | Add handlers for worktree action types |
| `packages/adapters/src/shell.ts` | Add worktree commands to privilege profiles |
| `packages/core/src/data/git-action-patterns.json` | Add worktree patterns |

#### Evaluator Logic

```typescript
// In policy evaluator, when checking conditions:
if (rule.conditions?.requireWorktree && action.type === 'git.checkout') {
  return {
    effect: 'deny',
    reason: rule.reason ?? 'Worktree required: use git worktree add instead of checkout'
  };
}
```

---

## Testing

- **Identity gate:** test resolution order (flag > env > prompt), stateless file lifecycle, kernel rejects propose() without identity, RUN_STARTED event emission
- **Worktree actions:** test AAB normalization of `git worktree` commands, policy evaluation with `requireWorktree` condition, adapter execution
- **Integration:** guard command with `--agent-name`, guard command with interactive prompt (mock stdin)
