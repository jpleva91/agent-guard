# Skill: Create Pull Request

Create a pull request with a governance telemetry summary. Pushes the branch, reads governance event data, generates a structured PR body, and updates the issue status.

## Prerequisites

All tests must pass — run `run-tests` first.

## Steps

### 1. Push Branch to Remote

```bash
git push -u origin $(git branch --show-current)
```

If push fails due to remote rejection, diagnose and report. Do NOT force push.

### 2. Collect Governance Telemetry

Read governance event data from this session:

```bash
ls -la .agentguard/events/ 2>/dev/null
```

For each `.jsonl` file in `.agentguard/events/`, count event types:

```bash
cat .agentguard/events/*.jsonl 2>/dev/null | wc -l
cat .agentguard/events/*.jsonl 2>/dev/null | grep -c "ActionAllowed" || echo 0
cat .agentguard/events/*.jsonl 2>/dev/null | grep -c "ActionDenied" || echo 0
cat .agentguard/events/*.jsonl 2>/dev/null | grep -c "PolicyDenied" || echo 0
cat .agentguard/events/*.jsonl 2>/dev/null | grep -c "InvariantViolation" || echo 0
```

Also check the runtime telemetry log:

```bash
cat logs/runtime-events.jsonl 2>/dev/null | wc -l
```

If no telemetry files exist, note "No governance telemetry recorded" — still proceed with PR creation.

### 3. Generate PR Body

Use this structure:

```markdown
## Summary
- <1-3 bullet points describing what was implemented>
- Closes #<ISSUE_NUMBER>

## Changes
- <list of files modified with brief description of each change>

## Test Plan
- [ ] TypeScript build passes (`npm run build:ts`)
- [ ] Vitest tests pass (`npm run ts:test`)
- [ ] JS tests pass (`npm test`)
- [ ] ESLint clean (`npm run lint`)
- [ ] Prettier clean (`npm run format`)

## Governance Report

| Metric | Count |
|--------|-------|
| Total events | <N> |
| Actions allowed | <N> |
| Actions denied | <N> |
| Policy denials | <N> |
| Invariant violations | <N> |

<details>
<summary>Telemetry details</summary>

Source: `.agentguard/events/` and `logs/runtime-events.jsonl`

[List any notable denials or violations with their reasons]

</details>
```

### 4. Create the PR

```bash
gh pr create --title "<type>(issue-<N>): <concise title>" --body "<generated body>"
```

Use the issue title as the basis for the PR title. Keep it under 70 characters. Use conventional prefixes: `feat`, `fix`, `refactor`, `test`, `docs`.

If a PR already exists for this branch:

```bash
gh pr view --json url --jq '.url'
```

Update the existing PR instead:

```bash
gh pr edit <PR_NUMBER> --body "<updated body>"
```

### 5. Update Issue Label

```bash
gh issue edit <ISSUE_NUMBER> --remove-label "status:in-progress" --add-label "status:review"
```

### 6. Comment on Issue

```bash
gh issue comment <ISSUE_NUMBER> --body "**AgentGuard Agent** — pull request created.

- **PR**: <PR_URL>
- **Branch**: \`$(git branch --show-current)\`
- **Actions evaluated**: <N>
- **Denials**: <N>
- **Completed**: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

## Rules

- Do NOT force push — if push fails, diagnose and report
- If `gh pr create` fails because a PR already exists, update the existing PR
- If no governance telemetry exists, still create the PR but note "Governance telemetry: not available" in the report
- Mark all test plan checkboxes that passed during `run-tests`
- The PR title must be under 70 characters
