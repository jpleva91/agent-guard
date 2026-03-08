# AgentGuard — Deterministic Governance Runtime

AgentGuard is the governance layer of the system. It enforces deterministic execution constraints on AI coding agents by evaluating every agent action against declared policies and invariants. Violations produce canonical events that feed into BugMon encounters.

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
- Layer boundaries are maintained (no cross-imports between `core/` and `game/`)
- Bundle size stays within budget
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

AgentGuard produces canonical events (see [Event Model](event-model.md)) that flow into the shared event store. BugMon subscribes to these events and generates encounters from them.

| AgentGuard Outcome | Event Type | BugMon Effect |
|-------------------|------------|---------------|
| Action allowed | (no event) | No encounter |
| Policy denied | `PolicyDenied` | Governance enemy |
| Unauthorized action | `UnauthorizedAction` | Governance boss |
| Invariant violated | `InvariantViolation` | Elite governance boss |
| Blast radius exceeded | `BlastRadiusExceeded` | Governance boss |
| Merge guard triggered | `MergeGuardFailure` | Governance boss |

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
    ├──▶ BugMon (encounters from violations)
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

## Current Implementation Status

AgentGuard is in the specification phase. The following existing components provide the foundation:

| Concept | Existing Foundation | Path |
|---------|-------------------|------|
| Event emission | EventBus | `domain/event-bus.js` |
| Event types | Events constant (to be extended with governance types) | `domain/events.js` |
| Action interception | Claude Code PostToolUse hook | `core/cli/claude-hook.js` |
| Error classification | BugEvent severity mapping | `core/bug-event.js` |
| Boss triggers | Threshold-based escalation | `ecosystem/bosses.js` |

## Target Directory Structure

```
agentguard/
├── core/          # Runtime engine
│   ├── aab.js     # Action Authorization Boundary
│   └── runtime.js # Main governance loop
├── policies/      # Policy definitions and evaluation
│   ├── loader.js  # Policy file parser
│   ├── eval.js    # Deterministic policy evaluator
│   └── default.yaml  # Default policy set
├── invariants/    # Invariant definitions and monitoring
│   ├── checker.js # Invariant evaluation engine
│   └── system.js  # Built-in system invariants
├── evidence/      # Evidence pack generation
│   ├── pack.js    # Evidence pack builder
│   └── store.js   # Evidence persistence
└── cli/           # CLI integration
    ├── guard.js   # CLI command for governance mode
    └── report.js  # Governance audit report
```
