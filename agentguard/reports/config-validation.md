# Workspace Config Validation — 2026-03-27T18:32:57Z

**Identity:** claude-code:opus:ops (workspace-config-validator)
**Schedule agents:** 126 enabled, 2 disabled
**Registry agents:** 87
**Overall:** FAIL

## Schedule ↔ SKILL.md
| Agent | Enabled | SKILL.md | Status |
|-------|---------|----------|--------|
| agentguard-autonomous-sdlc--code-review-agent | yes | OK | PASS |
| agentguard-autonomous-sdlc--coder-agent | yes | OK | PASS |
| agentguard-autonomous-sdlc--documentation-maintainer-agent | yes | OK | PASS |
| agentguard-autonomous-sdlc--governance-monitor-agent | yes | OK | PASS |
| analytics-em | yes | OK | PASS |
| analytics-invariant-researcher | yes | OK | PASS |
| analytics-pipeline | yes | OK | PASS |
| analytics-pr-review-agent | yes | OK | PASS |
| analytics-reporter | yes | OK | PASS |
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
| cloud-em | yes | OK | PASS |
| cloud-qa | yes | OK | PASS |
| cloud-qa-backlog-steward | yes | OK | PASS |
| cloud-qa-coder-agent | yes | OK | PASS |
| cloud-qa-regression-analyzer | yes | OK | PASS |
| cloud-qa-smoke-runner | yes | OK | PASS |
| cloud-qa-test-architect | yes | OK | PASS |
| cloud-sr | yes | OK | PASS |
| code-review-agent-cloud | yes | OK | PASS |
| coder-agent-cloud | yes | OK | PASS |
| copilot-docs-sync | yes | OK | PASS |
| copilot-pr-fixer | yes | OK | PASS |
| copilot-test-writer | yes | OK | PASS |
| copilot-test-writer-oss | yes | OK | PASS |
| design-auditor | yes | OK | PASS |
| design-em | yes | OK | PASS |
| director | yes | OK | PASS |
| docs-sync-agent-cloud | yes | OK | PASS |
| documentation-maintainer-agent | yes | OK | PASS |
| governance-monitor-agent | yes | OK | PASS |
| governance-monitor-cloud | yes | OK | PASS |
| hq-em | yes | OK | PASS |
| infrastructure-health-agent | yes | OK | PASS |
| infrastructure-health-agent-cloud | yes | OK | PASS |
| kernel-em | yes | OK | PASS |
| kernel-qa | yes | OK | PASS |
| kernel-sr | yes | OK | PASS |
| marketing-content-agent | yes | OK | PASS |
| marketing-content-agent-cloud | yes | OK | PASS |
| marketing-em | yes | OK | PASS |
| marketing-launch-agent | yes | OK | PASS |
| merge-conflict-resolver-cloud | yes | OK | PASS |
| observability-agent | yes | OK | PASS |
| observability-agent-cloud | yes | OK | PASS |
| office-sim-em | yes | OK | PASS |
| office-sim-qa | yes | OK | PASS |
| office-sim-sr | yes | OK | PASS |
| onboarding-monitor-agent | yes | OK | PASS |
| planning-agent | yes | OK | PASS |
| planning-agent-cloud | yes | OK | PASS |
| policy-effectiveness-agent | no | OK | PASS |
| pr-merger-agent | yes | OK | PASS |
| pr-merger-agent-cloud | yes | OK | PASS |
| pr-review-responder-cloud | yes | OK | PASS |
| product-agent | yes | OK | PASS |
| product-agent-cloud | yes | OK | PASS |
| progress-controller-agent | yes | OK | PASS |
| progress-controller-cloud | yes | OK | PASS |
| qa-backlog-steward | yes | OK | PASS |
| qa-coder-agent | yes | OK | PASS |
| qa-conductor | yes | MISSING | FAIL |
| qa-em | yes | OK | PASS |
| qa-escalation-agent | yes | OK | PASS |
| qa-flaky-test-detector | yes | OK | PASS |
| qa-issue-fixer-agent | yes | OK | PASS |
| qa-issue-generator | yes | OK | PASS |
| qa-observability-agent | yes | OK | PASS |
| qa-pr-review-agent | yes | OK | PASS |
| qa-pr-review-responder | yes | OK | PASS |
| qa-regression-analyzer | yes | OK | PASS |
| qa-slack-reporter | yes | OK | PASS |
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
| rollout-canary-validator | yes | OK | PASS |
| security-audit-agent | yes | OK | PASS |
| security-audit-agent-cloud | yes | OK | PASS |
| security-code-scan-agent | no | OK | PASS |
| shellforge-docs | yes | OK | PASS |
| shellforge-em | yes | OK | PASS |
| shellforge-ollama-integration | yes | OK | PASS |
| shellforge-qa | yes | OK | PASS |
| shellforge-research-scout | yes | OK | PASS |
| shellforge-reviewer | yes | OK | PASS |
| shellforge-sr | yes | OK | PASS |
| site-builder | yes | OK | PASS |
| site-docs-sync | yes | OK | PASS |
| site-em | yes | OK | PASS |
| stale-branch-janitor | yes | OK | PASS |
| stale-branch-janitor-cloud | yes | OK | PASS |
| studio-designer | yes | OK | PASS |
| studio-em | yes | OK | PASS |
| studio-jr | yes | OK | PASS |
| studio-product | yes | OK | PASS |
| studio-qa | yes | OK | PASS |
| studio-sr | yes | OK | PASS |
| swarm-health-agent | yes | OK | PASS |
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
| workspace-backlog-steward | yes | OK | PASS |
| workspace-config-validator | yes | OK | PASS |
| workspace-pr-review-agent | yes | OK | PASS |

