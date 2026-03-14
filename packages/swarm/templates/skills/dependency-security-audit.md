# Skill: Dependency Security Audit

Run security audits on project dependencies, check for known vulnerabilities, identify outdated packages, and review Dependabot alerts. Creates a high-priority issue if critical or high-severity vulnerabilities are found. Designed for periodic scheduled execution.

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance. Also requires `npm` and `gh` CLI.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Run npm Audit

```bash
npm audit --json 2>/dev/null || npm audit 2>/dev/null
```

Parse the output to extract:
- **Total vulnerabilities** by severity (critical, high, moderate, low)
- **Affected packages** and their vulnerable version ranges
- **Fix available**: whether a non-breaking fix exists (`npm audit fix --dry-run`)

If `npm audit` reports 0 vulnerabilities, note "npm audit: clean".

### 3. Check for Outdated Packages

```bash
npm outdated --json 2>/dev/null || npm outdated 2>/dev/null
```

For each outdated package, extract:
- **Package name**
- **Current version** vs **latest version**
- **Update type**: patch, minor, or major (breaking)

Categorize by risk:
- Major version behind on a runtime dependency → **HIGH** risk
- Major version behind on a dev dependency → **MODERATE** risk
- Minor/patch behind → **LOW** risk

### 4. Check Dependabot Alerts

```bash
gh api repos/{owner}/{repo}/dependabot/alerts --jq '[.[] | select(.state=="open")] | length' 2>/dev/null || echo "Dependabot API not available"
```

If alerts are available, list open ones:

```bash
gh api repos/{owner}/{repo}/dependabot/alerts --jq '.[] | select(.state=="open") | {number: .number, package: .security_vulnerability.package.name, severity: .security_vulnerability.severity, summary: .security_advisory.summary}' 2>/dev/null
```

### 5. Check for Known Supply Chain Risks

Review `package-lock.json` for concerning patterns:

```bash
# Check total dependency count
node -e "const lock = require('./package-lock.json'); const deps = Object.keys(lock.packages || {}).filter(k => k !== ''); console.log('Total packages:', deps.length)"

# Check for install scripts (potential supply chain risk)
node -e "const lock = require('./package-lock.json'); const pkgs = lock.packages || {}; Object.entries(pkgs).forEach(([name, info]) => { if (info.hasInstallScript) console.log('Install script:', name) })" 2>/dev/null
```

### 6. Check Fix Availability

For any critical or high vulnerabilities, check if automated fixes are available:

```bash
npm audit fix --dry-run 2>/dev/null
```

Report which vulnerabilities can be auto-fixed and which require manual intervention (breaking changes).

### 7. License Compliance Check

Check licenses of all dependencies for compatibility:

```bash
npx license-checker --json --production 2>/dev/null | head -200
```

If `license-checker` is not available, fall back to manual inspection:

```bash
node -e "
const lock = require('./package-lock.json');
const pkg = require('./package.json');
const deps = Object.keys(pkg.dependencies || {});
deps.forEach(d => {
  try {
    const p = require('./node_modules/' + d + '/package.json');
    console.log(d + ': ' + (p.license || 'UNKNOWN'));
  } catch(e) { console.log(d + ': UNREADABLE'); }
});
"
```

Flag problematic licenses:
- **GPL-2.0, GPL-3.0, AGPL** → **HIGH** risk (copyleft, may require source disclosure)
- **UNKNOWN, UNLICENSED** → **MEDIUM** risk (legal uncertainty)
- **MIT, Apache-2.0, BSD, ISC** → OK (permissive)

### 8. Secret Detection in Configuration

Scan project configuration files for accidentally committed secrets:

```bash
grep -rn "password\|secret\|api.key\|token\|credential" .env* *.yaml *.json --include="*.env" --include="*.yaml" --include="*.json" 2>/dev/null | grep -v "node_modules\|package-lock\|dist" | head -20
```

Also check git history for recently added secrets:

