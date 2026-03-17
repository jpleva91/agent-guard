# Skill: Recovery Controller

Detect unhealthy swarm conditions and execute remediation playbooks to drive the autonomous SDLC back to a healthy state. This is the self-healing layer — the Kubernetes controller-manager equivalent for the agent swarm. Designed for periodic scheduled execution (every 4 hours).

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If governance activation fails, log the failure and **STOP**
- If `gh` CLI fails, log the error and **STOP**
- Default to the **safest remediation** in every ambiguous situation
- When in doubt: **observe and report** rather than take corrective action

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Design Principle: Reconciliation Loop

```
Observe actual state (GitHub, CI, swarm-state.json, agent outputs)
    |
Compare to desired state (healthy thresholds)
    |
If unhealthy: execute remediation playbook
    |
Verify remediation succeeded
    |
Update swarm-state.json with recovery actions taken
```

The Recovery Controller NEVER duplicates other agents' work. It only intervenes when an agent has failed to do its job or when system-level conditions prevent normal operation.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Read Swarm State

```bash
cat <%= paths.swarmState %> 2>/dev/null || echo '{}'
```

Extract current state fields: `mode`, `openAgentPRs`, `prQueueHealthy`, `mergeConflicts`, `blockers`, `lastUpdated`, `recoveryActions`.

### 3. Health Check: PR Queue

```bash
gh pr list --state open --json number,title,headRefName,mergeable,createdAt,labels,isDraft --limit 30
```

**Condition: PR queue stuck** — 5+ open non-draft PRs AND the oldest is >48 hours old with no activity.

**Remediation playbook:**
1. Identify PRs with `merge:failed` label or `CONFLICTING` mergeable state
2. For PRs older than 7 days with conflicts:
   ```bash
   gh pr comment <NUMBER> --body "Recovery Controller: This PR has been conflicting for 7+ days. Closing to unblock the queue. The underlying issue remains open for a fresh attempt."
   gh pr close <NUMBER>
   ```
3. Cap at **2 PR closures per run**
4. Do NOT close PRs with `do-not-merge` label (these are intentionally held)

### 4. Health Check: CI on Main

```bash
gh run list --branch main --limit 5 --json databaseId,conclusion,createdAt,name
```

**Condition: CI broken on main** — Last 3 runs on main all have conclusion `failure`.

**Remediation playbook:**
1. Check if a CI Triage issue already exists:
   ```bash
   gh issue list --state open --label "source:ci-triage" --json number,title --limit 5
   ```
2. If no triage issue exists, create one:
   ```bash
   gh issue create \
     --title "fix(ci): Main branch CI broken — recovery controller alert" \
     --body "## CI Recovery Alert

   The last 3 CI runs on main have failed. This blocks all PR merges and agent work.

   **Failed runs:**
   <list run IDs and failure reasons>

   **Priority:** CRITICAL — this blocks the entire SDLC pipeline.

   ---
   *Auto-created by recovery-controller on $(date -u +%Y-%m-%dT%H:%M:%SZ)*" \
     --label "<%= labels.critical %>" --label "source:recovery-controller" --label "<%= labels.pending %>"
   ```
3. If triage issue exists but is >48h old, add a comment escalating urgency

### 5. Health Check: Agent Liveness

Check that key agents have produced recent output:

```bash
# Planning Agent — should produce a sprint plan daily
gh issue list --state open --label "source:planning-agent" --limit 1 --json number,createdAt

# Observability Agent — should produce a report daily
gh issue list --state open --label "source:observability-agent" --limit 1 --json number,createdAt

# Backlog Steward — should produce issues regularly
gh issue list --label "source:backlog-steward" --limit 1 --json number,createdAt --state all
```

**Condition: Agent silent** — An agent's last output is >72 hours old (3x its expected frequency).

**Remediation playbook:**
1. Log the silent agent in the recovery report
2. Check if the agent's scheduled task is still enabled:
   - Look for recent issues/PRs from the agent
