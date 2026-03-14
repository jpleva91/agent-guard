# Skill: Respond to PR Reviews

Detect unresolved review comments on agent-authored PRs, make code changes to address the feedback, validate changes against governance policy, and reply to each thread. Keeps agent PRs moving toward merge without requiring human re-implementation. Designed for periodic scheduled execution.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If a comment's intent is ambiguous, classify it as **non-actionable** and reply acknowledging it
- If a code change is uncertain, **skip it** and reply explaining what was unclear
- If governance activation fails, log the failure and **STOP** — do not ask what to do
- If `gh` CLI fails, log the error and **STOP** — do not ask for credentials
- If a branch has unexpected state, **skip that PR** and move to the next
- Default to the **safest option** in every ambiguous situation (skip > attempt)
- When in doubt about any decision, choose the conservative path and document why in the summary

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance. Requires `gh` CLI authenticated with repo access.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Ensure Labels Exist

```bash
gh label create "source:review-responder" --color "C5DEF5" --description "Auto-created by Review Response skill" 2>/dev/null || true
```

### 3. List Agent-Authored Open PRs

Find open PRs authored by the current authenticated user (the agent):

```bash
gh pr list --state open --author "@me" --json number,title,headRefName,updatedAt --limit 20
```

If no open agent-authored PRs exist, report "No agent-authored PRs to process" and STOP.

### 4. Find PRs with Unresolved Review Feedback

For each PR, check for unresolved review threads:

```bash
gh pr view <PR_NUMBER> --json reviewThreads --jq '[.reviewThreads[] | select(.isResolved == false)] | length'
```

Also check for review comments not yet replied to by this bot:

```bash
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments --jq '[.[] | select(.body != null)] | length'
gh pr view <PR_NUMBER> --json comments --jq '[.comments[] | select(.body | contains("AgentGuard Review Response Bot"))] | length'
```

Skip PRs with zero unresolved threads and zero unaddressed comments. Select up to **3 PRs** with actionable feedback for this run.

### 5. Classify Each Comment

For each unresolved review thread, read the comment body and classify:

**Actionable feedback** (make code changes):
- Requests a code change ("rename this", "extract this", "add a check for...")
- Points out a bug or logic error
- Asks for missing error handling or validation
- Requests additional test coverage
- Flags a convention violation with a specific fix
- Suggests a refactor with clear direction

**Non-actionable** (acknowledge but skip code changes):
- General questions ("why did you do this?", "what does this do?")
- Praise or approval ("looks good", "nice")
- Discussion or debate without a clear requested change
- Requests that require product/architecture decisions outside agent scope
- Comments already replied to by `**AgentGuard Review Response Bot**`

For non-actionable comments, reply with a brief acknowledgment but do NOT make code changes.

### 6. Check Out the Branch

For each PR with actionable feedback:

```bash
git fetch origin <HEAD_BRANCH>
git checkout <HEAD_BRANCH>
git pull origin <HEAD_BRANCH>
```

### 7. Address Each Actionable Comment

For each actionable review comment:

#### 7a. Read the Referenced Code

Read the file and lines referenced in the review comment. Understand the surrounding context.

#### 7b. Apply the Requested Change

Make the code change that addresses the feedback. Follow project conventions:
- `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants
- `const`/`let` only (no `var`), arrow functions preferred
- `import type` for type-only imports
- Single quotes, trailing commas (es5), semicolons

#### 7c. Validate Against Governance Policy

After making the change, simulate each modified file against governance policy:

```bash
<%= paths.cli %> simulate --action file.write --target <modified-file> --policy <%= paths.policy %> --json 2>/dev/null
```

If simulation shows a denial:
- Do NOT commit the change
- Reply to the review comment explaining the governance constraint
- Note which policy rule or invariant blocked the change

If the simulate command is not available, skip validation and proceed.

#### 7d. Verify the Change

After each change, run the full quality suite:

```bash
pnpm build && pnpm ts:check && pnpm lint && pnpm format && ppnpm test && pnpm test
```

If the suite fails after the change:
1. Attempt auto-fix: `pnpm lint:fix && pnpm format:fix`
2. Re-run the suite
3. If still failing: **revert the change** for this comment, note it as unresolvable, and move to the next comment

### 8. Commit and Push

Stage only the files changed to address review feedback:

```bash
git add <changed-files>
git commit -m "fix(review): address review feedback — <brief summary of changes>"
git push origin <HEAD_BRANCH>
```

If multiple comments were addressed, list them in the commit body:

```
fix(review): address review feedback — <summary>

