# Claude Init Identity Wizard Design

**Date:** 2026-03-21
**Status:** Approved
**Repo:** agent-guard (OSS)

## Problem

When users install AgentGuard and run `agentguard claude-init`, it configures hooks and policies but does not:

1. Set up agent identity (persona) for governance telemetry
2. Scaffold starter skills that demonstrate the identity bridge pattern
3. Guide users on Claude Desktop integration via the MCP server
4. Have tests verifying the wizard and installation work correctly

The identity system (`.agentguard/persona.env`, hook wrapper, bridge script) was added in #707 but never wired into the init wizard.

## Design

### Phase 1: Extended Wizard

#### New Prompt

Add one prompt after the existing mode + pack:

```
? Your role (for governance telemetry)
  › developer
    reviewer
    ops
    security
    planner
```

#### Auto-Detection

Driver is auto-detected (no prompt needed):

| Priority | Condition | Driver |
|----------|-----------|--------|
| 1 | `--driver` flag | flag value |
| 2 | `GITHUB_ACTIONS=true` | ci |
| 3 | `COPILOT_AGENT` env var set | copilot |
| 4 | `CLAUDE_MODEL` env var set | claude-code |
| 5 | TTY is interactive | human |
| 6 | fallback | human |

Model: simplify `CLAUDE_MODEL` env var (`*opus*` → opus, `*sonnet*` → sonnet, `*haiku*` → haiku, else unknown).

Project: `basename $(git rev-parse --show-toplevel)`, fallback `unknown`.

#### Non-TTY Behavior

No prompts. Uses `--role` flag or defaults to `developer`. Auto-detects driver as `ci` if `GITHUB_ACTIONS` is set, else `human`.

#### New Flags

- `--role <role>` — skip role prompt
- `--driver <driver>` — override auto-detection
- `--no-skills` — don't scaffold skill files

#### What Init Writes

**`.claude/settings.json` changes:**
- PreToolUse: `bash scripts/claude-hook-wrapper.sh` (replaces direct `agentguard claude-hook pre` call)
- SessionStart: adds `bash scripts/session-persona-check.sh` (blocking, 5s timeout)
- All other hooks unchanged

**New files created:**

| File | Purpose |
|------|---------|
| `scripts/agent-identity-bridge.sh` | Composite identity for autonomous skills |
| `scripts/write-persona.sh` | Writes persona.env for interactive sessions |
| `scripts/session-persona-check.sh` | SessionStart hook: prompts if identity missing |
| `scripts/claude-hook-wrapper.sh` | Sources persona.env before governance hook |
| `.agentguard/persona.env` | Session identity (written via write-persona.sh) |
| `.claude/skills/run-tests.md` | Generic starter skill |
| `.claude/skills/implement-issue.md` | Generic starter skill |
| `.claude/skills/governance-audit.md` | AgentGuard-specific starter skill |

**Scripts source:** Bundled in `@red-codes/agentguard` npm package under `templates/scripts/`. Copied to project `scripts/` during init. All set `chmod +x`.

**Overwrite behavior:** If script already exists, prompt "Overwrite? [y/N]". `--refresh` flag always overwrites. Skills never overwrite existing files.

**CLAUDE.md:** If exists, append identity instruction block. If not, create with:

```markdown
## Agent Identity

At session start, if you see `[AgentGuard] No agent identity set`, ask the user:
1. **Role**: developer / reviewer / ops / security / planner
2. **Driver**: human / claude-code / copilot / ci

Then run: `scripts/write-persona.sh <driver> <role>`
```

#### Starter Skills

Three skill files scaffolded to `.claude/skills/`:

**`run-tests.md`** — generic, works in any repo:
```markdown
---
name: run-tests
description: "Run the project test suite"
---
# Run Tests

source scripts/agent-identity-bridge.sh "run-tests"

Detect the project's test framework and run all tests.
Report failures with file paths and line numbers.
```

**`implement-issue.md`** — generic, works in any repo:
```markdown
---
name: implement-issue
description: "Implement a GitHub issue end-to-end"
---
# Implement Issue

source scripts/agent-identity-bridge.sh "implement-issue"

Read the issue, plan the implementation, write code,
run tests, and open a PR.
```

