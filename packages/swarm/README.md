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
aguard init swarm

# This creates:
#   agentguard-swarm.yaml   — swarm configuration
#   .claude/skills/*.md     — 39 skill definitions
#   agentguard.yaml         — governance policy (if missing)
```

### Claude Desktop Setup

After scaffolding, each agent must be registered as a **scheduled task** in Claude Desktop. The scaffolder outputs the full agent manifest with cron schedules — but you still need to configure three things manually:

#### 1. Create scheduled tasks in Claude Desktop

Open Claude Desktop and create a scheduled task for each agent you want to run. Use the cron schedule from the agent manifest and point the task at the agent's prompt file (e.g., `.claude/prompts/coder-agent.md`).

#### 2. Enable worktree isolation

In each scheduled task's configuration, set **worktree to `true`**. This gives each agent run an isolated git worktree so parallel agents don't interfere with each other's file changes or git state.

```json
{
  "task": "coder-agent",
  "schedule": "0 */2 * * *",
  "worktree": true
}
```

Without worktree isolation, concurrent agents will conflict on file writes, git index locks, and branch state.

#### 3. Bypass permissions manually

Scheduled agents run **unattended** — there is no human to approve tool-use permission prompts. You must manually pre-approve the necessary permissions for each agent before it can run autonomously. In Claude Desktop, configure the agent's permissions to allow the tools it needs (file read/write, shell execution, git operations) without interactive confirmation.

> **Important:** Review the governance policy (`agentguard.yaml`) before granting broad permissions. AgentGuard's invariant system acts as a second layer of defense, but the policy should be tuned to your project's risk tolerance.

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
aguard init swarm

# In your enterprise repo
cd ~/enterprise-project
aguard init swarm
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

## Squad Structure

The swarm can be organized into **squads** — small, autonomous teams of AI agents with a reporting hierarchy. Each squad has an Engineering Manager (EM) overseeing 5 specialist agents, all reporting up to a single Director agent.

### Squad Manifest Schema

Squads are defined in a YAML manifest (`squad-manifest.yaml`):

```yaml
version: "1.0.0"

org:
  director:
    id: director
    rank: director
    driver: claude-code
    model: opus
    cron: "0 7,19 * * *"
    skills: [squad-status, director-brief, escalation-router]

squads:
  kernel:
    repo: agent-guard
    em:
      id: kernel-em
      rank: em
      driver: claude-code
      model: opus
      cron: "0 */3 * * *"
      skills: [squad-plan, squad-execute, squad-status]
    agents:
      product-lead: { id: kernel-pl, rank: product-lead, driver: claude-code, model: sonnet, ... }
      architect:    { id: kernel-arch, rank: architect, driver: claude-code, model: opus, ... }
      senior:       { id: kernel-sr, rank: senior, driver: copilot-cli, model: sonnet, ... }
      junior:       { id: kernel-jr, rank: junior, driver: copilot-cli, model: copilot, ... }
      qa:           { id: kernel-qa, rank: qa, driver: copilot-cli, model: sonnet, ... }

loopGuards:
  maxOpenPRsPerSquad: 3
  maxRetries: 3
  maxBlastRadius: 20
  maxRunMinutes: 10
```

Each squad agent specifies a `driver` (`claude-code` or `copilot-cli`), a `model` (`opus`, `sonnet`, `haiku`, `copilot`), a `rank`, and a set of skills. Valid ranks: `director`, `em`, `product-lead`, `architect`, `senior`, `junior`, `qa`.

### Identity Format

Every agent in a squad has a 4-part identity string: `driver:model:squad:rank`. For example:

- `claude-code:opus:kernel:em` — the kernel squad's EM running on Claude Code with Opus
- `copilot-cli:sonnet:cloud:senior` — the cloud squad's senior dev running on Copilot CLI with Sonnet

Identity strings are parsed from agent metadata at runtime and flow through telemetry, so the dashboard can attribute actions to specific agents within a squad.

```typescript
import { buildAgentIdentity, parseAgentIdentity } from '@red-codes/swarm';

const identity = buildAgentIdentity(agent, 'kernel');
// => "copilot-cli:sonnet:kernel:senior"

const parsed = parseAgentIdentity('copilot-cli:sonnet:kernel:senior');
// => { driver: 'copilot-cli', model: 'sonnet', squad: 'kernel', rank: 'senior' }
```

### Loop Guards

Every agent checks **4 loop guards** at run start to prevent runaway behavior:

| Guard | Config Key | Description |
|-------|-----------|-------------|
| Budget | `maxOpenPRsPerSquad` | Blocks new PRs when the squad has too many open |
| Retry | `maxRetries` | Stops retrying after N consecutive failures |
| Blast Radius | `maxBlastRadius` | Rejects changes touching too many files |
| Time | `maxRunMinutes` | Kills runs that exceed the time limit |

All four guards must pass for an agent to proceed. Violations are returned with the specific guard names that failed.

### State File Locations

Each squad maintains its own state directory under `.agentguard/squads/`:

```
.agentguard/
  squads/
    kernel/
      state.json        # Current squad state (sprint goal, assignments, PR queue, blockers)
      learnings.json    # Accumulated learnings from retrospectives
      em-report.json    # Latest EM health report for the director
    cloud/
      state.json
      learnings.json
      em-report.json
    qa/
      state.json
      learnings.json
      em-report.json
  director-brief.json   # Aggregated brief from all squad EM reports
```

Use `scaffoldSquad` to initialize these directories:

```typescript
import { loadSquadManifest, scaffoldSquad } from '@red-codes/swarm';

const manifest = loadSquadManifest(yamlContent);
for (const [name, squad] of Object.entries(manifest.squads)) {
  scaffoldSquad('/path/to/project', name, squad);
}
```

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
