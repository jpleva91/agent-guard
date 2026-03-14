# Skill: Run Tests

Run the complete build, test, and verification suite. Every step must pass before creating a pull request.

## Prerequisites

Run `implement-issue` first. Changes must be committed.

## Steps

Run these in sequence. If any step fails, fix and retry before proceeding.

### 1. Build TypeScript

```bash
pnpm build
```

Compiles all workspace packages via Turborepo. If the build fails, read the error output, fix the source files, and rebuild. Do not proceed until the build succeeds.

### 2. Run TypeScript Tests (vitest)

```bash
ppnpm test
```

Report the pass/fail count. If any tests fail:
- If the failure is in code you modified, fix it and re-run
- If the failure is a pre-existing issue unrelated to your changes, note it but proceed
- Re-run after any fix: `ppnpm test`

### 3. Run JavaScript Tests

```bash
pnpm test
```

Report the pass/fail count. Same fix-or-note approach as step 2.

### 4. Run ESLint

```bash
pnpm lint
```

If lint errors exist in files you modified:

```bash
pnpm lint:fix
pnpm lint
```

If errors persist after auto-fix, fix manually.

### 5. Run Prettier Format Check

```bash
pnpm format
```

If formatting issues exist in files you modified:

```bash
pnpm format:fix
pnpm format
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