## Schedule ↔ Registry
| Agent | In Schedule | In Registry | Repo Match | Status |
|-------|-------------|-------------|------------|--------|
| agentguard-autonomous-sdlc--code-review-agent | yes | yes | yes | PASS |
| agentguard-autonomous-sdlc--coder-agent | yes | yes | yes | PASS |
| agentguard-autonomous-sdlc--documentation-maintainer-agent | yes | yes | yes | PASS |
| agentguard-autonomous-sdlc--governance-monitor-agent | yes | yes | yes | PASS |
| analytics-em | yes | no | n/a | WARN |
| analytics-invariant-researcher | yes | no | n/a | WARN |
| analytics-pipeline | yes | no | n/a | WARN |
| analytics-pr-review-agent | yes | no | n/a | WARN |
| analytics-reporter | yes | no | n/a | WARN |
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
| cloud-em | yes | no | n/a | WARN |
| cloud-qa | yes | no | n/a | WARN |
| cloud-qa-backlog-steward | yes | yes | yes | PASS |
| cloud-qa-coder-agent | yes | yes | yes | PASS |
| cloud-qa-regression-analyzer | yes | yes | yes | PASS |
| cloud-qa-smoke-runner | yes | yes | yes | PASS |
| cloud-qa-test-architect | yes | yes | yes | PASS |
| cloud-sr | yes | no | n/a | WARN |
| code-review-agent-cloud | yes | yes | yes | PASS |
| coder-agent-cloud | yes | yes | yes | PASS |
| copilot-docs-sync | yes | yes | yes | PASS |
| copilot-pr-fixer | yes | yes | yes | PASS |
| copilot-test-writer | yes | yes | yes | PASS |
| copilot-test-writer-oss | yes | yes | yes | PASS |
| design-auditor | yes | no | n/a | WARN |
| design-em | yes | no | n/a | WARN |
| director | yes | no | n/a | WARN |
| docs-sync-agent-cloud | yes | yes | yes | PASS |
| documentation-maintainer-agent | yes | yes | yes | PASS |
| governance-monitor-agent | yes | yes | yes | PASS |
| governance-monitor-cloud | yes | yes | yes | PASS |
| hq-em | yes | no | n/a | WARN |
| infrastructure-health-agent | yes | yes | yes | PASS |
| infrastructure-health-agent-cloud | yes | yes | yes | PASS |
| kernel-em | yes | no | n/a | WARN |
| kernel-qa | yes | no | n/a | WARN |
| kernel-sr | yes | no | n/a | WARN |
| marketing-content-agent | yes | yes | yes | PASS |
| marketing-content-agent-cloud | yes | yes | yes | PASS |
| marketing-em | yes | no | n/a | WARN |
| marketing-launch-agent | yes | no | n/a | WARN |
| merge-conflict-resolver-cloud | yes | yes | yes | PASS |
| observability-agent | yes | yes | yes | PASS |
| observability-agent-cloud | yes | yes | yes | PASS |
| office-sim-em | yes | no | n/a | WARN |
| office-sim-qa | yes | no | n/a | WARN |
| office-sim-sr | yes | no | n/a | WARN |
| onboarding-monitor-agent | yes | no | n/a | WARN |
| planning-agent | yes | yes | yes | PASS |
| planning-agent-cloud | yes | yes | yes | PASS |
| policy-effectiveness-agent | yes | yes | yes | PASS |
| pr-merger-agent | yes | yes | yes | PASS |
| pr-merger-agent-cloud | yes | yes | yes | PASS |
| pr-review-responder-cloud | yes | yes | yes | PASS |
| product-agent | yes | yes | yes | PASS |
| product-agent-cloud | yes | yes | yes | PASS |
| progress-controller-agent | yes | yes | yes | PASS |
| progress-controller-cloud | yes | yes | yes | PASS |
| qa-backlog-steward | yes | yes | yes | PASS |
| qa-coder-agent | yes | yes | yes | PASS |
| qa-conductor | yes | no | n/a | WARN |
| qa-em | yes | no | n/a | WARN |
| qa-escalation-agent | yes | yes | yes | PASS |
| qa-flaky-test-detector | yes | yes | yes | PASS |
| qa-issue-fixer-agent | yes | yes | yes | PASS |
| qa-issue-generator | yes | yes | yes | PASS |
| qa-observability-agent | yes | yes | yes | PASS |
| qa-pr-review-agent | yes | yes | yes | PASS |
| qa-pr-review-responder | yes | yes | yes | PASS |
| qa-regression-analyzer | yes | yes | yes | PASS |
| qa-slack-reporter | yes | yes | yes | PASS |
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
| security-code-scan-agent | yes | yes | yes | PASS |
| shellforge-docs | yes | no | n/a | WARN |
| shellforge-em | yes | no | n/a | WARN |
| shellforge-ollama-integration | yes | no | n/a | WARN |
| shellforge-qa | yes | no | n/a | WARN |
| shellforge-research-scout | yes | no | n/a | WARN |
| shellforge-reviewer | yes | no | n/a | WARN |
| shellforge-sr | yes | no | n/a | WARN |
| site-builder | yes | no | n/a | WARN |
| site-docs-sync | yes | no | n/a | WARN |
| site-em | yes | no | n/a | WARN |
| stale-branch-janitor | yes | yes | yes | PASS |
| stale-branch-janitor-cloud | yes | yes | yes | PASS |
| studio-designer | yes | no | n/a | WARN |
| studio-em | yes | no | n/a | WARN |
| studio-jr | yes | no | n/a | WARN |
| studio-product | yes | no | n/a | WARN |
| studio-qa | yes | no | n/a | WARN |
| studio-sr | yes | no | n/a | WARN |
| swarm-health-agent | yes | no | n/a | WARN |
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
| workspace-backlog-steward | yes | no | n/a | WARN |
| workspace-config-validator | yes | yes | yes | PASS |
| workspace-pr-review-agent | yes | yes | yes | PASS |

