# Product Positioning

## What This Is

**AgentGuard** is a governed action runtime for AI coding agents. It intercepts agent tool calls, enforces policies and invariants, executes authorized actions, and emits lifecycle events. Every agent action passes through a deterministic kernel that decides allow/deny before execution.

AgentGuard answers one question: **"Should this AI agent be allowed to do this?"**

The first integration target is **Claude Code** via its hook system (PreToolUse/PostToolUse). The architecture supports any agent framework that can normalize tool calls into the canonical action format.

## What This Is Not

### Not monitoring or observability

AgentGuard is not Sentry, Datadog, or a logging tool. It is an **active runtime** that intercepts and gates actions before they happen. It blocks destructive commands. It denies pushes to protected branches. It enforces blast radius limits. Monitoring happens as a side effect of enforcement, not as the goal.

### Not AI-based safety

AgentGuard does not use AI to evaluate agent actions. Policy evaluation is deterministic: pattern matching, scope checking, invariant verification. Same action + same policy = same decision. No heuristics, no inference, no probabilistic decisions.

### Not a sandbox or VM

AgentGuard operates at the application layer, not the OS layer. It doesn't intercept syscalls or run agents in containers. It works by integrating with agent tool-use interfaces (Claude Code hooks, future framework adapters) to evaluate actions before they execute.

## Why This Architecture

The **governed action kernel** pattern solves a real problem: AI coding agents can execute arbitrary tool calls — file writes, shell commands, git operations — with no systematic policy enforcement. AgentGuard provides:

1. **Policy enforcement** — declare what agents can and cannot do in YAML/JSON. The kernel enforces it deterministically.
2. **Invariant safety** — 6 built-in invariants (no secret exposure, protected branches, blast radius limits, test-before-push, no force push, lockfile integrity) catch safety violations.
3. **Escalation** — repeated denials or violations escalate from NORMAL → ELEVATED → HIGH → LOCKDOWN (all actions blocked until human intervention).
4. **Audit trail** — every action proposal, decision, and execution is recorded as JSONL events. Fully inspectable and replayable.
5. **Extensibility** — custom policies, custom invariants, custom adapters for new agent frameworks.

## Who This Is For

### Primary: Developers using AI coding agents

Developers who use Claude Code, Copilot, Cursor, or similar AI assistants and want guardrails on what the agent can do. "Let the agent write code, but don't let it push to main or delete production files."

### Secondary: Teams with AI agent governance requirements

Organizations that need audit trails and policy enforcement for AI-assisted development. Compliance, security, and risk management.

### Tertiary: Agent framework builders

Developers building agent systems who want a reusable governance layer. AgentGuard's canonical action model and policy engine can be integrated into any agent framework.

## How Developers Discover This

1. **Claude Code integration** — `agentguard guard --policy agentguard.yaml` starts the runtime. Agent actions are evaluated in real-time.
2. **CLI** — pipe actions into `agentguard guard` to see allow/deny decisions.
3. **npm** — `npm install -g agentguard` for the CLI.
4. **Policy files** — drop an `agentguard.yaml` in your repo to define agent boundaries.

## Competitive Position

| Category | Existing Tools | AgentGuard |
|----------|---------------|------------|
| AI agent governance | No standard tool | Deterministic runtime with policy evaluation, invariant checking, escalation |
| Policy enforcement | Ad-hoc rules in prompts | Declarative YAML/JSON policies with pattern matching and scope rules |
| Agent audit trails | Manual logging | Automatic JSONL event streams with full action lifecycle |
| Agent safety | Prompt engineering | Runtime enforcement: block destructive commands, protect branches, enforce blast radius |

## Technical Differentiators

- **Deterministic kernel** — no AI, no heuristics, no probabilistic decisions
- **6 built-in invariants** — secret exposure, protected branches, blast radius, test-before-push, no force push, lockfile integrity
- **Escalation system** — NORMAL → ELEVATED → HIGH → LOCKDOWN with automatic de-escalation
- **Evidence packs** — structured audit records for every governance decision
- **YAML policies** — simple, declarative, version-controllable
- **Claude Code integration** — first-class support via hooks
- **JSONL event sink** — every action, decision, and execution recorded for replay
- **TypeScript** — type-safe governance infrastructure with 345+ tests
