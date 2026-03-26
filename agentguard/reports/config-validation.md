# Workspace Config Validation — 2026-03-26

**Schedule agents:** 111 enabled, 2 disabled
**Registry agents:** 89
**Overall:** FAIL

## Schedule Structure

| Field | Value | Status |
|-------|-------|--------|
| max_workers | 32 | PASS |
| default_timeout_seconds | 900 | PASS |
| agents | 113 entries (111 enabled) | PASS |
| cron expressions | all 5-field | PASS |

## Schedule <> SKILL.md

| Agent | Enabled | SKILL.md | Status |
|-------|---------|----------|--------|
| agentguard-autonomous-sdlc--code-review-agent | yes | OK | PASS |
| agentguard-autonomous-sdlc--coder-agent | yes | OK | PASS |
| agentguard-autonomous-sdlc--documentation-maintainer-agent | yes | OK | PASS |
| agentguard-autonomous-sdlc--governance-monitor-agent | yes | OK | PASS |
| analytics-em | yes | MISSING | FAIL |
| analytics-invariant-researcher | yes | MISSING | FAIL |
| analytics-pipeline | yes | MISSING | FAIL |
| analytics-pr-review-agent | yes | MISSING | FAIL |
| analytics-reporter | yes | MISSING | FAIL |
| architect-agent | yes | OK | PASS |
| architect-agent-cloud | yes | OK | PASS |
| audit-merged-prs | yes | OK | PASS |
| audit-merged-prs-cloud | yes | OK | PASS |
| backlog-hygiene--roadmap-triage-agent | yes | OK | PASS |
| backlog-steward-agent | yes | OK | PASS |
| backlog-steward-cloud | yes | OK | PASS |
| ci-triage-agent-cloud | yes | OK | PASS |
| cicd-hardening-agent | yes | OK | PASS |
| cicd-hardening-agent-cloud | yes | OK | PASS |
| cloud-em | yes | MISSING | FAIL |
| cloud-qa | yes | MISSING | FAIL |
| cloud-qa-backlog-steward | yes | OK | PASS |
| cloud-qa-coder-agent | yes | OK | PASS |
| cloud-qa-regression-analyzer | yes | OK | PASS |
| cloud-qa-smoke-runner | yes | OK | PASS |
| cloud-qa-test-architect | yes | OK | PASS |
| cloud-sr | yes | MISSING | FAIL |
| code-review-agent-cloud | yes | OK | PASS |
| coder-agent-cloud | yes | OK | PASS |
| copilot-docs-sync | yes | OK | PASS |
| copilot-pr-fixer | yes | OK | PASS |
| copilot-test-writer | yes | OK | PASS |
| copilot-test-writer-oss | yes | OK | PASS |
| design-auditor | yes | MISSING | FAIL |
| design-em | yes | MISSING | FAIL |
| director | yes | MISSING | FAIL |
| docs-sync-agent-cloud | yes | OK | PASS |
| documentation-maintainer-agent | yes | OK | PASS |
| governance-monitor-agent | yes | OK | PASS |
| governance-monitor-cloud | yes | OK | PASS |
| hq-em | yes | MISSING | FAIL |
| infrastructure-health-agent | yes | OK | PASS |
| infrastructure-health-agent-cloud | yes | OK | PASS |
| kernel-em | yes | OK | PASS |
| kernel-qa | yes | OK | PASS |
| kernel-sr | yes | OK | PASS |
| marketing-content-agent | yes | OK | PASS |
| marketing-content-agent-cloud | yes | OK | PASS |
| marketing-em | yes | MISSING | FAIL |
| marketing-launch-agent | yes | MISSING | FAIL |
| merge-conflict-resolver-cloud | yes | OK | PASS |
| observability-agent | yes | OK | PASS |
| observability-agent-cloud | yes | OK | PASS |
| office-sim-em | yes | MISSING | FAIL |
| office-sim-qa | yes | MISSING | FAIL |
| office-sim-sr | yes | MISSING | FAIL |
| onboarding-monitor-agent | yes | MISSING | FAIL |
| planning-agent | yes | OK | PASS |
| planning-agent-cloud | yes | OK | PASS |
| pr-merger-agent | yes | OK | PASS |
| pr-merger-agent-cloud | yes | OK | PASS |
| pr-review-responder-cloud | yes | OK | PASS |
| product-agent | yes | OK | PASS |
| product-agent-cloud | yes | OK | PASS |
| progress-controller-agent | yes | OK | PASS |
| progress-controller-cloud | yes | OK | PASS |
| qa-backlog-steward | yes | OK | PASS |
| qa-coder-agent | yes | OK | PASS |
| qa-em | yes | MISSING | FAIL |
| qa-flaky-test-detector | yes | OK | PASS |
| qa-issue-generator | yes | OK | PASS |
| qa-observability-agent | yes | OK | PASS |
| qa-pr-review-agent | yes | OK | PASS |
| qa-regression-analyzer | yes | OK | PASS |
| qa-smoke-runner | yes | OK | PASS |
| qa-test-architect | yes | OK | PASS |
| recovery-controller-agent | yes | OK | PASS |
| recovery-controller-cloud | yes | OK | PASS |
| repo-hygiene-agent | yes | OK | PASS |
| repo-hygiene-agent-cloud | yes | OK | PASS |
| resolve-merge-conflicts | yes | OK | PASS |
| respond-to-pr-reviews | yes | OK | PASS |
| retrospective-agent | yes | OK | PASS |
| retrospective-agent-cloud | yes | OK | PASS |
| risk-escalation-agent | yes | OK | PASS |
| risk-escalation-agent-cloud | yes | OK | PASS |
| rollout-canary-validator | yes | MISSING | FAIL |
| security-audit-agent | yes | OK | PASS |
| security-audit-agent-cloud | yes | OK | PASS |
| site-builder | yes | MISSING | FAIL |
| site-docs-sync | yes | MISSING | FAIL |
| site-em | yes | MISSING | FAIL |
| stale-branch-janitor | yes | OK | PASS |
| stale-branch-janitor-cloud | yes | OK | PASS |
| studio-em | yes | OK | PASS |
| studio-qa | yes | OK | PASS |
| studio-sr | yes | OK | PASS |
| swarm-health-agent | yes | MISSING | FAIL |
| test-agent | yes | OK | PASS |
| test-agent-cloud | yes | OK | PASS |
| test-generation-agent | yes | OK | PASS |
| test-generation-agent-cloud | yes | OK | PASS |
| tier-a-architect-review | yes | OK | PASS |
| tier-b-senior-review | yes | OK | PASS |
| tier-c-copilot-implementer | yes | OK | PASS |
| tier-c-copilot-implementer-oss | yes | OK | PASS |
| triage-failing-ci-agent | yes | OK | PASS |
| workspace-agent-reliability | yes | OK | PASS |
| workspace-backlog-steward | yes | MISSING | FAIL |
| workspace-config-validator | yes | OK | PASS |
| workspace-pr-review-agent | yes | OK | PASS |
| policy-effectiveness-agent | no | n/a | OK |
| security-code-scan-agent | no | n/a | OK |

