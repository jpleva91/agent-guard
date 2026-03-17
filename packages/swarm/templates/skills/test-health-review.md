# Skill: Test Health Review

Evaluate the health, coverage, and reliability of the test suite. Run both test tracks (JS + TypeScript), analyze coverage, detect regressions, identify untested code, and assess test quality. Publish a Test Health Report. Designed for daily scheduled execution.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If data is unavailable or ambiguous, proceed with available data and note limitations
- If governance activation fails, log the failure and **STOP**
- If `gh` CLI fails, log the error and **STOP**
- Default to the **safest option** in every ambiguous situation

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Build the Project

Build must succeed before tests can run:

```bash
pnpm build
```

If the build fails, record the error output and skip to Step 9 (Generate Report) with build failure as the primary finding. Do NOT attempt to fix the build — that is the Coder Agent's job.

### 3. Run TypeScript Tests

Run the vitest test suite and capture structured output:

```bash
npx vitest run --reporter=verbose 2>&1
```

Parse the output to extract:
- **Total tests**: Count of test cases
- **Passed**: Count of passing tests
- **Failed**: Count of failing tests (with names and error messages)
- **Skipped**: Count of skipped tests
- **Duration**: Total execution time
- **Per-file results**: Pass/fail status for each test file

### 4. Run JavaScript Tests

Run the custom JS test harness:

```bash
pnpm test 2>&1
```

Parse the output for:
- **Total tests**: Count of test cases
- **Passed/Failed**: Counts with test names
- **Duration**: Execution time

### 5. Run Coverage Analysis

Run coverage to measure code coverage:

```bash
npx c8 --reporter=text --check-coverage --lines 50 node tests/run.js 2>&1
```

Parse the output to extract:
- **Line coverage %**: Overall and per-file
- **Branch coverage %**: Overall and per-file
- **Function coverage %**: Overall and per-file
- **Uncovered lines**: File paths and line ranges with zero coverage
- **Threshold status**: Whether the 50% line coverage minimum is met

### 6. Run Type Check

Verify TypeScript strict mode compliance:

```bash
npx tsc --noEmit 2>&1
```

Parse output for:
- **Error count**: Total type errors
- **Error locations**: File paths and line numbers
- **Error categories**: Missing types, type mismatches, unused variables, etc.

### 7. Analyze Test-to-Code Ratio

Calculate the ratio of test code to source code:

Count source files and test files:

```bash
find packages/ apps/ -name "*.ts" -not -name "*.test.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" | wc -l
find packages/ apps/ -name "*.test.*" -not -path "*/node_modules/*" | wc -l
```

Count lines of source code vs. test code:

```bash
find packages/ apps/ -name "*.ts" -not -name "*.test.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" -exec cat {} + | wc -l
find packages/ apps/ -name "*.test.*" -not -path "*/node_modules/*" -exec cat {} + | wc -l
```

Calculate:
- **Test-to-code ratio**: test lines / source lines
- **Test file coverage**: % of source modules that have a corresponding test file
- **Untested modules**: Source files with no matching test file in their package's `tests/` directory

For each source file, check if a corresponding test exists in the same package:
- `packages/kernel/src/kernel.ts` → `packages/kernel/tests/kernel.test.ts` or similar
- `packages/events/src/bus.ts` → `packages/events/tests/event-bus.test.ts` or similar

List all source files that have NO corresponding test file.

### 8. Analyze Recent CI History

Fetch recent CI runs to detect patterns:

```bash
gh run list --limit 20 --json databaseId,conclusion,headBranch,createdAt,name
```

Calculate:
- **CI pass rate**: % of runs with conclusion "success" in last 20 runs
- **Failure frequency**: Runs that failed, grouped by failure type
- **Flaky signal**: Branches where the same commit has both pass and fail runs
- **Average CI duration**: If available from run metadata

Also check for any currently failing CI on open PRs:

```bash
gh pr list --state open --json number,title,statusCheckRollup --jq '.[] | select(.statusCheckRollup != null) | {number, title, checks: [.statusCheckRollup[] | {name: .name, conclusion: .conclusion}]}'
```

### 9. Generate Test Health Report

Compose a structured report in markdown:

**Header**:
- Generation timestamp (UTC)
- HEAD commit SHA
- Build status (success/failure)

**Test Results Dashboard** (table):
| Suite | Total | Passed | Failed | Skipped | Duration |
Showing JS tests, TS tests, and combined totals.

