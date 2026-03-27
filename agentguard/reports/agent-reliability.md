# Agent Reliability Report — 2026-03-27

**Window:** 7 days | **Agents analyzed:** 114 | **Total runs:** 1573  
**Swarm success rate:** 67.8% | **Regressions detected:** 22

> **Identity:** `claude-code:opus:ops` (workspace-agent-reliability)


## Regressions (was working, now failing)
| Agent | Repo | Was (days 4-7) | Now (days 1-3) | Streak |
|-------|------|---------------|----------------|--------|
| architect-agent | agent-guard | 100% | 50% | 2x failure |
| observability-agent-cloud | agentguard-cloud | 100% | 50% | 2x failure |
| recovery-controller-cloud | agentguard-cloud | 100% | 50% | 2x failure |
| risk-escalation-agent | agent-guard | 100% | 50% | 2x failure |
| risk-escalation-agent-cloud | agentguard-cloud | 100% | 50% | 2x failure |
| observability-agent | agent-guard | 100% | 50% | 2x failure |
| product-agent | agent-guard | 100% | 50% | 2x failure |
| tier-a-architect-review | agent-guard | 100% | 50% | 2x failure |
| tier-b-senior-review | agent-guard | 100% | 50% | 2x failure |
| recovery-controller-agent | agent-guard | 100% | 50% | 2x failure |
| planning-agent-cloud | agentguard-cloud | 100% | 50% | 2x failure |
| progress-controller-agent | agent-guard | 100% | 50% | 2x failure |
| planning-agent | agent-guard | 100% | 50% | 2x failure |
| architect-agent-cloud | agentguard-cloud | 100% | 50% | 2x failure |
| agentguard-autonomous-sdlc--coder-agent | agent-guard | 94% | 60% | 1x success |
| pr-merger-agent-cloud | agentguard-cloud | 100% | 62% | 4x failure |
| triage-failing-ci-agent | agent-guard | 91% | 64% | 1x success |
| pr-review-responder-cloud | agentguard-cloud | 100% | 67% | 1x failure |
| backlog-hygiene--roadmap-triage-agent | agent-guard | 100% | 67% | 1x failure |
| resolve-merge-conflicts | agent-guard | 100% | 68% | 2x success |
| coder-agent-cloud | agentguard-cloud | 94% | 68% | 1x success |
| ci-triage-agent-cloud | agentguard-cloud | 97% | 68% | 3x success |

## Broken Agents (<50% success)
| Agent | Repo | Success Rate | Runs | Fail Streak | Last Success |
|-------|------|-------------|------|-------------|--------------|
| shellforge-sr | shellforge | 0.0% | 2 | 2 | never |
| shellforge-ollama-integration | shellforge | 0.0% | 2 | 2 | never |
| design-auditor | agent-guard | 0.0% | 1 | 1 | never |
| cloud-qa-regression-analyzer | agentguard-cloud | 0.0% | 2 | 1 | never |
| retrospective-agent-cloud | agentguard-cloud | 0.0% | 2 | 1 | never |
| retrospective-agent | agent-guard | 0.0% | 2 | 1 | never |
| shellforge-docs | shellforge | 0.0% | 2 | 1 | never |
| shellforge-qa | shellforge | 0.0% | 2 | 1 | never |
| shellforge-em | shellforge | 0.0% | 2 | 2 | never |
| shellforge-reviewer | shellforge | 0.0% | 2 | 1 | never |
| shellforge-research-scout | shellforge | 0.0% | 1 | 1 | never |
| kernel-sr | agent-guard | 26.9% | 28 | - | 03-27 02:38 |
| office-sim-sr | internal | 27.8% | 18 | 13 | 03-26 00:44 |
| office-sim-qa | internal | 36.4% | 12 | - | 03-27 00:55 |
| analytics-pr-review-agent | internal | 36.8% | 20 | 1 | 03-27 00:40 |
| cloud-sr | agentguard-cloud | 40.0% | 20 | - | 03-27 02:39 |
| product-agent-cloud | agentguard-cloud | 40.0% | 5 | 2 | 03-25 12:35 |
| progress-controller-cloud | agentguard-cloud | 40.0% | 5 | 2 | 03-25 13:35 |
| cloud-qa | agentguard-cloud | 46.2% | 13 | - | 03-27 02:39 |
| office-sim-em | internal | 47.1% | 17 | 9 | 03-26 00:22 |
| hq-em | internal | 47.4% | 19 | 9 | 03-26 00:18 |

## Highly Flaky (>50% flip rate)
| Agent | Repo | Flakiness Rate | Success Rate | Flips/Runs |
|-------|------|---------------|-------------|------------|
| cloud-qa-coder-agent | agentguard-cloud | 100.0% | 66.7% | 2/3 |
| cloud-qa-backlog-steward | agentguard-cloud | 100.0% | 50.0% | 1/2 |
| audit-merged-prs-cloud | agentguard-cloud | 100.0% | 50.0% | 1/2 |
| onboarding-monitor-agent | agent-guard | 66.7% | 75.0% | 2/4 |
| studio-em | internal | 66.7% | 50.0% | 2/4 |

