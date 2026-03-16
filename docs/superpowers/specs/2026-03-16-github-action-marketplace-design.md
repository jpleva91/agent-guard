# GitHub Action Marketplace — AgentGuard Governance Action

**Date:** 2026-03-16
**Status:** Design approved
**Author:** Claude (brainstorming session)

## Problem

AgentGuard has a fully-featured governance runtime, CI check command, and evidence reporting — but no discoverable distribution surface. The reusable workflow (`agentguard-governance.yml`) requires manual wiring. A marketplace GitHub Action with `uses: red-codes/agentguard-action@v1` is the highest-leverage move to turn every GitHub repo into a potential installation vector.

## Decision

**Composite GitHub Action** (Approach A) — thin orchestration shell that installs the published `@red-codes/agentguard` CLI and delegates to `ci-check` + `evidence-pr`. Enhanced PR comment report for viral visibility.

### Why composite over JS action or Docker action

- **Composite:** Minimal new code, reuses existing CLI, ships fast. ~90% of value in ~20% of effort.
- **JS action:** Native Check Runs API, inline PR comments — but duplicates CLI logic, heavier maintenance. Future upgrade path.
- **Docker:** Hermetic but slow cold start (~30s), Linux-only. Overkill.

## OSS vs Cloud Boundary

### OSS repo (`agent-guard`)

- GitHub Action (`apps/github-action/`)
- Enhanced PR comment report (markdown generation, risk scoring)
- `ci-check`, `evidence-pr` CLI commands
- Policy evaluation, invariant checking, blast radius
- Session export/import (JSONL)
- Reusable workflow
- Static repo badge

### Cloud repo (`agentguard-cloud`)

- GitHub App (OAuth, webhooks, org-wide installation)
- Cross-repo governance dashboard
- Org-level policy management & central reporting
- AI usage audit analytics
- Dynamic badge service (server-rendered)
- Telemetry aggregation
- Billing/licensing

**Principle:** What runs in your CI and produces a local report = OSS. What aggregates, dashboards, and manages at org scale = cloud/paid.

## User-Facing API

```yaml
# .github/workflows/governance.yml
name: AgentGuard Governance
on: [pull_request]

jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: red-codes/agentguard-action@v1
        with:
          policy: agentguard.yaml
          fail-on-violation: true
          fail-on-denial: false
          post-report: true
          session-file: ''
          agentguard-version: 'latest'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `policy` | string | `agentguard.yaml` | Path to policy file (YAML or JSON) |
| `fail-on-violation` | boolean | `true` | Exit 1 on invariant violations |
| `fail-on-denial` | boolean | `false` | Exit 1 on denied actions |
| `post-report` | boolean | `true` | Post governance report as PR comment |
| `session-file` | string | `''` | Explicit session file path (auto-detects if empty) |
| `agentguard-version` | string | `latest` | CLI version to install |

### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `result` | string | `pass` or `fail` |
| `total-actions` | number | Total governed actions |
| `allowed` | number | Actions allowed |
| `denied` | number | Actions denied |
| `violations` | number | Invariant violations |
| `risk-level` | string | `low`, `medium`, `high`, or `critical` |
| `report-url` | string | URL to PR comment (if posted) |

## Internal Flow

```
action.yml (composite)
  ├── Step 1: Setup Node.js 20
  ├── Step 2: Install @red-codes/agentguard@version
  ├── Step 3: Validate policy file exists
  ├── Step 4: Run agentguard ci-check --json → governance-result.json
  ├── Step 5: Generate enhanced PR report (formatGitHubReport)
  ├── Step 6: Post PR comment via gh CLI (GITHUB_TOKEN)
  ├── Step 7: Set outputs from governance-result.json
  └── Step 8: Upload session artifact
```

## Enhanced PR Report

### Passed variant

```markdown
## 🛡 AgentGuard Governance Report

**Verdict: ✅ PASSED** | Risk: 🟢 LOW | Escalation: NORMAL

| Metric | Value |
|--------|-------|
| Actions governed | 14 |
| Allowed | 13 |
| Denied | 1 |
| Invariant violations | 0 |
| Blast radius | 3.2 (low) |

