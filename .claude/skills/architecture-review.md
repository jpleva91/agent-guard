# Skill: Architecture Review

Review open PRs for architectural concerns: module boundary violations, dependency direction, cross-layer coupling, and consistency with the unified architecture. Complements the `review-open-prs` skill with deeper structural analysis. Designed for periodic scheduled execution.

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active. If governance cannot be activated, STOP.

### 2. List Open PRs

```bash
gh pr list --state open --json number,title,headRefName,additions,deletions --limit 10
```

If no open PRs exist, report "No open PRs to review" and STOP.

### 3. Filter PRs Needing Architecture Review

Select PRs that touch structural files (skip docs-only, config-only, or test-only PRs):

```bash
gh pr view <PR_NUMBER> --json files --jq '.files[].path'
```

A PR needs architecture review if it modifies files in:
- `src/kernel/` — core governance engine
- `src/events/` — canonical event model
- `src/policy/` — policy system
- `src/invariants/` — invariant system
- `src/adapters/` — execution adapters
- `src/core/` — shared types and utilities
- `src/cli/` — CLI entry points and commands

Skip PRs that already have an `**Architect Agent**` comment. Select up to **2 PRs** per run.

### 4. Review Each PR

For each selected PR:

#### 4a. Read the Diff

```bash
gh pr diff <PR_NUMBER>
```

#### 4b. Analyze Module Boundaries

The architecture defines 7 distinct layers with strict dependency rules:

```
core/ ← (shared types, no imports from other layers)
  ↑
events/ ← (may import from core/)
  ↑
policy/ ← (may import from core/)
  ↑
invariants/ ← (may import from core/, events/)
  ↑
kernel/ ← (may import from core/, events/, policy/, invariants/)
  ↑
adapters/ ← (may import from core/, events/, kernel/)
  ↑
cli/ ← (may import from anything)
```

Check the diff for import statements that violate these dependency rules:
- `kernel/` must NOT import from `adapters/` or `cli/`
- `adapters/` must NOT import from `cli/`
- `events/` must NOT import from `kernel/`, `policy/`, `invariants/`, `adapters/`, or `cli/`
- `policy/` must NOT import from `kernel/`, `invariants/`, `adapters/`, or `cli/`
- `core/` must NOT import from any other `src/` layer

#### 4c. Check Event Model Consistency

If the PR adds new event kinds:
- New events must be defined in `src/events/schema.ts`
- New events must follow the existing naming convention (PascalCase)
- New events must have a factory function for creation
- New events must be documented in the appropriate event category

#### 4d. Check Action Type Consistency

If the PR adds new action types:
- New actions must be registered in `src/core/actions.ts`
- New actions must follow the `class.verb` naming convention (e.g., `file.read`, `git.push`)
- New action classes must have a corresponding adapter in `src/adapters/`

#### 4e. Check Public API Surface

If the PR modifies exports from barrel files (`index.ts`):
- Removing exports is a breaking change — flag it
- Adding exports should be intentional, not accidental

#### 4f. Assess Coupling

Analyze the changed files for coupling concerns:
- Does the change introduce circular dependencies?
- Does the change add imports from multiple unrelated layers?
- Does the change leak implementation details across layer boundaries?
- Could the change be implemented with fewer cross-layer imports?

### 5. Post Architecture Review

For each reviewed PR, post a structured comment:

```bash
gh pr comment <PR_NUMBER> --body "**Architect Agent** — architecture review

## Module Boundary Analysis

| Layer | Files Changed | Boundary Status |
|-------|--------------|----------------|
| kernel/ | N | CLEAN/VIOLATION |
| events/ | N | CLEAN/VIOLATION |
| policy/ | N | CLEAN/VIOLATION |
| invariants/ | N | CLEAN/VIOLATION |
| adapters/ | N | CLEAN/VIOLATION |
| cli/ | N | CLEAN/VIOLATION |
| core/ | N | CLEAN/VIOLATION |

## Findings

| # | Severity | Category | Details |
|---|----------|----------|---------|
| 1 | <HIGH/MED/LOW> | <boundary/coupling/api/event/action> | <description with file:line> |

## Recommendations

<Numbered list of architectural recommendations>

---
*Architecture review by Architect Agent on $(date -u +%Y-%m-%dT%H:%M:%SZ)*"
```

### 6. Summary

Report:
- **PRs reviewed**: N (list PR numbers)
- **Boundary violations found**: N
- **Coupling concerns**: N
- **API surface changes**: N
- If all clean: "Architecture review passed — no structural concerns"

## Rules

- Review a maximum of **2 PRs per run** (architecture review is deeper than code review).
- **Never approve or merge PRs** — post informational comments only.
- **Never modify PR code** — review is read-only.
- Skip PRs that already have an `**Architect Agent**` comment.
- Skip docs-only, config-only, and test-only PRs — they don't affect architecture.
- Focus on structural concerns, not coding style (that is the Reviewer Agent's job).
- If `gh` CLI is not authenticated, report the error and STOP.