```bash
git log --oneline -20 --diff-filter=A -- "*.env" "*.key" "*.pem" 2>/dev/null
```

Flag:
- Any `.env` files tracked in git → **CRITICAL**
- Any credential-like strings in YAML/JSON config → **HIGH**
- Any key/pem files committed → **CRITICAL**

### 9. Compare with Previous Audit

Check if a previous audit issue exists and compare:

```bash
gh issue list --state all --label "source:security-audit" --json number,title,createdAt --limit 5
```

If a previous audit exists, note:
- **New vulnerabilities** since last audit
- **Resolved vulnerabilities** since last audit
- **Trend**: improving, stable, or degrading

### 10. Generate Report

Compile findings into a structured report:

```
## Dependency Security Audit Report

**Date**: <timestamp>
**Node version**: $(node -v)
**npm version**: $(npm -v)

### Vulnerability Summary

| Severity | Count |
|----------|-------|
| Critical | N |
| High | N |
| Moderate | N |
| Low | N |

### Outdated Packages

| Package | Current | Latest | Type | Risk |
|---------|---------|--------|------|------|
| <name> | <current> | <latest> | <major/minor/patch> | <HIGH/MODERATE/LOW> |

### Dependabot Alerts

| # | Package | Severity | Summary |
|---|---------|----------|---------|
| <N> | <name> | <severity> | <summary> |

### Supply Chain Notes

- Total dependency count: N
- Packages with install scripts: N

### License Compliance

| License | Count | Risk |
|---------|-------|------|
| MIT | N | OK |
| Apache-2.0 | N | OK |
| GPL-* | N | HIGH |
| UNKNOWN | N | MEDIUM |

### Secret Detection

| Finding | File | Severity |
|---------|------|----------|
| <description> | <file> | <CRITICAL/HIGH> |

### Trend (vs. Previous Audit)

- New vulnerabilities: N
- Resolved vulnerabilities: N
- Trend: Improving / Stable / Degrading

### Recommendations

<Actionable remediation steps ranked by severity>
```

### 11. Create or Update Issue (if critical/high found)

If any critical or high-severity vulnerabilities, license issues, or secret detections exist, check for an existing audit issue:

```bash
gh issue list --state open --label "source:security-audit" --json number,title --limit 1
```

Ensure the label exists:

```bash
gh label create "source:security-audit" --color "D93F0B" --description "Auto-created by Dependency Security Audit skill" 2>/dev/null || true
```

If an existing issue is open, update it with the latest findings:

```bash
gh issue comment <ISSUE_NUMBER> --body "<updated audit report>"
```

If no existing issue is open, create one:

```bash
gh issue create \
  --title "security-audit: <N> critical/<N> high vulnerabilities found" \
  --body "<full audit report>" \
  --label "source:security-audit" --label "<%= labels.critical %>"
```

Use `priority:critical` if any critical vulnerabilities or secrets detected, otherwise `priority:high`.

### 12. Summary

Report:
- **Vulnerabilities**: N critical, N high, N moderate, N low
- **Outdated packages**: N (N high-risk)
- **Dependabot alerts**: N open
- **Auto-fixable**: N vulnerabilities
- **License issues**: N (N high-risk copyleft, N unknown)
- **Secrets detected**: N
- **Trend**: improving/stable/degrading vs. previous audit
- **Issue**: created/updated/none needed
- If clean: "No security issues found — dependencies healthy"

## Rules

- **Never run `npm audit fix`** without `--dry-run` — this skill is analysis-only, not remediation
- **Never modify `package.json` or `package-lock.json`** — only read and report
- **Never close existing security issues** — only create new ones or comment on existing open ones
- If `npm audit` fails (no lockfile, network error), report the error and continue with other checks
- If Dependabot API is not available (permissions, not enabled), skip that step and continue
- If no vulnerabilities are found, report "Dependencies healthy" and STOP — do not create an issue
- If `gh` CLI is not authenticated, still generate the report to console but skip issue creation
