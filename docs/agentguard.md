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

Invariants are conditions that must always hold true. AgentGuard monitors these continuously, not just at action boundaries.

**System invariants:**
- Test suite passes after modifications
- No secrets or credentials in committed files
- Protected files are not modified without explicit authorization

**Operational invariants:**
- Agent stays within declared scope (specific directories, file patterns)
- Blast radius limits are respected (max files modified per action)
- No destructive operations without confirmation
- No force-push to protected branches

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

AgentGuard produces canonical events (see [Event Model](event-model.md)) that flow into the shared event store. Subscribers (TUI renderer, JSONL sink, CLI inspect) consume these events.

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
| Governed action kernel | `agentguard/kernel.ts` | Complete |
| AAB (normalization) | `agentguard/core/aab.ts` | Complete |
| RTA decision engine | `agentguard/core/engine.ts` | Complete |
| Runtime monitor (escalation) | `agentguard/monitor.ts` | Complete |

### Policy Engine
| Component | File | Status |
|-----------|------|--------|
| Policy evaluator | `agentguard/policies/evaluator.ts` | Complete |
| JSON policy loader | `agentguard/policies/loader.ts` | Complete |
| YAML policy loader | `agentguard/policies/yaml-loader.ts` | Complete |

### Safety Infrastructure
| Component | File | Status |
|-----------|------|--------|
| Invariant checker | `agentguard/invariants/checker.ts` | Complete |
| 6 default invariants | `agentguard/invariants/definitions.ts` | Complete |
| Evidence pack generation | `agentguard/evidence/pack.ts` | Complete |

### Execution Adapters
| Component | File | Status |
|-----------|------|--------|
| File adapter (read/write/delete) | `agentguard/adapters/file.ts` | Complete |
| Shell adapter (exec with timeout) | `agentguard/adapters/shell.ts` | Complete |
| Git adapter (commit/push/branch) | `agentguard/adapters/git.ts` | Complete |
| Adapter registry | `agentguard/adapters/registry.ts` | Complete |
| Claude Code adapter | `agentguard/adapters/claude-code.ts` | Complete |

### Observability
| Component | File | Status |
|-----------|------|--------|
| JSONL event sink | `agentguard/sinks/jsonl.ts` | Complete |
| TUI renderer | `agentguard/renderers/tui.ts` | Complete |

### CLI Commands
| Component | File | Status |
|-----------|------|--------|
| `aguard guard` | `cli/commands/guard.ts` | Complete |
| `aguard inspect` | `cli/commands/inspect.ts` | Complete |
| `aguard events` | `cli/commands/inspect.ts` | Complete |

### Directory Structure

```
agentguard/
├── kernel.ts              # Governed action kernel (orchestrator)
├── monitor.ts             # Runtime monitor (escalation tracking)
├── core/
│   ├── aab.ts             # Action Authorization Boundary
│   └── engine.ts          # RTA decision engine
├── policies/
│   ├── evaluator.ts       # Policy rule matching
│   ├── loader.ts          # JSON policy loader
│   └── yaml-loader.ts     # YAML policy loader
├── invariants/
│   ├── checker.ts         # Invariant evaluation engine
│   └── definitions.ts     # 6 default invariants
├── evidence/
│   └── pack.ts            # Evidence pack builder
├── adapters/
│   ├── file.ts            # File operations (fs)
│   ├── shell.ts           # Shell execution (child_process)
│   ├── git.ts             # Git operations
│   ├── registry.ts        # Adapter wiring
│   └── claude-code.ts     # Claude Code hook adapter
├── renderers/
│   └── tui.ts             # Terminal action stream
└── sinks/
    └── jsonl.ts           # JSONL event persistence
```
