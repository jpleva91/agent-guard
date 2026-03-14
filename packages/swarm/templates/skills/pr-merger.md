# Skill: PR Merger

Auto-merge pull requests that have passed all quality gates: CI passing, no merge conflicts, reviews approved or no changes requested, and all threads resolved. Designed for periodic scheduled execution as the final step in the autonomous SDLC pipeline.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If any step fails, log the error and move on to the next PR
- Default to the **safest option** in every ambiguous situation (skip merge > attempt merge)

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 1b. Check System Mode

```bash
cat <%= paths.swarmState %> 2>/dev/null | grep -o '"mode":"[^"]*"' 2>/dev/null
```

- If mode is `safe`: output "System in SAFE MODE — skipping PR merging" and **STOP immediately**
- If mode is `conservative`: only merge PRs with `blast_radius < 200` lines (additions + deletions) AND at least 1 approving review from a human (not just agent review)

### 2. Ensure Labels Exist

```bash
gh label create "merge:failed" --color "D93F0B" --description "Auto-merge failed" 2>/dev/null || true
gh label create "do-not-merge" --color "B60205" --description "Do not auto-merge this PR" 2>/dev/null || true
```

### 3. List Candidate PRs

```bash
gh pr list --state open --json number,title,headRefName,mergeable,isDraft,labels,createdAt,reviewDecision,statusCheckRollup --limit 20
```

### 4. Filter by Merge Criteria

A PR is eligible for auto-merge ONLY if ALL conditions are met:

1. **Not a draft**: `isDraft` is `false`
2. **No blocking labels**: Does NOT have `conflict:needs-human`, `do-not-merge`, `needs:refinement`, or `blocked`
3. **Mergeable**: `mergeable` is `MERGEABLE` (not `CONFLICTING` or `UNKNOWN`)
4. **Age gate**: `createdAt` is more than 1 hour ago (gives review agents time to review)
5. **CI passing**: All status checks in `statusCheckRollup` have state `SUCCESS`, `NEUTRAL`, or `SKIPPED`
6. **Review state**: Either `reviewDecision` is `APPROVED`, or there are no `CHANGES_REQUESTED` reviews and all review threads are resolved

If no PRs match all criteria, report "No PRs meet merge criteria. Skipping." and STOP.

### 5. Process Eligible PRs

For each eligible PR (max 3 per run, oldest first):

#### 5a. Double-Check CI Status

```bash
gh pr checks <NUMBER> --json name,state --jq '.[] | select(.state != "SUCCESS" and .state != "NEUTRAL" and .state != "SKIPPED")'
```

If any non-passing checks: skip this PR, log "CI not fully passing for PR #N"

#### 5b. Double-Check Mergeable State

```bash
gh pr view <NUMBER> --json mergeable --jq .mergeable
```

If not `MERGEABLE`: skip this PR, log "PR #N not mergeable"

#### 5c. Check Review Threads

```bash
gh api repos/{owner}/{repo}/pulls/<NUMBER>/reviews --jq '[.[] | select(.state == "CHANGES_REQUESTED")] | length'
```

If any reviews with `CHANGES_REQUESTED` that haven't been dismissed: skip this PR

#### 5d. Merge

```bash
gh pr merge <NUMBER> --squash --delete-branch
```

If merge fails:
- Log the error
- Add label `merge:failed`
- Post a comment: "Auto-merge failed: <error message>. Skipping."
- Continue to next PR

If merge succeeds:
- Post a comment: "Auto-merged by PR Merger Agent. All quality gates passed: CI green, no conflicts, reviews clear."

#### 5e. Cooldown

After each successful merge, wait 10 seconds before processing the next PR. This allows CI to re-evaluate other PRs against the new main.

### 6. Summary

Report:
- **PRs eligible**: N
- **PRs merged**: N (list PR numbers and titles)
- **PRs skipped**: N (list with reasons: CI failing, conflicts, reviews pending, etc.)
- **PRs not eligible**: N (total open minus eligible)
- If clean: "No PRs meet merge criteria"

## Rules

- Merge a maximum of **3 PRs per run**
- **NEVER merge PRs with `do-not-merge` or `conflict:needs-human` labels**
- **NEVER merge draft PRs**
- **NEVER force merge** — only standard squash merge
- **NEVER merge if CI has ANY failing required checks**
- **NEVER merge if there are unresolved `CHANGES_REQUESTED` reviews**
- If unsure about any condition: **SKIP** the PR (do not merge)
- After each merge, wait 10 seconds before the next (let CI re-evaluate)
- Always delete the branch after merge (`--delete-branch`)
- If `gh` CLI is not authenticated, report the error and STOP
- The age gate (1 hour) ensures review agents have time to post comments before merge
