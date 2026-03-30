# Autonomous SDLC Methodology: How 70K Lines Were Built in Under Two Weeks

## Executive Summary

AgentGuard — a 70,000-line, 20-package governed action runtime — was built in under two weeks by a single engineer orchestrating an autonomous agent swarm. This document describes the methodology, provides evidence of the velocity achieved, and explains why this approach is transferable to any software domain.

**Key metrics:**
- 33,668 lines of production TypeScript, 39,160 lines of tests
- 20 workspace packages, 3 applications (CLI, VS Code extension, telemetry server)
- 142 test files, 26 invariants, 47 event kinds, 41 action types
- Equivalent to 240 story points / 6-8 months of traditional senior engineering
- Delivered in <2 weeks by one person with an autonomous agent swarm

---

## The Core Insight

Governance is not a constraint on velocity. It is the **enabler** of velocity.

When agents cannot accidentally break production, delete secrets, or corrupt the repository, they can run continuously without human supervision. The entire SDLC — implementation, review, testing, merging, documentation — becomes autonomous.

---

## 1. Swarm Architecture: 26 Agents Across 5 Tiers

The swarm is organized into tiers with distinct responsibilities and cadences:

### Core Tier (8 agents, every 2 hours)
| Agent | Role |
|-------|------|
| coder-agent | Implements issues on feature branches |
| code-review-agent | Reviews open PRs for correctness, style, and safety |
| pr-merger-agent | Auto-merges approved PRs with passing CI |
| ci-triage-agent | Triages CI failures (skip-if-green) |
| merge-conflict-resolver | Resolves merge conflicts (serialized, 1 PR/run) |
| pr-review-responder | Responds to unresolved review comments |
| stale-branch-janitor | Daily cleanup of stale branches and PRs |
| recovery-controller | Self-healing for swarm health |

### Governance Tier (3 agents)
| Agent | Role |
|-------|------|
| governance-monitor | Daily governance audit + policy effectiveness |
| risk-escalation-agent | Cumulative risk assessment, gates dangerous operations |
| recovery-controller | Detects unhealthy conditions, executes remediation |

### Operations Tier (8 agents, daily)
| Agent | Role |
|-------|------|
| planning-agent | Sprint planning + strategy ingestion |
| observability-agent | SRE health analysis |
| backlog-steward | ROADMAP expansion (capped 3 issues/run) |
| docs-sync-agent | Documentation staleness detection |
| product-agent | Product health + roadmap alignment |
| progress-controller | Tracks roadmap phase transitions |
| repo-hygiene-agent | Detects stale/solved issues |
| retrospective-agent | Weekly failure pattern analysis |

### Quality Tier (5 agents)
| Agent | Role |
|-------|------|
| test-agent | Daily test health + coverage analysis |
| test-generation-agent | Weekly test generation for untested modules |
| security-audit-agent | Weekly dependency + source code security scan |
| architect-agent | Reviews open PRs for architectural concerns |
| cicd-hardening-agent | Weekly CI/CD supply chain audit |

### Marketing Tier (1 agent)
| Agent | Role |
|-------|------|
| marketing-content-agent | Weekly content generation |

---

## 2. Skill Composition: 39 Reusable Building Blocks

Each agent composes its workflow from reusable skills. A skill is a markdown template that defines a discrete capability with clear inputs, outputs, and STOP conditions.

**Development Skills:** start-governance-runtime, sync-main, discover-next-issue, claim-issue, implement-issue, run-tests, create-pr

**Governance Skills:** governance-log-audit, policy-effectiveness-review, recovery-controller, risk-escalation

**Quality Skills:** full-test, test-health-review, generate-tests, dependency-security-audit, security-code-scan, architecture-review, cicd-hardening-audit

**Operational Skills:** sprint-planning, observability-review, backlog-steward, scheduled-docs-sync, product-health-review, progress-controller, repo-hygiene, retrospective, resolve-merge-conflicts, respond-to-pr-reviews, stale-branch-janitor, triage-failing-ci

**Artifact Skills:** release-prepare, release-publish, marketing-content

