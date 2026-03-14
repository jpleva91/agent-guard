# Skill: Full Test

Run the complete build, type-check, test, lint, format, and coverage verification suite. This is the comprehensive "is everything OK?" check for the AgentGuard codebase.

## Steps

Run these in sequence. If any step fails, stop and analyze before proceeding.

### 1. Build TypeScript

```bash
pnpm build
```

Compiles all workspace packages via Turborepo. Report build success or failure with error details.

### 2. Type-Check

```bash
pnpm ts:check
```

Runs `tsc --noEmit` for strict type verification. Report any type errors with file:line references.

### 3. Run TypeScript Tests (vitest)

```bash
ppnpm test
```

Report pass/fail count. If tests fail, note the failing test names and error messages.

### 4. Run JavaScript Tests

```bash
pnpm test
```

Report pass/fail count. These use the custom zero-dependency harness in `tests/run.js`.

### 5. Run ESLint

```bash
pnpm lint
```

Report any lint errors with file:line references.

### 6. Run Prettier Format Check

```bash
pnpm format
```

Report any formatting issues.

### 7. Run Coverage Check

```bash
pnpm test:coverage
```

Report line coverage percentage. The project threshold is 50% line coverage.

### 8. Summary

Provide a structured pass/fail summary:

```
## Full Test Report

| Check | Status | Details |
|-------|--------|---------|
| Build | PASS/FAIL | <error count or clean> |
| Type-check | PASS/FAIL | <error count or clean> |
| TS tests (vitest) | PASS/FAIL | <X pass / Y fail> |
| JS tests | PASS/FAIL | <X pass / Y fail> |
| Lint | PASS/FAIL | <error count or clean> |
| Format | PASS/FAIL | <issue count or clean> |
| Coverage | PASS/FAIL | <X% lines (threshold: 50%)> |
```

One-line verdict:
- **All clear**: "All 7 checks passed — codebase healthy"
- **Issues found**: "N/7 checks failed — see details above"

## Rules

- **Read-only** — do not fix, modify, or commit anything. This skill only reports.
- Run all steps even if earlier steps fail — report the full picture.
- If a command times out (>2 minutes), note the timeout and continue.
- If `node_modules` is missing, run `pnpm install` first, then proceed.
