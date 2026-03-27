# Workspace Config Validation — 2026-03-27

**Schedule agents:** 118 enabled, 2 disabled
**Registry agents:** 87
**Overall:** FAIL

## Schedule <-> SKILL.md

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
| policy-effectiveness-agent | no | OK | SKIP |
| security-code-scan-agent | no | OK | SKIP |
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

## Schedule <-> Registry

| Agent | In Schedule | In Registry | Repo Match | Status |
|-------|-------------|-------------|------------|--------|
| director | yes | no | n/a | WARN |
| kernel-em | yes | no | n/a | WARN |
| kernel-sr | yes | no | n/a | WARN |
| kernel-qa | yes | no | n/a | WARN |
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
| swarm-health-agent | yes | no | n/a | WARN |
| tier-c-copilot-implementer-oss | yes | yes | yes | PASS |
| copilot-test-writer-oss | yes | yes | yes | PASS |
| copilot-docs-sync | yes | yes | yes | PASS |
| audit-merged-prs | yes | yes | yes | PASS |
| cicd-hardening-agent | yes | yes | yes | PASS |
| security-audit-agent | yes | yes | yes | PASS |
| test-generation-agent | yes | yes | yes | PASS |
| policy-effectiveness-agent | yes | yes | yes | PASS |
| security-code-scan-agent | yes | yes | yes | PASS |
| cloud-em | yes | no | n/a | WARN |
| cloud-sr | yes | no | n/a | WARN |
| cloud-qa | yes | no | n/a | WARN |
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
| onboarding-monitor-agent | yes | no | n/a | WARN |
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
| hq-em | yes | no | n/a | WARN |
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
| workspace-backlog-steward | yes | no | n/a | WARN |
| retrospective-agent | yes | yes | yes | PASS |
| retrospective-agent-cloud | yes | yes | yes | PASS |
| rollout-canary-validator | yes | yes | yes | PASS |
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
| workspace-config-validator | yes | yes | yes | PASS |
| workspace-agent-reliability | yes | yes | yes | PASS |
| workspace-pr-review-agent | yes | yes | yes | PASS |
| qa-em | yes | no | n/a | WARN |
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
| marketing-em | yes | no | n/a | WARN |
| marketing-content-agent | yes | yes | yes | PASS |
| marketing-content-agent-cloud | yes | yes | yes | PASS |
| marketing-launch-agent | yes | no | n/a | WARN |
| site-em | yes | no | n/a | WARN |
| site-builder | yes | no | n/a | WARN |
| site-docs-sync | yes | no | n/a | WARN |
| design-em | yes | no | n/a | WARN |
| design-auditor | yes | no | n/a | WARN |
| office-sim-em | yes | no | n/a | WARN |
| office-sim-sr | yes | no | n/a | WARN |
| office-sim-qa | yes | no | n/a | WARN |

## Repo Directories

| Repo | Exists | Git Valid | Status |
|------|--------|-----------|--------|
| agent-guard | yes | yes | PASS |
| agentguard-cloud | yes | yes | PASS |
| . | yes | yes | PASS |
| agentguard-analytics | no | no | FAIL |
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

