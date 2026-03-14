# Skill: Implement Issue

Execute the implementation work described in the claimed GitHub issue. Reads the issue for requirements, respects file scope, validates changes against governance policy via simulation, follows coding conventions, and commits changes.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If requirements are ambiguous, implement the most conservative interpretation and note assumptions in the commit message
- If governance activation fails, log the failure and **STOP** — do not ask what to do
- If a policy simulation denies a file change, **skip that file** and note the denial in the commit message
- Default to the **safest option** in every ambiguous situation

## Prerequisites

Run `claim-issue` first. Must be on the working branch.

## Steps

### 1. Read Issue Details

```bash
gh issue view <ISSUE_NUMBER> --json body,title --jq '.body'
```

Extract from the body:
- **Task Description** — what to implement
- **Acceptance Criteria** — success conditions (checklist items)
- **File Scope** — allowed paths (if specified)
- **Protected Paths** — paths that must NOT be modified

### 2. Verify Branch

```bash
git branch --show-current
```

Must match `agent/<type>/issue-<N>`. If not on the correct branch, STOP.

### 3. Implement Changes

Follow these coding conventions (from CLAUDE.md):

- **camelCase** for functions and variables
- **UPPER_SNAKE_CASE** for constants
- **const/let** only, no `var`
- Arrow functions preferred
- `import type` for type-only imports (`verbatimModuleSyntax: true`)
- Single quotes, trailing commas (es5), printWidth 100, tabWidth 2, semicolons
- Node.js >= 18

If a **File Scope** section exists in the issue, only modify files matching the listed paths. If you need to modify a file outside the scope, note it as a scope extension request in the PR body later.

If a **Protected Paths** section exists, do NOT modify those files. The kernel will deny the action via policy, but avoid triggering denials proactively.

### 4. Pre-Commit Policy Simulation

Before committing, validate each modified file against governance policy:

```bash
git diff --name-only HEAD
```

For each modified file, run simulation:

```bash
<%= paths.cli %> simulate --action file.write --target <file> --policy <%= paths.policy %> --json 2>/dev/null
```

Check the simulation result:
- If **allowed**: proceed with the file
- If **denied**: do NOT commit that file — note the policy violation and the denial reason

If simulation shows a denial, attempt to resolve:
1. Check if the file is in a protected path (kernel, policy, invariants) — if so, verify the issue explicitly authorizes it
2. Check if the file matches a deny rule in `<%= paths.policy %>` — if so, note it as a governance constraint

If the simulate command is not available, skip this step and proceed.

### 5. Type-Check

```bash
pnpm ts:check
```

If type errors exist in files you modified, fix them before proceeding. Do not skip type errors.

### 6. Lint

```bash
pnpm lint
```

If lint errors exist in files you modified:

```bash
pnpm lint:fix
```

If errors remain after auto-fix, fix them manually.

### 7. Format Check

```bash
pnpm format
```

If formatting issues exist in files you modified:

```bash
pnpm format:fix
```

### 8. Commit Changes

Stage only the files you modified — do NOT use `git add .` or `git add -A`:

```bash
git add <specific-files>
git commit -m "<type>(issue-<N>): <concise description>

Implements #<ISSUE_NUMBER>

- <bullet point summary of changes>"
```

Use conventional commit prefixes based on the task type label:
- `task:implementation` -> `feat`
- `task:bug-fix` -> `fix`
- `task:refactor` -> `refactor`
- `task:test-generation` -> `test`
- `task:documentation` -> `docs`

If the task requires multiple logical units of work, make separate commits for each.

### 9. Capture Governance Decision

After commit, capture the governance decision record for audit trail:

```bash
<%= paths.cli %> inspect --last 2>/dev/null
```

This records the governance decisions made during implementation, which will be included in the PR body by the `create-pr` skill.

## Rules

- Do NOT modify files in `packages/kernel/src/**`, `packages/policy/src/**`, or `packages/invariants/src/**` unless the issue explicitly authorizes it
- Do NOT modify `<%= paths.policy %>` or `.claude/settings.json`
- Do NOT use `git add .` or `git add -A` — stage specific files only
- If pre-commit simulation denies a file, do NOT commit it — report the denial
- If you cannot complete the implementation, commit what you have and note incomplete items in the PR body
- Write tests for new functionality when the task type is `task:implementation` or `task:bug-fix`
