# Skill: Product Health Review

Evaluate whether the autonomous SDLC is building the right things. Audit roadmap alignment, phase progress, issue quality, value drift, and feature completeness. Publish a Product Health Report. Designed for daily scheduled execution.

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Snapshot Current State

Fetch all open issues, open PRs, and recent activity:

```bash
gh issue list --state open --limit 200 --json number,title,body,labels,createdAt,updatedAt
gh pr list --state open --json number,title,headRefName,labels,body,additions,deletions,createdAt
gh issue list --state closed --limit 30 --json number,title,closedAt,labels,body
gh pr list --state merged --limit 15 --json number,title,mergedAt,body,labels
```

Also fetch the latest sprint plan for cross-reference:

```bash
gh issue list --state open --label "source:planning-agent" --limit 1 --json number,title,body
```

### 3. Read ROADMAP

Read `<%= paths.roadmap %>` to determine the phase structure:

```bash
cat <%= paths.roadmap %>
```

Parse each phase to extract:
- **Phase number and name**
- **Status** (`COMPLETE`, `MOSTLY COMPLETE`, `PARTIALLY COMPLETE`, or `PLANNED`)
- **Total items**: Count of all `- [x]` and `- [ ]` items
- **Completed items**: Count of `- [x]` items
- **Remaining items**: Count of `- [ ]` items with their text

Identify:
- **Current phase**: First phase not fully `COMPLETE`
- **Next phase**: Phase after current
- **Overall progress**: Total checked / total items across all phases

### 4. Roadmap Alignment Audit

For every open issue and every PR merged in the last 14 days, determine which ROADMAP phase it maps to.

**Mapping heuristic** (in order of confidence):
1. Issue body explicitly references a phase (e.g., "Phase 4", "Plugin Ecosystem")
2. Issue title or body mentions a ROADMAP line item keyword (e.g., "policy pack", "VS Code extension", "replay")
3. Issue labels contain a `phase:N` label
4. Issue file scope paths map to a ROADMAP area (e.g., `packages/events/src/` → Phase 1, `packages/kernel/src/` → Phase 2, `apps/cli/src/` → Phase 3)
5. No mapping found → classify as **orphaned**

Produce three lists:
- **Aligned**: Issues/PRs that map to a ROADMAP phase
- **Orphaned**: Issues/PRs with no clear ROADMAP mapping
- **Cross-cutting**: Issues that span multiple phases (infrastructure, docs, tooling)

### 5. Phase Progress Assessment

For each ROADMAP phase (especially the current and next phases), calculate:

- **ROADMAP completion**: `checked_items / total_items` as percentage
- **Open issues in this phase**: Count of aligned open issues
- **Closed issues in last 14 days**: Count of aligned recently closed issues
- **Open PRs in this phase**: Count of aligned open PRs
- **Velocity**: Issues closed per week in this phase (last 14 days / 2)
- **Estimated remaining work**: `remaining_items / velocity_per_week` (if velocity > 0)

Flag:
- **Stalled phases**: Current phase with 0 velocity in last 14 days
- **Phase regression**: If a previously `COMPLETE` phase now has open issues targeting it

### 6. Issue Quality Assessment

For each open issue, evaluate quality against these criteria:

| Criterion | Check |
|-----------|-------|
| **Has description** | Body is non-empty and >50 characters |
| **Has task type label** | Has one of: `task:feature`, `task:bug`, `task:chore`, `task:docs`, `task:test` |
| **Has status label** | Has one of: `status:pending`, `status:in-progress`, `status:blocked` |
| **Has priority label** | Has one of: `priority:critical`, `priority:high`, `priority:medium`, `priority:low` |
| **Has file scope** | Body contains a `## File Scope` section or path references |
| **Has acceptance criteria** | Body contains `## Acceptance Criteria`, `## Done When`, or a checkbox list |
| **Has dependencies documented** | Body contains `## Dependencies` section (if applicable) |

Score each issue 0-7 based on criteria met.

Classify:
- **Well-defined** (score 5-7): Ready for autonomous work
- **Needs refinement** (score 3-4): Missing key metadata
- **Underspecified** (score 0-2): Not ready for autonomous implementation

### 7. Value Drift Detection

Compare what the sprint plan recommended vs. what actually happened:

1. Parse the latest sprint plan issue body (from Step 2) to extract the **Recommended Sequence**
2. Compare against recently closed issues and merged PRs
3. Calculate **alignment score**: `recommended_items_completed / total_items_completed`

Classify drift:
- **On track** (alignment ≥ 70%): Work matches recommendations
- **Minor drift** (alignment 40-69%): Some unplanned work
- **Significant drift** (alignment < 40%): Work diverged from plan

Also check:
- **Unplanned work ratio**: Issues closed that were NOT in the sprint plan
- **Stale plan items**: Sprint plan items with no progress in 7+ days

### 8. Feature Completeness Analysis

For the current ROADMAP phase, group related open issues into feature clusters:

