# System Specification

AgentGuard is a **governed action runtime for AI coding agents**. It intercepts agent tool calls, enforces policies and invariants, executes authorized actions via adapters, and emits lifecycle events. The Action is the primary unit of computation.

## Core Flow: Governed Action Kernel

```
Agent proposes tool call (e.g., Claude Code Bash, Write, Edit)
↓
Claude Code adapter normalizes → RawAgentAction
↓
Kernel loop:
  1. Emit ACTION_REQUESTED
  2. AAB normalizes intent (tool → action type, detect git/destructive)
  3. Policy evaluator matches rules (allow/deny with scope, branches, limits)
  4. Invariant checker verifies system state (6 defaults)
  5. Evidence pack generated if violation
  6. Monitor tracks escalation (NORMAL → ELEVATED → HIGH → LOCKDOWN)
↓
If DENIED → emit ACTION_DENIED, return with reason + intervention
If ALLOWED → execute via adapter → emit ACTION_EXECUTED or ACTION_FAILED
↓
All events sunk to JSONL (.agentguard/events/<runId>.jsonl)
```

## System Boundaries

### AgentGuard (Governance Runtime)
- **Input**: Agent tool calls (file edits, shell commands, git operations)
- **Processing**: Kernel loop — normalize → evaluate → execute → emit
- **Output**: Allow/deny decisions, execution results, canonical events, JSONL audit trail
- **Constraint**: Deterministic evaluation — same action + same policy + same state = same result

### Domain Layer (Pure Logic)
- **Input**: Events, actions, policies, system state
- **Output**: Decisions, event objects, validation results
- **Constraint**: No DOM, no Node.js-specific APIs, deterministic when RNG is injected

## Invariants

1. All agent actions pass through the kernel loop (no bypass)
2. Policy evaluation is deterministic (no inference, no heuristics)
3. Domain logic has zero environment dependencies
4. Every governance decision produces events sunk to JSONL
5. Escalation tracks cumulative denials/violations and locks down at threshold
6. Evidence packs provide structured audit trail for every violation

## Event Taxonomy

| Category | Examples | Producer | Consumer |
|----------|----------|----------|----------|
| Action Lifecycle | `ActionRequested`, `ActionAllowed`, `ActionDenied`, `ActionExecuted`, `ActionFailed` | Kernel | TUI, JSONL sink, inspect CLI |
| Governance | `PolicyDenied`, `UnauthorizedAction`, `InvariantViolation`, `BlastRadiusExceeded` | Engine/AAB | Kernel, monitor, evidence |
| Evidence | `EvidencePackGenerated` | Evidence pack | JSONL sink |
| Developer Signals | `FileSaved`, `TestCompleted`, `CommitCreated` | Git hooks, watchers | Kernel context |

## Technical Constraints

- TypeScript source (`src/`), compiled to `dist/` via tsc + esbuild
- CLI runtime dependencies: `chokidar`, `commander`, `pino`
- ESLint + Prettier enforced
- Node.js >= 18 required
