# Roadmap

> Deterministic governance for AI coding agents.

## Vision

AgentGuard provides deterministic governance for AI coding agents — policy evaluation, invariant monitoring, blast radius limits, and evidence generation. Every agent action passes through a governed action kernel that produces a complete, replayable audit trail.

### Core Loop

```
agent proposes action
    ↓
AAB normalizes intent (tool → action type)
    ↓
policy evaluator matches rules (deny/allow)
    ↓
invariant checker verifies system state
    ↓
simulate impact (predict blast radius, risk level)
    ↓
if allowed: execute via adapter
    ↓
emit lifecycle events (JSONL audit trail)
```

---

## Phase 0 — Architecture Clarity `STABLE`

> **Theme:** Define the unified system model

Establish the conceptual architecture, documentation, and event model.

- [x] Canonical event model documentation (`docs/event-model.md`)
- [x] AgentGuard governance runtime specification (`docs/agentguard.md`)
- [x] Unified architecture document (`docs/unified-architecture.md`)
- [x] Plugin API specification (`docs/plugin-api.md`)
- [x] Product positioning (`docs/product-positioning.md`)
- [x] Rewritten README, ARCHITECTURE, ROADMAP

## Phase 1 — Canonical Event Model `STABLE`

> **Theme:** Formalize the event spine

Extend the event system into the formal canonical event model.

- [x] Full event type taxonomy (developer signals, governance events, session events)
- [x] Event schema validation
- [x] Governance event types: `InvariantViolation`, `UnauthorizedAction`, `PolicyDenied`, `BlastRadiusExceeded`, `MergeGuardFailure`
- [x] Session event types: `RunStarted`, `RunEnded`, `CheckpointReached`
- [x] Developer signal event types: `FileSaved`, `TestCompleted`, `BuildCompleted`, `CommitCreated`, `CodeReviewed`, `DeployCompleted`, `LintCompleted`
- [x] Event factory with fingerprint generation
- [x] Event store interface (persist, query, replay)
- [x] Tests for all event types and lifecycle

## Phase 2 — AgentGuard Governance Runtime `STABLE`

> **Theme:** Deterministic agent governance

Build the governance runtime that evaluates agent actions against policies and invariants.

- [x] Action Authorization Boundary (AAB) implementation (`src/kernel/aab.ts`)
- [x] Policy definition format (JSON + YAML) (`policy/action_rules.json`)
- [x] Policy loader and parser (`src/policy/loader.ts`)
- [x] Deterministic policy evaluator (`src/policy/evaluator.ts`)
- [x] Invariant monitoring engine (`src/invariants/checker.ts`)
- [x] Built-in invariants (`src/invariants/definitions.ts`)
- [x] Blast radius computation (`src/kernel/blast-radius.ts`)
- [x] Evidence pack generation and persistence (`src/kernel/evidence.ts`)
- [x] CLI governance commands (`agentguard guard`, `agentguard inspect`)
- [x] Governance event emission into canonical event model
- [x] Integration with Claude Code hook (`src/adapters/claude-code.ts`, `src/cli/commands/claude-hook.ts`)
- [x] Pre-execution simulation engine (`src/kernel/simulation/`)
- [x] Filesystem simulator — risk assessment by path pattern (`src/kernel/simulation/filesystem-simulator.ts`)
- [x] Git simulator — push/merge/branch impact analysis (`src/kernel/simulation/git-simulator.ts`)
- [x] Package simulator — dependency change detection via dry-run (`src/kernel/simulation/package-simulator.ts`)
- [x] Simulation-triggered invariant re-evaluation (high-risk simulation flips ALLOW → DENY)
- [x] `SIMULATION_COMPLETED` event kind with blast radius and risk level

## Phase 3 — Event Persistence + Replay `STABLE`

> **Theme:** Every session is replayable

Implement durable event storage and deterministic replay.

- [x] File-based event store (`src/cli/file-event-store.ts`)
- [x] Event stream serialization (NDJSON/JSONL)
- [x] Session metadata (run ID, timestamps)
- [x] Execution event log (`src/core/execution-log/`)
- [x] CLI replay command (`agentguard replay`)
- [x] Deterministic replay with seeded RNG (`src/core/rng.ts`, `src/kernel/replay-engine.ts`)
- [x] Replay comparator (verify original vs replayed outcomes) (`src/kernel/replay-comparator.ts`)
- [x] Event export/import for sharing sessions (`src/cli/commands/export.ts`, `src/cli/commands/import.ts`)

## Phase 4 — Plugin Ecosystem `STABLE`

> **Theme:** Extensible by design

Formalize the plugin system for third-party extensions.

- [x] Policy pack loading system (community policy sets) (`src/policy/pack-loader.ts`)
- [x] Renderer plugin interface (`src/renderers/`)
- [x] Replay processor interface (`src/kernel/replay-processor.ts`)
- [x] Plugin validation and sandboxing (`src/plugins/validator.ts`, `src/plugins/sandbox.ts`)
- [x] Plugin registry / discovery mechanism (`src/plugins/registry.ts`, `src/plugins/discovery.ts`)

## Phase 5 — Editor Integrations `PLANNED`

> **Theme:** Governance moves into the editor

Bring AgentGuard governance into editor environments.