1. **FAIL** — SKILL.md missing for enabled agent `director`
2. **FAIL** — SKILL.md missing for enabled agent `swarm-health-agent`
3. **FAIL** — SKILL.md missing for enabled agent `cloud-em`
4. **FAIL** — SKILL.md missing for enabled agent `cloud-sr`
5. **FAIL** — SKILL.md missing for enabled agent `cloud-qa`
6. **FAIL** — SKILL.md missing for enabled agent `onboarding-monitor-agent`
7. **FAIL** — SKILL.md missing for enabled agent `hq-em`
8. **FAIL** — SKILL.md missing for enabled agent `workspace-backlog-steward`
9. **FAIL** — SKILL.md missing for enabled agent `analytics-em`
10. **FAIL** — SKILL.md missing for enabled agent `analytics-pipeline`
11. **FAIL** — SKILL.md missing for enabled agent `analytics-reporter`
12. **FAIL** — SKILL.md missing for enabled agent `analytics-invariant-researcher`
13. **FAIL** — SKILL.md missing for enabled agent `analytics-pr-review-agent`
14. **FAIL** — SKILL.md missing for enabled agent `qa-em`
15. **FAIL** — SKILL.md missing for enabled agent `marketing-em`
16. **FAIL** — SKILL.md missing for enabled agent `marketing-launch-agent`
17. **FAIL** — SKILL.md missing for enabled agent `site-em`
18. **FAIL** — SKILL.md missing for enabled agent `site-builder`
19. **FAIL** — SKILL.md missing for enabled agent `site-docs-sync`
20. **FAIL** — SKILL.md missing for enabled agent `design-em`
21. **FAIL** — SKILL.md missing for enabled agent `design-auditor`
22. **FAIL** — SKILL.md missing for enabled agent `office-sim-em`
23. **FAIL** — SKILL.md missing for enabled agent `office-sim-sr`
24. **FAIL** — SKILL.md missing for enabled agent `office-sim-qa`
25. **WARN** — Agent `director` is enabled in schedule but not in agent-registry.json
26. **WARN** — Agent `kernel-em` is enabled in schedule but not in agent-registry.json
27. **WARN** — Agent `kernel-sr` is enabled in schedule but not in agent-registry.json
28. **WARN** — Agent `kernel-qa` is enabled in schedule but not in agent-registry.json
29. **WARN** — Agent `swarm-health-agent` is enabled in schedule but not in agent-registry.json
30. **WARN** — Agent `cloud-em` is enabled in schedule but not in agent-registry.json
31. **WARN** — Agent `cloud-sr` is enabled in schedule but not in agent-registry.json
32. **WARN** — Agent `cloud-qa` is enabled in schedule but not in agent-registry.json
33. **WARN** — Agent `onboarding-monitor-agent` is enabled in schedule but not in agent-registry.json
34. **WARN** — Agent `hq-em` is enabled in schedule but not in agent-registry.json
35. **WARN** — Agent `workspace-backlog-steward` is enabled in schedule but not in agent-registry.json
36. **WARN** — Agent `analytics-em` is enabled in schedule but not in agent-registry.json
37. **WARN** — Agent `analytics-pipeline` is enabled in schedule but not in agent-registry.json
38. **WARN** — Agent `analytics-reporter` is enabled in schedule but not in agent-registry.json
39. **WARN** — Agent `analytics-invariant-researcher` is enabled in schedule but not in agent-registry.json
40. **WARN** — Agent `analytics-pr-review-agent` is enabled in schedule but not in agent-registry.json
41. **WARN** — Agent `studio-em` is enabled in schedule but not in agent-registry.json
42. **WARN** — Agent `studio-sr` is enabled in schedule but not in agent-registry.json
43. **WARN** — Agent `studio-jr` is enabled in schedule but not in agent-registry.json
44. **WARN** — Agent `studio-qa` is enabled in schedule but not in agent-registry.json
45. **WARN** — Agent `studio-product` is enabled in schedule but not in agent-registry.json
46. **WARN** — Agent `studio-designer` is enabled in schedule but not in agent-registry.json
47. **WARN** — Agent `qa-em` is enabled in schedule but not in agent-registry.json
48. **WARN** — Agent `marketing-em` is enabled in schedule but not in agent-registry.json
49. **WARN** — Agent `marketing-launch-agent` is enabled in schedule but not in agent-registry.json
50. **WARN** — Agent `site-em` is enabled in schedule but not in agent-registry.json
51. **WARN** — Agent `site-builder` is enabled in schedule but not in agent-registry.json
52. **WARN** — Agent `site-docs-sync` is enabled in schedule but not in agent-registry.json
53. **WARN** — Agent `design-em` is enabled in schedule but not in agent-registry.json
54. **WARN** — Agent `design-auditor` is enabled in schedule but not in agent-registry.json
55. **WARN** — Agent `office-sim-em` is enabled in schedule but not in agent-registry.json
56. **WARN** — Agent `office-sim-sr` is enabled in schedule but not in agent-registry.json
57. **WARN** — Agent `office-sim-qa` is enabled in schedule but not in agent-registry.json
58. **FAIL** — Repo directory `agentguard-analytics` does not exist or is not a git repo

