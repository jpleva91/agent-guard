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

## Scope

- GitHub Action (`apps/github-action/`)
- Enhanced PR comment report (markdown generation, risk scoring)
- `ci-check`, `evidence-pr` CLI commands
- Policy evaluation, invariant checking, blast radius
- Session export/import (JSONL)
- Reusable workflow
- Static repo badge

## User-Facing API

```yaml
# .github/workflows/governance.yml
name: AgentGuard Governance
on: [pull_request]

permissions:
  contents: read
  pull-requests: write

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
| `risk-level` | string | `low`, `medium`, or `high` (session-level aggregate) |

### Session Data: Where It Comes From

The action consumes governance session data produced by a prior AgentGuard-governed agent run. Three supported scenarios:

1. **Committed `.agentguard/` directory** — If the AI agent was governed by AgentGuard during development, the `.agentguard/events/*.jsonl` files are committed to the branch. The action auto-detects them.
2. **Explicit session file** — A previously exported `.agentguard.jsonl` file passed via the `session-file` input. Useful when session data is produced by a separate CI step.
3. **Scan-only mode** — If no session data exists, the action runs policy validation only (validates the policy file, reports invariant definitions, exits cleanly). This is still useful as a "policy health check."

The action detects the scenario automatically: if `session-file` is set, use it. Otherwise, check for `.agentguard/events/` directory. If neither exists, fall back to scan-only mode.

### Known Limitations

- **Fork PRs:** The default `GITHUB_TOKEN` on `pull_request` from forks has read-only permissions. PR comment posting will emit a `::warning::` annotation and skip on fork PRs (the CI check still runs and reports via annotations).
- **OS support:** v1 targets `ubuntu-latest` only. `macos-latest` and `windows-latest` are untested.

## Internal Flow

```
action.yml (composite)
  Step 1: Setup Node.js 20
  Step 2: Install @red-codes/agentguard@version (with npm cache)
  Step 3: Validate policy file exists (warn if missing, continue)
  Step 4: Detect session source (file, .agentguard/, or scan-only)
  Step 5: Run agentguard ci-check --json --enhanced -> governance-result.json
  Step 6: Post PR comment via gh CLI (if post-report=true and in PR context)
  Step 7: Set outputs from governance-result.json
  Step 8: Upload session artifact
```

### Shell security requirements for `run.sh`

The orchestration script uses `set -euo pipefail`. All user-supplied inputs (`session-file`, `policy`, `agentguard-version`) arrive as environment variables (`$INPUT_SESSION_FILE`, `$INPUT_POLICY`, `$INPUT_AGENTGUARD_VERSION`). Implementation requirements:

- **Double-quote all interpolated inputs**: `"$INPUT_SESSION_FILE"`, `"$INPUT_POLICY"`, `"$INPUT_AGENTGUARD_VERSION"`
- **Use `--` to terminate option parsing** before positional arguments: `agentguard ci-check -- "$INPUT_SESSION_FILE"`
- Avoids shell injection via whitespace splitting and glob expansion in input values

### Error handling

The orchestration script uses `set -euo pipefail`. Step-level behavior:
- Step 2 (install) failure -> action fails immediately
- Step 3 (policy validation) -> warning annotation, continues with default policy
- Step 4 (session detection) -> falls back to scan-only mode
- Step 5 (ci-check) -> exit code determines pass/fail output
- Step 6 (PR comment) -> failure is non-fatal (warning annotation), CI result still reported via exit code
- Step 8 (artifact upload) -> failure is non-fatal

## Enhanced PR Report

### Session-level risk aggregation

The `risk-level` is computed from the `EvidenceSummary` fields as a new `computeSessionRiskLevel()` function:

```typescript
export function computeSessionRiskLevel(summary: EvidenceSummary): 'low' | 'medium' | 'high' {
  if (summary.invariantViolations > 0 || summary.maxEscalationLevel === 'LOCKDOWN') return 'high';
  if (summary.actionsDenied > 2 || summary.blastRadiusExceeded > 0 || summary.maxEscalationLevel === 'HIGH') return 'medium';
  return 'low';
}
// Threshold rationale: actionsDenied > 2 is the medium threshold because 1-2 denials is normal
// (policy working as intended), while 3+ suggests the agent is repeatedly probing boundaries.
// This threshold is intentionally not configurable in v1 — add to GitHubReportOptions if
// callers need different sensitivity.
```

Risk level emoji mapping: LOW=green, MEDIUM=yellow, HIGH=red.

### `EvidenceSummary` location

`EvidenceSummary` lives in `apps/cli/src/evidence-summary.ts` (not in `@red-codes/events` or `@red-codes/core`). This is appropriate for v1: the action interacts via CLI JSON output, so no consumer outside `apps/cli` needs the type directly. If a future JS action or external consumer needs it, migration to `@red-codes/core` is the path.

### `formatGitHubReport()` function signature

Added to `evidence-summary.ts` alongside existing `formatEvidenceMarkdown()`:

```typescript
export interface GitHubReportOptions {
  artifactUrl?: string;
  policyName?: string;
  rulesEvaluated?: number;
  invariantsChecked?: number;
}

export function formatGitHubReport(
  summary: EvidenceSummary,
  riskLevel: 'low' | 'medium' | 'high',
  options?: GitHubReportOptions
): string;
```

### Comment marker unification

The new report uses the **existing** marker: `<!-- agentguard-evidence-report -->`. This ensures the action's report replaces any prior report from `ci-check --post-evidence` or `evidence-pr`, avoiding duplicate comments. The existing `ci-check.ts` and `evidence-pr.ts` already use this marker.

### Passed variant

```markdown
<!-- agentguard-evidence-report -->
## AgentGuard Governance Report

**Verdict: PASSED** | Risk: LOW | Escalation: NORMAL

| Metric | Value |
|--------|-------|
| Actions governed | 14 |
| Allowed | 13 |
| Denied | 1 |
| Invariant violations | 0 |
| Blast radius exceeded | 0 |

<details>
<summary>Action Breakdown</summary>

| Action Type | Allowed | Denied |
|-------------|---------|--------|
| file.write | 8 | 0 |
| shell.exec | 3 | 1 |
| git.commit | 2 | 0 |

</details>

<details>
<summary>Denied Actions (1)</summary>

- **shell.exec** `rm -rf /tmp/*` -- matched rule: no-destructive-shell (severity: 8)

</details>

<details>
<summary>Policy Trace</summary>

Policy: `agentguard.yaml` (12 rules evaluated)
Invariants: 20 checked, 0 violated

</details>

---
Protected by [AgentGuard](https://github.com/red-codes/agent-guard) -- governance runtime for AI coding agents
```

### Failed variant

```markdown
<!-- agentguard-evidence-report -->
## AgentGuard Governance Report

**Verdict: FAILED** | Risk: HIGH | Escalation: ELEVATED

**2 invariant violations detected:**
- Secret exposure detected in `config/keys.json`
- Blast radius exceeded: 47 files affected (threshold: 25)

| Metric | Value |
|--------|-------|
| Actions governed | 23 |
| Allowed | 18 |
| Denied | 5 |
| Invariant violations | 2 |
| Blast radius exceeded | 1 |

...
```

### Design decisions

1. **Verdict banner at top** -- scannable pass/fail in 1 second
2. **Risk level with color indicator** -- LOW, MEDIUM, HIGH (maps to session-level risk aggregation from blast radius + violations + escalation)
3. **Collapsed details** -- Clean by default, expandable for investigation
4. **Denial details include the matched rule** -- Shows the policy is working, not just blocking
5. **Footer with link** -- Every report is a referral to the repo
6. **Unified comment marker** -- Uses existing `<!-- agentguard-evidence-report -->` to replace prior reports

## Enhancing `ci-check --json` output

The existing `CiCheckResult` lacks fields needed for the enhanced report (action type breakdown, blast radius count, escalation level, denial details with rule names). Rather than adding a separate aggregation step, enhance `ci-check` to accept an `--enhanced` flag that outputs a richer JSON:

```typescript
export interface EnhancedCiCheckResult extends CiCheckResult {
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly maxEscalationLevel: string;
  readonly blastRadiusExceeded: number;
  readonly actionTypeBreakdown: Record<string, { allowed: number; denied: number }>;
  readonly violationDetails: readonly string[];
  readonly policyDenials: number;
  readonly evidencePacksGenerated: number;
}
```

When `--enhanced` is passed, `ci-check` builds an `EvidenceSummary` internally and serializes the full result. This keeps the existing `--json` output backward-compatible.

## PR Comment Utility Extraction

The duplicated PR comment logic across `ci-check.ts` and `evidence-pr.ts` (detect PR number, find/replace comments by marker, post via `gh`) will be extracted into a shared utility:

```typescript
// apps/cli/src/pr-comment.ts
export const COMMENT_MARKER = '<!-- agentguard-evidence-report -->';

export function detectPrNumber(): string | null;
export function postPrComment(prNumber: string, body: string): boolean;
export function replacePrComment(prNumber: string, body: string, marker: string): boolean;
```

Note: PR numbers are `string` throughout the existing codebase (`ci-check.ts:190`, `evidence-pr.ts:25`, `evidence-pr.ts:39`). They are validated with `/^\d+$/` and interpolated directly into `gh` CLI commands — using `number` would require `.toString()` conversions at every call site.

`replacePrComment` is the **primary API** (marker-based upsert: find existing comment by marker → delete → repost). `postPrComment` is the low-level helper used internally by `replacePrComment`. Existing callers in `ci-check.ts` and `evidence-pr.ts` both do the delete-then-repost pattern; `replacePrComment` canonicalizes that behavior.

Note: The existing codebase uses `execSync` for `gh` CLI calls. The `pr-comment.ts` utility follows this pattern. The security hook recommends `execFileNoThrow` for user-controlled input, but these calls use only internally-constructed arguments (PR numbers, static markers). Implementation should use `execFileSync` where feasible for defense-in-depth.

Both `ci-check.ts` and `evidence-pr.ts` will be refactored to use this utility. The action's `run.sh` script invokes `ci-check --enhanced --post-evidence` which delegates to this same utility.

## File Structure

```
apps/github-action/
  action.yml              # Composite action definition (marketplace entry point)
  README.md               # Marketplace listing page
  scripts/
    run.sh                # Main orchestration script (set -euo pipefail)
```

### Changes to existing files

- `apps/cli/src/evidence-summary.ts` -- Add `computeSessionRiskLevel()` and `formatGitHubReport()`
- `apps/cli/src/pr-comment.ts` -- New shared PR comment utility (extracted from ci-check + evidence-pr)
- `apps/cli/src/commands/ci-check.ts` -- Add `--enhanced` flag, use `pr-comment.ts` utility
- `apps/cli/src/commands/evidence-pr.ts` -- Use `pr-comment.ts` utility (refactor only, no behavior change)
- `.github/workflows/release-action.yml` -- New workflow for publishing to marketplace repo

### `action.yml` branding

```yaml
branding:
  icon: 'shield'
  color: 'red'
```

### No new packages, no new npm dependencies

The action is a thin shell that delegates to the published CLI. The `pr-comment.ts` utility uses only `child_process` (existing pattern).

## Release & Marketplace Publishing

### Release flow

1. Tag `agentguard-action-v1.x.x` in this monorepo
2. `release-action.yml` triggers on tags matching `agentguard-action-v*`
3. Workflow copies `apps/github-action/*` to `red-codes/agentguard-action` repo using a PAT
4. Creates matching semver tag + floating `v1` major version tag in the target repo
5. GitHub Marketplace picks up `action.yml` from the target repo root

### `release-action.yml` sketch

```yaml
name: Publish GitHub Action
on:
  push:
    tags: ['agentguard-action-v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Extract version from tag
        id: version
        run: echo "version=${GITHUB_REF_NAME#agentguard-action-}" >> "$GITHUB_OUTPUT"

      - name: Clone target repo
        run: |
          git clone https://x-access-token:${{ secrets.ACTION_REPO_PAT }}@github.com/red-codes/agentguard-action.git target

      - name: Copy action files
        run: |
          cp -r apps/github-action/* target/
          cd target
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A
          git commit -m "Release ${{ steps.version.outputs.version }}"

      - name: Push and tag
        run: |
          cd target
          git tag "${{ steps.version.outputs.version }}"
          git tag -f v1
          git push origin main
          git push origin "${{ steps.version.outputs.version }}"  # immutable semver tag — never force
          git push origin v1 --force                              # floating major tag only
```

### Requirements

- `ACTION_REPO_PAT` secret: PAT with `repo` scope for `red-codes/agentguard-action`
- Target repo `red-codes/agentguard-action` must exist (created once, manually)

### Failure recovery

If the workflow fails mid-flight (e.g., push succeeds but tag fails), re-running the workflow is idempotent -- it overwrites files and force-updates tags. No manual reconciliation needed.

### Version strategy

Major version tag (`v1`) that floats, plus pinnable semver tags (`v1.0.0`, `v1.1.0`). Standard marketplace convention.

## Testing

- **Unit test** for `computeSessionRiskLevel()` in `apps/cli/tests/evidence-summary.test.ts`
- **Unit test** for `formatGitHubReport()` in `apps/cli/tests/evidence-summary.test.ts`
- **Unit test** for `pr-comment.ts` utilities (mocked subprocess calls)
- **Integration test:** Run `run.sh` against a fixture session JSONL, verify JSON output and markdown
- **Existing coverage:** `cli-ci-check.test.ts` and `cli-evidence-pr.test.ts` cover the CLI layer (update to use new `pr-comment.ts`)

## Roadmap (not in this build)

| Item | Repo | Tier | Label |
|------|------|------|-------|
| Copilot CLI safety wrapper | `agent-guard` (OSS) | Tier 1 follow-up | |
| Inline PR review comments on specific lines | `agent-guard` (OSS) -- JS action upgrade | Tier 2 | |
| Check Runs API integration | `agent-guard` (OSS) -- JS action upgrade | Tier 2 | |

## Success Criteria

1. Any GitHub repo can add governance with a 5-line workflow file
2. PR comments are visually compelling and informative
3. Action passes/fails CI based on governance results
4. Session artifacts are downloadable for audit
5. Zero new runtime dependencies beyond the existing CLI
6. Scan-only mode works gracefully when no session data exists
