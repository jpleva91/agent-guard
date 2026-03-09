# Skill: Review Open PRs

Review open pull requests for code quality, coding convention adherence, governance compliance, and test coverage. Posts structured review comments. Designed for periodic scheduled execution.

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. List Open PRs

```bash
gh pr list --state open --json number,title,author,headRefName,additions,deletions,createdAt --limit 10
```

If no open PRs exist, report "No open PRs to review" and STOP.

### 3. Filter Unreviewed PRs

For each open PR, check if this skill has already posted a review:

```bash
gh pr view <PR_NUMBER> --json comments --jq '.comments[].body' | grep -c "AgentGuard Review Bot" || echo 0
```

Skip PRs that already have an `**AgentGuard Review Bot**` comment. Select up to **3 unreviewed PRs** for this run.

### 4. Review Each PR

For each selected PR:

#### 3a. Read the Diff

```bash
gh pr diff <PR_NUMBER>
```

#### 3b. Read the PR Body

```bash
gh pr view <PR_NUMBER> --json body --jq '.body'
```

#### 3c. Check Changed Files

```bash
gh pr view <PR_NUMBER> --json files --jq '.files[].path'
```

#### 3d. Evaluate Quality

Check the diff against these criteria:

**Coding Conventions:**
- Uses `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants
- Uses `const`/`let` only (no `var`)
- Uses arrow functions
- Uses `import type` for type-only imports
- Single quotes, trailing commas (es5), semicolons

**Protected Path Violations:**
- Files in `src/kernel/**`, `src/policy/**`, `src/invariants/**` should only be modified if the linked issue explicitly authorizes it
- `agentguard.yaml` and `.claude/settings.json` should not be modified

**Test Coverage:**
- New source files in `src/` should have corresponding test files
- Bug fixes should include regression tests

**Governance Compliance:**
- PR body should contain a `## Governance Report` section (for agent-created PRs)
- PR body should contain a `## Test Plan` section

**General Quality:**
- No debug logging left in (`console.log`, `debugger`)
- No commented-out code blocks
- No hardcoded secrets or credentials
- Imports are clean (no unused imports)

### 5. Post Review Comment

For each reviewed PR, post a structured comment:

```bash
gh pr comment <PR_NUMBER> --body "**AgentGuard Review Bot** — automated code review

## Summary

<1-2 sentence overall assessment>

## Findings

| Category | Status | Details |
|----------|--------|---------|
| Coding conventions | <PASS/WARN/FAIL> | <brief details> |
| Protected paths | <PASS/WARN/FAIL> | <brief details> |
| Test coverage | <PASS/WARN/FAIL> | <brief details> |
| Governance compliance | <PASS/WARN/FAIL> | <brief details> |
| General quality | <PASS/WARN/FAIL> | <brief details> |

## Specific Items

<Numbered list of specific findings with file:line references>

---
*Automated review by review-open-prs skill on $(date -u +%Y-%m-%dT%H:%M:%SZ)*"
```

### 6. Summary

Report:
- **PRs reviewed**: N (list PR numbers and titles)
- **PRs skipped (already reviewed)**: N
- **PRs skipped (cap reached)**: N
- **Overall findings**: N PASS, N WARN, N FAIL across all reviews

## Rules

- Review a maximum of **3 PRs per run**
- **Never approve or merge PRs** — post informational comments only
- **Never use `gh pr review --request-changes`** — only use `gh pr comment`
- **Never modify PR code** — review is read-only
- Skip PRs that already have an `**AgentGuard Review Bot**` comment
- If a PR has no diff (empty), skip it
- Be constructive — flag issues but do not use harsh language
- If `gh` CLI is not authenticated, report the error and STOP
