# AgentGuard — Deterministic Governance Runtime

AgentGuard is the governance layer of the system. It enforces deterministic execution constraints on AI coding agents by evaluating every agent action against declared policies and invariants. Violations produce canonical events that feed into the audit trail.

AgentGuard is not an AI system. It is a deterministic runtime that evaluates agent behavior against static rules. No inference, no heuristics, no probabilistic decisions.

## Core Responsibilities

### Action Authorization Boundary (AAB)

The AAB is the central gate through which all agent actions pass before execution.

```
Agent Action Request
    │
    ▼
┌─────────────────────┐
│  Action Authorization │
│     Boundary (AAB)    │
│                       │
│  1. Parse action      │
│  2. Resolve scope     │
│  3. Evaluate policies │
│  4. Check invariants  │
│  5. Compute blast     │
│     radius            │
│  6. Emit decision     │
│     event             │
└───────┬───────────────┘
        │
   ┌────┴────┐
   │         │
ALLOW     DENY
   │         │
   ▼         ▼
Execute   Block +
action    emit PolicyDenied
          or InvariantViolation
```

**Actions evaluated:**
- File modifications (create, edit, delete)
- Repository operations (commit, branch, merge, push)
- CI/CD triggers (workflow dispatch, deployment)
- Package management (install, update, remove)
- Configuration changes (env vars, secrets, permissions)

### Invariant Monitoring

Invariants are conditions that must always hold true. AgentGuard monitors these continuously, not just at action boundaries. There are 26 built-in invariants covering secrets exposure, force push, protected branches, package script injection, blast radius, test-before-push, lockfile integrity, CI/CD config modification, permission escalation, governance self-modification, container config modification, environment variable modification, network egress, destructive migrations, transitive effect analysis, IDE socket access, commit scope, script execution tracking, no-verify bypass, no-self-approve-pr, cross-repo-blast-radius, and more.

**Example invariants:**
- No secrets or credentials in committed files (`no-secret-exposure`)
- No force-push to protected branches (`no-force-push`)
- Blast radius limits are respected — max files modified per action (`blast-radius-limit`)
- Tests must pass before git push (`test-before-push`)
- Agent stays within declared scope (`commit-scope-guard`)
- No `--no-verify` bypass on git push/commit (`no-verify-bypass`)

### Policy Evaluation

Policies are declarative rules that define what an agent is allowed to do.

```yaml
# Example policy definition (target format)
policy:
  name: "documentation-agent"
  scope:
    include:
      - "docs/**"
      - "*.md"
    exclude:
      - "CHANGELOG.md"
  permissions:
    file_create: allow
    file_edit: allow
    file_delete: deny
    git_commit: allow
    git_push: deny
  limits:
    max_files_per_action: 10
    max_lines_changed: 500
```

Policy evaluation is deterministic:
1. Match action against scope (include/exclude patterns)
2. Check permission for action type
3. Verify limits are not exceeded
4. Return ALLOW or DENY with reason

### Blast Radius Computation

Before allowing an action, AgentGuard computes its blast radius — the scope of potential impact.

**Factors:**
- Number of files affected
- Lines of code changed
- Number of dependent modules
- Whether changes cross layer boundaries
- Whether changes affect CI/CD configuration
- Whether changes touch security-sensitive files

Actions exceeding the blast radius limit produce `BlastRadiusExceeded` events.

### Evidence Pack Generation

Every governance decision produces an evidence pack — a structured record of what was evaluated, what rules applied, and what the outcome was.

```json
{
  "evidenceId": "evp_abc123",
  "timestamp": 1709856120000,
  "action": {
    "type": "file_write",
    "target": "src/database/schema.sql",
    "agent": "code-assistant"
  },
  "evaluation": {
    "scope": "OUTSIDE_SCOPE",
    "policies_checked": ["production-scope-guard"],
    "invariants_checked": ["no-production-schema-changes"],
    "blast_radius": {
      "files_affected": 1,
      "is_security_sensitive": true
    }
  },
  "decision": "DENY",
  "reason": "File src/database/schema.sql is outside agent scope and modifies production database schema",
  "event_emitted": "evt_Invariant_scope_1"
}
```

Evidence packs enable:
- Post-session audit of all governance decisions
- Debugging why an action was allowed or denied
- Compliance reporting
- Replay of governance evaluation sequences

## Event Production

