# Skill: Repository Maintenance

Consolidated housekeeping skill that scans for code annotations, detects stale/solved issues, manages abandoned PRs and branches, and cross-references findings against existing issues and the ROADMAP. Uses governance analytics to prioritize findings by risk. Replaces the overlapping concerns of `backlog-steward`, `repo-hygiene`, and `stale-branch-janitor` in a single scheduled pass. Designed for periodic scheduled execution.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If data is unavailable or ambiguous, proceed with available data and note limitations
- If governance activation fails, log the failure and **STOP**
- If `gh` CLI fails, log the error and **STOP**
- Default to the **safest option** in every ambiguous situation (skip > act)
- When in doubt about closing a PR, **warn instead of close**

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance. Requires `gh` CLI authenticated with repo access.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Ensure Labels Exist

```bash
gh label create "source:repo-maintenance" --color "C5DEF5" --description "Auto-created by Repository Maintenance skill" 2>/dev/null || true
gh label create "stale" --color "EDEDED" --description "No activity for 7+ days" 2>/dev/null || true
gh label create "source:backlog-steward" --color "C5DEF5" --description "Auto-created by Backlog Steward skill" 2>/dev/null || true
```

### 3. Collect Governance Context

Read governance analytics to prioritize maintenance actions:

```bash
<%= paths.cli %> analytics --format json 2>/dev/null | head -50
```

Extract:
- **Current escalation level**: NORMAL / ELEVATED / HIGH / LOCKDOWN
- **Risk score**: current session risk level
- **Top violation patterns**: recurring issues that might indicate stale or blocked work

If analytics is not available, proceed with standard maintenance.

### 4. Fetch Repository State

Fetch all open issues and PRs for cross-referencing:

```bash
gh issue list --state open --limit 100 --json number,title,body,labels,updatedAt
gh pr list --state open --json number,title,headRefName,updatedAt,labels,author --limit 100
gh pr list --state merged --base main --json number,title,body,mergedAt --limit 30
```

---

## Phase A: Code Annotation Scan (from backlog-steward)

### 5. Scan Code Annotations

Search the codebase for TODO, FIXME, HACK, and XXX comments:

```bash
grep -rn "TODO\|FIXME\|HACK\|XXX\|WORKAROUND" packages/ apps/ tests/ --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=dist | head -50
```

For each match, extract:
- **File path** and **line number**
- **Annotation type** (TODO, FIXME, HACK, XXX)
- **Description text** (the rest of the line after the annotation keyword)

### 6. Scan ROADMAP Unchecked Items

Read `<%= paths.roadmap %>` and extract all unchecked items:

```bash
grep -n "\- \[ \]" <%= paths.roadmap %>
```

For each match, extract the item description and its parent section (Phase name).

### 7. Deduplicate Annotations Against Issues

For each discovered annotation or ROADMAP item, check whether an open issue already covers it:

- Compare the annotation description against each open issue title and body
- A match exists if the issue title or body contains the key phrase from the annotation (case-insensitive substring match)
- Also match if the file path and line reference appear in any open issue body
- Also check against ROADMAP items to avoid creating issues for tracked work
- If a match is found, skip the item — do NOT create a duplicate

### 8. Create Issues for New Annotations

For each unmatched item (up to **5 per run**), create a GitHub issue:

```bash
gh issue create \
  --title "<type>: <description>" \
  --body "## Source

- **Type**: <TODO|FIXME|HACK|ROADMAP>
- **Location**: \`<file>:<line>\` (or <%= paths.roadmap %> section)
- **Original text**: <annotation text>

## Task Description

<Expanded description of what needs to be done based on the annotation context>

---
*Discovered by repository-maintenance on $(date -u +%Y-%m-%dT%H:%M:%SZ)*" \
  --label "source:backlog-steward" --label "<%= labels.pending %>"
```

Add a task type label based on the annotation:
- `FIXME` → also add `task:bug-fix`
- `TODO` → also add `task:implementation`
- `HACK` / `XXX` / `WORKAROUND` → also add `task:refactor`
- ROADMAP items → also add `task:implementation`

Prioritize: FIXME and HACK annotations over TODO annotations when the cap is reached.

---

## Phase B: Stale/Solved Issue Detection (from repo-hygiene)

### 9. Detect Stale Issues

From the open issues fetched in step 4, filter for issues where `updatedAt` is more than 30 days ago. Exclude issues with labels `pinned`, `epic`, or `release-candidate`.

For each stale issue, check if it has been addressed by a recent merged PR:

```bash
gh pr list --state merged --search "<issue-title-keywords>" --json number,title,mergedAt --limit 5
```

Categorize stale issues:
- **Likely solved**: a merged PR matches the issue title/keywords
- **Abandoned**: no matching PR and no recent comments
- **Blocked**: has a "blocked" label or dependency comment

### 10. Detect Solved-But-Open Issues

Check open issues against recently merged PRs to find issues that were fixed but never closed:

For each merged PR (from step 4), extract referenced issue numbers from:
- PR body (patterns: `fixes #N`, `closes #N`, `resolves #N`)
- PR title (pattern: `issue-N`, `#N`)

Check if those referenced issues are still open:

```bash
gh issue view <N> --json state --jq '.state'
```

### 11. Check File Path Validity

For each open issue, check if referenced file paths still exist:

- **File paths referenced in the issue that no longer exist** — check with `test -f`
- **Issues that reference `src/agentguard/`** — this directory was removed in a restructure

---

## Phase C: Stale PR and Branch Management (from stale-branch-janitor)

### 12. Identify Stale PRs

