# Skill: Stale Branch Janitor

Scan for stale remote branches and abandoned PRs (no activity in 7+ days). Warn newly stale PRs with a comment and label, auto-close previously warned PRs that remain inactive. Designed for periodic scheduled execution.

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance. Requires `gh` CLI authenticated with repo access.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Ensure Labels Exist

Create the required labels if they don't already exist:

```bash
gh label create "stale" --color "EDEDED" --description "No activity for 7+ days" 2>/dev/null || true
gh label create "source:stale-branch-janitor" --color "C5DEF5" --description "Auto-created by Stale Branch Janitor skill" 2>/dev/null || true
```

### 3. List Stale Open PRs

Find open PRs with no activity in the last 7 days:

```bash
gh pr list --state open --json number,title,updatedAt,headRefName,labels,author --limit 100
```

Filter results:
- **Include**: PRs where `updatedAt` is more than 7 days ago
- **Exclude**: PRs targeting `main` or `master` as the head branch (these are the base, not head — head branches are the source)
- **Exclude**: PRs with any `source:` label from other scheduled agents (e.g., `source:coder-agent`, `source:security-audit`) — these are managed by other automation
- **Exclude**: PRs with a `do-not-close` label

### 4. Auto-Close Previously Warned PRs (max 3)

From the stale PRs found in step 3, identify those already labeled `stale`:

For each (up to 3):

1. Check if there has been **any new activity** (comments, commits, reviews) since the stale warning was posted. Use:

```bash
gh pr view <PR_NUMBER> --json comments,reviews,commits --jq '{lastComment: .comments[-1].createdAt, lastReview: .reviews[-1].submittedAt}'
```

2. If **new activity exists** since the warning: remove the `stale` label and skip this PR:

```bash
gh pr edit <PR_NUMBER> --remove-label "stale"
```

3. If **no new activity** since the warning: close the PR with a comment:

```bash
gh pr comment <PR_NUMBER> --body "Closing this PR due to 7+ days of inactivity after a stale warning. If this work is still needed, feel free to reopen.

*Auto-closed by Stale Branch Janitor*"

gh pr close <PR_NUMBER>
```

### 5. Warn Newly Stale PRs (max 5)

From the stale PRs found in step 3, identify those **not yet labeled** `stale`:

For each (up to 5):

```bash
gh pr comment <PR_NUMBER> --body "This PR has had no activity for 7+ days. It will be automatically closed on the next janitor run if no further activity occurs.

To keep this PR open, push a commit, leave a comment, or add the \`do-not-close\` label.

*Warning posted by Stale Branch Janitor*"

gh pr edit <PR_NUMBER> --add-label "stale" --add-label "source:stale-branch-janitor"
```

### 6. Report Orphaned Stale Branches

List remote branches with no associated open PR that have had no commits in 7+ days:

```bash
git fetch --prune origin
git for-each-ref --sort=-committerdate --format='%(refname:short) %(committerdate:iso)' refs/remotes/origin/ | grep -v 'origin/main\|origin/master\|origin/HEAD'
```

For each branch, check if it has an associated open PR:

```bash
gh pr list --head <BRANCH_NAME> --state open --json number --jq 'length'
```

Branches with no open PR and last commit older than 7 days are "orphaned stale branches." Report them in the summary but **do not delete them**.

### 7. Summary

Report:
- **Stale PRs found**: N total
- **PRs warned (newly stale)**: N (list PR numbers and titles)
- **PRs auto-closed**: N (list PR numbers and titles)
- **PRs revived (stale label removed)**: N (had new activity since warning)
- **Orphaned stale branches**: N (list branch names)
- **Skipped (agent-managed)**: N (PRs with `source:` labels from other agents)
- If clean: "No stale PRs or branches found — repo is tidy"

## Rules

- **Never delete branches** — only close PRs. Branch cleanup is left to the developer.
- **Never close PRs on `main` or `master`** — these are protected.
- **Never close PRs from other scheduled agents** — skip any PR with a `source:` label from another agent.
- **Max 5 warnings per run** — if more than 5 newly stale PRs exist, warn the first 5 and note the remainder in the summary.
- **Max 3 auto-closes per run** — if more than 3 previously warned PRs are still stale, close the first 3 and note the remainder.
- **Respect `do-not-close` label** — never warn or close a PR with this label.
- **Check for activity before closing** — if a previously warned PR has new commits, comments, or reviews since the warning, remove the `stale` label instead of closing.
- If `gh` CLI is not authenticated, report the error and STOP — do not proceed without GitHub access.
- If no stale items are found, report "Repo is tidy" and STOP.
