# Skill: Retrospective

Analyze patterns in failed PRs, CI regressions, review feedback, merge conflicts, and rollbacks to extract actionable heuristics. Publish a retrospective report with lessons learned and recommendations for improving swarm effectiveness. Designed for weekly scheduled execution.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If governance activation fails, log the failure and **STOP**
- If `gh` CLI fails, log the error and **STOP**
- Default to the **safest option** in every ambiguous situation

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Analyze Failed PRs (Last 14 Days)

```bash
gh pr list --state closed --limit 30 --json number,title,mergedAt,closedAt,headRefName,labels,body,comments
```

Identify PRs that were **closed without merge** (`mergedAt` is null):
- Extract the PR title and branch name
- Read PR comments for failure reasons (review rejections, CI failures, conflicts)
- Categorize the failure:
  - **Review rejected**: Code quality, architecture, style issues
  - **CI failed**: Test failures, lint errors, type errors, build failures
  - **Conflict abandoned**: Merge conflicts that were never resolved
  - **Superseded**: Replaced by another PR
  - **Stale**: No activity for extended period

Count:
- Total closed-without-merge PRs
- Failure category distribution

### 3. Analyze Review Feedback Patterns

```bash
gh pr list --state all --limit 30 --json number,title,reviews,reviewDecision
```

For PRs with reviews, analyze:
- **Common review themes**: What do reviewers flag most? (missing tests, style issues, blast radius, missing docs)
- **Review-to-merge time**: How long from first review to merge?
- **Revision count**: How many review rounds before merge?

Look for patterns:
- Same reviewer comment appearing 3+ times across PRs → systemic issue
- PRs requiring 3+ revision rounds → agent not learning from feedback
- PRs with `CHANGES_REQUESTED` that were eventually merged → what changed?

### 4. Analyze CI Failure Patterns

```bash
gh run list --limit 50 --json databaseId,conclusion,headBranch,createdAt,name
```

For failed runs, identify patterns:
- **Failure hotspots**: Which workflow jobs fail most? (lint, typecheck, test, build)
- **Branch patterns**: Do certain branches fail more?
- **Flaky tests**: Same branch with both pass and fail (non-deterministic)
- **Regression patterns**: A test that was passing starts failing across multiple branches

For the top 3 most recent failures, get details:
```bash
gh run view <RUN_ID> --json jobs --jq '.jobs[] | select(.conclusion == "failure") | {name, steps: [.steps[] | select(.conclusion == "failure") | .name]}'
```

### 5. Analyze Merge Conflict Patterns

```bash
gh pr list --state all --limit 50 --json number,title,headRefName,mergeable,labels,changedFiles
```

Identify:
- **Conflict hotspot files**: Which files appear in conflicts most often?
- **Conflict recurrence**: Same file conflicting across 3+ PRs
- **Resolution patterns**: Were conflicts resolved by rebase or by closing the PR?

### 6. Analyze Agent Effectiveness

Cross-reference agent outputs:

```bash
# Coder Agent PRs
gh pr list --state all --limit 20 --json number,title,mergedAt,closedAt,additions,deletions,headRefName

# Issues closed vs created
gh issue list --state closed --limit 30 --json number,title,closedAt,labels
gh issue list --state open --json number,labels --jq length
```

Calculate:
- **PR merge rate**: merged / (merged + closed-without-merge) — target >80%
- **Average PR size**: mean of (additions + deletions) — target <300 lines
- **Issue throughput**: issues closed per week
- **Backlog growth**: open issues trend (growing / stable / shrinking)

### 7. Detect Recurring Patterns

From the data collected in steps 2-6, identify recurring patterns:

**Anti-patterns** (things that keep going wrong):
- Same test failing across multiple PRs
- Same review feedback repeated (agent not adapting)
- Same files causing conflicts (need serialized access)
- PRs too large (blast radius repeatedly flagged)
- CI failures on the same step across branches

**Success patterns** (things that work well):
- PRs that merge on first review (what makes them successful?)
- Phases with high completion velocity
- Agents with high effectiveness rates