### Example: The Coder Agent Workflow

```
1. start-governance-runtime    → activate PreToolUse hooks
2. sync-main                   → pull latest from origin
3. discover-next-issue         → find highest-priority pending issue
4. claim-issue                 → label with status:in-progress
5. implement-issue             → code on feature branch
6. run-tests                   → pnpm test, fix failures
7. create-pr                   → push + open PR with evidence summary

If any skill reports STOP, end the run and report why.
```

Each agent's prompt includes a critical autonomy directive:

> "This is an unattended scheduled task. No human is present. NEVER pause to ask for clarification. Default to the safest option."

### Claude Desktop Configuration

Scaffolding generates the files, but each agent must also be configured in **Claude Desktop** to run autonomously:

1. **Create scheduled tasks** — Register each agent as a scheduled task in Claude Desktop using the cron schedules from the agent manifest. Point the task at the agent's prompt file (e.g., `.claude/prompts/coder-agent.md`).

2. **Set `worktree: true`** — Enable worktree isolation for every scheduled task. Each agent run gets its own isolated git worktree, preventing parallel agents from conflicting on file writes, git index locks, and branch state. Without this, concurrent agents will corrupt each other's working directory.

3. **Bypass permissions manually** — Since agents run unattended with no human to approve tool-use prompts, you must pre-approve the required permissions (file read/write, shell execution, git operations) for each agent in Claude Desktop. AgentGuard's governance policy and invariant system provide a second layer of defense, but Claude Desktop's permission gates must be resolved before the agent can start.

---

## 3. Governance as Execution Boundary

Every agent tool call passes through the AgentGuard kernel before execution:

```
Agent proposes tool call (Write, Bash, etc.)
        ↓
PreToolUse hook fires → AgentGuard kernel
        ↓
AAB normalizes intent (tool → action type, detect destructive patterns)
        ↓
Three-layer evaluation:
  Layer 1: Capabilities — can this agent attempt this action class?
  Layer 2: Policies    — is this allowed under governance rules?
  Layer 3: Invariants  — would this violate system correctness?
        ↓
Decision recorded (JSONL/SQLite audit trail)
        ↓
ALLOW → tool executes  |  DENY → tool blocked, agent informed
```

### 17 Built-in Invariants

1. no-secret-exposure (severity 5) — block .env, .pem, .key, credentials
2. protected-branch (severity 5) — deny direct push to main/master
3. blast-radius (severity 4) — file modification count limits
4. test-before-push (severity 3) — tests must pass before push
5. no-force-push (severity 5) — block git push --force
6. lockfile-integrity (severity 3) — lock file consistency
7. no-skill-modification (severity 5) — block agent skill self-modification
8. no-scheduled-task-modification (severity 5) — block cron/schedule changes
9. credential-file-creation (severity 5) — block new .netrc, AWS credentials
10. package-script-injection (severity 4) — protect lifecycle scripts
11. recursive-operation-guard (severity 2) — catch find -exec + write/delete
12. large-file-write (severity 3) — per-file size limits
13. no-cicd-config-modification (severity 5) — protect .github/workflows
14. no-permission-escalation (severity 4) — prevent chmod/chown abuse
15. no-governance-self-modification (severity 5) — protect governance config
16. no-container-config-modification (severity 3) — protect Dockerfile
17. no-env-var-modification (severity 3) — prevent shell profile injection

### Escalation State Machine

Repeated violations trigger escalation that constrains agent behavior:

```
NORMAL → ELEVATED → HIGH → LOCKDOWN
```

- **NORMAL**: all issues eligible
- **ELEVATED**: prefer smaller-scope issues
- **HIGH**: only 5-file-or-fewer issues
- **LOCKDOWN**: refuse new work entirely

---

## 4. Distributed Coordination via Shared State

Agents coordinate without a centralized scheduler through a shared state contract:

```json
{
  "mode": "normal",
  "prQueueHealthy": true,
  "openAgentPRs": 3,
  "currentPhase": "Phase 5",
  "escalationLevel": "NORMAL",
  "lastSync": "2026-03-15T10:43:47Z",
  "priorities": ["issue-336", "issue-335"]
}
```

