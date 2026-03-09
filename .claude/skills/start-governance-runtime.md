# Skill: Start Governance Runtime

Ensure the AgentGuard kernel is active and intercepting all tool calls before any development work begins. This skill MUST be invoked as the first step in any autonomous workflow.

## Steps

### 1. Check Hook Registration

Read the local Claude Code settings and verify the PreToolUse governance hook is installed:

```bash
cat .claude/settings.json 2>/dev/null
```

Look for a `PreToolUse` entry whose command contains `claude-hook`. If the file does not exist or does not contain the hook, proceed to step 2. If it does, skip to step 3.

### 2. Install Hooks

Run the AgentGuard hook installer:

```bash
npx agentguard claude-init
```

This writes both PreToolUse (governance enforcement for all tools) and PostToolUse (Bash error monitoring) hooks into `.claude/settings.json`. The command is idempotent — if hooks already exist it reports "Already configured."

If installation fails, STOP. Do not proceed with development work without governance.

### 3. Verify Telemetry Directories

Ensure the telemetry output paths exist:

```bash
mkdir -p .agentguard/events logs
```

These directories are used by:
- `.agentguard/events/<runId>.jsonl` — per-run governance event logs
- `logs/runtime-events.jsonl` — aggregated telemetry records

### 4. Verify Policy File

Check that a governance policy is loaded:

```bash
ls agentguard.yaml 2>/dev/null || ls agentguard.yml 2>/dev/null || ls .agentguard.yaml 2>/dev/null
```

If a policy file exists, governance rules are active. If no policy file is found, warn: "No policy file found — governance running in fail-open mode (allow all)."

### 5. Confirm Governance Active

Report the status:

```
Governance runtime active.
PreToolUse hooks: registered
Telemetry paths: ready
Policy: <filename or "none (fail-open)">
```

## Rules

- This skill MUST be the first skill invoked in any autonomous workflow
- If hook installation fails, STOP — do not proceed with development work without governance
- Never modify `.claude/settings.json` manually — always use `npx agentguard claude-init`
- Never modify `agentguard.yaml` — this is the governance policy and is protected