### 8. Generate Heuristics

From the patterns detected, distill actionable heuristics:

Format each heuristic as:
```
HEURISTIC: <short name>
EVIDENCE: <specific data points>
RECOMMENDATION: <what should change>
AFFECTED AGENTS: <which agents should adapt>
PRIORITY: HIGH / MEDIUM / LOW
```

Example heuristics:
- "PR size limit" — PRs >300 lines have 60% merge rate vs 90% for smaller PRs → Coder Agent should split large changes
- "Test file co-location" — PRs without test changes get rejected 3x more → Coder Agent should always include tests
- "Conflict hotspot: src/events/schema.ts" — 5 PRs conflicted on this file → serialize work touching event schema

### 9. Generate Retrospective Report

Check if a previous retrospective exists:

```bash
gh issue list --state open --label "source:retrospective-agent" --json number --jq '.[0].number' 2>/dev/null
```

If a previous report exists, close it:
```bash
gh issue close <PREV_NUMBER> --comment "Superseded by new retrospective."
```

Create the new report:

```bash
gh issue create \
  --title "Retrospective — $(date +%Y-%m-%d) — Week $(date +%V)" \
  --body "<retrospective markdown>" \
  --label "source:retrospective-agent" --label "<%= labels.pending %>"
```

**Report format:**

```markdown
## Weekly Retrospective

**Period:** <start date> to <end date>
**Generated:** <timestamp UTC>

### Velocity Metrics

| Metric | This Week | Previous Week | Trend |
|--------|-----------|---------------|-------|
| PRs merged | N | N | up/down/stable |
| PRs closed (no merge) | N | N | |
| PR merge rate | N% | N% | |
| Average PR size | N lines | N lines | |
| Issues closed | N | N | |
| Issues created | N | N | |
| Backlog size | N | N | |

### Failure Analysis

#### Failed PRs (N total)
| PR | Title | Failure Category | Root Cause |
|----|-------|------------------|------------|
| #N | <title> | <category> | <brief cause> |

#### CI Failure Hotspots
| Job/Step | Failures (14d) | Pattern |
|----------|---------------|---------|
| <job> | N | <description> |

#### Merge Conflict Hotspots
| File | Conflicts (14d) | Impact |
|------|----------------|--------|
| <file> | N | <description> |

### Patterns Detected

#### Anti-Patterns
1. **<pattern name>** — <evidence> — <impact>
2. ...

#### Success Patterns
1. **<pattern name>** — <evidence> — <why it works>
2. ...

### Heuristics

| # | Heuristic | Evidence | Recommendation | Affected Agents | Priority |
|---|-----------|----------|----------------|-----------------|----------|
| 1 | <name> | <data> | <action> | <agents> | HIGH/MED/LOW |

### Top 3 Recommendations

1. **<most impactful recommendation>** — <brief reasoning>
2. **<second recommendation>**
3. **<third recommendation>**
```

### 10. Summary

Report:
- **Period analyzed**: 14 days
- **PRs analyzed**: N (N merged, N failed)
- **PR merge rate**: N%
- **CI failure rate**: N%
- **Anti-patterns detected**: N
- **Heuristics generated**: N
- **Top recommendation**: Brief statement
- **Retrospective created**: #N

## Rules

- Create a maximum of **1 retrospective report per run**
- **NEVER modify source code or tests** — only report findings
- **NEVER close issues** — only close previous retrospective reports labeled `source:retrospective-agent`
- **NEVER create work issues** — recommendations are for other agents and humans to act on
- If `gh` CLI is not authenticated, report the error and STOP
- Analysis should cover the **last 14 days** to capture enough data for pattern detection
- Heuristics should be backed by specific data points — never speculate without evidence
- Limit to **top 5 heuristics** per report (prioritize by impact)
- When calculating merge rate, exclude draft PRs and PRs with `do-not-merge` label
- The retrospective agent is read-only on the codebase — it never modifies files
