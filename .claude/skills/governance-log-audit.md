# Skill: Governance Log Audit

Analyze governance event logs for anomalies, violation trends, escalation patterns, and policy effectiveness. Creates an issue if actionable findings exist. Designed for periodic scheduled execution.

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance — even log analysis should be auditable.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Locate Log Files

```bash
ls -la .agentguard/events/*.jsonl 2>/dev/null
ls -la logs/runtime-events.jsonl 2>/dev/null
```

If no log files exist, report "No governance logs found — nothing to audit" and STOP.

### 3. Count Events by Type

Count each governance event type across all log files:

```bash
cat .agentguard/events/*.jsonl 2>/dev/null | grep -c "ActionRequested" || echo 0
cat .agentguard/events/*.jsonl 2>/dev/null | grep -c "ActionAllowed" || echo 0
cat .agentguard/events/*.jsonl 2>/dev/null | grep -c "ActionDenied" || echo 0
cat .agentguard/events/*.jsonl 2>/dev/null | grep -c "PolicyDenied" || echo 0
cat .agentguard/events/*.jsonl 2>/dev/null | grep -c "InvariantViolation" || echo 0
cat .agentguard/events/*.jsonl 2>/dev/null | grep -c "ActionEscalated" || echo 0
cat .agentguard/events/*.jsonl 2>/dev/null | grep -c "BlastRadiusExceeded" || echo 0
cat .agentguard/events/*.jsonl 2>/dev/null | grep -c "MergeGuardFailure" || echo 0
```

Also count total events:

```bash
cat .agentguard/events/*.jsonl 2>/dev/null | wc -l
```

### 4. Compute Metrics

Calculate key governance health metrics:

- **Denial rate**: `(ActionDenied + PolicyDenied) / ActionRequested * 100`
- **Invariant violation rate**: `InvariantViolation / ActionRequested * 100`
- **Escalation count**: total ActionEscalated events

Flag these thresholds:
- Denial rate > 20% → **WARNING**
- Denial rate > 50% → **CRITICAL**
- Any InvariantViolation → **WARNING**
- Any ActionEscalated → **WARNING**
- Any BlastRadiusExceeded → **WARNING**

### 5. Identify Patterns

Read the actual log content to identify patterns:

```bash
cat .agentguard/events/*.jsonl 2>/dev/null | grep "ActionDenied" | head -20
cat .agentguard/events/*.jsonl 2>/dev/null | grep "PolicyDenied" | head -20
cat .agentguard/events/*.jsonl 2>/dev/null | grep "InvariantViolation" | head -20
```

Look for:
- **Repeated denials**: same action type denied 3+ times (suggests policy misconfiguration or persistent bad behavior)
- **Escalation sequences**: events showing progression from NORMAL → ELEVATED → HIGH
- **Invariant clusters**: same invariant violated repeatedly (may need stronger enforcement)
- **Time patterns**: bursts of violations in short windows

### 6. Check Escalation State

Read the most recent escalation-related events:

```bash
cat .agentguard/events/*.jsonl 2>/dev/null | grep -i "escalat\|lockdown" | tail -10
```

If any LOCKDOWN events exist, this is a **CRITICAL** finding.

### 7. Generate Report

Compile the audit findings into a structured report:

```
## Governance Log Audit Report

**Date**: <timestamp>
**Log files analyzed**: <count>
**Total events**: <N>

### Event Summary

| Event Type | Count |
|------------|-------|
| ActionRequested | N |
| ActionAllowed | N |
| ActionDenied | N |
| PolicyDenied | N |
| InvariantViolation | N |
| ActionEscalated | N |
| BlastRadiusExceeded | N |

### Health Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Denial rate | X% | OK/WARNING/CRITICAL |
| Invariant violation rate | X% | OK/WARNING |
| Escalation events | N | OK/WARNING |

### Patterns Detected

<List of identified patterns, repeated denials, escalation sequences>

### Recommendations

<Actionable recommendations based on findings>
```

### 8. Create or Update Issue (if actionable)

If any WARNING or CRITICAL findings exist, check for an existing audit issue:

```bash
gh issue list --state open --label "source:governance-audit" --json number,title --limit 1
```

Ensure the label exists:

```bash
gh label create "source:governance-audit" --color "D93F0B" --description "Auto-created by Governance Log Audit skill" 2>/dev/null || true
```

If an existing issue is open, comment on it with the new report:

```bash
gh issue comment <ISSUE_NUMBER> --body "<audit report>"
```

If no existing issue is open, create one:

```bash
gh issue create \
  --title "governance-audit: <summary of top finding>" \
  --body "<full audit report>" \
  --label "source:governance-audit" --label "priority:high"
```

### 9. Summary

Report the audit findings to the console, including:
- Total events analyzed
- Key metrics (denial rate, violation rate)
- Number of warnings and critical findings
- Issue created or updated (if any)
- "Governance logs nominal" if no actionable findings

## Rules

- **Read-only on log files** — never modify, truncate, or delete governance logs
- **Never close existing audit issues** — only create new ones or comment on existing open ones
- If no log files exist, report cleanly and STOP — do not error
- If all metrics are within thresholds, report "Governance logs nominal" and STOP — do not create an issue
- Cap pattern analysis at 20 events per type to avoid excessive processing
- If `gh` CLI is not authenticated, still generate the report to console but skip issue creation
