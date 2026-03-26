# Workspace Config Validation — 2026-03-26

**Schedule agents:** 118 enabled, 2 disabled
**Registry agents:** 78
**Overall:** FAIL

## Schedule Structure

| Field | Value | Status |
|-------|-------|--------|
| max_workers | 32 | PASS |
| default_timeout_seconds | 900 | PASS |
| agents count | 120 | PASS |
| All agents valid schema | yes | PASS |
| All cron expressions 5-field | yes | PASS |

## Schedule ↔ SKILL.md

| Agent | Enabled | SKILL.md | Status |
|-------|---------|----------|--------|
| director | yes | MISSING | FAIL |
| kernel-em | yes | OK | PASS |
| kernel-sr | yes | OK | PASS |
| kernel-qa | yes | OK | PASS |
| triage-failing-ci-agent | yes | OK | PASS |
| agentguard-autonomous-sdlc--coder-agent | yes | OK | PASS |
| agentguard-autonomous-sdlc--code-review-agent | yes | OK | PASS |
| architect-agent | yes | OK | PASS |
| resolve-merge-conflicts | yes | OK | PASS |
| pr-merger-agent | yes | OK | PASS |
| respond-to-pr-reviews | yes | OK | PASS |
| backlog-steward-agent | yes | OK | PASS |
| documentation-maintainer-agent | yes | OK | PASS |
| agentguard-autonomous-sdlc--documentation-maintainer-agent | yes | OK | PASS |
| governance-monitor-agent | yes | OK | PASS |
| agentguard-autonomous-sdlc--governance-monitor-agent | yes | OK | PASS |
| infrastructure-health-agent | yes | OK | PASS |
| observability-agent | yes | OK | PASS |
| repo-hygiene-agent | yes | OK | PASS |
| stale-branch-janitor | yes | OK | PASS |
| test-agent | yes | OK | PASS |
| swarm-health-agent | yes | MISSING | FAIL |
| tier-c-copilot-implementer-oss | yes | OK | PASS |
| copilot-test-writer-oss | yes | OK | PASS |
| copilot-docs-sync | yes | OK | PASS |
| audit-merged-prs | yes | OK | PASS |
| cicd-hardening-agent | yes | OK | PASS |
| security-audit-agent | yes | OK | PASS |
| test-generation-agent | yes | OK | PASS |
| policy-effectiveness-agent | no | — | SKIP |
| security-code-scan-agent | no | — | SKIP |
| cloud-em | yes | MISSING | FAIL |
| cloud-sr | yes | MISSING | FAIL |
| cloud-qa | yes | MISSING | FAIL |
| ci-triage-agent-cloud | yes | OK | PASS |
| coder-agent-cloud | yes | OK | PASS |
| code-review-agent-cloud | yes | OK | PASS |
| architect-agent-cloud | yes | OK | PASS |
| tier-a-architect-review | yes | OK | PASS |
| tier-b-senior-review | yes | OK | PASS |
| merge-conflict-resolver-cloud | yes | OK | PASS |
| pr-merger-agent-cloud | yes | OK | PASS |
| pr-review-responder-cloud | yes | OK | PASS |
| backlog-steward-cloud | yes | OK | PASS |
| docs-sync-agent-cloud | yes | OK | PASS |
| governance-monitor-cloud | yes | OK | PASS |
| infrastructure-health-agent-cloud | yes | OK | PASS |
| observability-agent-cloud | yes | OK | PASS |
| onboarding-monitor-agent | yes | MISSING | FAIL |
| repo-hygiene-agent-cloud | yes | OK | PASS |
| stale-branch-janitor-cloud | yes | OK | PASS |
| test-agent-cloud | yes | OK | PASS |
| tier-c-copilot-implementer | yes | OK | PASS |
| copilot-test-writer | yes | OK | PASS |
| copilot-pr-fixer | yes | OK | PASS |
| cloud-qa-smoke-runner | yes | OK | PASS |
| cloud-qa-test-architect | yes | OK | PASS |
| cloud-qa-backlog-steward | yes | OK | PASS |
| cloud-qa-coder-agent | yes | OK | PASS |
| cloud-qa-regression-analyzer | yes | OK | PASS |
| audit-merged-prs-cloud | yes | OK | PASS |
| cicd-hardening-agent-cloud | yes | OK | PASS |
| security-audit-agent-cloud | yes | OK | PASS |
| test-generation-agent-cloud | yes | OK | PASS |
| hq-em | yes | MISSING | FAIL |
| planning-agent | yes | OK | PASS |
| planning-agent-cloud | yes | OK | PASS |
| product-agent | yes | OK | PASS |
| product-agent-cloud | yes | OK | PASS |
| progress-controller-agent | yes | OK | PASS |
| progress-controller-cloud | yes | OK | PASS |
| recovery-controller-agent | yes | OK | PASS |
| recovery-controller-cloud | yes | OK | PASS |
| risk-escalation-agent | yes | OK | PASS |
| risk-escalation-agent-cloud | yes | OK | PASS |
| backlog-hygiene--roadmap-triage-agent | yes | OK | PASS |
| workspace-backlog-steward | yes | MISSING | FAIL |
| retrospective-agent | yes | OK | PASS |
| retrospective-agent-cloud | yes | OK | PASS |
| rollout-canary-validator | yes | OK | PASS |
| analytics-em | yes | MISSING | FAIL |
| analytics-pipeline | yes | MISSING | FAIL |
| analytics-reporter | yes | MISSING | FAIL |
| analytics-invariant-researcher | yes | MISSING | FAIL |
| analytics-pr-review-agent | yes | MISSING | FAIL |
| studio-em | yes | OK | PASS |
| studio-sr | yes | OK | PASS |
| studio-jr | yes | OK | PASS |
| studio-qa | yes | OK | PASS |
| studio-product | yes | OK | PASS |
| studio-designer | yes | OK | PASS |
| workspace-config-validator | yes | OK | PASS |
| workspace-agent-reliability | yes | OK | PASS |
| workspace-pr-review-agent | yes | OK | PASS |
| qa-em | yes | MISSING | FAIL |
| qa-smoke-runner | yes | OK | PASS |
| qa-flaky-test-detector | yes | OK | PASS |
| qa-regression-analyzer | yes | OK | PASS |
| qa-issue-generator | yes | OK | PASS |
| qa-observability-agent | yes | OK | PASS |
| qa-backlog-steward | yes | OK | PASS |
| qa-coder-agent | yes | OK | PASS |
| qa-pr-review-agent | yes | OK | PASS |
| qa-pr-review-responder | yes | OK | PASS |
| qa-issue-fixer-agent | yes | OK | PASS |
| qa-escalation-agent | yes | OK | PASS |
| qa-slack-reporter | yes | OK | PASS |
| qa-test-architect | yes | OK | PASS |
| marketing-em | yes | MISSING | FAIL |
| marketing-content-agent | yes | OK | PASS |
| marketing-content-agent-cloud | yes | OK | PASS |
| marketing-launch-agent | yes | MISSING | FAIL |
| site-em | yes | MISSING | FAIL |
| site-builder | yes | MISSING | FAIL |
| site-docs-sync | yes | MISSING | FAIL |
| design-em | yes | MISSING | FAIL |
| design-auditor | yes | MISSING | FAIL |
| office-sim-em | yes | MISSING | FAIL |
| office-sim-sr | yes | MISSING | FAIL |
| office-sim-qa | yes | MISSING | FAIL |

