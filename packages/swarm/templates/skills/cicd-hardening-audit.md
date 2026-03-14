# Skill: CI/CD Hardening Audit

Audit CI/CD pipeline configuration for security hardening, best practices, and governance integration. Verify that all workflows enforce required checks, use pinned action versions, have proper permissions, and integrate with AgentGuard governance. Designed for weekly scheduled execution.

## Autonomy Directive

This skill runs as an **unattended scheduled task**. No human is present to answer questions.

- **NEVER pause to ask for clarification or confirmation** — make your best judgment and proceed
- **NEVER use AskUserQuestion or any interactive prompt** — all decisions must be made autonomously
- If data is unavailable or ambiguous, proceed with available data and note limitations
- If governance activation fails, log the failure and **STOP**
- If `gh` CLI fails, log the error and **STOP**
- Default to the **safest option** in every ambiguous situation

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Audit Workflow Files

Read all GitHub Actions workflow files:

```bash
ls .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null
```

For each workflow file, check:

#### 2a. Action Version Pinning

```bash
grep -n "uses:" .github/workflows/<file>
```

Flag:
- Actions using `@main` or `@master` instead of a pinned SHA or version tag — **HIGH risk** (supply chain attack vector)
- Actions using floating tags like `@v4` instead of exact versions like `@v4.1.2` — **MEDIUM risk**

#### 2b. Workflow Permissions

```bash
grep -n "permissions:" .github/workflows/<file>
```

Flag:
- Workflows without explicit `permissions:` block — **HIGH risk** (gets default write-all)
- Workflows with `permissions: write-all` — **HIGH risk** (overly permissive)
- Workflows that should use `contents: read` but have `contents: write` — **MEDIUM risk**

#### 2c. Secret Usage

```bash
grep -n "secrets\." .github/workflows/<file>
```

Flag:
- Secrets passed to third-party actions — **MEDIUM risk**
- Secrets used in `run:` steps without environment variable indirection — **LOW risk**

#### 2d. Trigger Configuration

```bash
grep -n "on:" .github/workflows/<file>
```

Flag:
- `pull_request_target` trigger without proper safeguards — **HIGH risk** (can run untrusted code with repo secrets)
- Missing branch protection on push triggers — **MEDIUM risk**

### 3. Check Branch Protection

```bash
gh api repos/{owner}/{repo}/branches/main/protection 2>/dev/null
```

Verify:
- **Required status checks** are configured
- **Required reviews** count is >= 1 (or 0 if fully autonomous — note this)
- **Dismiss stale reviews** is enabled
- **Require up-to-date branches** is enabled
- **Enforce for administrators** is enabled

If branch protection API fails (may require admin access), note "Branch protection: unable to query (may require admin access)" and continue.

### 4. Audit GitHub Actions Security

Check for common CI/CD security issues:

#### 4a. Script Injection

```bash
grep -rn '\${{.*github\.event' .github/workflows/ 2>/dev/null
```

Flag any use of `${{ github.event.* }}` in `run:` steps — **HIGH risk** (script injection via PR titles, comments, etc.)

#### 4b. Artifact Security

```bash
grep -n "actions/upload-artifact\|actions/download-artifact" .github/workflows/*.yml 2>/dev/null
```

Check for:
- Artifacts with sensitive data — **MEDIUM risk**
- Missing artifact retention limits — **LOW risk**

### 5. Check AgentGuard Governance Integration

Verify that CI/CD integrates with AgentGuard governance:

```bash
grep -rn "agentguard" .github/workflows/ 2>/dev/null
```

Check for:
- `agentguard ci-check` in CI workflows — governance verification
- `agentguard evidence-pr` in PR workflows — evidence attachment
- Governance hook configuration in `.claude/settings.json`

Flag:
- CI workflows that modify code without governance — **MEDIUM risk**
- PR workflows that don't attach governance evidence — **LOW risk** (nice-to-have)
- Missing `agentguard-governance.yml` reusable workflow usage — **LOW risk**

