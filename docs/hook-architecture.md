# Hook Architecture — How AgentGuard Integrates with AI Runtimes

AgentGuard supports multiple AI runtimes through a unified hook architecture. Both **Claude Code** and **GitHub Copilot CLI** are governed through the same kernel pipeline, with adapter-specific hooks that normalize tool calls into canonical actions.

## Design: Inline Hooks, Not a Daemon

AgentGuard does **not** run as a separate long-lived process. Instead, it integrates with AI runtimes via **inline hooks** — lightweight commands that fire on every tool call and evaluate governance in-process.

This is intentional. A daemon-based approach would require process management, health checks, IPC, and would risk silently crashing mid-session. The hook-based design is:

- **Stateless per invocation** — each hook call is self-contained (load policy, evaluate, respond, exit)
- **Fail-open by default** — if policy loading or storage fails, the hook exits cleanly and the runtime continues
- **Zero infrastructure** — no daemon, no sidecar, no port binding. Just a CLI command wired into the runtime's hook system
- **Always exits 0** — hooks must never block the runtime. Denial is communicated via stdout; errors are swallowed

## Hook Patterns

### Claude Code — Four-Hook Pattern

AgentGuard registers four hooks in `.claude/settings.json`:

#### 1. `PreToolUse` — Governance Enforcement

Fires **before** every Claude Code tool call (Bash, Write, Edit, Read, Glob, Grep). The hook:

1. Reads the tool call payload from stdin (JSON with tool name, parameters)
2. Normalizes it into a vendor-neutral `ActionContext` via the AAB (Action Authorization Boundary)
3. Evaluates policies and invariants through the kernel
4. If **denied**: writes a block response to stdout, which tells Claude Code to prevent execution
5. If **allowed**: exits silently, Claude Code proceeds normally
6. Wraps decisions in a `GovernanceEventEnvelope` and emits to storage (SQLite or JSONL)

```
Claude Code tool call → stdin (JSON) → ActionContext → Kernel → stdout (deny) or silent (allow)
```

#### 2. `PostToolUse` — Error Monitoring

Fires **after** Bash tool calls complete. Detects test/format pass/fail from command output and stores results in session state for subsequent policy checks (e.g., `test-before-push`).

#### 3. `Notification` — Session Lifecycle

Fires on session lifecycle notifications. Records governance events for session tracking and telemetry.

#### 4. `Stop` — Session Cleanup

Fires when a Claude Code session ends. Finalizes session records and flushes pending events.

### GitHub Copilot CLI — Two-Hook Pattern

AgentGuard registers two hooks in `.github/hooks/hooks.json`:

#### 1. `preToolUse` — Governance Enforcement

Identical governance pipeline to Claude Code's PreToolUse. Copilot sends tool calls as JSON with lowercase tool names and JSON-string `toolArgs`. The hook:

1. Reads the tool call payload (Copilot format)
2. Maps Copilot tool names to AgentGuard canonical names (see tool mapping below)
3. Normalizes into `ActionContext` via `copilotToActionContext()`
4. Evaluates policies and invariants
5. If **denied**: returns JSON `{ permissionDecision: 'deny', permissionDecisionReason: '...' }` to stdout
6. If **allowed**: exits silently

#### 2. `postToolUse` — Error Monitoring

Same as Claude Code — detects test/format results from command output and stores in session state.

## Hook Configuration

### Claude Code

Running `agentguard claude-init` writes hooks to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "agentguard claude-hook pre --store sqlite",
            "timeout": 30000
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "agentguard claude-hook post --store sqlite",
            "timeout": 10000
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "agentguard claude-hook notification --store sqlite",
            "timeout": 10000
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "agentguard claude-hook stop --store sqlite",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

Options:

- `agentguard claude-init --global` — install to `~/.claude/settings.json` (all projects)
- `agentguard claude-init --store sqlite` — use SQLite storage backend
- `agentguard claude-init --remove` — uninstall hooks

### GitHub Copilot CLI

Running `agentguard copilot-init` writes hooks to `.github/hooks/hooks.json`:

```json
{
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "command": "agentguard copilot-hook pre --store sqlite",
        "timeout": 30000
      }
    ],
    "postToolUse": [
      {
        "type": "command",
        "command": "agentguard copilot-hook post --store sqlite",
        "timeout": 10000
      }
    ]
  }
}
```

Options:

- `agentguard copilot-init --global` — install to `~/.copilot/hooks/` (all projects)
- `agentguard copilot-init --store sqlite` — use SQLite storage backend
- `agentguard copilot-init --remove` — uninstall hooks

### Postinstall Auto-Setup

When `@red-codes/agentguard` is installed as a dependency, the `postinstall` script automatically configures both hook integrations and creates a starter policy:

1. **Claude Code hooks** → `.claude/settings.json`
2. **Copilot CLI hooks** → `.github/hooks/hooks.json`
3. **Starter policy** → `agentguard.yaml` (monitor mode with baseline safety rules)

