# Skill: Start Governance Runtime

Ensure the AgentGuard kernel is active and intercepting all tool calls before any development work begins. This skill MUST be invoked as the first step in any autonomous workflow.

## Steps

### 0. Build the CLI

Ensure the AgentGuard CLI is compiled from the latest source before hooks reference it:

```bash
pnpm build
```

If the build fails, STOP — governance hooks depend on the compiled CLI at `apps/cli/dist/bin.js`.

### 1. Check Hook Registration

Read the local Claude Code settings and verify the PreToolUse governance hook is installed with SQLite storage:

```bash
cat .claude/settings.json 2>/dev/null
```

Look for a `PreToolUse` entry whose command contains `claude-hook` and `--store sqlite`. If the file does not exist, does not contain the hook, or the hook is missing `--store sqlite`, proceed to step 2. If it does, skip to step 3.

### 2. Install Hooks

Run the AgentGuard hook installer with SQLite storage:

```bash
<%= paths.cli %> claude-init --remove 2>/dev/null; <%= paths.cli %> claude-init --store sqlite
```

This writes both PreToolUse (governance enforcement for all tools) and PostToolUse (Bash error monitoring) hooks into `.claude/settings.json`, configured to persist governance data to SQLite (`~/.agentguard/agentguard.db`). The `--remove` ensures any existing hooks without SQLite are replaced.

If installation fails, STOP. Do not proceed with development work without governance.

### 3. Verify Telemetry Directories

Ensure the telemetry output paths exist:

```bash
mkdir -p .agentguard logs
```

These directories are used by:
- `~/.agentguard/agentguard.db` — SQLite governance database (events, decisions, sessions)
- `<%= paths.logs %>` — aggregated telemetry records

### 4. Verify Policy File

Check that a governance policy is loaded:

```bash
ls <%= paths.policy %> 2>/dev/null || ls agentguard.yml 2>/dev/null || ls .<%= paths.policy %> 2>/dev/null
```

If a policy file exists, governance rules are active. If no policy file is found, warn: "No policy file found — governance running in fail-open mode (allow all)."

### 5. Confirm Governance Active

Report the status:

```
Governance runtime active.
PreToolUse hooks: registered
Storage: SQLite (~/.agentguard/agentguard.db)
Telemetry paths: ready
Policy: <filename or "none (fail-open)">
```

## Rules

- This skill MUST be the first skill invoked in any autonomous workflow
- If hook installation fails, STOP — do not proceed with development work without governance
- Never modify `.claude/settings.json` manually — always use `<%= paths.cli %> claude-init`
- Never modify `<%= paths.policy %>` — this is the governance policy and is protected
