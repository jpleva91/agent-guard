# Roadmap

> Deterministic governance for AI coding agents.

## Strategic Direction

AgentGuard is the **runtime governance layer for AI agents** — infrastructure that sits between agents and the real world. All agent side effects (file writes, shell commands, git operations, network calls) must pass through deterministic governance before reaching the environment.

This is not a library. Not middleware. Not a research framework. It is a **mandatory execution control plane** — the same architectural pattern that made kernels, hypervisors, IAM systems, and admission controllers foundational infrastructure.

**The core thesis:** Once autonomous agents start modifying production systems, organizations must answer one question — *"What prevents the agent from destroying production?"* Prompt alignment cannot solve that. Only deterministic execution governance can.

### The Advisory → Mandatory Shift

The roadmap represents a fundamental architectural evolution:

**Advisory interception (current):**
```
agent runtime → calls guard → gets allow/deny → executes tool
```
The agent cooperatively participates. Bypass vectors exist for unknown actions and unregistered adapters.

**Mandatory execution control (target):**
```
agent → requests capability → AgentGuard mediates → only approved adapter executes
```
The agent cannot perform side effects except through governed channels. All actions must either have an explicit policy grant or be denied. No capability, no effect.

### Core Loop

```
agent proposes action
    ↓
AAB normalizes intent (tool → action type)
    ↓
capability check (run manifest scope)
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

## Architectural Audit

A comprehensive codebase audit assessed the current system against the strategic roadmap for deterministic agentic governance.

### Core Governance Kernel — Mature

| Component | Status | Key Files |
|-----------|--------|-----------|
| Canonical Action Representation (23 types, 8 classes) | Implemented | `src/core/actions.ts` |
| Action Authorization Boundary (AAB) | Implemented (2 bypass vectors) | `src/kernel/aab.ts` |
| Policy Evaluator (two-phase deny/allow) | Implemented | `src/policy/evaluator.ts` |
| 10 Built-in Invariants | Fully Implemented | `src/invariants/definitions.ts`, `src/invariants/checker.ts` |
| Event Model (49 event kinds) | Comprehensive | `src/events/schema.ts` |
| JSONL Persistence | Implemented | `src/events/jsonl.ts` |
| Simulation Engine (3 simulators + impact forecast) | Fully Implemented | `src/kernel/simulation/` |
| Blast Radius Computation | Implemented | `src/kernel/blast-radius.ts` |
| Escalation State Machine (NORMAL → LOCKDOWN) | Implemented | `src/kernel/monitor.ts` |
| Replay Engine + Comparator | Implemented | `src/kernel/replay-engine.ts`, `src/kernel/replay-comparator.ts` |
| Evidence Pack Generation | Implemented | `src/kernel/evidence.ts` |
| Decision Record Factory | Implemented | `src/kernel/decisions/factory.ts` |

### Supporting Systems — Functional

| Component | Status | Key Files |
|-----------|--------|-----------|
| Cross-session Analytics (aggregation, clustering, trends) | Implemented | `src/analytics/` |
| Plugin Ecosystem (discovery, registry, validation) | Implemented | `src/plugins/` |
| Renderer Plugin System | Implemented | `src/renderers/` |
| CLI (guard, inspect, events, replay, export, import, simulate, ci-check, analytics, plugin, policy, claude-hook, claude-init, init, diff, evidence-pr, traces) | Implemented | `src/cli/` |
| Claude Code Hook Integration | Implemented | `src/adapters/claude-code.ts` |
| VS Code Extension (sidebar panels, event reader, inline diagnostics) | Implemented | `vscode-extension/` |
| Policy Pack Loader | Implemented | `src/policy/pack-loader.ts` |
| YAML Policy Parser | Implemented | `src/policy/yaml-loader.ts` |

### Advanced Roadmap Items — Status

| Component | Status | Notes |
|-----------|--------|-------|
| Kernel-Level Tracing (eBPF / Project Azazel) | Not Started | Requires Go/Rust, kernel probes, privileged runtime |
| OS-Level Sandboxing (Bubblewrap/Seatbelt) | Not Started | Only application-level plugin capability checking exists |
| Transactional Adjudication (P-1b Protocol) | Not Started | No state snapshot at T_authorize, no re-verification at T_execute |
| Confidence-Based HITL | Partial | Count-based escalation only. PAUSE/ROLLBACK/TEST_ONLY are labels, not enforced behaviors |
| Multi-Agent Identity & Capability Tokens | Aspirational | Types defined but never used. Basic session ID hashing exists |
| Shared State Contract & Heartbeat | Not Started | Would require architectural redesign |
| Formal Verification (Z3/SMT) | Not Started | No dependencies, no symbolic analysis |
| Automated Invariant Learning | Not Started | Analytics foundation exists but no synthesis/feedback loop |

---

## Maturity Matrix

| Item | Status | Maturity |
|---|---|---|
| Canonical Action Representation | Implemented | Production |
| AAB Reference Monitor | Implemented | 1 bypass vector to close (missing-adapter fixed) |
| Policy Evaluator | Implemented | Production |
| 10 Built-in Invariants | Fully Implemented | Production |
| Event Model (49 kinds) | Comprehensive | Production |
| Simulation & Forecasting | Fully Implemented | Production |
| Escalation State Machine | Implemented | Functional (events persisted as StateChanged) |
| Cross-session Analytics | Implemented | Functional (forensic only) |
| Plugin Sandbox | Implemented | Application-level only |
| Project Azazel (eBPF) | Not Started | Aspirational |
| OS-Level Sandboxing | Not Started | Aspirational |
| P-1b Transactional Protocol | Not Started | Aspirational |
| Confidence-Based HITL | Partial | Labels only |
| Multi-Agent Identity | Aspirational | Types exist, no enforcement |
| Shared State & Heartbeat | Partial | Heartbeat implemented (`src/kernel/heartbeat.ts`) |
| Formal Verification (Z3) | Not Started | Aspirational |
| Automated Invariant Learning | Not Started | Aspirational |

---

## Critical Findings

### Reference Monitor Bypass Vectors

One bypass path remains in the AAB (one previously identified vector has been resolved):

**1. Unknown actions default-allow.**
`src/policy/evaluator.ts` returns `allowed: true` when no policy rule matches an action. Unrecognized tool calls pass through governance unchecked. This violates the core principle of reference monitors: default deny.

**~~2. Missing adapters silently skip execution.~~ — Resolved.**
`src/kernel/kernel.ts` now emits `ActionDenied` when no registered adapter exists, closing this bypass vector.

### Claims Requiring Correction

- **"Complete Mediation"** — Not achieved due to the remaining default-allow bypass vector above.
- **"Tamper-proof"** — Event sink errors are silently swallowed. Escalation state can be reset without audit lock.
- **Intervention types (PAUSE, ROLLBACK, TEST_ONLY)** — Defined in `src/kernel/decision.ts` but only DENY is enforced. Others are metadata labels.

### Destructive Pattern Coverage Gap — Resolved

The AAB now detects 87 destructive shell patterns (`src/kernel/aab.ts`), expanded from the original 10. Coverage includes `sudo`, `pkill`, `killall`, `truncate`, `shred`, `chown`, `docker rm/rmi/system prune`, `systemctl stop/disable`, database-specific DROP commands, `npm uninstall -g`, and many more.

### Escalation Audit Gap — Resolved

Monitor escalation state transitions are now persisted as `StateChanged` DomainEvents in the event store (`src/kernel/monitor.ts`). State changes include trigger action, denial/violation counts, and threshold values.

---

## Completed Phases

### Phase 0 — Architecture Clarity `STABLE`

> **Theme:** Define the unified system model

- [x] Canonical event model documentation (`docs/event-model.md`)
- [x] AgentGuard governance runtime specification (`docs/agentguard.md`)
- [x] Unified architecture document (`docs/unified-architecture.md`)
- [x] Plugin API specification (`docs/plugin-api.md`)
- [x] Product positioning (`docs/product-positioning.md`)
- [x] Rewritten README, ARCHITECTURE, ROADMAP

### Phase 1 — Canonical Event Model `STABLE`

> **Theme:** Formalize the event spine

- [x] Full event type taxonomy (developer signals, governance events, session events)
- [x] Event schema validation
- [x] Governance event types: `InvariantViolation`, `UnauthorizedAction`, `PolicyDenied`, `BlastRadiusExceeded`, `MergeGuardFailure`
- [x] Session event types: `RunStarted`, `RunEnded`, `CheckpointReached`
- [x] Developer signal event types: `FileSaved`, `TestCompleted`, `BuildCompleted`, `CommitCreated`, `CodeReviewed`, `DeployCompleted`, `LintCompleted`
- [x] Event factory with fingerprint generation
- [x] Event store interface (persist, query, replay)
- [x] Tests for all event types and lifecycle

### Phase 2 — AgentGuard Governance Runtime `STABLE`

> **Theme:** Deterministic agent governance

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

### Phase 3 — Event Persistence + Replay `STABLE`

> **Theme:** Every session is replayable

- [x] File-based event store (`src/cli/file-event-store.ts`)
- [x] Event stream serialization (NDJSON/JSONL)
- [x] Session metadata (run ID, timestamps)
- [x] Execution event log (`src/core/execution-log/`)
- [x] CLI replay command (`agentguard replay`)
- [x] Deterministic replay with seeded RNG (`src/core/rng.ts`, `src/kernel/replay-engine.ts`)
- [x] Replay comparator (verify original vs replayed outcomes) (`src/kernel/replay-comparator.ts`)
- [x] Event export/import for sharing sessions (`src/cli/commands/export.ts`, `src/cli/commands/import.ts`)
- [x] SQLite storage backend (opt-in alternative to JSONL with indexed queries) (`src/storage/`)

### Phase 4 — Plugin Ecosystem `STABLE`

> **Theme:** Extensible by design

- [x] Policy pack loading system (community policy sets) (`src/policy/pack-loader.ts`)
- [x] Renderer plugin interface (`src/renderers/`)
- [x] Replay processor interface (`src/kernel/replay-processor.ts`)
- [x] Plugin validation and sandboxing (`src/plugins/validator.ts`, `src/plugins/sandbox.ts`)
- [x] Plugin registry / discovery mechanism (`src/plugins/registry.ts`, `src/plugins/discovery.ts`)

### Phase 5 — Editor Integrations `IN PROGRESS`

> **Theme:** Governance moves into the editor

- [x] VS Code extension: sidebar panel with run status (`vscode-extension/src/providers/run-status-provider.ts`)
- [x] VS Code: governance notifications for policy violations (`vscode-extension/src/services/notification-service.ts`)
- [x] VS Code: inline invariant violation indicators (`vscode-extension/src/services/diagnostics-service.ts`, `vscode-extension/src/services/violation-mapper.ts`)
- [ ] JetBrains plugin (IntelliJ/WebStorm)
- [ ] Claude Code deep integration (full governance kernel in hook pipeline)

---

## Active Roadmap

Phases are ordered to prioritize **effect-path closure and mandatory mediation** before research-grade features. The principle: ship a secure, deterministic governance runtime first; add advanced capabilities as extensions.

### Phase 6 — Reference Monitor Hardening `NEXT`

> **Theme:** Close all bypass vectors. Achieve true default-deny mediation.

This is the architectural hinge. These changes transform the AAB from advisory interception to mandatory execution control.

- [ ] Default-deny unknown actions in `src/policy/evaluator.ts` (change fallback from `allowed: true` to `allowed: false`)
- [x] Deny actions with no registered adapter in `src/kernel/kernel.ts` (emit `ActionDenied` instead of silently skipping)
- [x] Persist escalation state changes as `StateChanged` DomainEvents in `src/kernel/monitor.ts`
- [x] Expand destructive command patterns in `src/kernel/aab.ts` (expanded from 10 to 87 patterns covering sudo, pkill, docker, systemctl, database commands, and more)
- [ ] Enforce intervention types beyond DENY (implement PAUSE and ROLLBACK behaviors in kernel execution)
- [ ] Governance self-modification invariant — agents must not modify `agentguard.yaml`, `.agentguard/`, or `policies/` (prerequisite for tamper-resistance claim)

### Phase 6.5 — Invariant Expansion `NEXT`

> **Theme:** Close invariant coverage gaps. The current 10 invariants leave large classes of agent behavior ungoverned.

The `SystemState` interface in `src/invariants/definitions.ts` is the bottleneck for invariant expansion — it needs to become a richer context object with action-specific fields.

- [ ] CI/CD config modification invariant (severity 5) — block writes to `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/config.yml`
- [ ] Network egress governance invariant (severity 4) — deny HTTP requests to non-allowlisted domains (extend `SystemState` with `isNetworkRequest`, `requestUrl`, `requestDomain`)
- [x] Credential file creation invariant (severity 5) — inspect `currentTarget` for SSH keys, `.netrc`, `~/.aws/credentials`, Docker config (closes gap where `no-secret-exposure` misses new file creation)
- [x] Package.json script injection invariant (severity 4) — flag `package.json` modifications that alter lifecycle script entries (`src/invariants/definitions.ts`)
- [ ] Large single-file write invariant (severity 3) — enforce per-file size limit (extend `SystemState` with `writeSizeBytes`)
- [ ] Docker/container config modification invariant (severity 3) — protect `Dockerfile`, `docker-compose.yml`, `.dockerignore`
- [ ] Database migration safety invariant (severity 3) — flag writes to migration directories containing destructive DDL
- [ ] Permission escalation invariant (severity 4) — catch `chmod` to world-writable, `setuid`, ownership changes at invariant level (not just AAB pattern)
- [ ] Environment variable modification invariant (severity 3) — scan for `export`, `setenv`, writes to shell profile files
- [ ] Recursive operation guard (severity 2) — flag `find -exec`, `xargs` combined with write/delete operations

### Phase 7 — Capability-Scoped Sessions `PLANNED`

> **Theme:** Each governance run gets a bounded authority set. No capability, no effect.

- [ ] `RunManifest` type with role and capability grants (extend existing `Capability` type in `src/core/types.ts`)
- [ ] Validate every adapter call against session capabilities in `src/kernel/kernel.ts`
- [ ] Shell adapter privilege profiles (allowlist/denylist patterns per profile) in `src/adapters/shell.ts`
- [ ] Wire existing `AgentRole` and `RoleDefinition` types to enforcement layer
- [ ] Emit capability usage in audit trail (which grant authorized each action)
- [ ] `RunManifest` YAML format for declarative session configuration

### Phase 8 — Policy Ecosystem `PLANNED`

> **Theme:** Shareable, composable, discoverable policies

- [x] Policy templates for common scenarios (`policies/strict`, `policies/ci-safe`, `policies/enterprise`, `policies/open-source`)
- [x] Policy composition (multiple policy files merged with precedence) (`src/policy/composer.ts`, `guard --policy a --policy b`)
- [x] Policy validation CLI (`agentguard policy validate <file>`)
- [ ] Community policy packs (SOC2, HIPAA, internal engineering standards)
- [ ] Policy pack versioning and compatibility

### Phase 9 — Agent Integrations `PLANNED`

> **Theme:** Govern any agent framework

- [ ] Framework-specific adapters (LangGraph, CrewAI, AutoGen, OpenAI Agents SDK)
- [ ] Agent SDK for programmatic governance integration
- [ ] Generic MCP adapter
- [ ] Session-aware context tracking (modified files, test results, deployment state)
- [ ] Deep Claude Code integration (auto-install, configuration management)
- [ ] Cursor integration

### Phase 10 — Structured Storage Backend `IN PROGRESS`

> **Theme:** Replace flat-file JSONL with embedded database for fast queries and audit at scale

The JSONL persistence layer was the right starting point — append-only, human-readable, zero dependencies. But it doesn't scale: every query requires filesystem enumeration + full file parsing, and hundreds of `.jsonl` files accumulate in `.agentguard/`.

- [x] SQLite storage adapter implementing existing `EventStore` interface
- [x] Firestore storage adapter (analytics, sink, store) for cloud-native deployments (`src/storage/firestore-*.ts`)
- [x] `agentguard init firestore` scaffolding (security rules + credentials guide)
- [x] Schema design: `events`, `decisions`, `sessions` tables with JSON payload columns
- [x] Indexed columns: `kind`, `timestamp`, `runId`, `actionType`, `fingerprint`
- [ ] Migration utility: bulk-import existing `.jsonl` files into SQLite (`agentguard migrate`)
- [x] Query API: filter by time range, event kind, action type, run ID without loading all events
- [x] Aggregation queries for analytics (replace in-memory `loadAllEvents()` pattern)
- [x] JSONL export compatibility — `agentguard export` still produces portable JSONL
- [x] Storage location: `~/.agentguard/agentguard.db` (home directory, out of repo tree)
- [x] Retain JSONL as optional fallback/streaming sink for real-time tailing
- [x] Firestore NoSQL storage backend for cross-session governance data sharing (`src/storage/firestore-store.ts`, `firestore-sink.ts`, `firestore-analytics.ts`)
- [x] `agentguard init firestore` scaffold command for secure Firestore backend setup
- [x] Wire up `sessions` table — insert on `RunStarted`, update on `RunEnded` (`src/storage/sqlite-session.ts`)
- [ ] Migration v2: add `action_type` column to `events` table, `severity` column to `decisions` table
- [ ] Add composite index `(kind, timestamp)` on events for covering index scans
- [ ] Add standalone index on `decisions.action_type` for filtered queries
- [ ] Built-in SQL analytics queries: top denied actions, violation rate over time, session duration/action count
- [ ] Replace `loadAllEventsSqlite` full table scan with SQL-native aggregation (`GROUP BY`, pagination)
- [ ] Prepared statement caching for `EventStore.query()` hot paths

### Phase 11 — Runtime Tracing & Observability `PLANNED`

> **Theme:** Close the trust gap between application-level logging and actual system behavior

- [ ] Enhanced telemetry beyond current flat event logging
- [x] Run comparison and diff (`agentguard diff <run1> <run2>`) (`src/cli/commands/diff.ts`)
- [x] Risk scoring per agent run
- [x] Failure clustering and trend detection (`src/analytics/cluster.ts`, `src/analytics/trends.ts`)
- [ ] Timeline viewer for governance sessions (`agentguard replay --ui`)
- [x] Policy evaluation traces CLI (`agentguard traces`)
- [ ] Metrics export (Prometheus / OpenTelemetry)
- [x] Foundation for kernel-level tracing (define tracepoint interface)
- [ ] Application-level process and network monitoring (Node.js-based, pre-eBPF)

### Phase 12 — CI/CD Enforcement `PLANNED`

> **Theme:** Governance gates in the delivery pipeline

- [x] GitHub Actions integration (reusable workflow)
- [ ] Pre-merge policy validation (block PRs that violate policy)
- [ ] CI replay verification (replay governance session in CI)
- [x] Evidence packs attached to pull requests (`src/cli/commands/evidence-pr.ts`, `src/cli/evidence-summary.ts`)
- [ ] Policy violation gating (fail CI on unresolved violations)

### Phase 13 — Environmental Enforcement `PLANNED`

> **Theme:** Defense-in-depth through OS-level isolation

- [ ] Restricted container profiles (Bubblewrap on Linux, Seatbelt on macOS)
- [ ] Read-only project mounts with write-only authorized directories
- [ ] Network deny by default with allowlisted endpoints
- [ ] Credential stripping (clear SSH_AUTH_SOCK, GPG_AGENT_INFO)
- [ ] IDE socket cleanup (block vscode-ipc-*.sock access)
- [ ] Optional eBPF tracing layer (Project Azazel — process, network, filesystem hooks)

### Phase 14 — Multi-Agent Governance `PLANNED`

> **Theme:** Govern agent fleets with identity and privilege separation

- [ ] Agent identity verification (beyond session ID hashing)
- [ ] PID-bound capability tokens for privilege separation
- [ ] Cross-agent policy definitions
- [ ] Shared state contracts with provenance tracking
- [x] Heartbeat mechanism for agent liveness (`src/kernel/heartbeat.ts`)
- [ ] Multi-agent pipeline orchestration (implement `docs/multi-agent-pipeline.md`)
- [ ] Multi-agent escalation coordination

### Phase 15 — AI-Assisted Governance `PLANNED`

> **Theme:** AI-augmented governance. The system must be useful without AI before AI is layered on.

- [ ] Context-aware policy suggestions based on action patterns
- [ ] Automated fix verification (does a policy change resolve violations?)
- [ ] AI pattern detection (recurring violation clusters across sessions)
- [ ] Team observability (aggregate governance reports across a dev team)

### Phase 16 — Predictive Governance `PLANNED`

> **Theme:** Govern outcomes before execution

- [x] Structured impact forecasts (predicted files changed, dependencies affected, test risk, blast radius score)
- [ ] Predictive policy rules (`deny if predicted_test_failures > 0`)
- [ ] Plan-level simulation — simulate a sequence of actions as a batch
- [ ] Simulator plugin interface — community-contributed simulators
- [ ] Dependency graph simulation (transitive impact of package changes)

### Phase 17 — Formal Verification & Automated Learning `PLANNED`

> **Theme:** Mathematical guarantees of system safety

- [ ] SMT solver integration (Z3) for symbolic policy analysis
- [ ] Verify three properties: liveness (no deadlocks), safety (no reachable unsafe states), least privilege conformance
- [ ] Automated invariant discovery from historical event streams
- [ ] Policy feedback loop: analytics → suggested invariants → human review → policy updates
- [ ] Explainable evidence packs as formal interface between probabilistic advice and deterministic adjudication

### Phase 18 — Remote Governance Runtime `PLANNED`

> **Theme:** Governance as a service

- [ ] Server mode (`agentguard serve`)
- [ ] Remote policy distribution and sync
- [ ] Centralized event ingestion from multiple agents
- [ ] Multi-repo governance (single policy across repositories)
- [ ] Team policy management dashboard

### Ongoing — Documentation & White Paper `CONTINUOUS`

> **Theme:** Keep documentation in sync with implementation as the system evolves.

- [ ] Periodic white paper update — agent-driven sync of `paper/agentguard-whitepaper.md` with current architecture, invariant count, event kinds, and evaluation scenarios
- [ ] Update white paper invariant table (Section 6.2) when new invariants are added
- [ ] Update white paper component mapping (Section 8.2) when source paths change
- [ ] Sync white paper Appendix A repo structure with actual `src/` layout
- [ ] Update CLAUDE.md project structure and test counts after significant changes

---

## Simulation Engine — Standout Capability

The pre-execution simulation system is the most mature advanced feature and a key differentiator. Most governance systems only allow or deny. AgentGuard predicts impact before execution.

**Current capabilities:**
- Filesystem simulator: predicts file changes by path patterns, risk by sensitivity
- Git simulator: analyzes push/merge impact, predicts merge conflicts
- Package simulator: detects dependency changes via dry-run commands
- Impact forecast builder: predicted changes, downstream modules, test risk score (0-100), blast radius score, risk level
- Simulation-triggered re-evaluation: high blast radius can flip ALLOW → DENY at execution time
- Replay engine with outcome comparison for policy validation against historical sessions

---

## Legend

- **Status:** `STABLE` | `IN PROGRESS` | `NEXT` | `PLANNED`

## Community Contributions

AgentGuard is built for contributors. Here are the best places to start:

- **Write an invariant pack** — Define domain-specific invariants in `src/invariants/community/`. See `src/invariants/definitions.ts` for the 10 built-in invariants as a reference.
- **Create a policy pack** — Ship a reusable policy YAML in `policies/`. See `agentguard.yaml` for the format and `src/policy/pack-loader.ts` for the pack loading contract.
- **Build an adapter** — Add support for a new agent framework in `src/adapters/`. Follow the pattern in `src/adapters/claude-code.ts`.
- **Add a renderer** — Create a custom governance output renderer implementing the `GovernanceRenderer` interface in `src/renderers/types.ts`.
- **Write a replay processor** — Build session analysis tools using the `ReplayProcessor` interface in `src/kernel/replay-processor.ts`.

See the [Plugin API specification](docs/plugin-api.md) for detailed contracts.