- [ ] VS Code extension: sidebar panel with run status
- [ ] VS Code: governance notifications for policy violations
- [ ] VS Code: inline invariant violation indicators
- [ ] JetBrains plugin (IntelliJ/WebStorm)
- [ ] Claude Code deep integration (full governance kernel in hook pipeline)

## Phase 6 — AI-Assisted Governance `PLANNED`

> **Theme:** AI-augmented governance. Requires Phase 2 + 3.

AI features are intentionally placed last. The system must be useful without AI before AI is layered on.

- [ ] Context-aware policy suggestions based on action patterns
- [ ] Automated fix verification (does a policy change resolve violations?)
- [ ] AI pattern detection (recurring violation clusters across sessions)
- [ ] Team observability (aggregate governance reports across a dev team)

## Phase 7 — Predictive Governance `PLANNED`

> **Theme:** Govern outcomes before execution

Extend the simulation engine from risk assessment to predictive governance — evaluate policies and invariants against predicted system state before actions execute.

- [ ] Structured impact forecasts (predicted files changed, dependencies affected, test risk, blast radius score)
- [ ] Predictive policy rules (`deny if predicted_test_failures > 0`, `deny if predicted_files_changed > 10`)
- [ ] Plan-level simulation — simulate a sequence of actions as a batch before allowing execution
- [ ] Simulator plugin interface — community-contributed simulators via plugin registry
- [ ] `agentguard simulate <action>` CLI command for standalone impact analysis
- [ ] Simulation replay and comparison across runs
- [ ] Dependency graph simulation (transitive impact of package changes)

## Phase 8 — Governance Extensions `PLANNED`

> **Theme:** Easy contributor entry points for the governance ecosystem

Create well-defined extension surfaces so the community can contribute invariants, policies, adapters, renderers, and replay processors without modifying the kernel.

- [ ] Invariant packs — community invariant definitions (`src/invariants/community/`)
- [ ] Policy packs — prebuilt policy sets for common scenarios (`policies/`)
- [ ] Execution adapters — framework-specific adapters (`src/adapters/`)
- [ ] Renderer plugins — custom governance visualizations (`src/renderers/`)
- [ ] Replay processors — session analysis extensions (`src/kernel/replay-processors/`)
- [ ] Extension authoring guide and template scaffolding
- [ ] `agentguard init --extension <type>` scaffolding command

## Phase 9 — Governance Observability `PLANNED`

> **Theme:** See what governance is doing

Surface governance activity through dashboards, traces, and metrics.

- [ ] Timeline viewer for governance sessions (`agentguard replay --ui`)
- [ ] Policy evaluation traces (which rule matched, why)
- [ ] Invariant violation analytics (frequency, clustering)
- [ ] Metrics export (Prometheus / OpenTelemetry)
- [ ] Session comparison (diff two governance runs side-by-side)

## Phase 10 — CI/CD Enforcement `PLANNED`

> **Theme:** Governance gates in the delivery pipeline

Integrate governance checks into CI/CD workflows as enforceable gates.

- [ ] GitHub Actions integration (reusable workflow)
- [ ] Pre-merge policy validation (block PRs that violate policy)
- [ ] CI replay verification (replay governance session in CI)
- [ ] Evidence packs attached to pull requests
- [ ] Policy violation gating (fail CI on unresolved violations)

## Phase 11 — Multi-Agent Governance `PLANNED`

> **Theme:** Govern agent fleets, not just single agents

Extend the governance model to coordinate policies across multiple agents.

- [ ] Cross-agent policy definitions
- [ ] Shared invariant state across agent sessions
- [ ] Agent identity and role-based access control
- [ ] Agent-to-agent action verification
- [ ] Multi-agent escalation coordination

## Phase 12 — Remote Governance Runtime `PLANNED`

> **Theme:** Governance as a service

Run the governance kernel as a remote service for centralized policy management.

- [ ] Server mode (`agentguard serve`)
- [ ] Remote policy distribution and sync
- [ ] Centralized event ingestion from multiple agents
- [ ] Multi-repo governance (single policy across repositories)
- [ ] Team policy management dashboard

## Phase 13 — Ecosystem Integrations `PLANNED`

> **Theme:** Govern any agent framework

Provide adapters and hooks for major agent frameworks and editors.

- [ ] LangGraph adapter
- [ ] OpenAI Agents SDK adapter
- [ ] AutoGen adapter
- [ ] Cursor integration
- [ ] Generic MCP adapter

---

## Legend

- **Status:** `STABLE` | `EXPERIMENTAL` | `PLANNED`

## Community Contributions

AgentGuard is built for contributors. Here are the best places to start:

- **Write an invariant pack** — Define domain-specific invariants in `src/invariants/community/`. See `src/invariants/definitions.ts` for the 8 built-in invariants as a reference.
- **Create a policy pack** — Ship a reusable policy YAML in `policies/`. See `agentguard.yaml` for the format and `src/policy/pack-loader.ts` for the pack loading contract.
- **Build an adapter** — Add support for a new agent framework in `src/adapters/`. Follow the pattern in `src/adapters/claude-code.ts`.
- **Add a renderer** — Create a custom governance output renderer implementing the `GovernanceRenderer` interface in `src/renderers/types.ts`.
- **Write a replay processor** — Build session analysis tools using the `ReplayProcessor` interface in `src/kernel/replay-processor.ts`.

See the [Plugin API specification](docs/plugin-api.md) for detailed contracts.
