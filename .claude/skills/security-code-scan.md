# Skill: Security Code Scan

Perform static security analysis on the AgentGuard source code: scan for hardcoded secrets, unsafe patterns, path traversal risks, and input validation gaps. Complements `dependency-security-audit` which focuses on dependencies. Creates an issue if vulnerabilities are found. Designed for periodic scheduled execution.

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active. If governance cannot be activated, STOP.

### 2. Scan for Hardcoded Secrets

Search source files for patterns that indicate hardcoded credentials:

```bash
grep -rn "password\s*=\s*['\"]" src/ --include="*.ts" || true
grep -rn "secret\s*=\s*['\"]" src/ --include="*.ts" || true
grep -rn "api[_-]?key\s*=\s*['\"]" src/ --include="*.ts" || true
grep -rn "token\s*=\s*['\"]" src/ --include="*.ts" || true
grep -rn "Bearer\s" src/ --include="*.ts" || true
grep -rn "-----BEGIN.*PRIVATE KEY" src/ --include="*.ts" || true
```

Also check configuration and example files:

```bash
grep -rn "password\|secret\|api.key\|token" examples/ --include="*.ts" --include="*.json" --include="*.yaml" || true
```

Exclude false positives: references in type definitions, test fixtures with obvious dummy values, documentation strings.

### 3. Scan for Unsafe Code Patterns

Check for dangerous JavaScript/TypeScript patterns:

```bash
# eval and Function constructor — arbitrary code execution
grep -rn "eval(" src/ --include="*.ts" || true
grep -rn "new Function(" src/ --include="*.ts" || true

# Dynamic require — potential code injection
grep -rn "require(" src/ --include="*.ts" | grep -v "import" || true

# Shell command construction — command injection risk
grep -rn "exec(\|execSync(\|spawn(\|spawnSync(" src/ --include="*.ts" || true

# Template literals in shell commands — injection risk
grep -rn "exec\`\|execSync\`" src/ --include="*.ts" || true
```

For each shell execution found, verify:
- Is the command string constructed from user/agent input?
- Is the input sanitized before interpolation?
- Could a malicious tool call inject shell metacharacters?

### 4. Scan for Path Traversal Risks

Check file adapter and filesystem operations for path traversal:

```bash
grep -rn "path.join\|path.resolve\|readFile\|writeFile\|readdir\|mkdir\|unlink\|rmdir" src/ --include="*.ts" || true
```

For each filesystem operation found, verify:
- Is the path validated against a whitelist or base directory?
- Could `../` sequences escape the intended directory?
- Is `path.normalize()` used before path comparison?

Focus particularly on:
- `src/adapters/file.ts` — file adapter handles file.read, file.write, file.delete
- `src/kernel/aab.ts` — AAB normalizes paths from agent input
- `src/cli/` — CLI commands accept user-provided paths

### 5. Scan for Input Validation Gaps

Check system boundaries where external data enters:

```bash
# JSON parsing without try/catch
grep -rn "JSON.parse(" src/ --include="*.ts" || true

# stdin/process.argv handling
grep -rn "process.stdin\|process.argv" src/ --include="*.ts" || true

# File content used without validation
grep -rn "readFileSync\|readFile" src/ --include="*.ts" || true
```

For each entry point, verify:
- Is JSON parsing wrapped in try/catch?
- Are CLI arguments validated before use?
- Are file contents validated against expected schemas?

### 6. Check for Information Disclosure

```bash
# Stack traces exposed to output
grep -rn "console.error(.*err\|console.log(.*stack" src/ --include="*.ts" || true

# Verbose error messages that could leak internals
grep -rn "throw new Error(" src/ --include="*.ts" | head -20
```

### 7. Generate Security Report

Compile findings:

```
## Security Code Scan Report

**Date**: <timestamp>
**Files scanned**: N

### Findings Summary

| Category | Count | Severity |
|----------|-------|----------|
| Hardcoded secrets | N | CRITICAL |
| Unsafe code patterns | N | HIGH |
| Path traversal risks | N | HIGH |
| Input validation gaps | N | MEDIUM |
| Information disclosure | N | LOW |

### Detailed Findings

#### <Category>

| # | Severity | File:Line | Pattern | Risk | Recommendation |
|---|----------|-----------|---------|------|----------------|
| 1 | <level> | <file>:<line> | <code snippet> | <description> | <fix> |

### Recommendations

<Prioritized list of remediation actions>
```

### 8. Create or Update Issue (if findings exist)

Check for an existing security scan issue:

```bash
gh issue list --state open --label "source:security-scan" --json number,title --limit 1
```

Ensure labels exist:

```bash
gh label create "source:security-scan" --color "D93F0B" --description "Auto-created by Security Code Scan skill" 2>/dev/null || true
```

If critical or high findings exist, create or update an issue:

```bash
gh issue create \
  --title "security-scan: <N> findings (<severity summary>)" \
  --body "<full security report>" \
  --label "source:security-scan" --label "priority:high"
```

### 9. Summary

Report:
- **Files scanned**: N
- **Findings**: N critical, N high, N medium, N low
- **Issue**: created/updated/none needed
- If clean: "No security issues found in source code"

## Rules

- **Never modify source code** — only read and report.
- **Never close existing security issues** — only create new ones or comment on existing.
- Exclude false positives: type definitions, test fixtures with dummy values, documentation.
- Focus on the `src/` directory — do not scan `node_modules/`, `dist/`, or `.git/`.
- Cap detailed findings at 20 items per category to keep reports actionable.
- If `gh` CLI is not authenticated, still generate the report to console but skip issue creation.
- Differentiate from `dependency-security-audit` — this skill scans SOURCE CODE, not dependencies.
