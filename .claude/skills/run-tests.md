# Skill: Run Tests

Run the complete build, test, and verification suite. Every step must pass before creating a pull request.

## Prerequisites

Run `implement-issue` first. Changes must be committed.

## Steps

Run these in sequence. If any step fails, fix and retry before proceeding.

### 1. Build TypeScript

```bash
npm run build:ts
```

Compiles TypeScript via tsc + esbuild to `dist/`. If the build fails, read the error output, fix the source files, and rebuild. Do not proceed until the build succeeds.

### 2. Run TypeScript Tests (vitest)

```bash
npm run ts:test
```

Report the pass/fail count. If any tests fail:
- If the failure is in code you modified, fix it and re-run
- If the failure is a pre-existing issue unrelated to your changes, note it but proceed
- Re-run after any fix: `npm run ts:test`

### 3. Run JavaScript Tests

```bash
npm test
```

Report the pass/fail count. Same fix-or-note approach as step 2.

### 4. Run ESLint

```bash
npm run lint
```

If lint errors exist in files you modified:

```bash
npm run lint:fix
npm run lint
```

If errors persist after auto-fix, fix manually.

### 5. Run Prettier Format Check

```bash
npm run format
```

If formatting issues exist in files you modified:

```bash
npm run format:fix
npm run format
```

### 6. Commit Fixes

If steps 1-5 required any fixes, stage and commit them:

```bash
git add <fixed-files>
git commit -m "fix(issue-<N>): address test/lint/format issues"
```

### 7. Summary

Provide a one-line pass/fail summary:

- **All clear**: "Build OK, Tests: X pass / 0 fail, Lint: clean, Format: clean"
- **Issues found**: "Build: pass/fail | Tests: X pass / Y fail | Lint: N errors | Format: N issues"

## Rules

- ALL steps must pass before proceeding to `create-pr`
- If tests fail and you cannot fix them after 2 attempts, STOP and report the failure
- Do not skip any step
- Pre-existing failures unrelated to your changes should be noted but do not block the PR
