# Skill: Risk & Escalation

Assess cumulative swarm risk across multiple dimensions, gate dangerous operations, and escalate to human notification when autonomy should be reduced. This agent is the circuit breaker — it decides when the swarm should slow down or stop. Designed for periodic scheduled execution (every 4 hours).

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If governance activation fails, log the failure and **STOP**
- If `gh` CLI fails, log the error and **STOP**
- Default to the **safest option** — when in doubt, escalate rather than ignore

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Collect Risk Signals

Gather data from multiple sources to score risk:

#### 2a. PR Blast Radius

```bash
gh pr list --state open --json number,title,additions,deletions,changedFiles --limit 20
```

For each open PR, compute:
- `blast_radius = additions + deletions`
- `file_count = changedFiles`

Flag:
- Any single PR with `blast_radius > 500` lines — HIGH risk
- Any single PR with `file_count > 20` files — HIGH risk
- Total open PR blast radius > 2000 lines — ELEVATED risk

#### 2b. Test Failure Rate

```bash
gh run list --limit 20 --json databaseId,conclusion,createdAt,headBranch
```

Calculate:
- `failure_rate = failed_runs / total_runs` (last 20 runs)
- `main_failures = failed_runs on main branch` (last 5 runs on main)

Flag:
- `failure_rate > 0.40` (40%+) — HIGH risk
- `main_failures >= 2` — CRITICAL risk (main is unreliable)
- `failure_rate > 0.20` (20%+) — ELEVATED risk

#### 2c. Governance Denial Rate

```bash
<%= paths.cli %> analytics --format json 2>/dev/null | head -100
```

If analytics available, extract:
- `denial_rate` (last 24h)
- `invariant_violation_rate` (last 24h)
- `escalation_level` (current)

If analytics not available, check telemetry:
```bash
cat <%= paths.logs %> 2>/dev/null | tail -200 | grep -c '"policy_result":"deny"' 2>/dev/null
cat <%= paths.logs %> 2>/dev/null | tail -200 | wc -l 2>/dev/null
```

Flag:
- `denial_rate > 0.25` — HIGH risk
- `invariant_violation_rate > 0.10` — HIGH risk
- `escalation_level` is HIGH or LOCKDOWN — CRITICAL risk

#### 2d. Merge Conflict Rate

```bash
gh pr list --state open --json number,mergeable --jq '[.[] | select(.mergeable == "CONFLICTING")] | length'
gh pr list --state open --json number --jq length
```

Calculate:
- `conflict_rate = conflicting_prs / total_open_prs`

Flag:
- `conflict_rate > 0.50` (50%+) — HIGH risk (half the queue is broken)
- `conflict_rate > 0.25` (25%+) — ELEVATED risk

#### 2e. Agent Churn Rate

```bash
# PRs opened in last 24h
gh pr list --state all --json number,createdAt --limit 50 --jq '[.[] | select(.createdAt > "'$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-24H +%Y-%m-%dT%H:%M:%SZ)'")]' 2>/dev/null

# PRs closed without merge in last 24h
gh pr list --state closed --json number,mergedAt,closedAt --limit 20 --jq '[.[] | select(.mergedAt == null)]' 2>/dev/null
```

Flag:
- More than 5 PRs opened in 24h — ELEVATED risk (agent hyperactivity)
- More than 3 PRs closed-without-merge in 24h — HIGH risk (wasted work)

### 3. Compute Composite Risk Score

Score each dimension (0-25 scale, total max 100):

| Dimension | HEALTHY (0) | ELEVATED (10) | HIGH (20) | CRITICAL (25) |
|-----------|-------------|---------------|-----------|---------------|
| PR Blast Radius | Total <500 | Total 500-2000 | Any PR >500 lines | Multiple PRs >500 |
| Test Failures | <20% fail | 20-40% fail | 40%+ fail | Main broken |
| Governance Denials | <10% deny | 10-25% deny | 25%+ deny | LOCKDOWN |
| Conflicts | <25% conflict | 25-50% conflict | 50%+ conflict | All PRs conflict |

`composite_risk = blast_risk + test_risk + governance_risk + conflict_risk`

### 4. Determine Escalation Level

| Composite Risk | Escalation |
|----------------|------------|
| 0-20 | NORMAL — full autonomy |
| 21-40 | ELEVATED — log warning, continue |
| 41-60 | HIGH — reduce autonomy, notify via issue |
| 61-100 | CRITICAL — recommend safe mode, create alert |

### 5. Gate Dangerous Operations

Check for pending operations that should be blocked at current risk level:

#### At ELEVATED (risk > 20):
- Flag any open PR with `blast_radius > 300` as needing extra review:
  ```bash
  gh pr edit <NUMBER> --add-label "needs:careful-review"
  ```
  Cap at **3 label additions per run**.