The postinstall is idempotent (skips if hooks already exist), non-destructive (merges with existing configs), and never fails the install (all errors caught). See `apps/cli/src/postinstall.ts`.

## How PreToolUse Governance Works

Each PreToolUse invocation runs through this sequence:

```
stdin JSON payload
  ↓
Parse tool call (tool name, input parameters)
  ↓
ActionContext normalization (vendor-neutral: Bash → shell.exec or git.push, Write → file.write, etc.)
  ↓
Policy evaluation (match rules from agentguard.yaml)
  ↓
Invariant checks (22 built-in safety checks)
  ↓
Decision: ALLOW or DENY
  ↓
Wrap in GovernanceEventEnvelope → emit to storage (SQLite / JSONL) + cloud telemetry
  ↓
If denied → stdout response (runtime blocks the action)
If allowed → silent exit (runtime proceeds)
```

The kernel runs with `dryRun: true` — it evaluates policies and invariants but does not execute the action itself. The AI runtime handles actual execution; AgentGuard only governs.

## Tool-to-Action Mapping

The AAB normalizes tool calls from each runtime into canonical action types:

### Claude Code

| Claude Code Tool | AgentGuard Action | Notes |
|-----------------|-------------------|-------|
| Write | `file.write` | |
| Edit | `file.write` | |
| Read | `file.read` | |
| Bash | `shell.exec` | Default for shell commands |
| Bash | `git.push`, `git.commit`, etc. | Auto-detected when command contains git operations |
| Glob | `file.read` | |
| Grep | `file.read` | |

### GitHub Copilot CLI

| Copilot CLI Tool | AgentGuard Action | Notes |
|-----------------|-------------------|-------|
| bash | `shell.exec` | Default; git commands auto-detected |
| powershell | `shell.exec` | Tracked via `metadata.shell` |
| edit | `file.write` | |
| create | `file.write` | |
| view | `file.read` | |
| glob | `file.read` | |
| grep | `file.read` | |
| web_fetch | `http.request` | |
| task | `shell.exec` | Agent-spawned tasks |

## Session Identity

Hook invocations are correlated by session ID:

- **Claude Code**: Resolved from the payload's `session_id` field, or the `CLAUDE_SESSION_ID` environment variable
- **Copilot CLI**: Resolved from the `COPILOT_SESSION_ID` environment variable
- Multiple tool calls in the same session share one session record
- Session state (format pass, test pass, written files) is persisted across hook invocations for governance decisions like `test-before-push` and `commit-scope-guard`
- Enables cross-tool governance decisions and session-level analytics

## Storage Backends

The hook supports multiple storage backends for event and decision persistence:

| Backend | Flag | Description |
|---------|------|-------------|
| JSONL (default) | — | File-based event stream in `.agentguard/events/` |
| SQLite | `--store sqlite` | Indexed storage for analytics queries |
| Webhook | `--store webhook` | Forward events to an external endpoint |

Storage failures are non-fatal — governance evaluation continues regardless.

## Error Handling & Fail-Open Semantics

The hook is designed to **never break Claude Code**:

- All errors are caught and swallowed — the hook always exits 0
- Policy loading failures result in an empty policy (all actions allowed)
- Storage backend failures are non-fatal (events may be lost, but governance continues)
- Invalid stdin (non-JSON, empty input) causes a clean exit

This fail-open design prioritizes developer experience over strict enforcement. If you need fail-closed semantics, monitor the event trail for gaps.

## Debugging

```bash
# Check if hooks are installed
cat .claude/settings.json | jq '.hooks'

# View recent governance decisions
agentguard inspect --last

# View raw event stream
agentguard events --last

# View policy evaluation traces
agentguard traces --last

# Test a specific action against your policy
echo '{"tool":"Bash","input":{"command":"git push origin main"}}' | agentguard claude-hook pre
```

## Key Source Files

| File | Purpose |
|------|---------|
| `apps/cli/src/commands/claude-hook.ts` | Claude Code hook command (PreToolUse, PostToolUse, Notification, Stop) |
| `apps/cli/src/commands/claude-init.ts` | Claude Code hook setup and teardown |
| `apps/cli/src/commands/copilot-hook.ts` | Copilot CLI hook command (preToolUse, postToolUse) |
| `apps/cli/src/commands/copilot-init.ts` | Copilot CLI hook setup and teardown |
| `apps/cli/src/postinstall.ts` | Postinstall auto-setup (both runtimes + starter policy) |
| `packages/adapters/src/claude-code.ts` | Claude Code payload normalization, `toActionContext()`, `claudeCodeToEnvelope()` |
| `packages/adapters/src/copilot-cli.ts` | Copilot CLI payload normalization, `copilotToActionContext()`, `copilotCliToEnvelope()` |
| `packages/kernel/src/kernel.ts` | Governed action kernel (policy + invariant evaluation) |
| `packages/kernel/src/aab.ts` | Action Authorization Boundary (tool → `ActionContext`) |
