# Skill: Observability Review

Analyze runtime telemetry, governance event patterns, decision records, risk score trends, CI pipeline trends, and build metrics to surface operational health signals. Detect anomalies, regressions, and trends that other agents cannot see. Publish an Observability Report. Designed for daily scheduled execution.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If data is unavailable or ambiguous, proceed with available data and note limitations
- If governance activation fails, log the failure and **STOP**
- If `gh` CLI fails, log the error and **STOP**
- Default to the **safest option** in every ambiguous situation
- When in doubt about anomaly severity, round **up** (flag rather than ignore)

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Collect Cross-Session Analytics

Use the AgentGuard analytics engine for aggregated cross-session data:

```bash
<%= paths.cli %> analytics --format json 2>/dev/null | head -200
```

Extract:
- **Per-session risk scores** (trend over time)
- **Violation clustering** by dimension (action type, branch, target)
- **Cross-session denial rate** trend
- **Top violation patterns** (recurring invariant or policy violations)

If analytics is not available, fall back to manual aggregation in Step 3.

### 3. Collect Governance Telemetry

Read the runtime telemetry log:

```bash
cat <%= paths.logs %> 2>/dev/null | tail -500
```

Parse each line as JSON with schema:
```
{timestamp, agent, run_id, syscall, target, capability, policy_result, invariant_result}
```

If the file does not exist or is empty, note "No telemetry data available" and continue with other data sources.

Aggregate:
- **Total events** in the log
- **Events in last 24 hours**: Filter by timestamp
- **Events in last 7 days**: Filter by timestamp
- **Action type distribution**: Count by `syscall` (file.read, file.write, git.push, etc.)
- **Policy result distribution**: Count of allow vs. deny
- **Invariant result distribution**: Count of pass vs. fail
- **Agent distribution**: Count by `agent` field
- **Denial rate**: deny / total as percentage (last 24h and 7d)
- **Invariant failure rate**: fail / total as percentage (last 24h and 7d)

### 4. Analyze Decision Records and Risk Scores

List available decision log files:

```bash
ls -la .agentguard/decisions/ 2>/dev/null | tail -20
```

Read the most recent decision logs (up to 5 files, most recent first):

```bash
for f in $(ls -t .agentguard/decisions/*.jsonl 2>/dev/null | head -5); do cat "$f"; done
```

Parse each `GovernanceDecisionRecord` and aggregate:
- **Outcome distribution**: allow vs. deny counts
- **Intervention types**: deny, rollback, pause, test-only (count each)
- **Escalation levels observed**: Distribution of 0 (NORMAL) through 3 (LOCKDOWN)
- **Top denial reasons**: Group by `reason` field, count occurrences
- **Invariant violations**: Group by invariant name, count occurrences
- **Policy matches**: Group by `policy.matchedPolicyName`, count occurrences
- **Execution success rate**: executed actions that succeeded vs. failed
- **Average decision-to-execution time**: From `execution.durationMs` where available
- **Per-session risk scores**: Extract risk score from each session's decision records

### 5. Check Tracepoint Data

Look for kernel-level tracepoint data for performance and pipeline health:

```bash
grep "tracepoint\|trace_kind" <%= paths.logs %> 2>/dev/null | tail -50
```

If tracepoint data is available, extract:
- **Kernel pipeline latency**: Time spent in aab.normalize, policy.evaluate, invariant.check stages
- **Slow operations**: Any tracepoint with duration > 100ms
- **Adapter dispatch failures**: Failed adapter.dispatch tracepoints

If no tracepoint data exists, note "Tracepoint data: not available" and skip.

### 6. Detect Anomalies

Compare recent patterns (last 24h) against baseline (last 7d) to detect:

**Escalation anomalies**:
- Any LOCKDOWN events (escalation level 3) — always flag as critical
- HIGH escalation events (level 2) — flag if more than 2 in 24h
- Escalation level increasing over time (trend)

**Denial rate anomalies**:
- Denial rate >20% in last 24h (high denial signal)
- Denial rate increased >10 percentage points vs. 7-day average
- Single agent responsible for >50% of denials

**Invariant violation anomalies**:
- Any new invariant type that wasn't violated in prior 7 days
- Invariant violation rate >5% (high violation signal)
- Repeated violations of the same invariant (>3 in 24h)