**Pre-flight checks prevent queue saturation:**
- If `openAgentPRs >= 5`, the coder agent skips its run
- If `escalationLevel === "LOCKDOWN"`, no new work is started
- If `mode === "SAFE"`, only fixes are attempted

This enables parallel execution across 26 agents without coordination overhead.

---

## 5. The Reflexive Property: Self-Governing Development

AgentGuard governs the agents that develop AgentGuard. This creates:

1. **Empirical behavior data** — every agent failure, policy violation, and unsafe pattern becomes research data that improves the product
2. **Live safety lab** — the development process is itself a governance testbed
3. **Recursive validation** — if AgentGuard governs its own development and the development succeeds, the governance model is validated

This is not a toy demo. The 70K-line codebase, passing test suite, and functioning CI/CD pipeline are proof that the governance model works under real conditions.

---

## 6. Velocity Evidence

### Commit Timeline (3 days of recorded history)

| Date | Commits | Highlights |
|------|---------|------------|
| Mar 13 | 10 | Permission escalation invariant, SQLite migrations, SQL aggregation, policy suggestions, governance self-modification invariant |
| Mar 14 | 25 | Webhook storage, monorepo restructure, telemetry server, swarm package, privacy-first telemetry, performance benchmarks, plan-level simulation |
| Mar 15 | 16 | Session viewer, tamper-resistant audit trail, OpenClaw adapter, dependency graph simulator, auto-build hooks, agent persona capture |

### Parallel Execution Evidence

Bursts of 3 commits within 2 minutes are visible throughout the log — a signature of multiple agents completing work simultaneously on independent branches:

```
2026-03-14 20:30:25 | feat(issue-395): add performance benchmark suite
2026-03-14 20:30:58 | fix(issue-401): fix Windows path separators
2026-03-14 20:31:21 | feat(issue-416): add transitive effect analysis invariant
```

PR numbers reach #449, indicating hundreds of PRs were opened, reviewed, and merged autonomously.

### Engineering Equivalent

| Metric | Value |
|--------|-------|
| Story points (estimated) | ~240 SP |
| Traditional solo engineer time | 6-8 months |
| Traditional 2-person team time | 3-4 months |
| Actual time with agent swarm | <2 weeks |
| Velocity multiplier | 10-15x |
| Dollar equivalent (agency rates) | $190-250K |

---

## 7. Why This Is Transferable

This methodology is not specific to AgentGuard. The pattern generalizes:

1. **Define a governance kernel** — deterministic policy evaluation for agent actions
2. **Create reusable skills** — template library of domain-specific capabilities
3. **Personalize agents** — distinct prompts with role-specific autonomy directives
4. **Hook into execution** — intercept tool calls before execution
5. **Audit everything** — canonical event model captures all decisions
6. **Coordinate via state** — shared JSON enables distributed orchestration
7. **Self-govern development** — agents developing the system are governed by the system

Any software project can adopt this pattern. The governance kernel prevents the failure modes that make autonomous agents dangerous (secret exposure, destructive commands, unreviewed merges), while the skill composition system enables rapid domain-specific customization.

---

## Academic Foundations

The architecture draws from three established computer science fields:

- **Reference Monitors** (Anderson, 1972) — every action checked against policy
- **Capability-Based Security** (Dennis & Van Horn, 1966) — bounded, explicit authority
- **Event Sourcing** (Domain-Driven Design) — all state changes as immutable events

---

## Conclusion

The autonomous SDLC methodology demonstrated here achieves 10-15x velocity over traditional engineering by:

1. Running 26 specialized agents in parallel on 2-hour cycles
2. Enforcing governance boundaries that make unsupervised execution safe
3. Composing workflows from 39 reusable skills
4. Coordinating through shared state rather than human standup meetings
5. Auditing every decision for accountability and learning

The result is not just a product — it is proof that governed autonomous agents can reliably produce production-grade software at a pace that was previously impossible.
