# Skill: Governance Log Audit

Analyze governance event logs for cross-session trends, escalation trajectory, risk score progression, and per-agent governance compliance. Uses the AgentGuard analytics engine for aggregation and decision records for rich outcome analysis. Focuses on historical pattern analysis and compliance reporting — leave real-time anomaly detection to the Observability Agent, and policy quality analysis to `policy-effectiveness-review`. Creates an issue if actionable findings exist. Designed for periodic scheduled execution.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If data is unavailable or ambiguous, proceed with available data and note limitations
- If governance activation fails, log the failure and **STOP**
- If `gh` CLI fails, log the error and **STOP**
- Default to the **safest option** in every ambiguous situation

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance — even log analysis should be auditable.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Locate Log Files

```bash
ls -la .agentguard/events/*.jsonl 2>/dev/null
ls -la .agentguard/decisions/*.jsonl 2>/dev/null
ls -la <%= paths.logs %> 2>/dev/null
```

If no log files exist, report "No governance logs found — nothing to audit" and STOP.

### 3. Run Cross-Session Analytics

Use the AgentGuard analytics engine for aggregated cross-session data:

```bash
<%= paths.cli %> analytics --format json 2>/dev/null | head -200
```

Extract:
- **Total sessions** analyzed
- **Per-session risk scores** and risk levels
- **Violation clustering**: which action types, targets, and branches produce the most violations
- **Denial rate trend**: increasing, stable, or decreasing across sessions
- **Top violation patterns**: recurring invariant or policy violations

If the analytics command is not available, fall back to manual counting in Step 4.

### 4. Count Events by Type

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

### 5. Analyze Decision Records

Read decision records for richer outcome analysis:

```bash
cat .agentguard/decisions/*.jsonl 2>/dev/null | head -200
```

Parse each `GovernanceDecisionRecord` and aggregate:
- **Outcome distribution**: allow vs. deny counts
- **Intervention types**: deny, rollback, pause, test-only (count each)
- **Escalation levels**: Distribution of NORMAL through LOCKDOWN
- **Top denial reasons**: Group by reason, count occurrences
- **Execution success rate**: succeeded vs. failed
- **Per-session risk scores**: Extract and track over time

### 6. Compute Metrics

Calculate key governance health metrics:

- **Denial rate**: `(ActionDenied + PolicyDenied) / ActionRequested * 100`
- **Invariant violation rate**: `InvariantViolation / ActionRequested * 100`
- **Escalation count**: total ActionEscalated events
- **Average risk score**: mean of per-session risk scores

Flag these thresholds:
- Denial rate > 20% → **WARNING**
- Denial rate > 50% → **CRITICAL**
- Any InvariantViolation → **WARNING**
- Any ActionEscalated → **WARNING**
- Any BlastRadiusExceeded → **WARNING**
- Average risk score > 50 → **WARNING**
- Any session risk score > 70 → **CRITICAL**

### 7. Analyze Per-Agent Compliance

Group events by agent identity (extract from event metadata):

```bash
cat .agentguard/events/*.jsonl 2>/dev/null | grep "ActionDenied\|PolicyDenied" | head -100
```

For each agent:
- **Total actions requested**
- **Denial count and rate**
- **Types of denials** (policy vs. invariant)
- **Compliance score**: `(allowed / total) * 100`

Identify:
- **Compliant agents**: denial rate <5%
- **Boundary-testing agents**: denial rate 5-20%
- **Non-compliant agents**: denial rate >20% (persistent bad behavior)

### 8. Analyze Cross-Session Trends

If multiple log files exist (each representing a session), compare across sessions:

```bash
ls -lt .agentguard/events/*.jsonl 2>/dev/null | head -10
```

For the last 5 sessions, compute:
- Denial rate per session (is it trending up or down?)
- Risk score per session (from analytics or decision records)
- Escalation levels reached per session
- Most common denial reason per session
- Session duration and event volume

Look for:
- **Improving trend**: denial rate decreasing, risk scores declining across sessions (agents learning)
- **Degrading trend**: denial rate increasing, risk scores rising (new bad patterns emerging)
- **Escalation trajectory**: are sessions reaching higher escalation levels over time?

### 9. Check Escalation History

Read all escalation-related events across sessions:

```bash
cat .agentguard/events/*.jsonl 2>/dev/null | grep -i "escalat\|lockdown" | tail -20
```

Build an escalation timeline:
- When did each escalation occur?
- What action triggered it?
- Did the system recover (de-escalate) or remain elevated?
- Any LOCKDOWN events → **CRITICAL**

### 10. Generate Report

Compile the audit findings into a structured report:

```
## Governance Log Audit Report

**Date**: <timestamp>
**Log files analyzed**: <count>
**Decision records analyzed**: <count>
**Total events**: <N>
**Sessions covered**: <N>

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
| Average risk score | N/100 | OK/WARNING/CRITICAL |

### Risk Score Trend

| Session | Date | Risk Score | Risk Level | Trend |
|---------|------|------------|------------|-------|
| <id> | <date> | N/100 | low/medium/high/critical | ↑/↓/→ |

### Decision Record Analysis

| Metric | Value |
|--------|-------|
| Total decisions | N |
| Deny outcomes | N |
| Intervention types | deny: N, rollback: N, pause: N |
| Execution success rate | N% |

### Per-Agent Compliance

| Agent | Actions | Denials | Compliance | Status |
|-------|---------|---------|------------|--------|
| <agent> | N | N | X% | COMPLIANT/BOUNDARY/NON-COMPLIANT |

### Cross-Session Trends

| Session | Date | Events | Denial Rate | Risk Score | Max Escalation |
|---------|------|--------|-------------|------------|----------------|
| <id> | <date> | N | X% | N/100 | NORMAL/ELEVATED/HIGH/LOCKDOWN |

**Trend**: Improving / Stable / Degrading

### Escalation Timeline

<Chronological list of escalation events with triggers and recovery>

### Recommendations

<Actionable recommendations focused on agent compliance, risk reduction, and trend direction>
```

### 11. Create or Update Issue (if actionable)

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
  --label "source:governance-audit" --label "<%= labels.high %>"
```

### 12. Summary

Report the audit findings to the console, including:
- Total events analyzed
- Decision records analyzed
- Key metrics (denial rate, violation rate, average risk score)
- Number of warnings and critical findings
- Risk score trend direction
- Issue created or updated (if any)
- "Governance logs nominal" if no actionable findings

## Rules

- **Read-only on log files** — never modify, truncate, or delete governance logs
- **Never close existing audit issues** — only create new ones or comment on existing open ones
- If no log files exist, report cleanly and STOP — do not error
- If all metrics are within thresholds, report "Governance logs nominal" and STOP — do not create an issue
- Cap pattern analysis at 20 events per type to avoid excessive processing
- If `gh` CLI is not authenticated, still generate the report to console but skip issue creation