**Summary:** 94 OK, 24 MISSING, 2 SKIP

## Schedule ↔ Registry

| Agent | In Schedule | In Registry | Repo Match | Status |
|-------|-------------|-------------|------------|--------|
| triage-failing-ci-agent | yes | yes | yes | PASS |
| agentguard-autonomous-sdlc--coder-agent | yes | yes | yes | PASS |
| agentguard-autonomous-sdlc--code-review-agent | yes | yes | yes | PASS |
| architect-agent | yes | yes | yes | PASS |
| resolve-merge-conflicts | yes | yes | yes | PASS |
| pr-merger-agent | yes | yes | yes | PASS |
| respond-to-pr-reviews | yes | yes | yes | PASS |
| backlog-steward-agent | yes | yes | yes | PASS |
| documentation-maintainer-agent | yes | yes | yes | PASS |
| agentguard-autonomous-sdlc--documentation-maintainer-agent | yes | yes | yes | PASS |
| governance-monitor-agent | yes | yes | yes | PASS |
| agentguard-autonomous-sdlc--governance-monitor-agent | yes | yes | yes | PASS |
| infrastructure-health-agent | yes | yes | yes | PASS |
| observability-agent | yes | yes | yes | PASS |
| repo-hygiene-agent | yes | yes | yes | PASS |
| stale-branch-janitor | yes | yes | yes | PASS |
| test-agent | yes | yes | yes | PASS |
| tier-c-copilot-implementer-oss | yes | yes | yes | PASS |
| copilot-test-writer-oss | yes | yes | yes | PASS |
| copilot-docs-sync | yes | yes | yes | PASS |
| audit-merged-prs | yes | yes | yes | PASS |
| cicd-hardening-agent | yes | yes | yes | PASS |
| security-audit-agent | yes | yes | yes | PASS |
| test-generation-agent | yes | yes | yes | PASS |
| ci-triage-agent-cloud | yes | yes | yes | PASS |
| coder-agent-cloud | yes | yes | yes | PASS |
| code-review-agent-cloud | yes | yes | yes | PASS |
| architect-agent-cloud | yes | yes | yes | PASS |
| tier-a-architect-review | yes | yes | yes | PASS |
| tier-b-senior-review | yes | yes | yes | PASS |
| merge-conflict-resolver-cloud | yes | yes | yes | PASS |
| pr-merger-agent-cloud | yes | yes | yes | PASS |
| pr-review-responder-cloud | yes | yes | yes | PASS |
| backlog-steward-cloud | yes | yes | yes | PASS |
| docs-sync-agent-cloud | yes | yes | yes | PASS |
| governance-monitor-cloud | yes | yes | yes | PASS |
| infrastructure-health-agent-cloud | yes | yes | yes | PASS |
| observability-agent-cloud | yes | yes | yes | PASS |
| repo-hygiene-agent-cloud | yes | yes | yes | PASS |
| stale-branch-janitor-cloud | yes | yes | yes | PASS |
| test-agent-cloud | yes | yes | yes | PASS |
| tier-c-copilot-implementer | yes | yes | yes | PASS |
| copilot-test-writer | yes | yes | yes | PASS |
| copilot-pr-fixer | yes | yes | yes | PASS |
| cloud-qa-smoke-runner | yes | yes | yes | PASS |
| cloud-qa-test-architect | yes | yes | yes | PASS |
| cloud-qa-backlog-steward | yes | yes | yes | PASS |
| cloud-qa-coder-agent | yes | yes | yes | PASS |
| cloud-qa-regression-analyzer | yes | yes | yes | PASS |
| audit-merged-prs-cloud | yes | yes | yes | PASS |
| cicd-hardening-agent-cloud | yes | yes | yes | PASS |
| security-audit-agent-cloud | yes | yes | yes | PASS |
| test-generation-agent-cloud | yes | yes | yes | PASS |
| planning-agent | yes | yes | yes | PASS |
| planning-agent-cloud | yes | yes | yes | PASS |
| product-agent | yes | yes | yes | PASS |
| product-agent-cloud | yes | yes | yes | PASS |
| progress-controller-agent | yes | yes | yes | PASS |
| progress-controller-cloud | yes | yes | yes | PASS |
| recovery-controller-agent | yes | yes | yes | PASS |
| recovery-controller-cloud | yes | yes | yes | PASS |
| risk-escalation-agent | yes | yes | yes | PASS |
| risk-escalation-agent-cloud | yes | yes | yes | PASS |
| backlog-hygiene--roadmap-triage-agent | yes | yes | yes | PASS |
| retrospective-agent | yes | yes | yes | PASS |
| retrospective-agent-cloud | yes | yes | yes | PASS |
| rollout-canary-validator | yes | yes | yes | PASS |
| workspace-config-validator | yes | yes | yes | PASS |
| workspace-agent-reliability | yes | yes | yes | PASS |
| workspace-pr-review-agent | yes | yes | yes | PASS |
| qa-smoke-runner | yes | yes | yes | PASS |
| qa-flaky-test-detector | yes | yes | yes | PASS |
| qa-regression-analyzer | yes | yes | yes | PASS |
| qa-issue-generator | yes | yes | yes | PASS |
| qa-observability-agent | yes | yes | yes | PASS |
| qa-backlog-steward | yes | yes | yes | PASS |
| qa-coder-agent | yes | yes | yes | PASS |
| qa-pr-review-agent | yes | yes | yes | PASS |
| qa-pr-review-responder | yes | yes | yes | PASS |
| qa-issue-fixer-agent | yes | yes | yes | PASS |
| qa-escalation-agent | yes | yes | yes | PASS |
| qa-slack-reporter | yes | yes | yes | PASS |
| qa-test-architect | yes | yes | yes | PASS |
| marketing-content-agent | yes | yes | yes | PASS |
| marketing-content-agent-cloud | yes | yes | yes | PASS |
| director | yes | no | n/a | WARN |
| kernel-em | yes | no | n/a | WARN |
| kernel-sr | yes | no | n/a | WARN |
| kernel-qa | yes | no | n/a | WARN |
| swarm-health-agent | yes | no | n/a | WARN |
| cloud-em | yes | no | n/a | WARN |
| cloud-sr | yes | no | n/a | WARN |
| cloud-qa | yes | no | n/a | WARN |
| onboarding-monitor-agent | yes | no | n/a | WARN |
| hq-em | yes | no | n/a | WARN |
| workspace-backlog-steward | yes | no | n/a | WARN |
| analytics-em | yes | no | n/a | WARN |
| analytics-pipeline | yes | no | n/a | WARN |
| analytics-reporter | yes | no | n/a | WARN |
| analytics-invariant-researcher | yes | no | n/a | WARN |
| analytics-pr-review-agent | yes | no | n/a | WARN |
| studio-em | yes | no | n/a | WARN |
| studio-sr | yes | no | n/a | WARN |
| studio-jr | yes | no | n/a | WARN |
| studio-qa | yes | no | n/a | WARN |
| studio-product | yes | no | n/a | WARN |
| studio-designer | yes | no | n/a | WARN |
| qa-em | yes | no | n/a | WARN |
| marketing-em | yes | no | n/a | WARN |
| marketing-launch-agent | yes | no | n/a | WARN |
| site-em | yes | no | n/a | WARN |
| site-builder | yes | no | n/a | WARN |
| site-docs-sync | yes | no | n/a | WARN |
| design-em | yes | no | n/a | WARN |
| design-auditor | yes | no | n/a | WARN |
| office-sim-em | yes | no | n/a | WARN |
| office-sim-sr | yes | no | n/a | WARN |
| office-sim-qa | yes | no | n/a | WARN |
| policy-effectiveness-agent | no (disabled) | yes | n/a | PASS |
| security-code-scan-agent | no (disabled) | yes | n/a | PASS |