## Repo Directories
| Repo | Exists | Git Valid | Status |
|------|--------|-----------|--------|
| .  (workspace root) | yes | yes | PASS |
| agent-guard | yes | yes | PASS |
| agentguard-analytics | yes | yes | PASS |
| agentguard-cloud | yes | yes | PASS |
| bench-devs-platform | no | no | FAIL |
| shellforge | yes | yes | PASS |

## Schedule Collisions
None detected

## Infrastructure Scripts
| Script | Exists | Executable | Status |
|--------|--------|------------|--------|
| run-agent.sh | yes | yes | PASS |
| worker.sh | yes | yes | PASS |
| enqueue.sh | yes | yes | PASS |

## Issues Found
1. FAIL — `qa-conductor`: SKILL.md is MISSING (enabled=yes)
2. WARN — `analytics-em`: scheduled but not in agent-registry.json
3. WARN — `analytics-invariant-researcher`: scheduled but not in agent-registry.json
4. WARN — `analytics-pipeline`: scheduled but not in agent-registry.json
5. WARN — `analytics-pr-review-agent`: scheduled but not in agent-registry.json
6. WARN — `analytics-reporter`: scheduled but not in agent-registry.json
7. WARN — `cloud-em`: scheduled but not in agent-registry.json
8. WARN — `cloud-qa`: scheduled but not in agent-registry.json
9. WARN — `cloud-sr`: scheduled but not in agent-registry.json
10. WARN — `design-auditor`: scheduled but not in agent-registry.json
11. WARN — `design-em`: scheduled but not in agent-registry.json
12. WARN — `director`: scheduled but not in agent-registry.json
13. WARN — `hq-em`: scheduled but not in agent-registry.json
14. WARN — `kernel-em`: scheduled but not in agent-registry.json
15. WARN — `kernel-qa`: scheduled but not in agent-registry.json
16. WARN — `kernel-sr`: scheduled but not in agent-registry.json
17. WARN — `marketing-em`: scheduled but not in agent-registry.json
18. WARN — `marketing-launch-agent`: scheduled but not in agent-registry.json
19. WARN — `office-sim-em`: scheduled but not in agent-registry.json
20. WARN — `office-sim-qa`: scheduled but not in agent-registry.json
21. WARN — `office-sim-sr`: scheduled but not in agent-registry.json
22. WARN — `onboarding-monitor-agent`: scheduled but not in agent-registry.json
23. WARN — `qa-conductor`: scheduled but not in agent-registry.json
24. WARN — `qa-em`: scheduled but not in agent-registry.json
25. WARN — `shellforge-docs`: scheduled but not in agent-registry.json
26. WARN — `shellforge-em`: scheduled but not in agent-registry.json
27. WARN — `shellforge-ollama-integration`: scheduled but not in agent-registry.json
28. WARN — `shellforge-qa`: scheduled but not in agent-registry.json
29. WARN — `shellforge-research-scout`: scheduled but not in agent-registry.json
30. WARN — `shellforge-reviewer`: scheduled but not in agent-registry.json
31. WARN — `shellforge-sr`: scheduled but not in agent-registry.json
32. WARN — `site-builder`: scheduled but not in agent-registry.json
33. WARN — `site-docs-sync`: scheduled but not in agent-registry.json
34. WARN — `site-em`: scheduled but not in agent-registry.json
35. WARN — `studio-designer`: scheduled but not in agent-registry.json
36. WARN — `studio-em`: scheduled but not in agent-registry.json
37. WARN — `studio-jr`: scheduled but not in agent-registry.json
38. WARN — `studio-product`: scheduled but not in agent-registry.json
39. WARN — `studio-qa`: scheduled but not in agent-registry.json
40. WARN — `studio-sr`: scheduled but not in agent-registry.json
41. WARN — `swarm-health-agent`: scheduled but not in agent-registry.json
42. WARN — `workspace-backlog-steward`: scheduled but not in agent-registry.json
43. FAIL — repo `bench-devs-platform`: directory missing or not a git repo (exists=no, git_valid=no)