#### At HIGH (risk > 40):
- Add `do-not-merge` label to any PR with `blast_radius > 500`:
  ```bash
  gh pr edit <NUMBER> --add-label "do-not-merge"
  gh pr comment <NUMBER> --body "Risk & Escalation Agent: Adding do-not-merge — composite risk score is HIGH ($(risk_score)/100). This PR has a blast radius of $(blast_radius) lines. Manual review recommended before merging."
  ```
  Cap at **2 gate actions per run**.

#### At CRITICAL (risk > 60):
- Recommend safe mode in swarm-state.json (Recovery Controller is the authority for mode changes, so this agent only recommends)
- Create a critical alert issue

### 6. Human Escalation

At HIGH or CRITICAL risk levels, create a human-readable escalation issue:

Check for existing escalation:
```bash
gh issue list --state open --label "source:risk-escalation" --label "<%= labels.critical %>" --json number --jq '.[0].number' 2>/dev/null
```

If no existing critical escalation:

```bash
gh issue create \
  --title "RISK ALERT: Composite risk $(risk_score)/100 — $(escalation_level) — $(date +%Y-%m-%d)" \
  --body "## Risk Escalation Alert

**Composite Risk Score:** $(risk_score)/100
**Escalation Level:** $(escalation_level)
**Timestamp:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

### Risk Breakdown

| Dimension | Score | Evidence |
|-----------|-------|----------|
| PR Blast Radius | /25 | Total: N lines, largest PR: #N (N lines) |
| Test Failures | /25 | N% failure rate, main: pass/fail |
| Governance Denials | /25 | N% denial rate, escalation: LEVEL |
| Merge Conflicts | /25 | N/N PRs conflicting (N%) |

### Recommended Actions

1. <specific action based on highest-risk dimension>
2. <second action>
3. <third action>

### Gating Actions Taken

| Action | Target | Reason |
|--------|--------|--------|
| <label added / merge blocked> | PR #N | <reason> |

### What This Means

<1-2 sentence plain-language explanation of what's going wrong and what will happen if not addressed>

---
*Auto-created by risk-escalation agent. This alert requires human attention.*" \
  --label "source:risk-escalation" --label "<%= labels.critical %>" --label "<%= labels.pending %>"
```

### 7. Update Swarm State

Read and update swarm-state.json:

```bash
cat <%= paths.swarmState %> 2>/dev/null || echo '{}'
```

Update:
- `riskScore`: composite risk score (0-100)
- `riskLevel`: `normal` | `elevated` | `high` | `critical`
- `riskBreakdown`: object with per-dimension scores
- `lastRiskAssessment`: current ISO timestamp
- `recommendedMode`: if CRITICAL, set to `safe`; if HIGH, set to `conservative`; else preserve existing

Preserve all other fields.

### 8. Generate Risk Report

Check if a previous risk report exists (not an alert — the routine report):

```bash
gh issue list --state open --label "source:risk-escalation" --json number,labels --jq '[.[] | select(.labels | map(.name) | contains(["<%= labels.critical %>"]) | not)] | .[0].number' 2>/dev/null
```

If previous routine report exists, close it:
```bash
gh issue close <PREV_NUMBER> --comment "Superseded by new risk assessment."
```

Create new report:
```bash
gh issue create \
  --title "Risk Assessment — $(date +%Y-%m-%d) — Score: $(risk_score)/100" \
  --body "<risk report markdown>" \
  --label "source:risk-escalation" --label "<%= labels.pending %>"
```

### 9. Summary

Report:
- **Composite risk score**: N/100 (NORMAL/ELEVATED/HIGH/CRITICAL)
- **Highest risk dimension**: <dimension> at N/25
- **Gating actions taken**: N
- **Escalation issued**: Yes/No
- **Recommended mode**: normal/conservative/safe
- **Report created**: #N
- **Alert created**: #N or none

## Rules

- Create a maximum of **1 risk report per run**
- Create a maximum of **1 escalation alert per run**
- Apply a maximum of **3 labels per run** (needs:careful-review)
- Apply a maximum of **2 gate actions per run** (do-not-merge)
- **NEVER merge or close PRs** — only label them and comment
- **NEVER modify source code**
- **NEVER set the mode field in swarm-state.json** — only set `recommendedMode` (Recovery Controller owns `mode`)
- **NEVER create duplicate escalation alerts** — check for existing ones first
- If `gh` CLI is not authenticated, report the error and STOP
- When computing risk, use actual data — never estimate or assume
- Risk scores should be conservative — round up when data is ambiguous
- The `do-not-merge` label is a strong signal — only apply at HIGH risk or above
- Close previous routine reports but NEVER close previous escalation alerts (those need human acknowledgment)