**`governance-audit.md`** — AgentGuard-specific, demonstrates full pipeline:
```markdown
---
name: governance-audit
description: "Analyze governance logs for violations and trends"
---
# Governance Audit

source scripts/agent-identity-bridge.sh "governance-audit" standard semi-autonomous

Analyze .agentguard/events/*.jsonl for denial rates,
risk scores, and per-agent compliance. Create an issue
if actionable findings exist.
```

#### Wizard Output

```
  ✔ Hooks installed → .claude/settings.json
  ✔ Identity set → human:opus:developer (project: my-app)
  ✔ Starter skills → .claude/skills/ (3 files)
  ✔ Policy → agentguard.yaml (essentials)

  ℹ Claude Desktop support coming soon.
    Track: https://github.com/AgentGuardHQ/agentguard/issues/XXX
```

### Phase 2: MCP Server Identity

**Prerequisite for Claude Desktop instructions.** Until this ships, wizard prints "coming soon".

#### MCP Server Changes

**`apps/mcp-server/src/config.ts`:**
- Add persona fields to `McpConfig` interface
- Read `AGENTGUARD_PERSONA_*` env vars
- Fallback: parse `.agentguard/persona.env` file if env vars not set
- Add `persona` object: `{ driver, model, role, project, trustTier, autonomy }`

**`apps/mcp-server/src/server.ts`:**
- Pass persona to tool registrations

**`apps/mcp-server/src/tools/governance.ts`:**
- `propose_action`: if `agent` param not provided, fall back to `config.persona` composite identity
- Include persona dimensions in kernel metadata/context

**Telemetry forwarding:**
- If `cloudEndpoint` + `cloudApiKey` configured, include `X-Agent-Persona` header

#### Desktop Config (Unlocked After Phase 2)

Wizard output updated to print:

```json
{
  "mcpServers": {
    "agentguard": {
      "command": "npx",
      "args": ["@red-codes/agentguard-mcp"],
      "env": {
        "AGENTGUARD_POLICY": "./agentguard.yaml"
      }
    }
  }
}
```

With OS-specific config file locations:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

## Tests

### Wizard Tests (`apps/cli/src/commands/__tests__/claude-init.test.ts`)

1. **Unit — auto-detection:** Mock env vars, verify driver detection for each priority level
2. **Unit — flag parsing:** `--role developer --driver copilot --no-skills` parsed correctly
3. **Integration — full init:** Run with flags (no TTY), verify:
   - `.claude/settings.json` has wrapper hook and SessionStart persona check
   - `.agentguard/persona.env` written with correct composite identity
   - `scripts/` has all 4 identity scripts, all executable
   - `.claude/skills/` has 3 starter skills
   - `CLAUDE.md` has identity instruction block
4. **Integration — idempotency:** Run init twice, verify no duplicates, skills not overwritten
5. **Integration — `--no-skills`:** Verify `.claude/skills/` not created
6. **Integration — `--remove`:** Verify identity scripts, persona file, and skill files cleaned up
7. **Snapshot — settings.json:** Snapshot test for generated hook structure

### MCP Server Tests (`apps/mcp-server/src/__tests__/persona.test.ts`)

1. **Unit — config persona:** Set `AGENTGUARD_PERSONA_*` env vars, verify `resolveConfig()` returns persona
2. **Unit — persona.env fallback:** Write file, unset env vars, verify config reads from file
3. **Unit — propose_action identity:** Call without `agent` param, verify persona composite used
4. **Integration — telemetry forwarding:** Verify `X-Agent-Persona` header included

### Telemetry Client Tests

1. **Unit — X-Agent-Persona header:** Set persona env vars, verify `sendBatch()` includes header with correct JSON

## Implementation Order

1. Phase 1 wizard changes (single PR, includes wizard tests)
2. Phase 2 MCP server identity (separate PR, includes MCP tests)
3. Small follow-up: swap "coming soon" for real Desktop instructions in wizard output