### 6. Check Dependency Supply Chain

```bash
grep -rn "npm ci\|npm install\|yarn install\|pnpm install" .github/workflows/ 2>/dev/null
```

Flag:
- `npm install` instead of `npm ci` in CI — **MEDIUM risk** (non-deterministic)
- Missing `--ignore-scripts` flag for untrusted deps — **LOW risk**
- Missing npm provenance in publish workflow — **MEDIUM risk**

### 7. Generate Hardening Report

Compose a structured report in markdown:

**Header**:
- Audit timestamp (UTC)
- Number of workflows analyzed
- Overall hardening score (0-100 based on findings)

**Findings Summary**:
| Severity | Count | Examples |
|----------|-------|----------|
| HIGH | N | <brief list> |
| MEDIUM | N | <brief list> |
| LOW | N | <brief list> |

**Detailed Findings**:
For each finding:
- **Severity**: HIGH / MEDIUM / LOW
- **Category**: action-pinning / permissions / secrets / triggers / branch-protection / script-injection / supply-chain / governance
- **File**: workflow file and line number
- **Description**: What was found
- **Recommendation**: Specific fix
- **Auto-fixable**: Yes / No

**Governance Integration Status**:
| Check | Status |
|-------|--------|
| CI governance verification | Present / Missing |
| PR evidence attachment | Present / Missing |
| Hook configuration | Valid / Missing / Invalid |

**Hardening Score Calculation**:
- Start at 100
- Deduct 15 per HIGH finding
- Deduct 5 per MEDIUM finding
- Deduct 1 per LOW finding
- Minimum score: 0

### 8. Publish Report

Check if a previous hardening report exists:

```bash
gh issue list --state open --label "source:cicd-hardening" --json number --jq '.[0].number'
```

If a previous report exists, close it:

```bash
gh issue close <PREV_NUMBER> --comment "Superseded by new CI/CD hardening audit."
```

Create the new report:

```bash
gh label create "source:cicd-hardening" --color "0E8A16" --description "CI/CD Hardening Audit" 2>/dev/null || true
gh issue create \
  --title "CI/CD Hardening Audit — $(date +%Y-%m-%d)" \
  --body "<hardening report markdown>" \
  --label "source:cicd-hardening" --label "<%= labels.pending %>"
```

### 9. Create Fix Issues for HIGH Findings

For each HIGH severity finding that is auto-fixable, create a targeted fix issue:

```bash
gh issue create \
  --title "fix(ci): <brief description of the finding>" \
  --body "## CI/CD Hardening Fix

- **Severity**: HIGH
- **Finding**: <description>
- **File**: <workflow file>
- **Fix**: <specific change needed>

Discovered by CI/CD Hardening Audit on $(date +%Y-%m-%d).

---
*Auto-created by cicd-hardening-audit skill*" \
  --label "source:cicd-hardening" --label "<%= labels.high %>" --label "task:implementation" --label "<%= labels.pending %>"
```

Cap at **2 fix issues per run**.

### 10. Summary

Report:
- **Workflows audited**: N
- **Hardening score**: N/100
- **HIGH findings**: N
- **MEDIUM findings**: N
- **LOW findings**: N
- **Fix issues created**: N
- **Governance integration**: Complete / Partial / Missing
- **Top concern**: Brief statement of the most critical finding

## Rules

- Create a maximum of **1 hardening report issue per run**
- Create a maximum of **2 fix issues per run**
- **Never modify workflow files directly** — only report findings and create fix issues for the Coder Agent
- **Never close issues** — only close previous hardening report issues labeled `source:cicd-hardening`
- If `gh` CLI is not authenticated, report the error and STOP
- When assessing severity, err on the side of higher severity (flag rather than ignore)
- Always check actual file content — do not assume based on file names alone
