# Current Priorities

## Active Phase: Governed Action Kernel

AgentGuard is a **governed action runtime for AI agents**. The kernel loop intercepts agent tool calls, enforces policies and invariants, executes via adapters, and emits lifecycle events. This is the core value proposition.

## What Is Implemented

### Governed Action Kernel (NEW — Active Focus)
- **Kernel loop** — orchestrates AAB → policy → invariants → execute → events (`agentguard/kernel.ts`)
- **Execution adapters** — file, shell, git handlers (`agentguard/adapters/`)
- **Claude Code adapter** — normalizes PreToolUse/PostToolUse into kernel actions (`agentguard/adapters/claude-code.ts`)
- **YAML policy loader** — simple YAML policy format, zero external deps (`agentguard/policies/yaml-loader.ts`)
- **JSONL event sink** — persists events to `.agentguard/events/<runId>.jsonl` (`agentguard/sinks/jsonl.ts`)
- **Terminal renderer** — real-time action stream, action graph, event display (`agentguard/renderers/tui.ts`)
- **CLI commands** — `agentguard guard`, `agentguard inspect`, `agentguard events` (`cli/commands/guard.ts`, `cli/commands/inspect.ts`)

### Governance Infrastructure
- **Action Authorization Boundary (AAB)** — normalizes tool calls, detects git/destructive actions (`agentguard/core/aab.ts`)
- **RTA decision engine** — combines AAB + policy evaluation + invariant checking + evidence packs (`agentguard/core/engine.ts`)
- **Policy evaluator** — pattern matching, scope rules, wildcard support (`agentguard/policies/evaluator.ts`)
- **Policy loader** — JSON policy validation and loading (`agentguard/policies/loader.ts`)
- **Invariant checker** — 6 default invariants (secret exposure, protected branch, blast radius, etc.) (`agentguard/invariants/`)
- **Evidence pack generation** — structured audit records for every governance decision (`agentguard/evidence/pack.ts`)
- **Runtime monitor** — escalation tracking (NORMAL → ELEVATED → HIGH → LOCKDOWN) (`agentguard/monitor.ts`)
- **Canonical Action schema** — 23 action types across 8 classes (`domain/actions.ts`)
- **Reference monitor** — action authorization with decision trail (`domain/reference-monitor.ts`)
- **Adapter registry** — action class → handler mapping with authorization guard (`domain/execution/adapters.ts`)

### Canonical Event Model
- 50+ event kinds covering governance, pipeline, developer signals (`domain/events.ts`, `core/types.ts`)
- EventBus — generic typed pub/sub (`core/event-bus.ts`)
- Event store — in-memory persistence with query/replay (`domain/event-store.ts`)
- Event factory with fingerprinting (`domain/events.ts`)

### Event Pipeline
- Error parser with 40+ patterns across JS, TS, Python, Go, Rust, Java (`core/error-parser.ts`)
- Stack trace parser for 6+ frame formats (`core/stacktrace-parser.ts`)
- Stable fingerprinting for deduplication (`domain/ingestion/`)
- Pipeline orchestration (`domain/ingestion/pipeline.ts`)

### Infrastructure
- 345+ TypeScript tests (vitest) + 1085 JavaScript tests
- TypeScript build: tsc + esbuild → dist/
- CI workflows (deploy, validate, size check, CodeQL, publish, release)
- ESLint + Prettier enforced
- Size budget enforcement

## What Is Next

### Phase 1 — Kernel Hardening (Current)
- Integration testing: end-to-end Claude Code hook → kernel → decisions
- Demo script that simulates the "killer demo" scenario
- Error handling improvements for edge cases in adapters
- Documentation: README update with governance-first quickstart

### Phase 2 — Policy Ecosystem
- Policy templates for common scenarios (strict, permissive, CI-only)
- Policy composition (multiple policy files merged)
- Policy validation CLI (`agentguard policy validate <file>`)
- Community policy repository

### Phase 3 — Agent Integration
- Deep Claude Code integration via hooks (auto-install, configuration)
- Session-aware context (track what files were modified, test results)
- Multi-agent support (different policies per agent identity)

### Phase 4 — Observability
- Run comparison and diff (`agentguard diff <run1> <run2>`)
- Aggregate statistics across runs
- Risk scoring per agent run
- Failure clustering

## Open Questions

1. **Policy distribution** — how do users share and discover policies? npm packages? GitHub repos?
2. **Multi-agent identity** — how does the kernel distinguish between different agents in a session?
3. **Session context** — how much system state should the kernel track automatically (test results, modified files)?
4. **Remote mode** — should the kernel support a server mode for CI/CD integration?
