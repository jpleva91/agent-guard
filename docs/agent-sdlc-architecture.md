# Deterministic Action Mediation for Agent-Native Software Engineering

## Abstract

As AI agents transition from passive code assistants to active system operators, the fundamental risk in software development shifts from incorrect reasoning to unsafe execution. Agent-generated actions may modify source code, execute infrastructure commands, or interact with external systems.

Traditional guardrails embedded inside language models are probabilistic and insufficient for enforcing safe execution.

This document proposes a deterministic architecture for Agent-Native Software Development Life Cycles (SDLC) based on three principles:

1. Separation of reasoning and execution
2. Deterministic authorization boundaries for agent actions
3. Observable runtime telemetry for agent behavior

The system introduces an Action Authorization Boundary (AAB) that mediates all agent actions and a runtime observability layer (BugMon) that records and visualizes execution outcomes.

Together these components create a controlled environment for safe agent-driven development.

## System Architecture

The architecture separates the AI reasoning layer from the execution environment.

```
Agent Reasoning Layer
(LLM planning, code generation)
        │
        ▼
Intent Compilation
(structured action proposals)
        │
        ▼
Action Authorization Boundary
(deterministic policy enforcement)
        │
        ▼
Execution Adapters
(filesystem, shell, CI, APIs)
        │
        ▼
Runtime Telemetry Layer
(BugMon event monitoring and replay)
```

This separation ensures that probabilistic reasoning never directly controls real-world execution.

## Core Components

### 1. Intent Layer

The AI agent produces structured intent objects representing requested actions rather than raw commands.

Example:

```json
{
  "action": "file.write",
  "target": "src/auth/session.ts",
  "justification": "Fix token refresh logic"
}
```

Intent compilation converts natural language reasoning into canonical action representations. This normalization step is required for deterministic authorization.

**Implementation:** The canonical event factory in [`domain/events.js`](../domain/events.js) provides the `createEvent(kind, data)` function that normalizes all system activity into structured, validated events with stable fingerprints.

### 2. Action Authorization Boundary (AAB)

The AAB is the system's enforcement core and acts as a reference monitor for agent actions.

Responsibilities:

- Canonicalize action requests
- Evaluate policy and capability constraints
- Allow or deny execution
- Record authorization decisions
- Emit execution events

Example policy:

```
file.write: src/**
test.run: allowed
shell.exec: restricted
terraform.apply: denied
```

The AAB represents the smallest trusted component in the system and must remain minimal and auditable.

**Implementation:** The AAB is specified in [`docs/agentguard.md`](agentguard.md) with a complete evaluation pipeline (parse → scope → policy → invariant → blast radius → decision). The action interception prototype exists in [`core/cli/claude-hook.js`](../core/cli/claude-hook.js) as a Claude Code PostToolUse hook.

### 3. Execution Adapters

Execution adapters translate approved actions into real system operations.

Examples:

- Filesystem adapter
- Shell adapter
- Test runner adapter
- CI adapter
- API adapter

All operations must pass through the AAB before execution. Direct agent access to execution environments is prohibited.

**Implementation:** The CLI adapter ([`core/cli/adapter.js`](../core/cli/adapter.js)) wraps child processes and intercepts stderr. The ingestion pipeline ([`domain/ingestion/pipeline.js`](../domain/ingestion/pipeline.js)) orchestrates parse → fingerprint → classify → map stages for all intercepted output.

### 4. Runtime Telemetry Layer (BugMon)

BugMon acts as the observability and feedback system for agent execution.

Instead of relying solely on logs, BugMon records structured events that describe both agent actions and their consequences.

Example events:

```
ActionRequested
ActionAllowed
ActionDenied
FileModified
TestFailed
InvariantViolation
BugResolved
```

BugMon enables:

- Execution replay
- Debugging timelines
- Anomaly detection
- Developer feedback loops

The optional game interface provides an intuitive representation of debugging events but is not required for the telemetry system itself.

**Implementation:** The universal EventBus ([`domain/event-bus.js`](../domain/event-bus.js)) provides pub/sub across Node.js and browser environments. The EventStore ([`domain/event-store.js`](../domain/event-store.js)) persists events with query, replay, and filtering capabilities. The boss escalation system ([`ecosystem/bosses.js`](../ecosystem/bosses.js)) demonstrates threshold-based event aggregation.

## Event Model

All system activity is captured as immutable events.

Example flow:

```
Agent proposes action
        │
        ▼
AAB evaluates policy
        │
        ▼
Action allowed
        │
        ▼
Execution adapter performs operation
        │
        ▼
Test failure occurs
        │
        ▼
BugMon records event
```

This event stream forms a complete audit trail of agent activity.

**Implementation:** The system defines 30 canonical event kinds across 6 categories (ingestion, battle lifecycle, progression, session, governance, developer signals) in [`domain/events.js`](../domain/events.js). Events are validated against schemas, assigned monotonic IDs, and fingerprinted for deduplication.

## Security and Reliability Model

