# Skill: Sprint Planning

Analyze the full issue backlog, open PRs, ROADMAP phases, governance risk data, and recent activity to produce a prioritized sprint plan. Apply priority labels to unlabeled issues so the Coder Agent picks the right work next. Designed for daily scheduled execution.

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

### 2. Collect Governance Context

Read cross-session governance data to inform prioritization:

```bash
<%= paths.cli %> analytics --format json 2>/dev/null | head -100
```

Extract:
- **Current escalation level**: NORMAL / ELEVATED / HIGH / LOCKDOWN
- **Risk score** (0-100) and **risk level**
- **Recent denial trends**: increasing, stable, or decreasing
- **Top violation patterns**: which invariants or policy rules are triggering most

Also check current escalation state:

```bash
cat <%= paths.logs %> 2>/dev/null | grep -i "escalat\|StateChanged" | tail -5
```

If analytics is not available, note "Governance context: not available" and proceed with standard prioritization.

### 3. Snapshot the Backlog

Fetch all open issues with full metadata:

```bash
gh issue list --state open --limit 100 --json number,title,body,labels,createdAt,updatedAt
```

Parse each issue to extract:
- **Issue number** and **title**
- **Labels** (status, priority, task type, role, source)
- **Dependencies** (from `## Dependencies` section or `#N` references in body)
- **File scope** (from `## File Scope` section if present)
- **Phase mapping** (infer from title, body, or ROADMAP cross-reference)

Also check for existing sprint plan issues:

```bash
gh issue list --state open --label "source:planning-agent" --json number,title
```

### 4. Snapshot In-Flight Work

Fetch open PRs to understand what is actively being worked on:

```bash
gh pr list --state open --json number,title,headRefName,labels,body,additions,deletions
```

Fetch recent CI run status:

```bash
gh run list --limit 5 --json databaseId,conclusion,headBranch,createdAt
```

Note:
- PRs that reference issues (via `Closes #N` or `Implements #N`) indicate near-completion work
- Failing CI runs may indicate blocking issues

### 5. Analyze Throughput

Fetch recently closed issues and merged PRs to measure velocity:

```bash
gh issue list --state closed --limit 20 --json number,title,closedAt,labels
gh pr list --state merged --limit 10 --json number,title,mergedAt,body
```

Calculate:
- **Issues closed in last 7 days** (throughput)
- **PRs merged in last 7 days** (delivery rate)
- **Average issue age** for open issues (staleness signal)

### 6. Read ROADMAP

Read `<%= paths.roadmap %>` to determine phase structure and current progress:

```bash
cat <%= paths.roadmap %>
```

Identify:
- **Current phase**: The first phase that is not `COMPLETE` (currently Phase 3 — partially complete)
- **Remaining items in current phase**: Unchecked `- [ ]` items
- **Next phase**: The phase after current (Phase 4 — Plugin Ecosystem)
- **Phase ordering**: Issues should generally be completed in phase order

### 7. Build Dependency Graph

For each open issue, determine its dependencies:

1. **Explicit dependencies**: Parse `## Dependencies` sections for `#N` references
2. **Implicit phase dependencies**: Phase 3 items before Phase 4 items before Phase 5 items
3. **PR linkage**: Issues with open PRs are in-flight, not available for new work

For each dependency reference, check if it is resolved:

```bash
gh issue view <DEP_NUMBER> --json state --jq '.state'
```

Classify each issue as:
- **Ready**: All dependencies resolved, no open PR, status is `pending`
- **Blocked**: Has unresolved dependencies
- **In-flight**: Has an open PR or is `status:in-progress`
- **Stale candidate**: Open for >30 days with no activity

### 8. Prioritize Unlabeled Issues

For issues that lack a `priority:*` label, assign priority using these signals (in order):

| Signal | Priority |
|--------|----------|
| CI is failing and this issue relates to the failure | `priority:critical` |
| Issue has an open PR (near completion) | `priority:high` |
| Issue is in the current ROADMAP phase (Phase 3) | `priority:high` |
| Issue is documentation debt | `priority:medium` |
| Issue is an entry point to next phase (Phase 4) | `priority:medium` |
| Issue is in a future phase (Phase 5+) | `priority:low` |
| No clear signal | Do not label (leave for human review) |

**Governance risk adjustment**: If the current escalation level is ELEVATED or higher, deprioritize issues with high estimated blast radius (16+ files in scope). If escalation is HIGH, only label issues with small file scope as `priority:high` or above.

Apply labels:

```bash
gh issue edit <N> --add-label "priority:<level>"
```

Cap at **10 label changes per run** to avoid spamming.

### 9. Identify Stale or Obsolete Issues

For each open issue, check for staleness indicators:

- **File paths referenced in the issue that no longer exist** — check with `ls` or `test -f`
- **Issues that reference `src/agentguard/`** — this directory was removed in a restructure
- **Issues that may have been resolved by recently merged PRs** — cross-reference PR bodies for `Closes #N` or `Fixes #N`

For each stale candidate, add a comment (do NOT close the issue):

