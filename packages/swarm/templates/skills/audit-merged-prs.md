# Skill: Audit Merged PRs

Audit pull requests merged in the last 7 days for risks that may have been overlooked — unresolved review comments, dismissed change requests, bypassed CI, or governance violations. Creates a consolidated risk report as a GitHub issue. Designed for weekly scheduled execution.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If risk classification is ambiguous, round **up** to the higher risk level (err on the side of caution)
- If governance activation fails, log the failure and **STOP** — do not ask what to do
- If `gh` CLI fails, log the error and **STOP** — do not ask for credentials
- If a PR's data is incomplete or malformed, **skip that PR** and note it in the summary
- Default to the **safest option** in every ambiguous situation (flag risk > ignore risk)
- When in doubt about any decision, choose the conservative path and document why in the summary

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance. Requires `gh` CLI authenticated with repo access.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Ensure Labels Exist

```bash
gh label create "audit" --color "FBCA04" --description "Post-merge risk audit finding" 2>/dev/null || true
gh label create "source:merged-pr-audit" --color "C5DEF5" --description "Auto-created by Merged PR Audit skill" 2>/dev/null || true
gh label create "<%= labels.high %>" --color "D93F0B" --description "High priority" 2>/dev/null || true
gh label create "<%= labels.medium %>" --color "FBCA04" --description "Medium priority" 2>/dev/null || true
```

### 3. List Recently Merged PRs

```bash
gh pr list --state merged --json number,title,mergedAt,author,mergedBy,headRefName,additions,deletions,labels --limit 50
```

Filter results:
- **Include**: PRs where `mergedAt` is within the last 7 days
- **Exclude**: PRs already audited (check for a comment by `**AgentGuard Merged PR Audit Bot**`)

If no recently merged PRs exist, report "No recently merged PRs to audit" and STOP.

### 4. Audit Each Merged PR

For each merged PR, collect evidence across five risk dimensions:

#### 4a. Review Comment Analysis

Check for unresolved review threads at time of merge:

```bash
gh pr view <PR_NUMBER> --json reviewThreads --jq '[.reviewThreads[] | select(.isResolved == false)] | length'
```

Check for change-request reviews that were never addressed:

```bash
gh pr view <PR_NUMBER> --json reviews --jq '[.reviews[] | select(.state == "CHANGES_REQUESTED")] | length'
```

Check if change-request reviews were followed by approvals or remained outstanding:

```bash
gh pr view <PR_NUMBER> --json reviews --jq '[.reviews[] | {author: .author.login, state: .state, submittedAt: .submittedAt}]'
```

**Risk signals**:
- Unresolved review threads at merge → **HIGH**
- Outstanding CHANGES_REQUESTED with no subsequent approval by the same reviewer → **HIGH**
- Security-related keywords in dismissed/unresolved comments (e.g., "vulnerability", "injection", "auth", "secret", "credential", "XSS", "CSRF", "sanitize") → **CRITICAL**

#### 4b. CI Status at Merge

```bash
gh pr view <PR_NUMBER> --json statusCheckRollup --jq '[.statusCheckRollup[] | select(.status != "COMPLETED" or .conclusion != "SUCCESS")]'
```

**Risk signals**:
- Any required check not passing at merge time → **CRITICAL**
- CI checks skipped entirely (no check runs at all) → **HIGH**
- Only optional/non-required checks failing → **LOW**

#### 4c. Governance Report Analysis

Read the PR body and look for the `## Governance Report` section:

```bash
gh pr view <PR_NUMBER> --json body --jq '.body'
```

Parse the governance report for:
- `PolicyDenied` count > 0 → **MEDIUM**
- `InvariantViolation` count > 0 → **HIGH**
- `ActionDenied` count > 0 → **MEDIUM**
- No governance report at all (for agent-authored PRs) → **MEDIUM**

#### 4d. Size and Scope Assessment

```bash
gh pr view <PR_NUMBER> --json additions,deletions,files --jq '{additions: .additions, deletions: .deletions, fileCount: (.files | length)}'
```

**Risk signals**:
- PR > 500 lines changed with no evidence of review → **MEDIUM**
- PR > 1000 lines changed → **MEDIUM** (flag for scope assessment regardless)
- PR touches > 10 files → **LOW** (informational)

#### 4e. Protected File Changes

```bash
gh pr view <PR_NUMBER> --json files --jq '[.files[].path]'
```