**Failed Tests** (if any):
List each failing test with:
- Test file and test name
- Error message (first 3 lines)
- Severity assessment (regression vs. known failure)

**Coverage Summary** (table):
| Metric | Current | Threshold | Status |
Showing line, branch, and function coverage vs. thresholds.

**Lowest Coverage Files** (table, top 10):
| File | Line % | Branch % | Uncovered Lines |
Files sorted by lowest coverage first.

**Untested Modules** (list):
Source files with no corresponding test file, grouped by directory.

**Test-to-Code Ratio**:
- Overall ratio
- Per-package breakdown (kernel, events, policy, invariants, adapters, cli, core)
- Comparison note (healthy ratio is typically 0.8-1.5)

**CI Pipeline Health**:
- Pass rate (last 20 runs)
- Failure pattern summary
- Flaky test signals
- Currently failing PRs

**Type Safety**:
- Type error count
- Error locations (if any)

**Recommendations** (numbered, max 5):
Top 5 actions to improve test health, prioritized by impact:
1. Fix failing tests (if any)
2. Add tests for untested modules (list specific files)
3. Improve coverage for lowest-coverage files
4. Address flaky tests (if detected)
5. Fix type errors (if any)

### 10. Route Output (Report Routing Protocol)

Apply the `report-routing` protocol to determine where output goes:

**Assess severity**: Check if ANY of the following critical conditions exist:
- Test failures detected (any failing tests)
- Build failure
- CI pass rate below 50%
- Coverage dropped below threshold

**If critical conditions exist → ALERT tier**:

First, check if a tracking issue already exists:

```bash
gh issue list --state open --label "source:test-agent" --label "<%= labels.critical %>" --json number,title
```

If failing tests are found and no existing tracking issue covers them, create ONE alert issue:

```bash
gh issue create \
  --title "Test failures detected — $(date +%Y-%m-%d)" \
  --body "<failing test details with file paths and error messages>" \
  --label "source:test-agent" --label "<%= labels.critical %>" --label "task:bug" --label "<%= labels.pending %>"
```

Cap at **1 alert issue per run**. Do NOT create a separate "Test Health Report" issue.

**If no critical conditions → REPORT tier**:

Write the full report to a local file instead of creating a GitHub issue:

```bash
mkdir -p .agentguard/reports
cat > .agentguard/reports/test-agent-$(date +%Y-%m-%d).md <<'REPORT_EOF'
<test health report markdown>
REPORT_EOF
```

Close any previous test health report issues that are still open (cleanup from before routing was implemented):

```bash
PREV=$(gh issue list --state open --label "source:test-agent" --json number --jq '.[].number' 2>/dev/null)
for num in $PREV; do
  gh issue close "$num" --comment "Superseded — reports now written to .agentguard/reports/" 2>/dev/null || true
done
```

**If all tests pass AND no findings above INFO → LOG tier**:

```bash
mkdir -p .agentguard/logs
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [test-agent] All tests passing. Coverage: N%. CI pass rate: N%." >> .agentguard/logs/swarm.log
```

### 11. Summary

Report:
- **Build status**: Success / Failure
- **Tests**: N passed / N failed / N skipped (JS + TS combined)
- **Coverage**: N% lines (threshold: 50%)
- **Type errors**: N
- **CI pass rate**: N% (last 20 runs)
- **Untested modules**: N files
- **Test-to-code ratio**: N
- **Output routed to**: ALERT (issue #N) / REPORT (.agentguard/reports/test-agent-DATE.md) / LOG
- **Top recommendation**: Brief statement of the single most important test health action

## Rules

- Create a maximum of **1 alert issue per run** — only for critical findings (test failures, build failure, CI collapse)
- **Routine reports go to `.agentguard/reports/`, NOT GitHub issues** — follow the report-routing protocol
- **Never fix tests** — only report findings. Fixing is the Coder Agent's job.
- **Never modify source code** — this agent is read-only except for GitHub issues and report files
- **Never assign issues** — that is the Coder Agent's job
- If the build fails, still produce a report (with build failure as primary finding)
- If `gh` CLI is not authenticated, report the error and STOP
- Do not create duplicate alert issues — check for existing ones first
- Coverage analysis runs on JS tests only (c8 wraps the JS harness). TS test coverage uses vitest's built-in reporting if available.