3. Create an alert issue if the agent has been silent >72h:
   ```bash
   gh issue create \
     --title "alert: <agent-name> silent for 72+ hours" \
     --body "## Agent Liveness Alert

   **Agent:** <agent-name>
   **Last output:** <timestamp or 'none found'>
   **Expected frequency:** <frequency>
   **Impact:** <what stops working when this agent is down>

   ---
   *Auto-created by recovery-controller on $(date -u +%Y-%m-%dT%H:%M:%SZ)*" \
     --label "source:recovery-controller" --label "<%= labels.high %>" --label "<%= labels.pending %>"
   ```
3. Cap at **1 liveness alert per run**

### 6. Health Check: Merge Conflict Cascade

```bash
gh pr list --state open --json number,mergeable --jq '[.[] | select(.mergeable == "CONFLICTING")] | length'
```

**Condition: Conflict cascade** — 4+ PRs in CONFLICTING state simultaneously.

**Remediation playbook:**
1. List all conflicting PRs sorted by age (oldest first)
2. Close PRs 4+ (keeping only the 3 oldest for the Merge Conflict Resolver to process)
3. Comment on closed PRs:
   ```bash
   gh pr comment <NUMBER> --body "Recovery Controller: Closing to break merge conflict cascade. 4+ PRs were conflicting simultaneously, blocking the pipeline. The underlying issue remains open for a fresh implementation attempt."
   gh pr close <NUMBER>
   ```
4. Cap at **2 cascade closures per run**

### 7. Health Check: Swarm State Freshness

Check if `swarm-state.json` has been updated recently:

**Condition: Stale state** — `lastUpdated` is >48 hours ago.

**Remediation playbook:**
1. If the Planning Agent or Observability Agent should have updated it, flag their silence (Step 5 handles this)
2. Reset `lastUpdated` to now and add a `blockers` entry noting the staleness
3. Do NOT modify other fields — preserve whatever other agents have written

### 8. Health Check: Roadmap Progress Stall

```bash
# Check if any issues have been closed in the last 7 days
gh issue list --state closed --json closedAt --jq '[.[] | select(.closedAt > "'$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-7d +%Y-%m-%dT%H:%M:%SZ)'")]' 2>/dev/null | head -5
```

**Condition: No progress** — Zero issues closed AND zero PRs merged in the last 7 days.

**Remediation playbook:**
1. Check for blockers:
   - All PRs have failing CI? → CI is the bottleneck (Step 4)
   - All PRs have conflicts? → Conflict cascade (Step 6)
   - No open PRs at all? → Coder Agent may be stalled (Step 5)
   - PR queue at max (5+)? → Merge pipeline is the bottleneck
2. Log the root cause analysis in the recovery report
3. If bottleneck is identifiable and fixable, take the appropriate remediation
4. If bottleneck is not clear, create an alert issue for human review

### 9. Determine System Mode

Based on health checks, determine the appropriate system mode:

| Condition | Mode |
|-----------|------|
| All checks healthy | `normal` |
| 1-2 WARNING conditions | `normal` (with warnings logged) |
| CI broken on main OR conflict cascade OR 2+ silent agents | `conservative` |
| CI broken on main AND (conflict cascade OR 3+ silent agents OR no progress 14+ days) | `safe` |

**Mode behaviors:**
- **normal**: All agents operate at full autonomy
- **conservative**: Coder Agent reduces to 1 PR max, Backlog Steward pauses new issue creation, PR Merger requires 1+ human review
- **safe**: Only Observability Agent and Recovery Controller run. All other agents should check mode and skip.

### 10. Update Swarm State

Read the current `swarm-state.json` and update:

```bash
cat <%= paths.swarmState %> 2>/dev/null || echo '{}'
```

Update fields:
- `mode`: `normal` | `conservative` | `safe`
- `lastRecoveryRun`: current ISO timestamp
- `recoveryActions`: array of actions taken this run (e.g., `{"action": "closed-stale-pr", "target": "#123", "reason": "conflicting 7+ days"}`)
- `blockers`: array of current blockers with descriptions
- `healthChecks`: object with results of each health check