**Risk score anomalies**:
- Per-session risk score >70 (high risk session)
- Risk score trend increasing over last 5 sessions
- Any session with risk level "critical"

**Volume anomalies**:
- Event volume dropped >50% vs. 7-day daily average (agents may be stalled)
- Event volume spiked >200% vs. 7-day daily average (unusual activity)

### 7. Analyze CI Pipeline Health

Fetch recent CI workflow runs:

```bash
gh run list --limit 30 --json databaseId,conclusion,headBranch,createdAt,name,updatedAt
```

Calculate:
- **Overall pass rate**: % with conclusion "success" (last 30 runs)
- **Pass rate trend**: Compare last 10 runs vs. prior 20 runs
- **Failure breakdown**: Group failures by workflow name and branch
- **Mean time to recovery (MTTR)**: Average time between a failure and next success on the same branch
- **Currently failing branches**: Branches where the most recent run failed

Fetch workflow run details for recent failures (up to 3):

```bash
gh run view <RUN_ID> --json jobs --jq '.jobs[] | select(.conclusion == "failure") | {name, conclusion, steps: [.steps[] | select(.conclusion == "failure") | .name]}'
```

Identify:
- **Failure hotspots**: Which CI jobs fail most often (lint, typecheck, test, build)
- **Flaky patterns**: Same branch/commit with both pass and fail results

### 8. Analyze Build Metrics

Check the current build output:

```bash
ls -la apps/cli/dist/bin.js 2>/dev/null
ls -la apps/cli/dist/bin.js.map 2>/dev/null
```

Record:
- **CLI bundle size**: File size of `apps/cli/dist/bin.js`
- **Source map size**: File size of `apps/cli/dist/bin.js.map`

Check dependency health:

```bash
pnpm audit --json 2>/dev/null | head -100
pnpm outdated --json 2>/dev/null | head -50
```

Record:
- **Vulnerability count**: By severity (critical, high, moderate, low)
- **Outdated packages**: Count and list of outdated dependencies

### 9. Analyze Agent Activity Patterns

From the telemetry data (Step 3), analyze per-agent behavior:

For each unique agent in the telemetry:
- **Action volume**: Total actions in last 24h
- **Action types**: Distribution of syscall types
- **Denial rate**: Per-agent denial percentage
- **Target patterns**: Most frequently targeted files/paths
- **Activity timeline**: When the agent was most active (hour buckets)

Detect:
- **Idle agents**: Agents with no activity in last 24h that were active in prior 7 days
- **Hyperactive agents**: Agents with >100 actions in last 24h
- **Permission-seeking agents**: Agents with denial rate >30%
- **Narrow-scope agents**: Agents that only touch 1-2 file paths repeatedly

### 10. Check Scheduled Agent Health

Verify all scheduled agents are running:

```bash
gh issue list --state open --label "source:planning-agent" --limit 1 --json number,createdAt
gh issue list --state open --label "source:product-agent" --limit 1 --json number,createdAt
gh issue list --state open --label "source:test-agent" --limit 1 --json number,createdAt
gh issue list --state open --label "source:backlog-steward" --limit 1 --json number,createdAt
```

For each agent, check if it has produced output recently:
- **Healthy**: Output issue exists and was created/updated in last 48h
- **Stale**: Output issue exists but is older than 48h
- **Missing**: No output issue found (agent may not be running)

### 11. Generate Observability Report

Compose a structured report in markdown:

**Header**:
- Generation timestamp (UTC)
- HEAD commit SHA
- Reporting period (last 24h with 7d baseline)

**System Health Dashboard**:
| Metric | Last 24h | 7-Day Avg | Trend | Status |
Showing: event volume, denial rate, invariant failure rate, CI pass rate, escalation level, risk score.

Use status indicators:
- `HEALTHY` — metric within normal range
- `WARNING` — metric approaching threshold
- `CRITICAL` — metric exceeds threshold or anomaly detected

**Risk Score Trend**:
| Session | Date | Risk Score | Risk Level |
Showing per-session risk scores for the last 5-10 sessions, with trend arrow.

**Governance Event Summary** (table):
| Action Type | Total | Allowed | Denied | Denial Rate |
Broken down by syscall type.

**Decision Record Summary** (table):
| Metric | Value |
Showing: total decisions, deny outcomes, intervention types, escalation levels observed.

**Anomalies Detected** (list):
Each anomaly with:
- Severity (CRITICAL / WARNING / INFO)
- Description
- Evidence (specific numbers and comparisons)
- Recommended action

