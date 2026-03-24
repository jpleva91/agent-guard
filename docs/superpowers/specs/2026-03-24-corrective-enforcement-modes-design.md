# Corrective Enforcement Modes — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Author:** Jared + Claude

## Problem

AgentGuard's enforcement system has two modes: `monitor` (warn but allow) and `enforce` (block). Neither helps the agent correct its behavior. When an agent is blocked, it gets a flat denial reason with no guidance on what to do instead. This leads to retries, confusion, and human intervention for actions that could be self-corrected.

Real example: an agent ran `git push` (bare) while on branch `fix/governance-fail-closed`. The kernel blocked it with "Direct push to protected branch" — but the kernel already knew the current branch and could have said "use `git push origin fix/governance-fail-closed` instead."

## Design

### Four Modes on Two Axes

Block and suggest are independent dimensions:

| Mode | Blocks? | Suggests? | Use case |
|------|---------|-----------|----------|
| `monitor` | No | No | Observe-only rollout, audit trail |
| `educate` | No | Yes | Agent learns correct patterns while working |
| `guide` | Yes | Yes | Block + show the right way |
| `enforce` | Yes | No | Hard stop, no explanation needed |

Configuration in `agentguard.yaml`:

```yaml
mode: guide  # top-level default for new installs

invariantModes:
  no-secret-exposure: enforce
  protected-branch: guide
  blast-radius-limit: educate
```

Resolution order (unchanged): hardcoded always-enforce → per-invariant override → pack defaults → top-level mode.

**Default behavior:** `claude-init` and `copilot-init` generate `mode: guide` in new `agentguard.yaml` files. The code-level fallback in `resolveInvariantMode` remains `'enforce'` so that existing users who upgrade without re-running `claude-init` get the safe default. Only new installs get `guide` via the generated config.

### Suggestion Sources (Layered)

**Layer 1 — Policy-authored** (highest priority):

```yaml
rules:
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: Direct push to protected branch
    suggestion: "Push to a feature branch and open a PR"
    correctedCommand: "git push origin {{branch}}"
```

`suggestion` is a plain text guidance string. `correctedCommand` is an optional retryable command with template variable support.

**Layer 2 — Kernel-generated** (fallback):

Built-in suggestion generators registered per action class. Each receives `NormalizedIntent` and `SystemState`, returns `Suggestion | null`.

```typescript
interface Suggestion {
  message: string;
  correctedCommand?: string;
}
```

Built-in generators for common denials:

| Denial | Suggestion | Corrected Command |
|--------|-----------|-------------------|
| `git.push` to protected branch | Push to `{branch}` and open a PR | `git push origin {branch}` |
| `git.push` with no explicit branch | Specify remote and branch explicitly | `git push origin {branch}` |
| `git.force-push` | Use `--force-with-lease` for safer rewriting | Rewritten command with `--force-with-lease` |
| `file.write` to `.env`/credentials | Use environment variables or a secrets manager | — |
| `shell.exec` with `rm -rf` | Remove specific files instead | — |
| `git.reset-hard` | Use `git stash` to preserve changes | `git stash && git reset --hard` |

### Template Variables

Available in `correctedCommand` and `suggestion` strings:

| Variable | Source | Example |
|----------|--------|---------|
| `{{branch}}` | Current git branch | `fix/governance-fail-closed` |
| `{{target}}` | File path or command target | `/home/user/.env` |
| `{{action}}` | Canonical action type | `git.push` |
| `{{agent}}` | Agent identity | `claude-code:opus:developer` |
| `{{remote}}` | Git remote (default: `origin`) | `origin` |

Rendering happens in the kernel after suggestion resolution. Unresolved variables stay literal.

**Security:** Template variable values are shell-escaped before interpolation to prevent injection via branch names or file paths containing shell metacharacters.

### correctedCommand Security

`correctedCommand` is a privileged field — agents are likely to execute it with less scrutiny since it comes from the governance layer itself. Safeguards:

1. **Action scope validation:** The corrected command must match the denied rule's action class. A `git.push` deny rule cannot produce a `correctedCommand` containing `curl` or `rm`. The kernel validates this before rendering.
2. **Template variable escaping:** All `{{variable}}` values are shell-escaped before substitution. Branch names like `feat/$(whoami)` render as `feat/\$\(whoami\)`.
3. **Policy pack trust:** `correctedCommand` values from external policy packs (installed via `agentguard plugin install`) require trust verification via the existing `policy-trust.ts` system before rendering. Untrusted packs have their `correctedCommand` fields stripped — only the `suggestion` text is shown.