Preserve all other fields written by other agents.

```bash
mkdir -p .agentguard
# Write updated swarm-state.json
```

### 11. Generate Recovery Report

If any remediation actions were taken OR any WARNING/CRITICAL conditions detected, route the output using the `report-routing` protocol:

**If remediation actions were taken or CRITICAL conditions exist → write REPORT file AND create ALERT if critical**:

```bash
mkdir -p .agentguard/reports
cat > .agentguard/reports/recovery-controller-$(date +%Y-%m-%d).md <<'REPORT_EOF'
<recovery report markdown>
REPORT_EOF
```

Only create an ALERT issue if CRITICAL conditions required human attention (e.g., system entered `safe` mode, or remediation failed):

```bash
gh issue create \
  --title "ALERT: Recovery action required — $(date +%Y-%m-%d)" \
  --body "<critical recovery details>" \
  --label "source:recovery-controller" --label "<%= labels.critical %>" --label "<%= labels.pending %>"
```

Close any previous routine recovery report issues:

```bash
PREV=$(gh issue list --state open --label "source:recovery-controller" --json number,labels --jq '[.[] | select(.labels | map(.name) | index("<%= labels.critical %>") | not)] | .[].number' 2>/dev/null)
for num in $PREV; do
  gh issue close "$num" --comment "Superseded — recovery reports now written to .agentguard/reports/" 2>/dev/null || true
done
```

**If all health checks passed and no remediation needed → LOG tier**:

```bash
mkdir -p .agentguard/logs
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [recovery-controller] All healthy. Mode: $(mode). No remediation needed." >> .agentguard/logs/swarm.log
```

**Report format:**
```markdown
## Recovery Controller Report

**Timestamp:** <UTC>
**System Mode:** normal | conservative | safe

### Health Check Results

| Check | Status | Details |
|-------|--------|---------|
| PR Queue | HEALTHY/WARNING/CRITICAL | N open PRs, oldest Nh |
| CI on Main | HEALTHY/WARNING/CRITICAL | Last N runs: pass/fail |
| Agent Liveness | HEALTHY/WARNING/CRITICAL | N agents responsive |
| Merge Conflicts | HEALTHY/WARNING/CRITICAL | N conflicting PRs |
| Swarm State | HEALTHY/WARNING/CRITICAL | Last updated Nh ago |
| Roadmap Progress | HEALTHY/WARNING/CRITICAL | N issues closed (7d) |

### Remediation Actions Taken

| Action | Target | Reason |
|--------|--------|--------|
| <action> | <PR/issue> | <reason> |

### Mode Determination

Current mode: <mode>
Reason: <why this mode was selected>
```

### 12. Summary

Report:
- **Health checks run**: 6
- **Conditions detected**: N (N critical, N warning)
- **Remediation actions taken**: N (list actions)
- **System mode**: normal | conservative | safe (changed from <previous>?)
- **PRs closed**: N
- **Alert issues created**: N
- **Top concern**: Brief statement of the most critical finding

## Rules

- **Routine recovery reports go to `.agentguard/reports/`, NOT GitHub issues** — follow the report-routing protocol
- Create a maximum of **1 alert issue per run** — only for CRITICAL conditions requiring human attention
- Close a maximum of **2 stale/stuck PRs per run**
- Close a maximum of **2 cascade PRs per run**
- **NEVER close PRs with `do-not-merge` label**
- **NEVER force push or modify branches** — only close PRs or create issues
- **NEVER modify source code** — only manage GitHub issues and PRs
- **NEVER override other agents' decisions** — only intervene when agents have failed
- **NEVER escalate to `safe` mode without at least 2 CRITICAL conditions**
- If `gh` CLI is not authenticated, report the error and STOP
- The Recovery Controller is the ONLY agent that can set the system `mode` field in swarm-state.json
- When closing PRs, always verify the underlying issue remains open for retry
- Do not create duplicate alert issues — check for existing ones first
- Remediation actions should be minimal and targeted — do the least necessary to unblock the pipeline