## Schedule <> Registry

| Agent | In Schedule | In Registry | Repo Match | Status |
|-------|-------------|-------------|------------|--------|
| agentguard-autonomous-sdlc--code-review-agent | yes | yes | yes | PASS |
| agentguard-autonomous-sdlc--coder-agent | yes | yes | yes | PASS |
| agentguard-autonomous-sdlc--documentation-maintainer-agent | yes | yes | yes | PASS |
| agentguard-autonomous-sdlc--governance-monitor-agent | yes | yes | yes | PASS |
| analytics-em | yes (enabled) | no | n/a | WARN |
| analytics-invariant-researcher | yes (enabled) | no | n/a | WARN |
| analytics-pipeline | yes (enabled) | no | n/a | WARN |
| analytics-pr-review-agent | yes (enabled) | no | n/a | WARN |
| analytics-reporter | yes (enabled) | no | n/a | WARN |
| architect-agent | yes | yes | yes | PASS |
| architect-agent-cloud | yes | yes | yes | PASS |
| audit-merged-prs | yes | yes | yes | PASS |
| audit-merged-prs-cloud | yes | yes | yes | PASS |
| backlog-hygiene--roadmap-triage-agent | yes | yes | yes | PASS |
| backlog-steward-agent | yes | yes | yes | PASS |
| backlog-steward-cloud | yes | yes | yes | PASS |
| ci-triage-agent-cloud | yes | yes | yes | PASS |
| cicd-hardening-agent | yes | yes | yes | PASS |
| cicd-hardening-agent-cloud | yes | yes | yes | PASS |
| cloud-em | yes (enabled) | no | n/a | WARN |
| cloud-qa | yes (enabled) | no | n/a | WARN |
| cloud-qa-backlog-steward | yes | yes | yes | PASS |
| cloud-qa-coder-agent | yes | yes | yes | PASS |
| cloud-qa-regression-analyzer | yes | yes | yes | PASS |
| cloud-qa-smoke-runner | yes | yes | yes | PASS |
| cloud-qa-test-architect | yes | yes | yes | PASS |
| cloud-sr | yes (enabled) | no | n/a | WARN |
| code-review-agent-cloud | yes | yes | yes | PASS |
| coder-agent-cloud | yes | yes | yes | PASS |
| copilot-docs-sync | yes | yes | yes | PASS |
| copilot-pr-fixer | yes | yes | yes | PASS |
| copilot-test-writer | yes | yes | yes | PASS |
| copilot-test-writer-oss | yes | yes | yes | PASS |
| design-auditor | yes (enabled) | no | n/a | WARN |
| design-em | yes (enabled) | no | n/a | WARN |
| director | yes (enabled) | no | n/a | WARN |
| docs-sync-agent-cloud | yes | yes | yes | PASS |
| documentation-maintainer-agent | yes | yes | yes | PASS |
| governance-monitor-agent | yes | yes | yes | PASS |
| governance-monitor-cloud | yes | yes | yes | PASS |
| hq-em | yes (enabled) | no | n/a | WARN |
| infrastructure-health-agent | yes | yes | yes | PASS |
| infrastructure-health-agent-cloud | yes | yes | yes | PASS |
| kernel-em | yes (enabled) | no | n/a | WARN |
| kernel-qa | yes (enabled) | no | n/a | WARN |
| kernel-sr | yes (enabled) | no | n/a | WARN |
| marketing-content-agent | yes | yes | yes | PASS |
| marketing-content-agent-cloud | yes | yes | yes | PASS |
| marketing-em | yes (enabled) | no | n/a | WARN |
| marketing-launch-agent | yes (enabled) | no | n/a | WARN |
| merge-conflict-resolver-cloud | yes | yes | yes | PASS |
| observability-agent | yes | yes | yes | PASS |
| observability-agent-cloud | yes | yes | yes | PASS |
| office-sim-em | yes (enabled) | no | n/a | WARN |
| office-sim-qa | yes (enabled) | no | n/a | WARN |
| office-sim-sr | yes (enabled) | no | n/a | WARN |
| onboarding-monitor-agent | yes (enabled) | no | n/a | WARN |
| planning-agent | yes | yes | yes | PASS |
| planning-agent-cloud | yes | yes | yes | PASS |
| policy-effectiveness-agent | yes (disabled) | yes | yes | PASS |
| pr-merger-agent | yes | yes | yes | PASS |
| pr-merger-agent-cloud | yes | yes | yes | PASS |
| pr-review-responder-cloud | yes | yes | yes | PASS |
| product-agent | yes | yes | yes | PASS |
| product-agent-cloud | yes | yes | yes | PASS |
| progress-controller-agent | yes | yes | yes | PASS |
| progress-controller-cloud | yes | yes | yes | PASS |
| qa-backlog-steward | yes | yes | yes | PASS |
| qa-coder-agent | yes | yes | yes | PASS |
| qa-em | yes (enabled) | no | n/a | WARN |
| qa-escalation-agent | no | yes | n/a | WARN |
| qa-flaky-test-detector | yes | yes | yes | PASS |
| qa-issue-fixer-agent | no | yes | n/a | WARN |
| qa-issue-generator | yes | yes | yes | PASS |
| qa-observability-agent | yes | yes | yes | PASS |
| qa-pr-review-agent | yes | yes | yes | PASS |
| qa-pr-review-responder | no | yes | n/a | WARN |
| qa-regression-analyzer | yes | yes | yes | PASS |
| qa-slack-reporter | no | yes | n/a | WARN |
| qa-smoke-runner | yes | yes | yes | PASS |
| qa-test-architect | yes | yes | yes | PASS |
| recovery-controller-agent | yes | yes | yes | PASS |
| recovery-controller-cloud | yes | yes | yes | PASS |
| repo-hygiene-agent | yes | yes | yes | PASS |
| repo-hygiene-agent-cloud | yes | yes | yes | PASS |
| resolve-merge-conflicts | yes | yes | yes | PASS |
| respond-to-pr-reviews | yes | yes | yes | PASS |
| retrospective-agent | yes | yes | yes | PASS |
| retrospective-agent-cloud | yes | yes | yes | PASS |
| risk-escalation-agent | yes | yes | yes | PASS |
| risk-escalation-agent-cloud | yes | yes | yes | PASS |
| rollout-canary-validator | yes | yes | yes | PASS |
| security-audit-agent | yes | yes | yes | PASS |
| security-audit-agent-cloud | yes | yes | yes | PASS |
| security-code-scan-agent | yes (disabled) | yes | yes | PASS |
| site-builder | yes (enabled) | no | n/a | WARN |
| site-docs-sync | yes (enabled) | no | n/a | WARN |
| site-em | yes (enabled) | no | n/a | WARN |
| stale-branch-janitor | yes | yes | yes | PASS |
| stale-branch-janitor-cloud | yes | yes | yes | PASS |
| studio-em | yes (enabled) | no | n/a | WARN |
| studio-qa | yes (enabled) | no | n/a | WARN |
| studio-sr | yes (enabled) | no | n/a | WARN |
| swarm-health-agent | yes (enabled) | no | n/a | WARN |
| test-agent | yes | yes | yes | PASS |
| test-agent-cloud | yes | yes | yes | PASS |
| test-generation-agent | yes | yes | yes | PASS |
| test-generation-agent-cloud | yes | yes | yes | PASS |
| tier-a-architect-review | yes | yes | yes | PASS |
| tier-b-senior-review | yes | yes | yes | PASS |
| tier-c-copilot-implementer | yes | yes | yes | PASS |
| tier-c-copilot-implementer-oss | yes | yes | yes | PASS |
| triage-failing-ci-agent | yes | yes | yes | PASS |
| workspace-agent-reliability | yes | yes | yes | PASS |
| workspace-backlog-steward | yes (enabled) | no | n/a | WARN |
| workspace-config-validator | yes | yes | yes | PASS |
| workspace-pr-review-agent | yes | yes | yes | PASS |

