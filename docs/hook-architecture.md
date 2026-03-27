# Hook Architecture — How AgentGuard Integrates with AI Coding Agents

## Supported Drivers

AgentGuard supports four AI coding agent drivers via the same inline hook pattern:

| Driver | Init command | Hook command | Config file |
|--------|-------------|-------------|------------|
| **Claude Code** | `agentguard claude-init` | `agentguard claude-hook pre\|post` | `.claude/settings.json` |
| **GitHub Copilot CLI** | `agentguard copilot-init` | `agentguard copilot-hook pre\|post` | `.github/hooks/hooks.json` |
| **OpenAI Codex CLI** | `agentguard codex-init` | `agentguard codex-hook pre\|post` | `.codex/hooks.json` |
| **Google Gemini CLI** | `agentguard gemini-init` | `agentguard gemini-hook pre\|post` | `.gemini/settings.json` |

All four drivers follow the same governance flow: the agent fires a `PreToolUse` hook before each tool call, AgentGuard evaluates the action against policy and invariants, and responds with an allow or block decision. Agent identity (role + driver) is resolved at session start and flows into all hook evaluations and telemetry.

## Design: Inline Hooks, Not a Daemon

AgentGuard does **not** run as a separate long-lived process. Instead, it integrates with Claude Code via **inline hooks** — lightweight commands that fire on every tool call and evaluate governance in-process.

This is intentional. A daemon-based approach would require process management, health checks, IPC, and would risk silently crashing mid-session. The hook-based design is:

- **Stateless per invocation** — each hook call is self-contained (load policy, evaluate, respond, exit)
- **Fail-open by default** — if policy loading or storage fails, the hook exits cleanly and Claude Code continues
- **Zero infrastructure** — no daemon, no sidecar, no port binding. Just a CLI command wired into Claude Code's hook system
- **Always exits 0** — hooks must never block Claude Code. Denial is communicated via stdout; errors are swallowed

## The Three-Hook Pattern

AgentGuard registers three hooks in `.claude/settings.json`:

### 1. `PreToolUse` — Governance Enforcement

Fires **before** every Claude Code tool call (Bash, Write, Edit, Read, Glob, Grep). The hook:

1. Reads the tool call payload from stdin (JSON with tool name, parameters)
2. Normalizes it into a canonical action type via the AAB (Action Authorization Boundary)
3. Evaluates policies and invariants through the kernel
4. If **denied**: writes a block response to stdout, which tells Claude Code to prevent execution
5. If **allowed**: exits silently, Claude Code proceeds normally
6. Emits governance events to the configured storage backend (JSONL, SQLite, or webhook)

```
Claude Code tool call → stdin (JSON) → AgentGuard kernel → stdout (deny) or silent (allow)
```

### 2. `PostToolUse` — Error Monitoring

Fires **after** Bash tool calls complete. Reports stderr errors for visibility. This hook is informational only — it does not block or modify behavior.

### 3. `SessionStart` — Build & Status Check

Fires once when a Claude Code session begins. Ensures the CLI is built and displays governance status. The build step is blocking (waits up to 2 minutes); the status check is non-blocking.

## Hook Configuration

Running `agentguard claude-init` writes this to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "agentguard claude-hook pre"
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
            "command": "agentguard claude-hook post"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "test -f apps/cli/dist/bin.js || npm run build",
            "timeout": 120000,
            "blocking": true
          },
          {
            "type": "command",
            "command": "agentguard status",
            "timeout": 10000,
            "blocking": false
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

## How PreToolUse Governance Works

Each PreToolUse invocation runs through this sequence:

```
stdin JSON payload
  ↓
Parse tool call (tool name, input parameters)
  ↓
AAB normalization (Bash → shell.exec or git.push, Write → file.write, etc.)
  ↓
Policy evaluation (match rules from agentguard.yaml)
  ↓
Invariant checks (24 built-in safety checks)
  ↓
Decision: ALLOW or DENY
  ↓
Emit events to storage (JSONL / SQLite / webhook)
  ↓
If denied → stdout response (Claude Code blocks the action)
If allowed → silent exit (Claude Code proceeds)
```

The kernel runs with `dryRun: true` — it evaluates policies and invariants but does not execute the action itself. Claude Code handles actual execution; AgentGuard only governs.

## Tool-to-Action Mapping

The AAB normalizes Claude Code tool calls into canonical action types:

| Claude Code Tool | AgentGuard Action | Notes |
|-----------------|-------------------|-------|
| Write | `file.write` | |
| Edit | `file.write` | |
| Read | `file.read` | |
| Bash | `shell.exec` | Default for shell commands |
| Bash | `git.push`, `git.commit`, etc. | Auto-detected when command contains git operations |
| Glob | `file.read` | |
| Grep | `file.read` | |

## Session Identity

Hook invocations are correlated by session ID:

- Resolved from the payload's `session_id` field, or the `CLAUDE_SESSION_ID` environment variable
- Multiple tool calls in the same Claude Code session share one session record
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
| `apps/cli/src/commands/claude-hook.ts` | Claude Code hook command (PreToolUse governance + PostToolUse monitoring) |
| `apps/cli/src/commands/claude-init.ts` | Claude Code hook setup and teardown |
| `apps/cli/src/commands/copilot-hook.ts` | GitHub Copilot CLI hook command |
| `apps/cli/src/commands/copilot-init.ts` | GitHub Copilot CLI hook setup |
| `apps/cli/src/commands/codex-hook.ts` | OpenAI Codex CLI hook command |
| `apps/cli/src/commands/codex-init.ts` | OpenAI Codex CLI hook setup |
| `apps/cli/src/commands/gemini-hook.ts` | Google Gemini CLI hook command |
| `apps/cli/src/commands/gemini-init.ts` | Google Gemini CLI hook setup |
| `packages/adapters/src/claude-code.ts` | Claude Code payload normalization and action mapping |
| `packages/adapters/src/copilot-cli.ts` | Copilot CLI payload normalization |
| `packages/adapters/src/codex-cli.ts` | Codex CLI payload normalization |
| `packages/adapters/src/gemini-cli.ts` | Gemini CLI payload normalization |
| `packages/kernel/src/kernel.ts` | Governed action kernel (policy + invariant evaluation) |
| `packages/kernel/src/aab.ts` | Action Authorization Boundary (tool → action type) |