AgentGuard produces canonical events (see [Event Model](event-model.md)) that flow into the shared event store. Subscribers (TUI renderer, SQLite sink, CLI inspect) consume these events.

| Outcome | Event Type | Severity |
|---------|------------|----------|
| Action allowed | (no event) | - |
| Policy denied | `PolicyDenied` | Medium |
| Unauthorized action | `UnauthorizedAction` | High |
| Invariant violated | `InvariantViolation` | Critical |
| Blast radius exceeded | `BlastRadiusExceeded` | High |
| Merge guard triggered | `MergeGuardFailure` | High |

## Architecture

AgentGuard operates as a middleware layer between agent intent and execution:

```
Agent Intent
    │
    ▼
AgentGuard Runtime
├── Policy Loader ────── reads policy definitions
├── Scope Resolver ───── determines if action is in scope
├── Invariant Checker ── evaluates system invariants
├── Blast Radius Calc ── computes impact scope
├── Evidence Generator ─ records evaluation details
└── Event Emitter ────── produces canonical events
    │
    ▼
Event Store + EventBus
    │
    ├──▶ Audit Log (compliance record)
    └──▶ Agent Feedback (deny reason for adjustment)
```

## Design Principles

1. **Deterministic evaluation.** Given the same action, policies, and system state, AgentGuard always produces the same decision. No randomness, no inference.

2. **Fail-closed.** If AgentGuard cannot evaluate an action (missing policy, unknown action type), it denies by default.

3. **Zero runtime dependencies.** AgentGuard follows the same zero-dependency constraint as the rest of the system. Policy evaluation is pure logic operating on data.

4. **Observable.** Every decision is recorded in an evidence pack. The system is fully auditable.

5. **Composable policies.** Policies can be combined. Multiple policies can apply to the same action. If any policy denies, the action is denied.

6. **Separation from AI.** AgentGuard does not use AI for evaluation. It is a deterministic runtime. AI agents are the subjects being governed, not the governance mechanism.

## Implementation Status

AgentGuard is **implemented and operational**. The governed action kernel connects all governance infrastructure into a working runtime.

### Kernel Loop (Core)
| Component | File | Status |
|-----------|------|--------|
| Governed action kernel | `packages/kernel/src/kernel.ts` | Complete |
| AAB (normalization) | `packages/kernel/src/aab.ts` | Complete |
| RTA decision engine | `packages/kernel/src/decision.ts` | Complete |
| Runtime monitor (escalation) | `packages/kernel/src/monitor.ts` | Complete |

### Policy Engine
| Component | File | Status |
|-----------|------|--------|
| Policy evaluator | `packages/policy/src/evaluator.ts` | Complete |
| JSON policy loader | `packages/policy/src/loader.ts` | Complete |
| YAML policy loader | `packages/policy/src/yaml-loader.ts` | Complete |

### Safety Infrastructure
| Component | File | Status |
|-----------|------|--------|
| Invariant checker | `packages/invariants/src/checker.ts` | Complete |
| 26 built-in invariants | `packages/invariants/src/definitions.ts` | Complete |
| Evidence pack generation | `agentguard/evidence/pack.ts` | Complete |

### Execution Adapters
| Component | File | Status |
|-----------|------|--------|
| File adapter (read/write/delete) | `packages/adapters/src/file.ts` | Complete |
| Shell adapter (exec with timeout) | `packages/adapters/src/shell.ts` | Complete |
| Git adapter (commit/push/branch) | `packages/adapters/src/git.ts` | Complete |
| Adapter registry | `packages/adapters/src/registry.ts` | Complete |
| Claude Code adapter | `packages/adapters/src/claude-code.ts` | Complete |

### Observability
| Component | File | Status |
|-----------|------|--------|
| SQLite event sink (primary) | `packages/storage/src/sqlite-sink.ts` | Complete |
| JSONL export (portability) | `apps/cli/src/commands/export.ts` | Complete |
| TUI renderer | `packages/renderers/src/tui-renderer.ts` | Complete |