## Timeout Risks (avg duration >80% of timeout)
| Agent | Avg Duration | Timeout | % Used |
|-------|-------------|---------|--------|
| audit-merged-prs | 837s | 900s | 93% |
| audit-merged-prs-cloud | 812s | 900s | 90% |

## Unreliable (50-79% success)
| Agent | Repo | Success Rate | Flakiness | Streak | Regression |
|-------|------|-------------|-----------|--------|------------|
| kernel-em | agent-guard | 50.0% | low | 11x failure | no |
| cloud-qa-smoke-runner | agentguard-cloud | 50.0% | moderate | 1x success | no |
| cloud-qa-backlog-steward | agentguard-cloud | 50.0% | highly-flaky | 1x success | no |
| audit-merged-prs-cloud | agentguard-cloud | 50.0% | highly-flaky | 1x failure | no |
| studio-em | internal | 50.0% | highly-flaky | 1x failure | no |
| director | agent-guard | 50.0% | low | 3x failure | no |
| analytics-em | internal | 55.0% | low | 9x failure | no |
| cloud-em | agentguard-cloud | 55.0% | low | 9x failure | no |
| analytics-pipeline | internal | 55.6% | low | 4x failure | no |
| kernel-qa | agent-guard | 56.2% | low | 5x success | no |
| observability-agent-cloud | agentguard-cloud | 60.0% | moderate | 2x failure | ⚠️ YES |
| recovery-controller-cloud | agentguard-cloud | 60.0% | moderate | 2x failure | ⚠️ YES |
| risk-escalation-agent | agent-guard | 60.0% | moderate | 2x failure | ⚠️ YES |
| risk-escalation-agent-cloud | agentguard-cloud | 60.0% | moderate | 2x failure | ⚠️ YES |
| observability-agent | agent-guard | 60.0% | moderate | 2x failure | ⚠️ YES |
| product-agent | agent-guard | 60.0% | moderate | 2x failure | ⚠️ YES |
| tier-a-architect-review | agent-guard | 60.0% | moderate | 2x failure | ⚠️ YES |
| tier-b-senior-review | agent-guard | 60.0% | moderate | 2x failure | ⚠️ YES |
| recovery-controller-agent | agent-guard | 60.0% | moderate | 2x failure | ⚠️ YES |
| planning-agent-cloud | agentguard-cloud | 60.0% | moderate | 2x failure | ⚠️ YES |
| progress-controller-agent | agent-guard | 60.0% | moderate | 2x failure | ⚠️ YES |
| planning-agent | agent-guard | 60.0% | moderate | 2x failure | ⚠️ YES |
| architect-agent-cloud | agentguard-cloud | 60.0% | moderate | 2x failure | ⚠️ YES |
| pr-merger-agent-cloud | agentguard-cloud | 62.6% | low | 4x failure | ⚠️ YES |
| workspace-pr-review-agent | agent-guard | 65.2% | low | 24x failure | no |
| architect-agent | agent-guard | 66.7% | low | 2x failure | ⚠️ YES |
| cloud-qa-coder-agent | agentguard-cloud | 66.7% | highly-flaky | 1x success | no |
| agentguard-autonomous-sdlc--coder-agent | agent-guard | 70.4% | low | 1x success | ⚠️ YES |
| pr-merger-agent | agent-guard | 72.5% | low | 66x failure | no |
| code-review-agent-cloud | agentguard-cloud | 72.7% | low | 2x failure | no |
| triage-failing-ci-agent | agent-guard | 72.9% | low | 1x success | ⚠️ YES |
| pr-review-responder-cloud | agentguard-cloud | 75.0% | moderate | 1x failure | ⚠️ YES |
| onboarding-monitor-agent | agent-guard | 75.0% | highly-flaky | 1x success | no |
| marketing-em | agent-guard | 75.0% | moderate | 1x failure | no |
| site-em | agent-guard | 75.0% | moderate | 1x failure | no |
| analytics-invariant-researcher | internal | 75.0% | moderate | 1x failure | no |
| design-em | agent-guard | 75.0% | moderate | 1x failure | no |
| coder-agent-cloud | agentguard-cloud | 75.5% | low | 1x success | ⚠️ YES |
| ci-triage-agent-cloud | agentguard-cloud | 77.1% | low | 3x success | ⚠️ YES |
| resolve-merge-conflicts | agent-guard | 77.4% | low | 2x success | ⚠️ YES |
| merge-conflict-resolver-cloud | agentguard-cloud | 78.8% | low | 1x success | no |