### Retry Budget

Guide mode provides `correctedCommand` that agents can retry. To prevent infinite loops:

- Per-session retry counter, keyed by `{action_class}:{matched_rule_id}` (e.g., `git.push:protected-branch-deny`)
- **3 retries max** per key per session
- Attempts 1-3: guide mode — block + suggestion + correctedCommand
- Attempt 4+: escalates to enforce — hard block, message: "Action blocked after 3 correction attempts — ask the human for help"

Tracked in existing session state (`retryCounts: Record<string, number>` alongside existing `writtenFiles`).

Counter resets when:
- New session starts
- The specific denied action succeeds with the corrected approach (e.g., agent pushes to the correct branch → `git.push:protected-branch-deny` counter resets)

Educate mode does not need retry tracking (action is allowed).

### Hook Response Format

Claude Code's hook protocol supports these fields in `hookSpecificOutput`: `permissionDecision`, `permissionDecisionReason`, and `additionalContext`. Suggestions must be delivered through these existing fields.

**Guide mode** (block + suggest):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Direct push to protected branch.\n\nSuggested fix: Push to your feature branch and open a PR.\nCorrected command: git push origin fix/governance-fail-closed\n(Attempt 1/3 — action will hard-block after 3 attempts)"
  }
}
```

The `permissionDecisionReason` is a structured string that Claude receives as context for the denial. The suggestion, corrected command, and retry state are serialized into this field.

**Educate mode** (allow + suggest):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "additionalContext": "AgentGuard guidance: Next time, push to a feature branch instead of main. The action was allowed this time."
  }
}
```

The `additionalContext` field is injected into Claude's context before execution, so the agent sees the guidance alongside the action.

**Enforce mode** (block, no suggestion — unchanged):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Direct push to protected branch"
  }
}
```

**Retry exhausted** (guide → enforce escalation):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Action blocked after 3 correction attempts — ask the human for help."
  }
}
```

### Copilot Adapter

The Copilot CLI hook adapter (`adapters/copilot-cli.ts`) receives the same treatment. Copilot's hook protocol fields differ from Claude Code's — the adapter maps suggestions into whichever fields Copilot surfaces to the agent. The `Suggestion` interface is adapter-agnostic; each adapter formats it for its protocol.

## Changes by Package

| Package | Files | Changes |
|---------|-------|---------|
| **core** | `types.ts` | Add `Suggestion` interface, `EnforcementMode` type union |
| **policy/evaluator** | `evaluator.ts` | Extend `PolicyRule` and `LoadedPolicy` with `suggestion`, `correctedCommand`, four-value `mode` type |
| **policy/yaml-loader** | `yaml-loader.ts` | Parse `suggestion`, `correctedCommand` from rule blocks; extend `mode` type to four values |
| **kernel/aab** | `aab.ts` | Expose current branch, destructive details on `NormalizedIntent` for template rendering |
| **kernel** | new `suggestion-registry.ts` | `SuggestionRegistry` — per-action-class generators, resolve (policy first → built-in fallback), template rendering with shell escaping |
| **kernel/decision** | `decision.ts` | Add `suggestion?: Suggestion` to `EngineDecision` and `KernelResult` |
| **adapters/claude-code** | `claude-code.ts` | Extend `formatHookResponse` — serialize suggestion into `permissionDecisionReason` (deny) or `additionalContext` (allow) |
| **adapters/copilot-cli** | `copilot-cli.ts` | Same extension mapped to Copilot's hook protocol |
| **cli/mode-resolver** | `mode-resolver.ts` | Extend mode type to `'monitor' | 'educate' | 'guide' | 'enforce'`; code default stays `'enforce'` |
| **cli/claude-hook** | `claude-hook.ts` | Retry counter in session state; mode-aware response routing (guide blocks+suggests, educate allows+suggests) |
| **cli/claude-init** | `claude-init.ts` | Generate `mode: guide` in new installs; update interactive prompt with four mode options |
| **cli/copilot-init** | `copilot-init.ts` | Same as claude-init |
| **invariants** | `definitions.ts` | Add optional `suggest` callback to `AgentGuardInvariant` interface |
| **site** | `index.html` | Update landing page with guide/educate mode messaging |
| **README** | `README.md` | Update mode documentation with examples |

## Non-Goals

- Custom retry limits per-rule (fixed at 3 for now)
- Auto-retry without agent involvement (agent always decides whether to use correctedCommand)
- Suggestion analytics/learning (track which suggestions agents follow — future work)