### CLI Commands
| Component | File | Status |
|-----------|------|--------|
| `agentguard guard` | `apps/cli/src/commands/guard.ts` | Complete |
| `agentguard inspect` | `apps/cli/src/commands/inspect.ts` | Complete |
| `agentguard events` | `apps/cli/src/commands/inspect.ts` | Complete |
| `agentguard replay` | `apps/cli/src/replay.ts` | Complete |
| `agentguard export` | `apps/cli/src/commands/export.ts` | Complete |
| `agentguard import` | `apps/cli/src/commands/import.ts` | Complete |
| `agentguard simulate` | `apps/cli/src/commands/simulate.ts` | Complete |
| `agentguard ci-check` | `apps/cli/src/commands/ci-check.ts` | Complete |
| `agentguard policy` | `apps/cli/src/commands/policy.ts` | Complete |
| `agentguard diff` | `apps/cli/src/commands/diff.ts` | Complete |
| `agentguard plugin` | `apps/cli/src/commands/plugin.ts` | Complete |
| `agentguard evidence-pr` | `apps/cli/src/commands/evidence-pr.ts` | Complete |
| `agentguard traces` | `apps/cli/src/commands/traces.ts` | Complete |
| `agentguard init` | `apps/cli/src/commands/init.ts` | Complete |
| `agentguard session-viewer` | `apps/cli/src/commands/session-viewer.ts` | Complete |
| `agentguard status` | `apps/cli/src/commands/status.ts` | Complete |
| `agentguard audit-verify` | `apps/cli/src/commands/audit-verify.ts` | Complete |
| `agentguard analytics` | `apps/cli/src/commands/analytics.ts` | Complete |
| `agentguard team-report` | `apps/cli/src/commands/team-report.ts` | Complete |
| `agentguard adoption` | `apps/cli/src/commands/adoption.ts` | Complete |
| `agentguard learn` | `apps/cli/src/commands/learn.ts` | Complete |
| `agentguard migrate` | `apps/cli/src/commands/migrate.ts` | Complete |
| `agentguard trust` | `apps/cli/src/commands/trust.ts` | Complete |
| `agentguard telemetry` | `apps/cli/src/bin.ts` | Complete |
| `agentguard demo` | `apps/cli/src/commands/demo.ts` | Complete |
| `agentguard auto-setup` | `apps/cli/src/commands/auto-setup.ts` | Complete |
| `agentguard config` | `apps/cli/src/commands/config.ts` | Complete |
| `agentguard cloud` | `apps/cli/src/commands/cloud.ts` | Complete |
| `agentguard claude-init` | `apps/cli/src/commands/claude-init.ts` | Complete |
| `agentguard claude-hook` | `apps/cli/src/commands/claude-hook.ts` | Complete |
| `agentguard copilot-init` | `apps/cli/src/commands/copilot-init.ts` | Complete |
| `agentguard copilot-hook` | `apps/cli/src/commands/copilot-hook.ts` | Complete |
| `agentguard deepagents-init` | `apps/cli/src/commands/deepagents-init.ts` | Complete |
| `agentguard deepagents-hook` | `apps/cli/src/commands/deepagents-hook.ts` | Complete |

### Directory Structure

```
packages/
├── kernel/src/
│   ├── kernel.ts              # Governed action kernel (orchestrator)
│   ├── monitor.ts             # Runtime monitor (escalation tracking)
│   ├── aab.ts                 # Action Authorization Boundary
│   ├── decision.ts            # RTA decision engine
│   └── evidence.ts            # Evidence pack builder
├── policy/src/
│   ├── evaluator.ts           # Policy rule matching
│   ├── loader.ts              # JSON policy loader
│   └── yaml-loader.ts         # YAML policy loader
├── invariants/src/
│   ├── checker.ts             # Invariant evaluation engine
│   └── definitions.ts         # 26 built-in invariants
├── adapters/src/
│   ├── file.ts                # File operations (fs)
│   ├── shell.ts               # Shell execution (child_process)
│   ├── git.ts                 # Git operations
│   ├── registry.ts            # Adapter wiring
│   ├── claude-code.ts         # Claude Code hook adapter
│   └── copilot-cli.ts         # Copilot CLI hook adapter
├── renderers/src/
│   └── tui-renderer.ts        # Terminal action stream
├── storage/src/
│   ├── sqlite-sink.ts         # SQLite event/decision sink (primary)
│   └── sqlite-store.ts        # SQLite event store
└── events/src/
    ├── schema.ts              # Event kinds (47 total), factory, validation
    └── bus.ts                 # Generic typed EventBus

apps/
└── cli/src/
    ├── bin.ts                 # CLI entry point (34 commands)
    └── commands/              # Individual command implementations
```
