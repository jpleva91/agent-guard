# Skill: Report Routing

Shared routing logic for all reporting agents. Determines where output goes based on severity of findings. This skill is NOT invoked directly — it defines the routing protocol that other reporting skills reference.

## Routing Tiers

### Tier 1 — ALERT (GitHub Issue)

Create a GitHub issue ONLY when findings require human attention or action.

**Triggers**:
- Any test failures detected
- CI broken on main branch
- LOCKDOWN event triggered
- Risk score >50
- Security vulnerability found (critical/high severity)
- Agent attempted unauthorized action (governance violation)
- Deadlock or livelock detected in swarm
- Anomaly with severity CRITICAL

**Format**: Use `gh issue create` with appropriate `source:<agent>` and priority labels. Cap at 1 alert issue per run.

### Tier 2 — REPORT (Local File)

Write a markdown report to `.agentguard/reports/` for routine scheduled output that provides value but does not require immediate action.

**Triggers**:
- Routine health reports (test health, observability, product health)
- Sprint plans and progress updates
- Governance audit summaries with no critical findings
- Risk assessments at NORMAL or ELEVATED level
- Recovery controller reports with no remediation needed

**Format**: Write to `.agentguard/reports/<agent-id>-<YYYY-MM-DD>.md`. Create the directory if it doesn't exist. Overwrite the same-day file if re-run (idempotent).

```bash
mkdir -p .agentguard/reports
cat > .agentguard/reports/<agent-id>-$(date +%Y-%m-%d).md <<'REPORT_EOF'
# <Report Title> — <date>
<report content>
REPORT_EOF
```

### Tier 3 — LOG (Append to Log)

Append a single summary line for runs that found nothing actionable.

**Triggers**:
- "No anomalies detected"
- "Backlog clean — no new items"
- "All agents healthy"
- "No test failures"
- Run completed with no findings above INFO level

**Format**: Append one line to `.agentguard/logs/swarm.log`:

```bash
mkdir -p .agentguard/logs
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [<agent-id>] <one-line summary>" >> .agentguard/logs/swarm.log
```

## Routing Decision Process

Every reporting skill should follow this decision process BEFORE publishing:

```
1. Assess severity of ALL findings
2. If ANY finding is CRITICAL → ALERT tier (create issue)
3. Else if findings contain actionable content → REPORT tier (write file)
4. Else → LOG tier (append line)
```

**Important**: A single run may produce BOTH an ALERT issue (for critical findings) AND a REPORT file (for the full report). The alert is the signal; the report is the record.

## Superseding Previous Reports

When using ALERT tier, check for and close previous report issues from the same agent:

```bash
PREV=$(gh issue list --state open --label "source:<agent-id>" --json number --jq '.[0].number' 2>/dev/null)
if [ -n "$PREV" ] && [ "$PREV" != "null" ]; then
  gh issue close "$PREV" --comment "Superseded by new report." 2>/dev/null || true
fi
```

Only close issues with the EXACT `source:<agent-id>` label. Never close alert issues labeled with priority:critical — those stay open until resolved.

## Rules

- ALERT-tier issues MUST include `source:<agent-id>` label for tracking
- REPORT-tier files overwrite same-day files (one file per agent per day)
- LOG-tier entries are single lines, never multi-line
- Never create a GitHub issue for routine, non-actionable reports
- When in doubt between ALERT and REPORT, choose REPORT (conservative)
- When in doubt between REPORT and LOG, choose REPORT (preserve data)