From the open PRs fetched in step 4, filter for PRs where `updatedAt` is more than 7 days ago.

Exclude:
- PRs targeting `main` or `master` as the head branch
- PRs with any `source:` label from other scheduled agents
- PRs with a `do-not-close` label

### 13. Auto-Close Previously Warned PRs (max 3)

From stale PRs, identify those already labeled `stale`:

For each (up to 3):

1. Check for new activity since the stale warning:

```bash
gh pr view <PR_NUMBER> --json comments,reviews,commits --jq '{lastComment: .comments[-1].createdAt, lastReview: .reviews[-1].submittedAt}'
```

2. If **new activity exists**: remove the `stale` label and skip.

```bash
gh pr edit <PR_NUMBER> --remove-label "stale"
```

3. If **no new activity**: close the PR with a comment:

```bash
gh pr comment <PR_NUMBER> --body "Closing this PR due to 7+ days of inactivity after a stale warning. If this work is still needed, feel free to reopen.

*Auto-closed by Repository Maintenance*"

gh pr close <PR_NUMBER>
```

### 14. Warn Newly Stale PRs (max 5)

From stale PRs not yet labeled `stale`:

For each (up to 5):

```bash
gh pr comment <PR_NUMBER> --body "This PR has had no activity for 7+ days. It will be automatically closed on the next maintenance run if no further activity occurs.

To keep this PR open, push a commit, leave a comment, or add the \`do-not-close\` label.

*Warning posted by Repository Maintenance*"

gh pr edit <PR_NUMBER> --add-label "stale" --add-label "source:repo-maintenance"
```

### 15. Report Orphaned Stale Branches

List remote branches with no associated open PR that have had no commits in 7+ days:

```bash
git fetch --prune origin
git for-each-ref --sort=-committerdate --format='%(refname:short) %(committerdate:iso)' refs/remotes/origin/ | grep -v 'origin/main\|origin/master\|origin/HEAD'
```

For each branch, check if it has an associated open PR:

```bash
gh pr list --head <BRANCH_NAME> --state open --json number --jq 'length'
```

Branches with no open PR and last commit older than 7 days are "orphaned stale branches." Report them but **do not delete them**.

---

## Phase D: Report and Publish

### 16. Generate Consolidated Report

Compile all findings into a structured report:

```
## Repository Maintenance Report

**Date**: <timestamp>
**Governance escalation**: <NORMAL/ELEVATED/HIGH/LOCKDOWN>

### Code Annotations

| File:Line | Type | Text | Status |
|-----------|------|------|--------|
| <file>:<line> | TODO/FIXME/HACK | <text> | New issue / Already tracked |

- **Annotations found**: N TODO, N FIXME, N HACK
- **Already tracked**: N (matched to existing issues)
- **New issues created**: N

### ROADMAP Items

- **Unchecked items**: N
- **Already tracked as issues**: N
- **New issues created**: N

### Stale Issues (no activity >30 days)

| # | Title | Last Updated | Status |
|---|-------|-------------|--------|
| <N> | <title> | <date> | Likely solved / Abandoned / Blocked |

### Solved-But-Open Issues

| Issue # | Title | Fixing PR | Merged |
|---------|-------|-----------|--------|
| <N> | <title> | #<PR> | <date> |

### Stale PRs

- **Warned (newly stale)**: N
- **Auto-closed**: N
- **Revived (new activity)**: N

### Orphaned Branches

| Branch | Last Commit | Age |
|--------|-------------|-----|
| <name> | <date> | <N> days |

### Recommendations

<Actionable suggestions prioritized by governance risk level>
```

### 17. Create or Update Maintenance Issue

Check for an existing maintenance issue:

```bash
gh issue list --state open --label "source:repo-maintenance" --json number,title --limit 1
```

If an existing issue is open, comment with the new report:

```bash
gh issue comment <ISSUE_NUMBER> --body "<maintenance report>"
```

If no existing issue and there are actionable findings:

```bash
gh issue create \
  --title "repo-maintenance: <N> findings — $(date +%Y-%m-%d)" \
  --body "<full maintenance report>" \
  --label "source:repo-maintenance" --label "<%= labels.medium %>"
```

If no actionable findings, report "Repository maintenance nominal" and STOP — do not create an issue.

### 18. Summary

Report:
- **Annotations found**: N (N new issues created)
- **Stale issues**: N (N likely solved, N abandoned)
- **Solved-but-open**: N issues
- **Stale PRs warned**: N
- **Stale PRs closed**: N
- **Orphaned branches**: N
- **Governance context**: escalation level, risk score
- **Issue**: created/updated/none needed
- If clean: "Repository maintenance nominal — no action needed"

## Rules

- **Create a maximum of 5 new backlog issues per run**
- **Warn a maximum of 5 stale PRs per run**
- **Auto-close a maximum of 3 previously warned PRs per run**
- **Never delete branches** — only close PRs. Branch cleanup is left to the developer.
- **Never close issues** — only report findings and create/comment on maintenance tracking issues
- **Never close PRs on `main` or `master`**
- **Never close PRs from other scheduled agents** — skip any PR with a `source:` label from another agent
- **Respect `do-not-close` label** — never warn or close a PR with this label
- **Never modify source code** — only read and analyze
- **Never create duplicate issues** — always deduplicate against open issues and ROADMAP
- Do not scan `node_modules/`, `dist/`, or `.git/` directories
- Cap annotation scanning at 50 results
- Stale issue threshold is 30 days, stale PR threshold is 7 days
- If `gh` CLI is not authenticated, still generate the report to console but skip issue/PR operations
- Check for activity before closing stale PRs — remove `stale` label if revived