Check if any changed files are in protected paths:
- `packages/kernel/src/**` — core governance kernel
- `packages/policy/src/**` — policy evaluation engine
- `packages/invariants/src/**` — invariant system
- `<%= paths.policy %>` — default policy
- `.claude/settings.json` — hook configuration

**Risk signals**:
- Protected kernel/policy/invariant files modified → **HIGH**
- `<%= paths.policy %>` or `.claude/settings.json` modified → **CRITICAL**

### 5. Score and Classify Each PR

Assign risk scores:
- **CRITICAL** = 4 points
- **HIGH** = 3 points
- **MEDIUM** = 2 points
- **LOW** = 1 point

For each PR, sum all risk scores. Classify the PR:

| Total Score | Overall Risk |
|-------------|-------------|
| 0 | CLEAN |
| 1-2 | LOW |
| 3-4 | MEDIUM |
| 5-7 | HIGH |
| 8+ | CRITICAL |

### 6. Generate Risk Report

If any PR has risk level **MEDIUM or above**, generate a consolidated report.

If no risks at MEDIUM or above, report "All merged PRs pass audit — no risks detected" and STOP.

#### 6a. Check for Existing Open Audit Issue

```bash
gh issue list --state open --label "source:merged-pr-audit" --json number,title --limit 1
```

#### 6b. Compile the Report

```
## Merged PR Risk Audit Report

**Audit period**: <start_date> to <end_date>
**PRs audited**: <total_count>
**PRs with risks**: <risk_count>

### Risk Summary

| PR | Title | Merged By | Risk Level | Score | Top Finding |
|----|-------|-----------|------------|-------|-------------|
| #<N> | <title> | @<user> | <CRITICAL/HIGH/MEDIUM> | <score> | <top finding> |

### Detailed Findings

#### PR #<N>: <title>

**Risk level**: <LEVEL> (score: <N>)
**Merged by**: @<user> on <date>
**Changes**: +<additions> -<deletions> across <file_count> files

| Risk | Level | Details |
|------|-------|---------|
| <finding> | <CRITICAL/HIGH/MEDIUM/LOW> | <details> |

<Repeat for each PR with risk >= MEDIUM>

### Patterns Observed

<Cross-PR patterns — e.g., "3 PRs merged with outstanding change requests", "CI was bypassed on 2 PRs">

### Recommendations

<Actionable recommendations based on findings — e.g., "Enable branch protection to require CI passage", "Require review re-approval after new commits">

---
*Automated audit by audit-merged-prs skill on <timestamp>*
```

#### 6c. Create or Update Issue

If an existing open audit issue exists, comment on it:

```bash
gh issue comment <ISSUE_NUMBER> --body "<audit report>"
```

If no existing issue, create one:

```bash
gh issue create \
  --title "audit: Merged PR Risk Report — <start_date> to <end_date>" \
  --body "<full audit report>" \
  --label "audit" --label "source:merged-pr-audit" --label "priority:<highest risk level found>"
```

#### 6d. Mark Audited PRs

For each audited PR (regardless of risk level), post a brief audit receipt comment:

```bash
gh pr comment <PR_NUMBER> --body "**AgentGuard Merged PR Audit Bot** — audited

Risk level: **<LEVEL>** (score: <N>)
Findings: <count> (<brief summary>)
Full report: #<ISSUE_NUMBER>

---
*Automated audit by audit-merged-prs skill on $(date -u +%Y-%m-%dT%H:%M:%SZ)*"
```

### 7. Summary

Report:
- **PRs audited**: N (list PR numbers)
- **Risk breakdown**: N CRITICAL, N HIGH, N MEDIUM, N LOW, N CLEAN
- **Issue created/updated**: #<ISSUE_NUMBER> (or "none — all PRs clean")
- **Top risks**: <brief list of most concerning findings>
- If clean: "All merged PRs pass audit — governance is healthy"

## Rules

- **Read-only** — never modify merged PRs, never revert merges, never reopen closed PRs
- **Never close existing audit issues** — only create new ones or comment on existing open ones
- **Only create an issue if risks at MEDIUM or above are found** — do not create noise for LOW/CLEAN results
- **Cap audit at 50 merged PRs per run** — if more exist, audit the 50 most recent and note the overflow
- **Skip PRs already audited** — check for `**AgentGuard Merged PR Audit Bot**` comment
- **Do not name or blame individuals** — focus on process gaps and systemic patterns, not personal attribution
- Be factual and objective in findings — avoid inflammatory language
- If `gh` CLI is not authenticated, report the error and STOP
- If no merged PRs exist in the audit window, report cleanly and STOP