**Top Denial Reasons** (table, top 10):
| Reason | Count | % of Denials | Affected Agents |

**Invariant Health** (table):
| Invariant | Violations (24h) | Violations (7d) | Status |

**CI Pipeline Metrics**:
- Pass rate (with trend arrow)
- Failure hotspots
- MTTR
- Currently failing branches
- Flaky test signals

**Build Metrics**:
- Bundle size
- Vulnerability summary
- Outdated dependency count

**Agent Activity Matrix** (table):
| Agent | Actions (24h) | Denial Rate | Top Syscall | Status |
Showing activity for each detected agent.

**Scheduled Agent Health** (table):
| Agent | Last Output | Age | Status |
Showing liveness for all scheduled agents.

**Trend Analysis**:
- 7-day governance activity trend (daily totals)
- Denial rate trend (is it increasing, decreasing, or stable?)
- CI pass rate trend
- Risk score trend (per-session over time)

**Recommendations** (numbered, max 5):
Top 5 operational actions prioritized by severity:
1. Critical anomalies to investigate
2. Failing CI to fix
3. Agents that need attention
4. Policy gaps to address
5. Infrastructure improvements

### 12. Route Output (Report Routing Protocol)

Apply the `report-routing` protocol to determine where output goes:

**Assess severity**: Check if ANY of the following critical conditions exist:
- LOCKDOWN event detected
- CRITICAL anomalies found
- CI completely broken (0% pass rate)
- Risk score >50
- Sustained denial rate >20%
- Deadlock or livelock detected

**If critical conditions exist → ALERT tier**:

Check for existing alert from this agent:

```bash
gh issue list --state open --label "source:observability-agent" --label "<%= labels.critical %>" --json number,title
```

If no existing alert covers the anomaly:

```bash
gh issue create \
  --title "ALERT: <anomaly description> — $(date +%Y-%m-%d)" \
  --body "<anomaly details with evidence and recommended action>" \
  --label "source:observability-agent" --label "<%= labels.critical %>" --label "<%= labels.pending %>"
```

Cap at **1 alert issue per run**. Do NOT create a separate "Observability Report" issue.

**Always write the full report to REPORT tier** (regardless of alert):

```bash
mkdir -p .agentguard/reports
cat > .agentguard/reports/observability-agent-$(date +%Y-%m-%d).md <<'REPORT_EOF'
<full observability report markdown>
REPORT_EOF
```

Close any previous observability report issues that are still open:

```bash
PREV=$(gh issue list --state open --label "source:observability-agent" --json number --jq '[.[] | select(.labels | map(.name) | index("<%= labels.critical %>") | not)] | .[].number' 2>/dev/null)
for num in $PREV; do
  gh issue close "$num" --comment "Superseded — reports now written to .agentguard/reports/" 2>/dev/null || true
done
```

**If no anomalies detected → LOG tier** (in addition to REPORT file):

```bash
mkdir -p .agentguard/logs
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [observability-agent] No anomalies. Denial rate: N%. CI pass rate: N%. Risk: N/100." >> .agentguard/logs/swarm.log
```

### 14. Swarm Health Check

Analyze control plane health and include a "## Swarm Health" section in the report.

#### 14a. PR Queue Depth

```bash
gh pr list --author @me --state open --json number --jq length
```

- If count > 10: flag as "PR queue overloaded" (CRITICAL)
- If count > 5: flag as "PR queue elevated" (WARNING)

#### 14b. Issue Creation Rate

```bash
gh issue list --label "source:backlog-steward" --state open --json createdAt --jq '[.[] | select(.createdAt > "'$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)'")] | length' 2>/dev/null
```

- If count > 10: flag as "Issue flood detected" (WARNING)

#### 14c. Merge Conflict Count

```bash
gh pr list --state open --json mergeable --jq '[.[] | select(.mergeable == "CONFLICTING")] | length'
```

- If count > 3: flag as "Merge conflict cascade" (WARNING)

#### 14d. Sprint Plan Freshness

```bash
gh issue list --label "source:planning-agent" --limit 1 --state open --json createdAt --jq '.[0].createdAt'
```

- If older than 48h: flag as "Sprint plan stale" (WARNING)

#### 14e. Update Swarm State