<details>
<summary>📊 Action Breakdown</summary>

| Action Type | Allowed | Denied |
|-------------|---------|--------|
| file.write | 8 | 0 |
| shell.exec | 3 | 1 |
| git.commit | 2 | 0 |

</details>

<details>
<summary>🚫 Denied Actions (1)</summary>

- **shell.exec** `rm -rf /tmp/*` — *matched rule: no-destructive-shell (severity: 8)*

</details>

<details>
<summary>📋 Policy Trace</summary>

Policy: `agentguard.yaml` (12 rules evaluated)
Invariants: 20 checked, 0 violated

</details>

---
<sub>🛡 Protected by <a href="https://github.com/red-codes/agent-guard">AgentGuard</a> · governance runtime for AI coding agents</sub>
```

### Failed variant

```markdown
## 🛡 AgentGuard Governance Report

**Verdict: ❌ FAILED** | Risk: 🔴 HIGH | Escalation: ELEVATED

⚠️ **2 invariant violations detected:**
- Secret exposure detected in `config/keys.json`
- Blast radius exceeded: 47 files affected (threshold: 25)

| Metric | Value |
|--------|-------|
| Actions governed | 23 |
| Allowed | 18 |
| Denied | 5 |
| Invariant violations | 2 |
| Blast radius | 47.0 (high) |

...
```

### Design decisions

1. **Verdict banner at top** — scannable pass/fail in 1 second
2. **Risk level with color emoji** — 🟢 LOW, 🟡 MEDIUM, 🔴 HIGH, ⛔ CRITICAL (maps to blast radius scoring)
3. **Collapsed details** — Clean by default, expandable for investigation
4. **Denial details include the matched rule** — Shows the policy is working, not just blocking
5. **Footer with link** — Every report is a referral to the repo
6. **Comment replacement** — Uses `<!-- agentguard-governance-report -->` marker to update in place

## File Structure

```
apps/github-action/
├── action.yml              # Composite action definition (marketplace entry point)
├── README.md               # Marketplace listing page
└── scripts/
    └── run.sh              # Main orchestration script (called by action.yml)
```

### Changes to existing files

- `apps/cli/src/evidence-summary.ts` — Add `formatGitHubReport()` alongside existing `formatEvidenceMarkdown()`
- `.github/workflows/` — Add `release-action.yml` workflow

### No new packages, no new dependencies

The action is a thin shell that delegates to the published CLI.

## Release & Marketplace Publishing

### Release flow

1. Tag `agentguard-action-v1.x.x` in this monorepo
2. `release-action.yml` triggers → copies `apps/github-action/*` to `red-codes/agentguard-action` repo
3. Creates matching tag in that repo
4. GitHub Marketplace picks up `action.yml` from repo root

### Version strategy

Major version tag (`v1`) that floats, plus pinnable semver tags (`v1.0.0`, `v1.1.0`). Standard marketplace convention.

## Testing

- **Unit test** for `formatGitHubReport()` in `apps/cli/tests/evidence-summary.test.ts`
- **Integration test:** Run the action script against a fixture session JSONL, verify JSON output and markdown
- **Existing coverage:** `cli-ci-check.test.ts` and `cli-evidence-pr.test.ts` cover the CLI layer

## Roadmap (not in this build)

| Item | Location | Tier |
|------|----------|------|
| Copilot CLI safety wrapper | OSS | Tier 1 follow-up |
| Inline PR review comments on specific lines | OSS (JS action upgrade) | Tier 2 |
| GitHub App with OAuth | Cloud | Tier 2 |
| Check Runs API integration | OSS (JS action upgrade) | Tier 2 |
| Dynamic badge service | Cloud | Tier 3 |
| AI usage audit report | Cloud | Tier 3 |
| Cross-repo governance dashboard | Cloud | Tier 3 |

## Success Criteria

1. Any GitHub repo can add governance with a 5-line workflow file
2. PR comments are visually compelling and informative
3. Action passes/fails CI based on governance results
4. Session artifacts are downloadable for audit
5. Zero new runtime dependencies beyond the existing CLI
