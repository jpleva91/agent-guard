# Skill: Resolve Merge Conflicts

Detect open PR branches with merge conflicts against main, rebase them, and auto-resolve trivial conflicts. For complex conflicts, post a diagnostic comment listing the conflicting files and ask the human to intervene. Designed for periodic scheduled execution.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If a conflict's classification is ambiguous, treat it as **complex** and abort the rebase for that PR
- If governance activation fails, log the failure and **STOP** — do not ask what to do
- If `gh` CLI fails, log the error and **STOP** — do not ask for credentials
- If `git rebase` enters an unexpected state, run `git rebase --abort` and skip that PR
- Default to the **safest option** in every ambiguous situation (abort rebase > attempt resolution)
- When in doubt about any decision, choose the conservative path and document why in the summary

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance. Requires `gh` CLI authenticated with repo access.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Ensure Labels Exist

```bash
gh label create "source:conflict-resolver" --color "C5DEF5" --description "Auto-created by Conflict Resolution skill" 2>/dev/null || true
gh label create "conflict:needs-human" --color "D93F0B" --description "Merge conflict requires manual resolution" 2>/dev/null || true
```

### 3. Save Current Branch

Record the current branch so we can return to it later:

```bash
git branch --show-current
```

### 4. List PRs with Merge Conflicts

```bash
gh pr list --state open --json number,title,headRefName,mergeable,labels,author --limit 20
```

Filter results:
- **Include**: PRs where `mergeable` is `CONFLICTING`
- **Exclude**: PRs targeting `main` or `master` as the head branch
- **Exclude**: PRs with a `do-not-rebase` label
- **Exclude**: PRs already labeled `conflict:needs-human` (already diagnosed — waiting on human)

Select up to **3 conflicting PRs** for this run.

If no conflicting PRs found, report "No merge conflicts to resolve" and STOP.

### 5. Process Each Conflicting PR

For each selected PR:

#### 5a. Fetch Latest State

```bash
git fetch origin main
git fetch origin <HEAD_BRANCH>
```

#### 5b. Check Out the PR Branch

```bash
git checkout <HEAD_BRANCH>
git reset --hard origin/<HEAD_BRANCH>
```

#### 5c. Attempt Rebase onto Main

```bash
git rebase origin/main
```

If the rebase completes with **no conflicts**, skip to step 6.

If the rebase **hits conflicts**, proceed to step 5d.

#### 5d. Classify Conflicts

List conflicting files:

```bash
git diff --name-only --diff-filter=U
```

For each conflicting file, read the conflict markers and classify:

**Trivial conflicts** (auto-resolve):
- **Import ordering**: both sides added different imports → accept both, sort alphabetically
- **Whitespace / formatting only**: indentation or line ending differences → accept the PR branch version (`git checkout --theirs <file>`)
- **Non-overlapping additions**: both sides added different lines in the same region but not the same lines → accept both additions
- **package.json version bumps**: version field changed by both sides → accept the higher version number
- **Trailing comma or semicolon differences**: formatting-only → accept PR branch version

**Complex conflicts** (cannot auto-resolve):
- **Overlapping logic changes**: same lines modified with different logic on both sides
- **Structural changes**: function signatures, type definitions, or class structures changed by both sides
- **Test assertion changes**: test expectations modified on both sides
- **Deleted vs modified**: one side deleted code the other side modified
- **Renamed vs modified**: one side renamed a file/function the other side changed

#### 5e. Resolve or Abort

**If ALL conflicts in ALL files are trivial:**

For each conflicting file:
1. Open the file and resolve the conflict markers according to the trivial resolution strategy above
2. Stage the resolved file: `git add <file>`
3. Continue the rebase: `git rebase --continue`
4. If additional conflicts appear, repeat classification and resolution
5. If any conflict during rebase becomes complex, abort: `git rebase --abort`

**If ANY conflict is complex:**

Abort the entire rebase:

```bash
git rebase --abort
```

Post a diagnostic comment on the PR and add the `conflict:needs-human` label:

```bash
gh pr comment <PR_NUMBER> --body "**AgentGuard Conflict Resolution Bot** — manual resolution needed

## Merge Conflicts Detected

This branch has conflicts with \`main\` that require manual resolution.

### Conflicting Files

| File | Conflict Type | Details |
|------|--------------|---------|
| <file> | <trivial/complex> | <brief description of the conflict> |

### Suggested Resolution

\`\`\`bash
git fetch origin main
git checkout <HEAD_BRANCH>
git rebase origin/main
# Resolve conflicts in the files listed above
git add <resolved-files>
git rebase --continue
git push --force-with-lease origin <HEAD_BRANCH>
\`\`\`

---
*Automated diagnosis by resolve-merge-conflicts skill on $(date -u +%Y-%m-%dT%H:%M:%SZ)*"

gh pr edit <PR_NUMBER> --add-label "conflict:needs-human" --add-label "source:conflict-resolver"
```