The architecture adopts principles from high-assurance systems.

**Reference Monitor.** All access to execution resources must pass through the AAB.

**Minimal Trusted Computing Base.** The authorization boundary remains small and verifiable.

**Capability-Based Permissions.** Agents receive granular execution rights rather than broad system access.

**Immutable Telemetry.** All decisions and outcomes are recorded as events.

## Academic Foundations

This architecture draws from three established fields of computer science. Citing these foundations distinguishes the system from ad-hoc AI tooling and positions it within rigorous engineering traditions.

### 1. Reference Monitors (Anderson, 1972)

The Action Authorization Boundary implements the classical reference monitor concept from James P. Anderson's 1972 Computer Security Technology Planning Study. A reference monitor must satisfy three properties:

1. **Complete mediation** — every access to a protected resource is checked
2. **Tamper-proof** — the monitor cannot be bypassed or modified by the subjects it governs
3. **Verifiable** — the monitor is small enough to be subject to analysis and testing

The AAB satisfies these properties by design. All agent actions must pass through the boundary (complete mediation). The AAB operates as a deterministic runtime separate from the AI reasoning layer (tamper-proof — the agent cannot modify its own constraints). The policy evaluation logic is pure functions operating on data with no inference or heuristics (verifiable).

Most AI guardrail systems fail the reference monitor test because they embed safety checks inside the probabilistic model itself. By externalizing enforcement into a deterministic boundary, this architecture achieves the formal properties that embedded guardrails cannot.

> Anderson, J. P. (1972). *Computer Security Technology Planning Study*. ESD-TR-73-51, Vol. II. Air Force Electronic Systems Division.

### 2. Capability-Based Security (Dennis & Van Horn, 1966)

The policy model follows the capability-based security paradigm introduced by Jack Dennis and Earl Van Horn. In this model, agents do not receive ambient authority (broad permissions inherited from the user's environment). Instead, each agent receives an explicit capability set — a bounded collection of permissions that defines exactly what actions it may perform.

```yaml
# Agent capability set (not ambient authority)
policy:
  scope:
    include: ["src/**", "tests/**"]
    exclude: ["src/database/**"]
  permissions:
    file_edit: allow
    file_delete: deny
    git_push: deny
```

This is the Principle of Least Authority (POLA) applied to AI agents. The agent can only act within its declared capabilities, regardless of the broader permissions available to the user who invoked it.

The capability model also enables composition. Multiple policies can apply to the same agent. If any policy denies an action, the action is denied (fail-closed composition).

> Dennis, J. B., & Van Horn, E. C. (1966). Programming semantics for multiprogrammed computations. *Communications of the ACM*, 9(3), 143–155.

### 3. Event Sourcing (Domain-Driven Design)

The canonical event model follows the Event Sourcing pattern from domain-driven design. Rather than storing only the current state of the system, every state change is captured as an immutable event. The current state can be reconstructed by replaying the event stream.

This provides three critical capabilities for agent-driven development:

1. **Audit trail** — every agent action, policy decision, and execution outcome is recorded with full context
2. **Replay** — any sequence of events can be replayed to reproduce system behavior, enabling debugging and root cause analysis
3. **Temporal queries** — the system can answer questions about what happened at any point in time, not just what the current state is

The event store supports filtering by kind, time range, and fingerprint, enabling both real-time monitoring and post-hoc analysis.

Event sourcing transforms agent observability from "what is the system doing now" to "what has the system done, and why." This distinction is essential for building trust in autonomous agent behavior.

> Vernon, V. (2013). *Implementing Domain-Driven Design*. Addison-Wesley.
> Young, G. (2010). CQRS Documents. https://cqrs.files.wordpress.com/2010/11/cqrs_documents.pdf

## Advantages

- Deterministic safety enforcement
- Observable agent execution
- Improved debugging workflows
- Human-interpretable agent behavior
- Compatibility with existing development tools

This architecture enables organizations to safely integrate autonomous agents into software engineering workflows without sacrificing control or auditability.

## Future Work

Potential extensions include:

- Automated policy synthesis from codebase analysis
- Invariant learning from repository history
- Agent debugging replay systems
- Multi-agent orchestration frameworks with shared governance
- AI-assisted root cause analysis from event streams

These capabilities transform agent-driven development from experimental tooling into a structured and observable engineering discipline.

## Summary

Agent-native development requires a fundamental shift in system architecture.

By separating reasoning from execution and introducing deterministic enforcement boundaries, it becomes possible to safely deploy AI agents in real engineering environments.

The combination of Action Authorization Boundaries (AAB) and runtime telemetry systems like BugMon provides the foundational infrastructure for this next generation of software development.

## See Also

- [AgentGuard Specification](agentguard.md) — detailed governance runtime design
- [Unified Architecture](unified-architecture.md) — how AgentGuard and BugMon integrate
- [Event Model](event-model.md) — canonical event schema and lifecycle
- [Architecture](../ARCHITECTURE.md) — system-level technical architecture
