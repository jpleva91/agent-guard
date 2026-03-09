# Intent Contract

## System Purpose

AgentGuard is a governed action runtime for AI coding agents. It intercepts agent tool calls, evaluates them against declared policies and invariants, executes authorized actions via adapters, and emits canonical lifecycle events for audit and replay.

## Primary Responsibilities

1. Intercept agent tool calls via Claude Code hooks (PreToolUse/PostToolUse)
2. Normalize raw tool calls into canonical action types via the Action Authorization Boundary (AAB)
3. Evaluate actions against YAML/JSON policy rules (deny/allow with scopes, branches, limits)
4. Check system invariants before execution (secret exposure, protected branches, blast radius, test-before-push, no force push, lockfile integrity)
5. Execute authorized actions through typed adapters (file, shell, git, claude-code)
6. Emit structured canonical events for the full lifecycle: ACTION_REQUESTED, ACTION_ALLOWED/DENIED, ACTION_EXECUTED/FAILED
7. Track escalation levels (NORMAL, ELEVATED, HIGH, LOCKDOWN) for runtime governance
8. Persist all events to JSONL for audit trail and replay
9. Produce evidence packs for governance violations

## Scope Boundaries

Agents must not:

- Add external runtime dependencies (the CLI may use runtime deps, but the governance kernel should remain lean)
- Break the single canonical event schema that connects all systems
- Bypass the governed action loop (propose, normalize, evaluate, execute, emit)
- Modify policy evaluation to allow previously denied actions without explicit policy changes
- Introduce non-determinism into invariant checking
