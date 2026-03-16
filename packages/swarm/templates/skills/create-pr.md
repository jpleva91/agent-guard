# Skill: Create Pull Request

Create a pull request with a governance telemetry summary, risk assessment, and decision records. Pushes the branch, reads governance event data, runs pre-push simulation, generates a structured PR body, and updates the issue status.

## Prerequisites

All tests must pass — run `run-tests` first.

## Steps

### 1. Stage Governance Telemetry

Stage governance event files so they are committed with the PR branch:

```bash
git add .agentguard/events/*.jsonl 2>/dev/null || true
git add .agentguard/decisions/*.jsonl 2>/dev/null || true
git add <%= paths.logs %> 2>/dev/null || true
```

If no governance files exist yet, this is a no-op — proceed normally.

### 2. Pre-Push Simulation

Run impact simulation before pushing to assess blast radius and policy compliance:

```bash
<%= paths.cli %> simulate --action git.push --branch $(git branch --show-current) --policy <%= paths.policy %> --json 2>/dev/null
```

Parse the JSON output for:
- **riskLevel**: low / medium / high
- **blastRadius**: weighted score
- **predictedChanges**: list of affected resources
- **policyResult**: allowed / denied

If simulation shows a policy denial, report the denial reason and STOP — do not push a branch that would violate governance policy.

If the simulate command is not available or fails, note "Simulation: not available" and proceed.

### 3. Push Branch to Remote

```bash
git push -u origin $(git branch --show-current)
```

If push fails due to remote rejection, diagnose and report. Do NOT force push.

### 4. Collect Governance Telemetry

Use the evidence-pr command in dry-run mode to collect and format governance telemetry:

```bash
<%= paths.cli %> evidence-pr --last --dry-run --store sqlite 2>/dev/null
```

If the command fails or returns no output, fall back to JSONL mode:

```bash
<%= paths.cli %> evidence-pr --last --dry-run 2>/dev/null
```

If no telemetry files exist, note "No governance telemetry recorded" — still proceed with PR creation.

### 5. Collect Decision Records

Read governance decision records for this session:

```bash
ls -la .agentguard/decisions/ 2>/dev/null
cat .agentguard/decisions/*.jsonl 2>/dev/null | wc -l
cat .agentguard/decisions/*.jsonl 2>/dev/null | grep -c '"outcome":"deny"' || echo 0
```

Parse decision records to extract:
- **Total decisions recorded**
- **Deny outcomes** and their reasons
- **Escalation levels** observed (NORMAL, ELEVATED, HIGH, LOCKDOWN)
- **Intervention types** (deny, rollback, pause, test-only)

### 6. Compute Risk Score

Run the analytics engine for a per-session risk assessment:

```bash
<%= paths.cli %> analytics --format json 2>/dev/null | head -50
```

Extract:
- **Risk score** (0-100)
- **Risk level** (low / medium / high / critical)
- **Top violation patterns** (if any)

If the analytics command is not available, compute a basic risk level from telemetry:
- 0 denials + 0 violations → **low**
- 1-2 denials or violations → **medium**
- 3+ denials or any escalation → **high**
- Any LOCKDOWN event → **critical**

### 7. Generate PR Body

Use this structure:

```markdown
## Summary
- <1-3 bullet points describing what was implemented>
- Closes #<ISSUE_NUMBER>

## Changes
- <list of files modified with brief description of each change>

## Test Plan
- [ ] TypeScript build passes (`pnpm build`)
- [ ] Vitest tests pass (`pnpm test`)
- [ ] ESLint clean (`pnpm lint`)
- [ ] Prettier clean (`pnpm format`)

## Risk Assessment

| Metric | Value |
|--------|-------|
| Risk level | <low/medium/high/critical> |
| Risk score | <N>/100 |
| Blast radius | <N> (weighted) |
| Simulation result | <allowed/denied/not available> |

## Governance Report

| Metric | Count |
|--------|-------|
| Total events | <N> |
| Actions allowed | <N> |
| Actions denied | <N> |
| Policy denials | <N> |
| Invariant violations | <N> |
| Escalation events | <N> |
| Decision records | <N> |

<details>
<summary>Governance details</summary>

**Source**: `.agentguard/events/`, `.agentguard/decisions/`, `<%= paths.logs %>`

**Decision Records**: <N> total, <N> denials
**Escalation levels observed**: <list or "NORMAL only">
**Pre-push simulation**: <risk level, blast radius, or "not available">

[List any notable denials or violations with their reasons]

</details>
```

### 8. Create the PR

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

### 9. Update Issue Label

```bash
gh issue edit <ISSUE_NUMBER> --remove-label "<%= labels.inProgress %>" --add-label "<%= labels.review %>"
```

### 10. Comment on Issue

```bash
gh issue comment <ISSUE_NUMBER> --body "**AgentGuard Agent** — pull request created.

- **PR**: <PR_URL>
- **Branch**: \`$(git branch --show-current)\`
- **Risk level**: <low/medium/high/critical>
- **Actions evaluated**: <N>
- **Denials**: <N>
- **Decision records**: <N>
- **Completed**: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

## Rules

- Do NOT force push — if push fails, diagnose and report
- If `gh pr create` fails because a PR already exists, update the existing PR
- If no governance telemetry exists, still create the PR but note "Governance telemetry: not available" in the report
- If pre-push simulation shows a policy denial, STOP and report — do not create a PR for policy-violating changes
- Mark all test plan checkboxes that passed during `run-tests`
- The PR title must be under 70 characters
- If analytics or simulation commands are not available, degrade gracefully and note the limitation
