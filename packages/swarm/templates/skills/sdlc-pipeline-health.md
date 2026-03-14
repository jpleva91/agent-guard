# Skill: SDLC Pipeline Health Check

Validate the integrity of the autonomous SDLC infrastructure: skill files, governance hooks, CI workflows, GitHub labels, and build toolchain. Identifies gaps and creates issues for infrastructure problems. Designed for periodic scheduled execution.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If data is unavailable or ambiguous, proceed with available data and note limitations
- If governance activation fails, log the failure and **STOP**
- If `gh` CLI fails, log the error and **STOP**
- Default to the **safest option** in every ambiguous situation

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Verify Skill Files

Check that all expected skill files exist and have valid structure:

```bash
ls .claude/skills/*.md
```

For each `.md` file, verify it contains a `# Skill:` heading:

```bash
grep -l "^# Skill:" .claude/skills/*.md
```

Report any skill files missing the heading as malformed.

### 3. Verify Governance Hooks

Check that Claude Code hooks are configured:

```bash
cat .claude/settings.json 2>/dev/null
```

Verify the JSON contains:
- A `PreToolUse` hook entry with a command referencing `claude-hook` or `agentguard`
- A `PostToolUse` hook entry (optional but recommended)

If hooks are missing, flag as **CRITICAL**.

### 4. Verify Policy File

```bash
ls <%= paths.policy %> 2>/dev/null && echo "Policy file exists" || echo "MISSING: <%= paths.policy %>"
```

If the policy file exists, verify it's valid YAML:

```bash
node -e "const fs = require('fs'); const yaml = require('yaml'); yaml.parse(fs.readFileSync('<%= paths.policy %>', 'utf8')); console.log('Valid YAML')" 2>/dev/null || echo "YAML parse failed or yaml module not available"
```

### 5. Verify CI Workflows

Check that all expected CI workflow files exist:

```bash
ls .github/workflows/size-check.yml 2>/dev/null && echo "size-check.yml: OK" || echo "MISSING: size-check.yml"
ls .github/workflows/publish.yml 2>/dev/null && echo "publish.yml: OK" || echo "MISSING: publish.yml"
ls .github/workflows/codeql.yml 2>/dev/null && echo "codeql.yml: OK" || echo "MISSING: codeql.yml"
```

### 6. Verify GitHub Labels

Check that all required labels exist on the repository:

```bash
gh label list --json name --jq '.[].name' | sort
```

Verify these labels exist:
- Status: `status:pending`, `status:in-progress`, `status:review`
- Priority: `priority:critical`, `priority:high`, `priority:medium`, `priority:low`
- Task: `task:implementation`, `task:bug-fix`, `task:refactor`, `task:test-generation`, `task:documentation`
- Role: `role:developer`, `role:architect`, `role:auditor`
- Source: `source:backlog-steward`, `source:docs-sync`, `source:governance-audit`, `source:security-audit`, `source:sdlc-health`

Create any missing labels:

```bash
gh label create "<label-name>" --color "<color>" --description "<description>" 2>/dev/null || true
```

Use these colors:
- `status:*` → `0E8A16` (green)
- `priority:*` → `D93F0B` (red)
- `task:*` → `FBCA04` (yellow)
- `role:*` → `5319E7` (purple)
- `source:*` → `C5DEF5` (light blue)

### 7. Verify Build Toolchain

Run the build and test suite to verify the toolchain is healthy:

```bash
pnpm build
```

Report build result (pass/fail).

```bash
ppnpm test
```

Report test result (pass count, fail count).

```bash
pnpm test
```

Report JS test result (pass count, fail count).

```bash
pnpm lint
```

Report lint result (clean or error count).

```bash
pnpm format
```

Report format result (clean or issue count).

### 8. Check Telemetry Directories

Verify telemetry output paths exist:

```bash
ls -d .agentguard/events/ 2>/dev/null && echo "Events dir: OK" || echo "MISSING: .agentguard/events/"
ls -d logs/ 2>/dev/null && echo "Logs dir: OK" || echo "MISSING: logs/"
```

Create missing directories:

```bash
mkdir -p .agentguard/events logs
```

### 9. Generate Health Report

Compile results into a structured report:

```
## SDLC Pipeline Health Report

**Date**: <timestamp>

| Component | Status | Details |
|-----------|--------|---------|
| Skill files | OK/WARN | N files, N valid |
| Governance hooks | OK/CRITICAL | PreToolUse: yes/no, PostToolUse: yes/no |
| Policy file | OK/CRITICAL | <%= paths.policy %>: exists/missing |
| CI workflows | OK/WARN | N/3 present |
| GitHub labels | OK/WARN | N/N present, N created |
| Build | OK/FAIL | pass/fail |
| TypeScript tests | OK/FAIL | N pass / N fail |
| JS tests | OK/FAIL | N pass / N fail |
| Lint | OK/WARN | clean / N errors |
| Format | OK/WARN | clean / N issues |
| Telemetry dirs | OK/CREATED | present / created |
```

### 10. Create Issue (if problems found)

If any component has CRITICAL or FAIL status, check for an existing health issue:

```bash
gh issue list --state open --label "source:sdlc-health" --json number,title --limit 1
```

Ensure the label exists:

```bash
gh label create "source:sdlc-health" --color "C5DEF5" --description "Auto-created by SDLC Pipeline Health skill" 2>/dev/null || true
```

If an existing issue is open, comment with the new report. If none exists, create one:

```bash
gh issue create \
  --title "sdlc-health: <summary of critical finding>" \
  --body "<full health report>" \
  --label "source:sdlc-health" --label "<%= labels.high %>"
```

### 11. Summary

Report:
- **Overall status**: HEALTHY / DEGRADED / BROKEN
- **Components**: pass/fail count
- **Actions taken**: labels created, directories created, issue filed
- If all components pass: "SDLC pipeline healthy — all checks passed"

## Rules

- **Never modify source code, policy files, or CI workflows** — only create missing labels and telemetry directories
- **Never close existing health issues** — only create new ones or comment on existing open ones
- If build or tests fail, report the failure but do NOT attempt to fix it — that's a separate workflow
- If `gh` CLI is not authenticated, skip label verification and issue creation but still run local checks
- Create missing telemetry directories silently (this is always safe)