Read `<%= paths.swarmState %>` if it exists. Update with:
- `openAgentPRs`: PR count from 14a
- `prQueueHealthy`: true if count < 8
- `mergeConflicts`: count from 14c
- `lastObservabilityRun`: current ISO timestamp

Write the updated file back. If the file doesn't exist, create it with these fields.

#### 14f. Deadlock & Livelock Detection

Check for swarm-level deadlocks and livelocks:

**Deadlock patterns** (agents waiting on each other, no progress possible):

```bash
# All PRs blocked by the same failing test
gh pr list --state open --json number,statusCheckRollup --jq '[.[] | select(.statusCheckRollup != null) | select([.statusCheckRollup[] | select(.conclusion == "FAILURE")] | length > 0)] | length'
```

- If ALL open PRs fail the same CI check: flag as "Deadlock: all PRs blocked by same CI failure" (CRITICAL)
- If all PRs are CONFLICTING and the Merge Conflict Resolver hasn't produced output in 24h: flag as "Deadlock: conflict cascade with stalled resolver" (CRITICAL)

**Livelock patterns** (agents active but no forward progress):

```bash
# PRs opened and closed repeatedly on same issue
gh pr list --state closed --limit 30 --json number,title,headRefName,closedAt,mergedAt --jq '[.[] | select(.mergedAt == null)]'
```

- If 3+ PRs were closed-without-merge on the same issue in 7 days: flag as "Livelock: repeated failed attempts on same issue" (WARNING)
- If the same PR has been rebased 5+ times without merging: flag as "Livelock: rebase loop" (WARNING)

```bash
# Check for circular dependency blocking
gh issue list --state open --label "<%= labels.blocked %>" --json number,body --limit 20
```

- If issue A is blocked by issue B AND issue B references issue A: flag as "Deadlock: circular dependency" (WARNING)

**Starvation patterns** (some work never gets done):

```bash
# Issues older than 30 days with no PR activity
gh issue list --state open --json number,title,createdAt,labels --jq '[.[] | select(.createdAt < "'$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-30d +%Y-%m-%dT%H:%M:%SZ)'")]' 2>/dev/null
```

- If 5+ issues are older than 30 days with no linked PR: flag as "Starvation: old issues never picked up" (WARNING)

#### 14g. Include in Report

Add a "## Swarm Health" section to the observability report with a table:

| Metric | Value | Status |
|--------|-------|--------|
| Open agent PRs | N | HEALTHY/WARNING/CRITICAL |
| Issues created (24h) | N | HEALTHY/WARNING |
| Merge conflicts | N | HEALTHY/WARNING |
| Sprint plan age | Nh | HEALTHY/WARNING |
| Swarm state age | Nh | HEALTHY/WARNING |
| Deadlocks detected | N | HEALTHY/WARNING/CRITICAL |
| Livelocks detected | N | HEALTHY/WARNING |
| Starved issues (30d+) | N | HEALTHY/WARNING |

### 15. Summary

Report:
- **Governance events (24h)**: N total, N% denial rate, N% invariant failure rate
- **Escalation level**: NORMAL / ELEVATED / HIGH / LOCKDOWN
- **Risk score**: <N>/100 (<risk level>)
- **CI pass rate**: N% (trend: improving / stable / declining)
- **Anomalies detected**: N (N critical, N warning, N info)
- **Scheduled agents healthy**: N of M
- **Observability report created**: #N
- **Alerts raised**: N
- **Top concern**: Brief statement of the single most important operational finding

## Rules

- **Routine reports go to `.agentguard/reports/`, NOT GitHub issues** — follow the report-routing protocol
- Create a maximum of **1 alert issue per run** — only for CRITICAL anomalies
- **Never modify governance logs** — this agent is strictly read-only on telemetry data
- **Never modify source code or tests** — only report findings
- **Never close issues** — only close previous observability report issues labeled `source:observability-agent`
- **Never fix CI failures** — that is the CI Triage Agent's job
- **Never re-prioritize issues** — that is the Planning Agent's job
- If telemetry data is missing, still produce a report from available CI and GitHub data
- If `gh` CLI is not authenticated, report the error and STOP
- Do not create duplicate alert issues — check for existing ones first
- When closing previous reports, verify the issue is actually labeled `source:observability-agent` before closing
- Anomaly thresholds should be applied conservatively — flag only when evidence is clear
- The observability agent watches OTHER agents but never takes action on their behalf
