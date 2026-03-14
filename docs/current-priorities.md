# Current Priorities

> Derived from [ROADMAP.md](../ROADMAP.md) — the single source of truth for technical roadmap.
> Last reconciled: 2026-03-14

## Active Phase: Editor Integrations + Reference Monitor Hardening

AgentGuard is a **governed action runtime for AI agents**. The kernel loop intercepts agent tool calls, enforces policies and invariants, executes via adapters, and emits lifecycle events.

### Completed Phases (0–4)

| Phase | Theme | Status |
|-------|-------|--------|
| Phase 0 | Architecture Clarity | STABLE |
| Phase 1 | Canonical Event Model | STABLE |
| Phase 2 | AgentGuard Governance Runtime | STABLE |
| Phase 3 | Event Persistence + Replay | STABLE |
| Phase 4 | Plugin Ecosystem | STABLE |

### In Progress

| Phase | Theme | Status | Key Remaining Items |
|-------|-------|--------|---------------------|
| Phase 5 | Editor Integrations | IN PROGRESS | JetBrains plugin, deep Claude Code integration |
| Phase 6 | Reference Monitor Hardening | NEXT | Default-deny unknown actions, PAUSE/ROLLBACK enforcement, governance self-modification invariant |
| Phase 6.5 | Invariant Expansion | IN PROGRESS | Network egress, DB migration, transitive effect analysis (7 of 10 invariants implemented) |
| Phase 10 | Structured Storage Backend | IN PROGRESS | Migration v2, composite indexes, SQL-native analytics |

## What Is Implemented

### Governed Action Kernel (Production)
- **Kernel loop** (`packages/kernel/src/kernel.ts`) — propose → AAB normalize → policy evaluate → invariant check → simulate → execute → emit
- **AAB reference monitor** (`packages/kernel/src/aab.ts`) — 87 destructive command patterns, action normalization
- **Policy evaluator** (`packages/policy/src/evaluator.ts`) — two-phase deny/allow, pattern matching, scopes, branch conditions
- **17 built-in invariants** (`packages/invariants/src/definitions.ts`) — secret exposure, protected branches, blast radius, test-before-push, no force push, no skill modification, no scheduled task modification, credential file creation, package script injection, lockfile integrity, recursive operation guard, large file write, CI/CD config modification, permission escalation, governance self-modification, container config modification, environment variable modification
- **Escalation state machine** (`packages/kernel/src/monitor.ts`) — NORMAL → ELEVATED → HIGH → LOCKDOWN
- **Blast radius computation** (`packages/kernel/src/blast-radius.ts`) — weighted scoring engine
- **Evidence pack generation** (`packages/kernel/src/evidence.ts`)
- **Decision record factory** (`packages/kernel/src/decisions/factory.ts`)
- **Pre-execution simulation** (`packages/kernel/src/simulation/`) — filesystem, git, package simulators + impact forecast

### Execution Adapters
- **File, shell, git handlers** (`packages/adapters/src/file.ts`, `shell.ts`, `git.ts`)
- **Claude Code hook adapter** (`packages/adapters/src/claude-code.ts`) — PreToolUse/PostToolUse integration

### Event Model (49 event kinds)
- **Event schema** (`packages/events/src/schema.ts`) — governance, lifecycle, safety, reference monitor, decision, simulation, pipeline, dev activity, heartbeat events
- **EventBus** (`packages/events/src/bus.ts`) — generic typed pub/sub
- **JSONL persistence** (`packages/events/src/jsonl.ts`) — append-only audit trail
- **Decision record persistence** (`packages/events/src/decision-jsonl.ts`)

### Cross-Session Analytics
- **Violation aggregation** (`packages/analytics/src/aggregator.ts`)
- **Violation clustering** (`packages/analytics/src/cluster.ts`)
- **Trend computation** (`packages/analytics/src/trends.ts`)
- **Per-run risk scoring** (`packages/analytics/src/risk-scorer.ts`)
- **Output formatters** (`packages/analytics/src/reporter.ts`) — terminal, JSON, markdown

### Storage Backends
- **SQLite** (`packages/storage/src/sqlite-*.ts`) — indexed queries, analytics, session lifecycle
- **Firestore** (`packages/storage/src/firestore-*.ts`) — cloud-native governance data sharing
- **JSONL** (default) — streaming, human-readable

### Plugin Ecosystem
- **Plugin discovery, registry, validation, sandboxing** (`packages/plugins/src/`)
- **Renderer plugin system** (`packages/renderers/src/`)
- **Policy pack loader** (`packages/policy/src/pack-loader.ts`)

### CLI (19 commands)
`guard`, `inspect`, `events`, `replay`, `export`, `import`, `simulate`, `ci-check`, `analytics`, `plugin`, `policy`, `policy-verify`, `claude-hook`, `claude-init`, `init`, `diff`, `evidence-pr`, `traces`, `telemetry`

### Editor Integration
- **VS Code extension** (`vscode-extension/`) — sidebar panels, event reader, inline diagnostics, violation mapper

### Infrastructure
- 105 TypeScript tests (vitest) + 14 JavaScript tests
- TypeScript build: tsc + esbuild
- CI: size-check, publish, CodeQL, governance reusable workflow
- ESLint + Prettier enforced

## What Is Next

### Immediate Priority — Reference Monitor Hardening (Phase 6)
1. Default-deny unknown actions in policy evaluator (close last bypass vector)
2. Enforce PAUSE and ROLLBACK intervention types in kernel execution
3. ~~Governance self-modification invariant~~ — DONE (`no-governance-self-modification` invariant, severity 5)

### Near-Term — Invariant Expansion (Phase 6.5)
4. ~~CI/CD config modification invariant~~ — DONE (`no-cicd-config-modification`)
5. Network egress governance invariant
6. ~~Large single-file write invariant~~ — DONE (`large-file-write`)
7. ~~Docker/container config modification invariant~~ — DONE (`no-container-config-modification`)

### Mid-Term — Capability-Scoped Sessions (Phase 7)
8. RunManifest type with role and capability grants
9. Validate adapter calls against session capabilities
10. Shell adapter privilege profiles

## Autonomous SDLC Control Plane

AgentGuard runs a fully autonomous SDLC pipeline via 22+ scheduled Claude Code agents coordinated through `swarm-state.json`:

```
ROADMAP.md (human writes strategy)
    |
Planning Agent (daily 6 AM) -- ingests docs, derives phase, writes swarm-state.json
    |
Backlog Steward (daily 5 AM) -- expands ROADMAP items into issues (max 3/day)
    |
Coder Agent (every 4h) -- reads swarm state, picks highest-priority issue, implements
                          GATE: skips if >= 5 open PRs
    |
Code Review Agent (every 4h) -- reviews PRs for quality
Architect Agent (daily 10 AM) -- reviews PRs for architecture
    |
PR Review Responder (hourly) -- addresses review feedback
    |
CI Triage Agent (hourly) -- fixes failing CI (skip-if-green)
    |
Merge Conflict Resolver (every 4h) -- rebases 1 PR at a time
    |
PR Merger Agent (every 4h) -- auto-merges when CI+reviews pass
    |
Observability Agent (daily 9 AM) -- swarm health, agent liveness, writes state
```

## Open Questions

1. **Default-deny migration** — what is the impact on existing users when unknown actions switch from allow to deny?
2. **Capability token format** — how do capability tokens integrate with existing policy evaluation?
3. **Multi-framework priority** — which framework adapter ships after Claude Code? (MCP, LangChain, OpenAI Agents SDK)