- <file>: <what was changed and why>
- <file>: <what was changed and why>
```

### 9. Reply to Each Review Thread

For each addressed comment, reply on the review thread:

```bash
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments/<COMMENT_ID>/replies \
  -X POST -f body="**AgentGuard Review Response Bot** — feedback addressed

Applied in commit <SHORT_SHA>:
- <brief description of the change>
- **Governance check**: passed (no policy violations)

---
*Automated response by respond-to-pr-reviews skill on $(date -u +%Y-%m-%dT%H:%M:%SZ)*"
```

For comments blocked by governance policy:

```bash
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments/<COMMENT_ID>/replies \
  -X POST -f body="**AgentGuard Review Response Bot** — blocked by governance policy

The requested change cannot be applied automatically:
- **Policy rule**: <rule that denied the change>
- **Reason**: <denial reason>
- **Affected file**: <file path>

This requires a policy review or manual override. Run \`<%= paths.cli %> inspect --last\` for details.

---
*Automated response by respond-to-pr-reviews skill on $(date -u +%Y-%m-%dT%H:%M:%SZ)*"
```

For comments that could NOT be addressed (suite failure, unclear request, out of scope):

```bash
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments/<COMMENT_ID>/replies \
  -X POST -f body="**AgentGuard Review Response Bot** — could not auto-resolve

**Reason**: <explanation — e.g., 'Change causes test failures in X', 'Request requires architectural decision'>

Manual intervention needed. Details:
- <specific issue or question>

---
*Automated response by respond-to-pr-reviews skill on $(date -u +%Y-%m-%dT%H:%M:%SZ)*"
```

For non-actionable comments (questions, discussion):

```bash
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments/<COMMENT_ID>/replies \
  -X POST -f body="**AgentGuard Review Response Bot** — acknowledged

<brief response to the question or discussion point>

---
*Automated response by respond-to-pr-reviews skill on $(date -u +%Y-%m-%dT%H:%M:%SZ)*"
```

### 10. Return to Original Branch

```bash
git checkout -
```

### 11. Summary

Report:
- **PRs processed**: N (list PR numbers and titles)
- **Comments addressed (code changed)**: N
- **Comments blocked by governance**: N (list policy rules)
- **Comments acknowledged (non-actionable)**: N
- **Comments unresolvable**: N (list reasons)
- **Commits pushed**: N (list commit SHAs)
- **PRs skipped (no feedback)**: N
- **PRs skipped (cap reached)**: N

## Rules

- Process a maximum of **3 PRs per run**
- **Only respond to PRs authored by `@me`** — never modify PRs authored by humans or other agents
- **Never force push** — always regular push
- **Never modify protected files**: `<%= paths.policy %>`, `.claude/settings.json`, files in `packages/kernel/src/`, `packages/policy/src/`, `packages/invariants/src/` unless the review comment explicitly references them AND the linked issue authorizes it
- **Never push if the full quality suite fails** — revert the change and reply explaining the failure
- **Never push changes that governance policy denies** — report the denial in the review thread
- **Skip comments already replied to** by `**AgentGuard Review Response Bot**`
- **Do not approve, merge, or request changes** on PRs — only make code changes and reply to comments
- **Do not address merge/approval requests** — only code change requests
- Only commit files directly related to the review feedback — no unrelated changes
- If `gh` CLI is not authenticated, report the error and STOP
- If a branch has merge conflicts, skip it and note in summary — let `resolve-merge-conflicts` handle it