```bash
gh issue comment <N> --body "**Planning Agent**: This issue may be stale or obsolete.
- **Reason**: <specific reason>
- **Recommendation**: <close / reclassify / update>

*Analysis by sprint-planning on $(date -u +%Y-%m-%dT%H:%M:%SZ)*"
```

Cap at **3 staleness comments per run** to avoid noise.

### 10. Generate Sprint Plan

Compose a structured sprint plan in markdown with these sections:

**Header**:
- Generation timestamp
- HEAD commit SHA
- Open issue count, open PR count
- Current ROADMAP phase

**Governance Context**:
| Metric | Value |
|--------|-------|
| Escalation level | NORMAL / ELEVATED / HIGH / LOCKDOWN |
| Risk score | <N>/100 |
| Recent denial trend | increasing / stable / decreasing |
| Top violation | <invariant or policy rule name> |

**Ready Now** (table):
| Priority | Issue | Title | Package/Theme | Risk Estimate | Complexity Estimate |
Sorted by priority (critical > high > medium > low), then by issue age (oldest first).

**Blocked** (table):
| Issue | Title | Blocked By | Notes |

**Recommended Sequence** (numbered list):
The top 5-7 issues that should be worked next, in order, with brief reasoning. Factor in governance risk — prefer lower-blast-radius issues when escalation is elevated.

**Issues to Close or Reclassify** (list):
Issues identified as stale/obsolete with reasoning.

**Dependency Graph** (ASCII):
Show phase-level dependencies and any cross-issue dependency chains.

**Backlog Health Metrics**:
- Total open issues
- Issues without priority labels (before and after this run)
- Issues without status labels
- Issues older than 30 days
- Throughput: issues closed / PRs merged in last 7 days
- CI health: last 5 runs pass/fail
- Governance risk score and escalation level

### 11. Route Output (Report Routing Protocol)

Apply the `report-routing` protocol. Sprint plans are normally REPORT-tier (routine scheduled output).

**Write the sprint plan to a local file**:

```bash
mkdir -p .agentguard/reports
cat > .agentguard/reports/planning-agent-$(date +%Y-%m-%d).md <<'REPORT_EOF'
<sprint plan markdown>
REPORT_EOF
```

**If critical blockers detected** (e.g., all work blocked, no actionable issues, system in LOCKDOWN) → also create an ALERT issue:

```bash
gh issue create \
  --title "ALERT: Sprint blocked — $(date +%Y-%m-%d)" \
  --body "<blocker details>" \
  --label "source:planning-agent" --label "<%= labels.critical %>" --label "<%= labels.pending %>"
```

Close any previous sprint plan issues that are still open:

```bash
PREV=$(gh issue list --state open --label "source:planning-agent" --json number --jq '.[].number' 2>/dev/null)
for num in $PREV; do
  gh issue close "$num" --comment "Superseded — sprint plans now written to .agentguard/reports/" 2>/dev/null || true
done
```

### 12. Update Swarm State

After publishing the sprint plan, update `<%= paths.swarmState %>`:

```bash
cat <%= paths.swarmState %> 2>/dev/null || echo '{}'
```

Update/create the file with:
- `version`: 1
- `lastUpdated`: current ISO timestamp
- `updatedBy`: "planning-agent"
- `currentPhase`: derived from <%= paths.roadmap %> (the first phase not marked COMPLETE)
- `priorities`: array of top 5 prioritized issue objects with `issueNumber` and `priority` fields
- `documentHashes`: object with keys for <%= paths.roadmap %> — use the first 8 chars of `sha256sum` output for each

Preserve any fields written by other agents (e.g., `openAgentPRs`, `prQueueHealthy` from Observability Agent). Only overwrite the fields listed above.

```bash
mkdir -p .agentguard
# Write the updated swarm-state.json
```

### 13. Summary

Report:
- **Issues analyzed**: N
- **Priority labels applied**: N (list which issues got which priority)
- **Stale issues flagged**: N
- **Sprint plan issue created**: #N
- **Previous plan closed**: #N (or "none")
- **Governance context**: escalation level, risk score, denial trend
- **Top recommendation**: Brief statement of the single most important thing to work on next

## Rules

- **Sprint plans go to `.agentguard/reports/`, NOT GitHub issues** — follow the report-routing protocol
- Create a maximum of **1 alert issue per run** — only when sprint is critically blocked
- Apply a maximum of **10 priority labels per run**
- Add a maximum of **3 staleness comments per run**
- **Never close issues** — only comment with recommendations and close previous sprint plan issues
- **Never modify issue bodies** — only add labels and comments
- **Never create new work issues** — that is the Backlog Steward's job
- **Never assign issues** — that is the Coder Agent's job via `claim-issue`
- If `gh` CLI is not authenticated, report the error and STOP
- If no open issues exist, report "Backlog empty — no planning needed" and STOP
- Do not re-label issues that already have a `priority:*` label — only label unlabeled issues
- When closing previous sprint plans, verify the issue is actually labeled `source:planning-agent` before closing
- When escalation is ELEVATED or higher, deprioritize high-blast-radius issues in the recommended sequence