## Mostly Reliable (80-94% success)
| Agent | Repo | Success Rate | Flakiness |
|-------|------|-------------|-----------|
| tier-c-copilot-implementer-oss | agent-guard | 94.7% | low |
| backlog-steward-agent | agent-guard | 87.5% | moderate |
| backlog-steward-cloud | agentguard-cloud | 87.5% | moderate |
| agentguard-autonomous-sdlc--code-review-agent | agent-guard | 83.3% | low |
| swarm-health-agent | agent-guard | 81.2% | low |
| test-agent | agent-guard | 80.0% | moderate |
| governance-monitor-agent | agent-guard | 80.0% | moderate |
| test-agent-cloud | agentguard-cloud | 80.0% | moderate |
| analytics-reporter | internal | 80.0% | moderate |
| agentguard-autonomous-sdlc--documentation-maintainer-agent | agent-guard | 80.0% | moderate |
| infrastructure-health-agent | agent-guard | 80.0% | moderate |
| stale-branch-janitor-cloud | agentguard-cloud | 80.0% | moderate |
| stale-branch-janitor | agent-guard | 80.0% | moderate |
| infrastructure-health-agent-cloud | agentguard-cloud | 80.0% | moderate |
| documentation-maintainer-agent | agent-guard | 80.0% | moderate |
| repo-hygiene-agent-cloud | agentguard-cloud | 80.0% | moderate |
| docs-sync-agent-cloud | agentguard-cloud | 80.0% | moderate |
| agentguard-autonomous-sdlc--governance-monitor-agent | agent-guard | 80.0% | moderate |
| backlog-hygiene--roadmap-triage-agent | agent-guard | 80.0% | moderate |
| repo-hygiene-agent | agent-guard | 80.0% | moderate |
| governance-monitor-cloud | agentguard-cloud | 80.0% | moderate |

## Reliable (≥95% success)
22 agents operating normally: copilot-pr-fixer, copilot-test-writer, studio-qa, tier-c-copilot-implementer, marketing-content-agent, cicd-hardening-agent, security-audit-agent, test-generation-agent, cicd-hardening-agent-cloud, workspace-backlog-steward, copilot-docs-sync, copilot-test-writer-oss, respond-to-pr-reviews, rollout-canary-validator, marketing-content-agent-cloud, test-generation-agent-cloud, security-audit-agent-cloud, studio-jr, marketing-launch-agent, audit-merged-prs, tier-c-copilot-implementer-hq, studio-sr

## Unknown (insufficient data, 1 run)
9 agents with no exit code data or single runs: qa-em, workspace-config-validator, cloud-qa-test-architect, site-docs-sync, qa-coder-agent, site-builder, studio-product, studio-designer, workspace-agent-reliability

## Recommendations

### 🔴 Investigate Immediately
- **hq-em**: 47% success, 9-run failure streak — likely broken config or dependency issue
- **office-sim-em**: 47% success, 9-run failure streak — likely broken config or dependency issue
- **cloud-qa**: 46% success over 13 runs — needs diagnosis
- **cloud-sr**: 40% success over 20 runs — needs diagnosis
- **product-agent-cloud**: 40% success over 5 runs — needs diagnosis
- **progress-controller-cloud**: 40% success over 5 runs — needs diagnosis
- **analytics-pr-review-agent**: 37% success over 20 runs — needs diagnosis
- **office-sim-qa**: 36% success over 12 runs — needs diagnosis
- **office-sim-sr**: 28% success, 13-run failure streak — likely broken config or dependency issue
- **kernel-sr**: 27% success over 28 runs — needs diagnosis
### 🔴 Cluster Failures (possible shared root cause)
- 9 agents failing together (hq-em, office-sim-em, cloud-qa, cloud-sr, analytics-pr-review-agent, office-sim-qa, office-sim-sr, kernel-sr, cloud-qa-regression-analyzer) — may share a common dependency or token quota issue
### 🟡 Regression Cluster
- 22 agents regressed in the past 3 days — swarm-wide degradation likely caused by a shared root cause (API rate limits, CI failures, or recent code changes)
- Severe regressions (recent <55% success): architect-agent, observability-agent-cloud, recovery-controller-cloud, risk-escalation-agent, risk-escalation-agent-cloud, observability-agent, product-agent, tier-a-architect-review, tier-b-senior-review, recovery-controller-agent, planning-agent-cloud, progress-controller-agent, planning-agent, architect-agent-cloud
### 🟡 Timeout Increases Recommended
- **audit-merged-prs-cloud**: avg 812s vs 900s timeout — increase to ~1350s
- **audit-merged-prs**: avg 837s vs 900s timeout — increase to ~1350s
### 🔴 Shellforge Suite (all broken)
- All 7 shellforge agents are failing — this suite may be new/not-yet-functional or have a configuration issue

_Generated by `workspace-agent-reliability` (`claude-code:opus:ops`) at 2026-03-27T02:52:07Z_