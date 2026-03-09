# Skill: Implement Issue

Execute the implementation work described in the claimed GitHub issue. Reads the issue for requirements, respects file scope, follows coding conventions, and commits changes.

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

### 4. Type-Check

```bash
npm run ts:check
```

If type errors exist in files you modified, fix them before proceeding. Do not skip type errors.

### 5. Lint

```bash
npm run lint
```

If lint errors exist in files you modified:

```bash
npm run lint:fix
```

If errors remain after auto-fix, fix them manually.

### 6. Format Check

```bash
npm run format
```

If formatting issues exist in files you modified:

```bash
npm run format:fix
```

### 7. Commit Changes

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

## Rules

- Do NOT modify files in `src/kernel/**`, `src/policy/**`, or `src/invariants/**` unless the issue explicitly authorizes it
- Do NOT modify `agentguard.yaml` or `.claude/settings.json`
- Do NOT use `git add .` or `git add -A` — stage specific files only
- If you cannot complete the implementation, commit what you have and note incomplete items in the PR body
- Write tests for new functionality when the task type is `task:implementation` or `task:bug-fix`
