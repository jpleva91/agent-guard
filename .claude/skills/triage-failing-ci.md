# Skill: Triage Failing CI

Diagnose failed CI runs on open PR branches, apply minimal fixes, and push them. Keeps the pipeline unblocked so reviews and merges aren't stalled by lint errors, type mismatches, or broken tests.

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Find Failed CI Runs

```bash
gh run list --status failure --limit 10 --json databaseId,headBranch,event,conclusion,createdAt,name
```

Filter results:
- **Only PR branches** — skip runs on `main` or `master`
- **Only runs created in the last 24 hours** — skip stale failures
- Select up to **3 failed runs** for this invocation

If no failed runs match, report "No recent CI failures to triage" and STOP.

### 3. Diagnose Each Failure

For each selected failed run:

#### 3a. Fetch the Failure Logs

```bash
gh run view <RUN_ID> --log-failed
```

#### 3b. Identify the Associated PR

```bash
gh pr list --head <HEAD_BRANCH> --state open --json number,title --jq '.[0]'
```

If no open PR exists for the branch, skip this run.

#### 3c. Classify the Failure

Read the log output and classify into one of these categories:

| Category | Indicators |
|----------|------------|
| **lint** | ESLint errors, `npm run lint` exit code |
| **format** | Prettier check failures, `npm run format` exit code |
| **typecheck** | `tsc` errors, `TS\d+:` error codes |
| **test** | vitest/test failures, assertion errors, `npm test` exit code |
| **build** | `esbuild` errors, `npm run build:ts` exit code |
| **other** | Network errors, timeout, infrastructure issues |

If the category is **other**, skip this run — report it but do not attempt a fix.

### 4. Apply the Fix

#### 4a. Check Out the Branch

```bash
git fetch origin <HEAD_BRANCH>
git checkout <HEAD_BRANCH>
git pull origin <HEAD_BRANCH>
```

#### 4b. Fix by Category

**Lint errors:**

```bash
npm run lint:fix
npm run lint
```

If errors persist after auto-fix, read the specific errors and fix manually.

**Format errors:**

```bash
npm run format:fix
npm run format
```

**Type errors:**

Read the `tsc` error output. Fix the specific type issues in the reported files. Then verify:

```bash
npm run ts:check
```

**Test failures:**

Read the test output. Investigate the failing test and the code it exercises:
- If the test expectation is wrong (code is correct), update the test
- If the code has a bug, fix the code
- If a snapshot is stale, update the snapshot

Then verify:

```bash
npm run ts:test
```

**Build errors:**

Read the build output. Fix the reported issues (missing exports, syntax errors, etc.). Then verify:

```bash
npm run build:ts
```

#### 4c. If the Fix Attempt Fails

If you cannot resolve the failure after **2 attempts**, STOP fixing this run. Post a diagnostic comment on the PR instead (see step 5b).

### 5. Verify, Commit, and Push

#### 5a. Run the Full Suite

```bash
npm run build:ts && npm run ts:check && npm run lint && npm run format && npm run ts:test && npm test
```

If any step fails that was not part of the original failure, do not push — you may have introduced a regression. Revert your changes and skip this run.

#### 5b. Commit and Push

```bash
git add <fixed-files>
git commit -m "fix(ci): resolve <CATEGORY> failure — <brief description>"
git push origin <HEAD_BRANCH>
```

#### 5c. Comment on the PR

```bash
gh pr comment <PR_NUMBER> --body "**AgentGuard CI Triage Bot** — automated fix applied

## Diagnosis

- **Failed run**: <RUN_ID>
- **Category**: <CATEGORY>
- **Root cause**: <1-2 sentence explanation>

## Fix Applied

<Brief description of what was changed and why>

## Verification

Full suite passed locally: build, typecheck, lint, format, ts:test, test

---
*Automated fix by triage-failing-ci skill on $(date -u +%Y-%m-%dT%H:%M:%SZ)*"
```

If the fix attempt failed (step 4c), post a diagnostic comment instead:

```bash
gh pr comment <PR_NUMBER> --body "**AgentGuard CI Triage Bot** — diagnosis only (could not auto-fix)

## Diagnosis

- **Failed run**: <RUN_ID>
- **Category**: <CATEGORY>
- **Root cause**: <1-2 sentence explanation>
- **Why auto-fix failed**: <explanation>

## Suggested Manual Fix

<Specific steps the developer should take>

---
*Automated diagnosis by triage-failing-ci skill on $(date -u +%Y-%m-%dT%H:%M:%SZ)*"
```

### 6. Return to Original Branch

After processing all runs:

```bash
git checkout -
```

### 7. Summary

Report:
- **Runs triaged**: N (list run IDs, branches, and categories)
- **Fixes pushed**: N (list PR numbers and commit messages)
- **Diagnosis only (unfixable)**: N (list PR numbers and reasons)
- **Skipped (stale/no PR/other)**: N

## Rules

- Fix a maximum of **3 CI failures per run**
- **Never fix failures on `main` or `master`** — only PR branches
- **Never force push** — always regular push
- **Never modify tests to make them pass if the code is wrong** — fix the code instead
- **Never skip or disable tests, lint rules, or checks** to make CI green
- **Never push if the full suite doesn't pass** — revert and report instead
- Only commit files that are directly related to the CI fix — do not sneak in unrelated changes
- Skip runs older than 24 hours
- If `gh` CLI is not authenticated, report the error and STOP
- If the branch has merge conflicts, skip it and report the conflict in a PR comment
