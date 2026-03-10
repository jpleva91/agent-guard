# Skill: Repo Hygiene

Run nightly repository hygiene: detect stale issues, identify already-solved issues, surface undiscovered work from code annotations, and suggest backlog improvements. Creates or updates a hygiene report issue. Designed for periodic scheduled execution.

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance. Requires `gh` CLI authenticated.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active. If governance cannot be activated, STOP.

### 2. Detect Stale Issues

Find open issues with no activity in the last 30 days:

```bash
gh issue list --state open --json number,title,labels,updatedAt --limit 100
```

Filter for issues where `updatedAt` is more than 30 days ago. Exclude issues with labels `pinned`, `epic`, or `release-candidate`.

For each stale issue, check if it has been addressed by a recent merged PR:

```bash
gh pr list --state merged --search "<issue-title-keywords>" --json number,title,mergedAt --limit 5
```

Categorize stale issues:
- **Likely solved**: a merged PR matches the issue title/keywords
- **Abandoned**: no matching PR and no recent comments
- **Blocked**: has a "blocked" label or dependency comment

### 3. Detect Solved Issues

Check open issues against recently merged PRs to find issues that were fixed but never closed:

```bash
gh pr list --state merged --base main --json number,title,body --limit 30
```

For each merged PR, extract referenced issue numbers from:
- PR body (patterns: `fixes #N`, `closes #N`, `resolves #N`)
- PR title (pattern: `issue-N`, `#N`)

Check if those referenced issues are still open:

```bash
gh issue view <N> --json state --jq '.state'
```

### 4. Surface Code Annotations

Scan the codebase for undiscovered work items:

```bash
grep -rn "TODO\|FIXME\|HACK\|XXX\|WORKAROUND" src/ --include="*.ts" | head -50
```

Cross-reference each annotation against open issues:

```bash
gh issue list --state open --json number,title --limit 200
```

Flag annotations that have no corresponding open issue as "undiscovered work."

Also check `ROADMAP.md` for items not yet tracked as issues:

```bash
cat ROADMAP.md 2>/dev/null
```

### 5. Identify Missing Test Coverage

List source files without corresponding test files:

```bash
ls src/**/*.ts 2>/dev/null
ls tests/ts/*.test.ts 2>/dev/null
```

For each source file in `src/`, check if a corresponding test file exists in `tests/ts/`. Flag source files with no test coverage as gaps.

### 6. Generate Hygiene Report

Compile findings:

```
## Repo Hygiene Report

**Date**: <timestamp>

### Stale Issues (no activity >30 days)

| # | Title | Last Updated | Status |
|---|-------|-------------|--------|
| <N> | <title> | <date> | Likely solved / Abandoned / Blocked |

### Likely Solved (open but fixed by merged PR)

| Issue # | Issue Title | Fixing PR | Merged |
|---------|-------------|-----------|--------|
| <N> | <title> | #<PR> | <date> |

### Undiscovered Work (code annotations without issues)

| File:Line | Annotation | Text |
|-----------|-----------|------|
| <file>:<line> | TODO/FIXME/HACK | <text> |

### Missing Test Coverage

| Source File | Expected Test File | Status |
|-------------|-------------------|--------|
| <src/path> | <tests/ts/path> | Missing |

### Recommendations

<Actionable suggestions: close solved issues, investigate stale issues, create issues for annotations>
```

### 7. Create or Update Hygiene Issue

Check for an existing hygiene issue:

```bash
gh issue list --state open --label "source:hygiene-agent" --json number,title --limit 1
```

Ensure labels exist:

```bash
gh label create "source:hygiene-agent" --color "BFD4F2" --description "Auto-created by Repo Hygiene Agent" 2>/dev/null || true
```

If an existing issue is open, update it:

```bash
gh issue comment <ISSUE_NUMBER> --body "<hygiene report>"
```

If no existing issue is open and there are actionable findings, create one:

```bash
gh issue create \
  --title "repo-hygiene: <N> stale issues, <N> likely solved, <N> undiscovered items" \
  --body "<full hygiene report>" \
  --label "source:hygiene-agent" --label "priority:medium"
```

### 8. Summary

Report:
- **Stale issues**: N (N likely solved, N abandoned, N blocked)
- **Solved but open**: N issues
- **Undiscovered work**: N code annotations without issues
- **Missing test coverage**: N source files
- **Issue**: created/updated/none needed
- If clean: "Repository hygiene nominal — no action needed"

## Rules

- **Never close, modify, or delete issues** — only report findings and create hygiene tracking issues.
- **Never modify source code** — only read and analyze.
- **Never delete branches** — that is the `stale-branch-janitor` skill's job.
- Cap annotation scanning at 50 results to avoid excessive processing.
- If no actionable findings, report "Repository hygiene nominal" and STOP — do not create an issue.
- If `gh` CLI is not authenticated, still generate the report to console but skip issue creation.
- Stale threshold is 30 days — do not flag recently updated issues.