## Repo Directories

| Repo | Exists | Git Valid | Status |
|------|--------|-----------|--------|
| . (workspace) | yes | yes | PASS |
| agent-guard | yes | yes | PASS |
| agentguard-analytics | no | no | FAIL |
| agentguard-cloud | yes | yes | PASS |
| bench-devs-platform | yes | yes | PASS |

## Schedule Collisions

None detected

## Infrastructure Scripts

| Script | Exists | Executable | Status |
|--------|--------|------------|--------|
| run-agent.sh | yes | yes | PASS |
| worker.sh | yes | yes | PASS |
| enqueue.sh | yes | yes | PASS |

## Issues Found

### FAIL: Missing repo directory

1. **agentguard-analytics** repo directory does not exist — 5 enabled agents (analytics-em, analytics-invariant-researcher, analytics-pipeline, analytics-pr-review-agent, analytics-reporter) reference this repo and cannot run

### FAIL: Missing SKILL.md (25 enabled agents)

2. **analytics-em** — SKILL.md missing at `~/.claude/scheduled-tasks/analytics-em/SKILL.md`
3. **analytics-invariant-researcher** — SKILL.md missing
4. **analytics-pipeline** — SKILL.md missing
5. **analytics-pr-review-agent** — SKILL.md missing
6. **analytics-reporter** — SKILL.md missing
7. **cloud-em** — SKILL.md missing
8. **cloud-qa** — SKILL.md missing
9. **cloud-sr** — SKILL.md missing
10. **design-auditor** — SKILL.md missing
11. **design-em** — SKILL.md missing
12. **director** — SKILL.md missing
13. **hq-em** — SKILL.md missing
14. **marketing-em** — SKILL.md missing
15. **marketing-launch-agent** — SKILL.md missing
16. **office-sim-em** — SKILL.md missing
17. **office-sim-qa** — SKILL.md missing
18. **office-sim-sr** — SKILL.md missing
19. **onboarding-monitor-agent** — SKILL.md missing
20. **qa-em** — SKILL.md missing
21. **rollout-canary-validator** — SKILL.md missing
22. **site-builder** — SKILL.md missing
23. **site-docs-sync** — SKILL.md missing
24. **site-em** — SKILL.md missing
25. **swarm-health-agent** — SKILL.md missing
26. **workspace-backlog-steward** — SKILL.md missing

### WARN: Schedule <> Registry mismatches (34 agents)

**Scheduled (enabled) but not in registry (30 agents):**

27. analytics-em, analytics-invariant-researcher, analytics-pipeline, analytics-pr-review-agent, analytics-reporter
28. cloud-em, cloud-qa, cloud-sr
29. design-auditor, design-em
30. director
31. hq-em
32. kernel-em, kernel-qa, kernel-sr
33. marketing-em, marketing-launch-agent
34. office-sim-em, office-sim-qa, office-sim-sr
35. onboarding-monitor-agent
36. qa-em
37. site-builder, site-docs-sync, site-em
38. studio-em, studio-qa, studio-sr
39. swarm-health-agent
40. workspace-backlog-steward

**In registry but not in schedule (4 agents):**

41. qa-escalation-agent (registry: bench-devs-platform)
42. qa-issue-fixer-agent (registry: bench-devs-platform)
43. qa-pr-review-responder (registry: bench-devs-platform)
44. qa-slack-reporter (registry: bench-devs-platform)