**Summary:** 84 PASS, 33 WARN (scheduled but not registered), 1 disabled-only-in-registry

## Repo Directories

| Repo | Exists | Git Valid | Status |
|------|--------|-----------|--------|
| agent-guard | yes | yes | PASS |
| agentguard-cloud | yes | yes | PASS |
| . (workspace) | yes | yes | PASS |
| agentguard-analytics | no | no | FAIL |
| bench-devs-platform | yes | yes | PASS |

## Schedule Collisions

None detected.

## Infrastructure Scripts

| Script | Exists | Executable | Status |
|--------|--------|------------|--------|
| run-agent.sh | yes | yes | PASS |
| worker.sh | yes | yes | PASS |
| enqueue.sh | yes | yes | PASS |

## Issues Found

1. **FAIL** — Missing repo directory: `agentguard-analytics` does not exist at `/home/readybench/agentguard-workspace/agentguard-analytics`. 5 enabled agents depend on it (analytics-em, analytics-pipeline, analytics-reporter, analytics-invariant-researcher, analytics-pr-review-agent).
2. **FAIL** — 24 enabled agents are missing SKILL.md files. These agents will fail to start because the scheduler cannot find their task definition:
   - **analytics squad (5):** analytics-em, analytics-pipeline, analytics-reporter, analytics-invariant-researcher, analytics-pr-review-agent
   - **office-sim squad (3):** office-sim-em, office-sim-sr, office-sim-qa
   - **site squad (3):** site-em, site-builder, site-docs-sync
   - **design squad (2):** design-em, design-auditor
   - **cloud squad (3):** cloud-em, cloud-sr, cloud-qa
   - **other (8):** director, swarm-health-agent, onboarding-monitor-agent, hq-em, workspace-backlog-steward, qa-em, marketing-em, marketing-launch-agent
3. **WARN** — 33 enabled agents are scheduled but not in agent-registry.json. They will run without a registered identity, which may affect governance auditing and telemetry attribution.