Skip to the next PR.

### 6. Verify After Successful Rebase

Run the full quality suite to ensure the rebase didn't break anything:

```bash
npm run build:ts && npm run ts:check && npm run lint && npm run format && npm run ts:test && npm test
```

If the suite fails:
1. Attempt auto-fix: `npm run lint:fix && npm run format:fix`
2. Re-run: `npm run build:ts && npm run ts:check && npm run lint && npm run format && npm run ts:test && npm test`
3. If still failing: the rebase introduced a regression. Reset the branch and post a diagnostic comment:

```bash
git checkout <HEAD_BRANCH>
git reset --hard origin/<HEAD_BRANCH>
gh pr comment <PR_NUMBER> --body "**AgentGuard Conflict Resolution Bot** — rebase succeeded but quality suite failed

The branch was successfully rebased onto main, but the full quality suite failed after rebase. This suggests an incompatibility between the PR changes and recent main updates.

**Failure output**: <relevant error excerpt>

The branch has been left in its original state. Manual intervention needed to reconcile with main.

---
*Automated diagnosis by resolve-merge-conflicts skill on $(date -u +%Y-%m-%dT%H:%M:%SZ)*"

gh pr edit <PR_NUMBER> --add-label "conflict:needs-human" --add-label "source:conflict-resolver"
```

Skip to the next PR.

### 7. Force Push the Rebased Branch

Use `--force-with-lease` for safety (prevents overwriting commits pushed by someone else since our fetch):

```bash
git push --force-with-lease origin <HEAD_BRANCH>
```

If force push fails (someone else pushed in the meantime), skip this PR and note it in the summary.

### 8. Comment on the PR

```bash
gh pr comment <PR_NUMBER> --body "**AgentGuard Conflict Resolution Bot** — conflicts resolved

## Rebase Summary

- **Base**: \`main\` ($(git rev-parse --short origin/main))
- **Conflicts resolved**: <N> file(s)

### Resolved Files

| File | Resolution |
|------|------------|
| <file> | <how it was resolved — e.g., 'Merged non-overlapping additions', 'Accepted PR imports'> |

### Verification

Full quality suite passed: build, typecheck, lint, format, ts:test, test

---
*Automated fix by resolve-merge-conflicts skill on $(date -u +%Y-%m-%dT%H:%M:%SZ)*"

gh pr edit <PR_NUMBER> --add-label "source:conflict-resolver"
```

If the `conflict:needs-human` label was previously on the PR, remove it:

```bash
gh pr edit <PR_NUMBER> --remove-label "conflict:needs-human" 2>/dev/null || true
```

### 9. Return to Original Branch

After processing all PRs:

```bash
git checkout <ORIGINAL_BRANCH>
```

### 10. Summary

Report:
- **PRs with conflicts found**: N
- **Conflicts auto-resolved**: N (list PR numbers, file counts, and resolution types)
- **Conflicts requiring human intervention**: N (list PR numbers and conflicting files)
- **Rebase succeeded but suite failed**: N (list PR numbers)
- **Skipped (do-not-rebase label)**: N
- **Skipped (already diagnosed)**: N
- **Skipped (force push rejected)**: N
- If clean: "No merge conflicts found — all PRs are mergeable"

## Rules

- Resolve a maximum of **3 PRs per run**
- **Only use `--force-with-lease`** — never use `--force` (force-with-lease prevents overwriting concurrent pushes)
- **Never rebase `main` or `master`** — only PR branches
- **If ANY conflict in a PR is complex, abort the ENTIRE rebase for that PR** — do not partially resolve. Either all conflicts are trivially resolvable or none are attempted.
- **Run full quality suite after rebase** — if it fails, reset the branch to its original state
- **Never modify protected files during conflict resolution**: `agentguard.yaml`, `.claude/settings.json`
- **Respect `do-not-rebase` label** — never rebase PRs with this label
- **Skip PRs already labeled `conflict:needs-human`** — these have already been diagnosed and are waiting on a human
- If `gh` CLI is not authenticated, report the error and STOP
- Always return to the original branch after processing, even if errors occur
