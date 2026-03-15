# @red-codes/swarm

**Autonomous agent swarm for software development.** 26 coordinated AI agents that handle your entire SDLC — implementation, code review, CI triage, security audits, planning, and more — all running under governance policy enforcement.

This is the same swarm that builds AgentGuard itself.

## What It Does

The swarm scaffolds a complete autonomous development pipeline into any repository. Agents are scheduled via cron and coordinate through shared state. Every agent action passes through [AgentGuard](https://github.com/AgentGuardHQ/agent-guard) governance — policy evaluation, invariant checking, escalation tracking, and audit logging.

```
ROADMAP.md (you write strategy)
    │
    ├── Planning Agent (daily) ─── reads roadmap, sets priorities
    ├── Backlog Steward (daily) ── expands roadmap into issues
    ├── Coder Agent (2-hourly) ─── picks issues, implements, creates PRs
    ├── Code Review Agent (2h) ─── reviews PRs for quality
    ├── Architect Agent (daily) ── reviews PRs for architecture
    ├── CI Triage Agent (hourly) ─ fixes failing CI
    ├── PR Merger Agent (2h) ───── auto-merges when gates pass
    ├── Security Audit (weekly) ── dependency + code scanning
    ├── Recovery Controller (2h) ─ self-healing, detects unhealthy state
    └── ... 17 more agents
```

## Quick Start

```bash
# Clone and build AgentGuard
git clone https://github.com/AgentGuardHQ/agent-guard.git
cd agent-guard
pnpm install && pnpm build

# Link the CLI globally
cd apps/cli && npm link && cd ../..

# Scaffold the swarm into your project
cd /path/to/your-project
agentguard init swarm

# This creates:
#   agentguard-swarm.yaml   — swarm configuration
#   .claude/skills/*.md     — 39 skill definitions
#   agentguard.yaml         — governance policy (if missing)
```

Then register the agents as scheduled tasks in your Claude Code environment. The scaffolder outputs the full agent manifest with cron schedules.

## Agents

### Core Tier (7 agents)

| Agent | Schedule | Role |
|-------|----------|------|
| Implementation Agent | Every 2h | Picks issues, implements code, creates PRs |
| Code Review Agent | Every 2h | Reviews open PRs for quality |
| PR Merger Agent | Every 2h | Auto-merges PRs with passing CI + approvals |
| CI Triage Agent | Hourly | Diagnoses and fixes CI failures |
| Merge Conflict Resolver | Every 2h | Resolves conflicts (1 PR per run) |
| PR Review Responder | Hourly | Responds to review comments |
| Stale Branch Janitor | Daily 8am | Cleans up stale branches and PRs |

### Governance Tier (3 agents)

| Agent | Schedule | Role |
|-------|----------|------|
| Recovery Controller | Every 2h | Self-healing — detects and remediates unhealthy swarm state |
| Risk Escalation Agent | Every 4.5h | Cumulative risk assessment, gates dangerous operations |
| Governance Monitor | Daily 2am | Audits governance logs, reviews policy effectiveness |

### Ops Tier (8 agents)

| Agent | Schedule | Role |
|-------|----------|------|
| Planning Agent | Daily 6am | Sprint planning, priority setting |
| Backlog Steward | Daily 5am | Expands ROADMAP into issues (max 3/run) |
| Observability Agent | Daily 9am | SRE health monitoring |
| Documentation Maintainer | Daily 11am | Keeps docs in sync with code |
| Product Agent | Daily 7am | Product health and roadmap alignment |
| Progress Controller | Daily 7am | Tracks roadmap phase completion |
| Repo Hygiene Agent | Daily 3am | Detects stale issues |
| Retrospective Agent | Weekly Mon 8am | Failure analysis, lessons learned |

### Quality Tier (7 agents)

| Agent | Schedule | Role |
|-------|----------|------|
| Test Agent | Daily 8am | Test health and coverage analysis |
| Test Generation Agent | Weekly Mon 11am | Generates tests for untested modules |
| Security Audit Agent | Weekly Sun 8pm | Dependency + source code security scan |
| Architect Agent | Daily 10am | Architectural review of PRs |
| CI/CD Hardening Agent | Weekly Sun 9pm | Action pinning, permissions, supply chain audit |
| Merged PR Auditor | Weekly Mon 9am | Audits recently merged PRs for missed risks |
| Infrastructure Health Agent | Daily 9pm | SDLC pipeline health check |

### Marketing Tier (1 agent)

| Agent | Schedule | Role |
|-------|----------|------|
| Marketing Content Agent | Weekly Mon 9am | Drafts social posts and blog outlines |

## Configuration

After scaffolding, customize `agentguard-swarm.yaml`:

```yaml
swarm:
  # Enable/disable agent tiers
  tiers:
    - core          # Essential: coder, reviewer, merger, CI triage
    - governance    # Risk escalation, recovery, policy audit
    - ops           # Planning, observability, docs, retrospectives
    - quality       # Testing, security, architecture review
    # - marketing   # Content generation (opt-in)

  # Override cron schedules per agent
  schedules:
    coder-agent: '0 */4 * * *'     # Slow down to every 4 hours
    ci-triage-agent: '0 */2 * * *' # Less frequent CI checks

  # Project-specific paths
  paths:
    policy: agentguard.yaml         # Governance policy file
    roadmap: ROADMAP.md             # Your project roadmap
    swarmState: .agentguard/swarm-state.json
    logs: logs/runtime-events.jsonl
    cli: agentguard                  # How to invoke the CLI

  # Behavioral thresholds
  thresholds:
    maxOpenPRs: 5        # Coder stops creating PRs above this
    prStaleHours: 48     # PRs older than this get flagged
    blastRadiusHigh: 16  # Actions above this score get escalated
```

## Multi-Project Setup

The swarm is designed to work across multiple repositories. Each repo gets its own:
- `ROADMAP.md` — defines what the swarm builds
- `agentguard-swarm.yaml` — configures agent behavior
- `agentguard.yaml` — governance policy
- `.agentguard/swarm-state.json` — runtime coordination state

To run the same swarm on two repos (e.g., an OSS repo and a private enterprise repo):

```bash
# In your OSS repo
cd ~/oss-project
agentguard init swarm

# In your enterprise repo
cd ~/enterprise-project
agentguard init swarm
```

Each repo has its own ROADMAP.md driving independent priorities. The agents operate under their respective governance policies. Swarm state is per-repo.

## How Agents Coordinate

Agents share state through `.agentguard/swarm-state.json`:

```json
{
  "mode": "normal",
  "currentPhase": "Phase 6",
  "prQueueHealthy": true,
  "openAgentPRs": 3,
  "priorities": [42, 38, 45],
  "lastProgressRun": "2026-03-15T07:00:00Z"
}
```

- **mode**: `normal` | `conservative` | `safe` — the Recovery Controller escalates when things go wrong
- **prQueueHealthy**: Coder Agent skips when `false` (too many open PRs)
- **priorities**: Planning Agent sets issue priority order
- **currentPhase**: Progress Controller tracks ROADMAP phase

## Skills

Each agent executes one or more **skills** — markdown-defined task playbooks in `.claude/skills/`. Skills are composable and reusable across agents.

All 39 skills are scaffolded from templates with your project-specific paths and labels injected.

## Governance Integration

Every agent starts by invoking the `start-governance-runtime` skill, which activates AgentGuard hooks in Claude Code. This means:

- All file writes, shell commands, and git operations are policy-checked
- Destructive actions are blocked by invariants
- Violations escalate the system (NORMAL → ELEVATED → HIGH → LOCKDOWN)
- Full audit trail in JSONL for every agent action

## Programmatic API

```typescript
import { scaffold, loadConfig, loadManifest, filterAgentsByTier } from '@red-codes/swarm';

// Scaffold swarm into a project
const result = await scaffold({
  projectRoot: '/path/to/project',
  force: false,
  tiers: ['core', 'governance'],
});

// Load and filter agents
const manifest = loadManifest();
const coreAgents = filterAgentsByTier(manifest.agents, ['core']);
```

## License

[Apache 2.0](../../LICENSE)