1. Group by shared file scope paths (issues touching the same `src/` directories)
2. Group by shared keywords in titles/bodies
3. Group by explicit dependency chains

For each cluster, assess:
- **Is the cluster complete?**: All issues in the cluster are either closed or have open PRs
- **Has gaps?**: Related functionality referenced in ROADMAP but no corresponding issue exists
- **Blocking the phase?**: Unresolved cluster that blocks phase completion

### 9. Generate Product Health Report

Compose a structured report in markdown:

**Header**:
- Generation timestamp (UTC)
- HEAD commit SHA
- Current ROADMAP phase and overall progress percentage

**Roadmap Progress Dashboard** (table):
| Phase | Status | Progress | Velocity | ETA |
Showing all phases with completion bars and key metrics.

**Alignment Audit** (table):
| Category | Count | % of Total |
Showing aligned, orphaned, and cross-cutting issue/PR counts.

**Orphaned Work** (list, max 10):
Issues/PRs with no roadmap mapping — each with a brief recommendation (create roadmap item, reclassify, or close).

**Phase Health**:
For the current and next phases:
- Items remaining (with text)
- Open issues targeting this phase
- Velocity trend
- Risk flags (stalled, regression)

**Issue Quality Summary** (table):
| Quality Tier | Count | % | Example Issues |
With aggregate statistics and the bottom 5 worst-scored issues.

**Value Drift Report**:
- Alignment score with sprint plan
- Unplanned work ratio
- Top 3 recommended items that had no progress

**Feature Completeness** (current phase):
- Clusters identified
- Gaps found
- Blocking clusters

**Recommendations** (numbered, max 5):
The top 5 product-level actions that would improve roadmap delivery. Focus on:
1. Issues to create (feature gaps)
2. Issues to refine (underspecified)
3. Orphaned work to address
4. Phase blockers to unblock
5. Quality improvements

### 10. Route Output (Report Routing Protocol)

Apply the `report-routing` protocol to determine where output goes:

**Assess severity**: Check if ANY of the following critical conditions exist:
- Significant value drift detected (alignment score <50%)
- Current phase progress stalled (<10% change over 7 days with active issues)
- Multiple critical feature gaps identified

**If critical conditions exist → ALERT tier**:

```bash
gh issue create \
  --title "ALERT: Product health concern — $(date +%Y-%m-%d)" \
  --body "<critical findings with evidence>" \
  --label "source:product-agent" --label "<%= labels.critical %>" --label "<%= labels.pending %>"
```

**Otherwise → REPORT tier** (write to local file):

```bash
mkdir -p .agentguard/reports
cat > .agentguard/reports/product-agent-$(date +%Y-%m-%d).md <<'REPORT_EOF'
<product health report markdown>
REPORT_EOF
```

Close any previous product health report issues that are still open:

```bash
PREV=$(gh issue list --state open --label "source:product-agent" --json number --jq '.[].number' 2>/dev/null)
for num in $PREV; do
  gh issue close "$num" --comment "Superseded — reports now written to .agentguard/reports/" 2>/dev/null || true
done
```

### 11. Apply Quality Labels

For issues scoring 0-2 (underspecified), add a label to flag them for human review:

```bash
gh issue edit <N> --add-label "needs:refinement"
```

Cap at **5 label applications per run**.

Do NOT label issues that already have the `needs:refinement` label.

### 12. Summary

Report:
- **Issues analyzed**: N
- **Roadmap overall progress**: N%
- **Current phase progress**: N% (Phase N — Name)
- **Orphaned work found**: N items
- **Issue quality**: N well-defined / N needs-refinement / N underspecified
- **Value drift**: On track | Minor drift | Significant drift (alignment score N%)
- **Feature gaps identified**: N
- **Labels applied**: N
- **Product health report created**: #N
- **Top recommendation**: Brief statement of the single most important product-level action

## Rules

- **Routine reports go to `.agentguard/reports/`, NOT GitHub issues** — follow the report-routing protocol
- Create a maximum of **1 alert issue per run** — only for critical product health concerns
- Apply a maximum of **5 quality labels per run**
- **Never close issues** — except previous product health report issues labeled `source:product-agent` (cleanup)
- **Never modify issue bodies** — only add labels
- **Never create work issues** — that is the Backlog Steward's job. Only create the report issue.
- **Never assign issues** — that is the Coder Agent's job via `claim-issue`
- **Never re-prioritize issues** — that is the Planning Agent's job
- If `gh` CLI is not authenticated, report the error and STOP
- If no open issues exist, report "No issues to analyze" and STOP
- Do not re-label issues that already have the `needs:refinement` label
- When closing previous reports, verify the issue is actually labeled `source:product-agent` before closing
- Roadmap alignment mapping should be conservative — only classify as "aligned" when there is clear evidence
- Feature gap identification should be conservative — only flag gaps when a ROADMAP line item clearly has no corresponding issue
