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
| Canonical Action Representation (23 types, 8 classes) | Implemented | `packages/core/src/actions.ts` |
| Action Authorization Boundary (AAB) | Implemented (2 bypass vectors) | `packages/kernel/src/aab.ts` |
| Policy Evaluator (two-phase deny/allow) | Implemented | `packages/policy/src/evaluator.ts` |
| 17 Built-in Invariants | Fully Implemented | `packages/invariants/src/definitions.ts`, `packages/invariants/src/checker.ts` |
| Event Model (49 event kinds) | Comprehensive | `packages/events/src/schema.ts` |
| JSONL Persistence | Implemented | `packages/events/src/jsonl.ts` |
| Simulation Engine (3 simulators + impact forecast) | Fully Implemented | `packages/kernel/src/simulation/` |
| Blast Radius Computation | Implemented | `packages/kernel/src/blast-radius.ts` |
| Escalation State Machine (NORMAL → LOCKDOWN) | Implemented | `packages/kernel/src/monitor.ts` |
| Replay Engine + Comparator | Implemented | `packages/kernel/src/replay-engine.ts`, `packages/kernel/src/replay-comparator.ts` |
| Evidence Pack Generation | Implemented | `packages/kernel/src/evidence.ts` |
| Decision Record Factory | Implemented | `packages/kernel/src/decisions/factory.ts` |

### Supporting Systems — Functional

| Component | Status | Key Files |
|-----------|--------|-----------|
| Cross-session Analytics (aggregation, clustering, trends) | Implemented | `packages/analytics/src/` |
| Plugin Ecosystem (discovery, registry, validation) | Implemented | `packages/plugins/src/` |
| Renderer Plugin System | Implemented | `packages/renderers/src/` |
| CLI (guard, inspect, events, replay, export, import, simulate, ci-check, analytics, plugin, policy, policy-verify, claude-hook, claude-init, init, diff, evidence-pr, traces, telemetry) | Implemented | `apps/cli/src/` |
| Claude Code Hook Integration | Implemented | `packages/adapters/src/claude-code.ts` |
| VS Code Extension (sidebar panels, event reader, inline diagnostics) | Implemented | `apps/vscode-extension/` |
| Policy Pack Loader | Implemented | `packages/policy/src/pack-loader.ts` |
| YAML Policy Parser | Implemented | `packages/policy/src/yaml-loader.ts` |

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
| 17 Built-in Invariants | Fully Implemented | Production |
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
| Shared State & Heartbeat | Partial | Heartbeat implemented (`packages/kernel/src/heartbeat.ts`) |
| Formal Verification (Z3) | Not Started | Aspirational |
| Automated Invariant Learning | Not Started | Aspirational |

---

## Critical Findings

### Reference Monitor Bypass Vectors

One bypass path remains in the AAB (one previously identified vector has been resolved):

**1. Unknown actions default-allow.**
`packages/policy/src/evaluator.ts` returns `allowed: true` when no policy rule matches an action. Unrecognized tool calls pass through governance unchecked. This violates the core principle of reference monitors: default deny.

**~~2. Missing adapters silently skip execution.~~ — Resolved.**
`packages/kernel/src/kernel.ts` now emits `ActionDenied` when no registered adapter exists, closing this bypass vector.

### Claims Requiring Correction

- **"Complete Mediation"** — Not achieved due to the remaining default-allow bypass vector above.
- **"Tamper-proof"** — Event sink errors are silently swallowed. Escalation state can be reset without audit lock.
- **Intervention types (PAUSE, ROLLBACK, TEST_ONLY)** — Defined in `packages/kernel/src/decision.ts` but only DENY is enforced. Others are metadata labels.

### Destructive Pattern Coverage Gap — Resolved

The AAB now detects 87 destructive shell patterns (`packages/kernel/src/aab.ts`), expanded from the original 10. Coverage includes `sudo`, `pkill`, `killall`, `truncate`, `shred`, `chown`, `docker rm/rmi/system prune`, `systemctl stop/disable`, database-specific DROP commands, `npm uninstall -g`, and many more.

### Escalation Audit Gap — Resolved

Monitor escalation state transitions are now persisted as `StateChanged` DomainEvents in the event store (`packages/kernel/src/monitor.ts`). State changes include trigger action, denial/violation counts, and threshold values.

---

## Completed Phases

### Phase 0 — Architecture Clarity `STABLE`

> **Theme:** Define the unified system model

- [x] Canonical event model documentation (`docs/event-model.md`)
- [x] AgentGuard governance runtime specification (`docs/agentguard.md`)
- [x] Unified architecture document (`docs/unified-architecture.md`)
- [x] Plugin API specification (`docs/plugin-api.md`)
- [x] Product positioning
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

- [x] Action Authorization Boundary (AAB) implementation (`packages/kernel/src/aab.ts`)
- [x] Policy definition format (JSON + YAML) (`policy/action_rules.json`)
- [x] Policy loader and parser (`packages/policy/src/loader.ts`)
- [x] Deterministic policy evaluator (`packages/policy/src/evaluator.ts`)
- [x] Invariant monitoring engine (`packages/invariants/src/checker.ts`)
- [x] Built-in invariants (`packages/invariants/src/definitions.ts`)
- [x] Blast radius computation (`packages/kernel/src/blast-radius.ts`)
- [x] Evidence pack generation and persistence (`packages/kernel/src/evidence.ts`)
- [x] CLI governance commands (`agentguard guard`, `agentguard inspect`)
- [x] Governance event emission into canonical event model
- [x] Integration with Claude Code hook (`packages/adapters/src/claude-code.ts`, `apps/cli/src/commands/claude-hook.ts`)
- [x] Pre-execution simulation engine (`packages/kernel/src/simulation/`)
- [x] Filesystem simulator — risk assessment by path pattern (`packages/kernel/src/simulation/filesystem-simulator.ts`)
- [x] Git simulator — push/merge/branch impact analysis (`packages/kernel/src/simulation/git-simulator.ts`)
- [x] Package simulator — dependency change detection via dry-run (`packages/kernel/src/simulation/package-simulator.ts`)
- [x] Simulation-triggered invariant re-evaluation (high-risk simulation flips ALLOW → DENY)
- [x] `SIMULATION_COMPLETED` event kind with blast radius and risk level

### Phase 3 — Event Persistence + Replay `STABLE`

> **Theme:** Every session is replayable

- [x] File-based event store (`apps/cli/src/file-event-store.ts`)
- [x] Event stream serialization (NDJSON/JSONL)
- [x] Session metadata (run ID, timestamps)
- [x] Execution event log (`packages/core/src/execution-log/`)
- [x] CLI replay command (`agentguard replay`)
- [x] Deterministic replay with seeded RNG (`packages/core/src/rng.ts`, `packages/kernel/src/replay-engine.ts`)
- [x] Replay comparator (verify original vs replayed outcomes) (`packages/kernel/src/replay-comparator.ts`)
- [x] Event export/import for sharing sessions (`apps/cli/src/commands/export.ts`, `apps/cli/src/commands/import.ts`)
- [x] SQLite storage backend (opt-in alternative to JSONL with indexed queries) (`packages/storage/src/`)

### Phase 4 — Plugin Ecosystem `STABLE`

> **Theme:** Extensible by design

- [x] Policy pack loading system (community policy sets) (`packages/policy/src/pack-loader.ts`)
- [x] Renderer plugin interface (`packages/renderers/src/`)
- [x] Replay processor interface (`packages/kernel/src/replay-processor.ts`)
- [x] Plugin validation and sandboxing (`packages/plugins/src/validator.ts`, `packages/plugins/src/sandbox.ts`)
- [x] Plugin registry / discovery mechanism (`packages/plugins/src/registry.ts`, `packages/plugins/src/discovery.ts`)

### Phase 5 — Editor Integrations `IN PROGRESS`

> **Theme:** Governance moves into the editor

- [x] VS Code extension: sidebar panel with run status (`apps/vscode-extension/src/providers/run-status-provider.ts`)
- [x] VS Code: governance notifications for policy violations (`apps/vscode-extension/src/services/notification-service.ts`)
- [x] VS Code: inline invariant violation indicators (`apps/vscode-extension/src/services/diagnostics-service.ts`, `apps/vscode-extension/src/services/violation-mapper.ts`)
- [ ] JetBrains plugin (IntelliJ/WebStorm)
- [ ] Claude Code deep integration (full governance kernel in hook pipeline)

---

## Active Roadmap

Phases are ordered to prioritize **effect-path closure and mandatory mediation** before research-grade features. The principle: ship a secure, deterministic governance runtime first; add advanced capabilities as extensions.

### Phase 6 — Reference Monitor Hardening `NEXT`

> **Theme:** Close all bypass vectors. Achieve true default-deny mediation.

This is the architectural hinge. These changes transform the AAB from advisory interception to mandatory execution control.

- [ ] Default-deny unknown actions in `packages/policy/src/evaluator.ts` (change fallback from `allowed: true` to `allowed: false`)
- [x] Deny actions with no registered adapter in `packages/kernel/src/kernel.ts` (emit `ActionDenied` instead of silently skipping)
- [x] Persist escalation state changes as `StateChanged` DomainEvents in `packages/kernel/src/monitor.ts`
- [x] Expand destructive command patterns in `packages/kernel/src/aab.ts` (expanded from 10 to 87 patterns covering sudo, pkill, docker, systemctl, database commands, and more)
- [ ] Enforce intervention types beyond DENY (implement PAUSE and ROLLBACK behaviors in kernel execution)
- [x] Governance self-modification invariant — agents must not modify `agentguard.yaml`, `.agentguard/`, or `policies/` (`no-governance-self-modification` invariant, severity 5)
- [ ] Performance benchmark suite — formal latency measurement (p50/p95/p99) per action type for policy evaluation, invariant checking, and simulation overhead. Publish results as a marketing asset and regression gate in CI

### Phase 6.5 — Invariant Expansion `IN PROGRESS`

> **Theme:** Close invariant coverage gaps. Expanded from 10 to 17 built-in invariants; remaining items cover network egress, database migration safety, and transitive effect analysis.

The `SystemState` interface in `packages/invariants/src/definitions.ts` is the bottleneck for invariant expansion — it needs to become a richer context object with action-specific fields.

- [x] CI/CD config modification invariant (severity 5) — block writes to `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/config.yml` (`no-cicd-config-modification` invariant)
- [x] Network egress governance invariant (severity 4) — deny HTTP requests to non-allowlisted domains (extend `SystemState` with `isNetworkRequest`, `requestUrl`, `requestDomain`)
- [x] Credential file creation invariant (severity 5) — inspect `currentTarget` for SSH keys, `.netrc`, `~/.aws/credentials`, Docker config (closes gap where `no-secret-exposure` misses new file creation)
- [x] Package.json script injection invariant (severity 4) — flag `package.json` modifications that alter lifecycle script entries (`packages/invariants/src/definitions.ts`)
- [x] Large single-file write invariant (severity 3) — enforce per-file size limit (`large-file-write` invariant)
- [x] Docker/container config modification invariant (severity 3) — protect `Dockerfile`, `docker-compose.yml`, `.dockerignore` (`no-container-config-modification` invariant)
- [x] Database migration safety invariant (severity 3) — flag writes to migration directories containing destructive DDL
- [x] Permission escalation invariant (severity 4) — catch `chmod` to world-writable, `setuid`, ownership changes at invariant level (`no-permission-escalation` invariant)
- [x] Environment variable modification invariant (severity 3) — scan for `export`, `setenv`, writes to shell profile files (`no-env-var-modification` invariant)
- [x] Recursive operation guard (severity 2) — flag `find -exec`, `xargs` combined with write/delete operations (`recursive-operation-guard` invariant)
- [x] Transitive effect analysis (severity 4) — when an agent writes a script or config file, analyze content for downstream effects that would violate policy (e.g., a Python script containing `open('.env').read()` or a shell script with `curl` exfiltration). Closes the creative circumvention gap where agents bypass direct restrictions via indirect file creation

### Phase 7 — Capability-Scoped Sessions & Intent Contracts `PLANNED`

> **Theme:** Each governance run gets a bounded authority set. No capability, no effect. Declared intent becomes auditable against observed behavior.

The `RunManifest` defines the session's authority boundary. The `IntentSpec` (a declarative contract of what the agent *should* do) enables a dual-ledger audit: compare declared plan vs. actual execution. This separation — declaration layer above, enforcement layer below — makes the audit trail meaningful beyond just allow/deny logs.

Prior art: Kubernetes Capability Primitives (KCP), OS capability-based security models.

- [ ] `RunManifest` type with role and capability grants (extend existing `Capability` type in `packages/core/src/types.ts`)
- [ ] `IntentSpec` format — machine-readable contract of expected agent behavior (planned action types, target files/branches, expected scope). Declared independently of the agent, loaded at session start
- [ ] Intent-vs-execution comparison in audit trail — flag actions that fall outside declared intent even if policy allows them (advisory initially, enforceable later)
- [ ] Validate every adapter call against session capabilities in `packages/kernel/src/kernel.ts`
- [ ] Shell adapter privilege profiles (allowlist/denylist patterns per profile) in `packages/adapters/src/shell.ts`
- [ ] Wire existing `AgentRole` and `RoleDefinition` types to enforcement layer
- [ ] Emit capability usage in audit trail (which grant authorized each action)
- [ ] `RunManifest` YAML format for declarative session configuration

### Phase 8 — Policy Ecosystem `PLANNED`

> **Theme:** Shareable, composable, discoverable policies

- [x] Policy templates for common scenarios (`policies/strict`, `policies/ci-safe`, `policies/enterprise`, `policies/open-source`)
- [x] Policy composition (multiple policy files merged with precedence) (`packages/policy/src/composer.ts`, `guard --policy a --policy b`)
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
- [x] Firestore storage adapter (analytics, sink, store) for cloud-native deployments (`packages/storage/src/firestore-*.ts`)
- [x] `agentguard init firestore` scaffolding (security rules + credentials guide)
- [x] Schema design: `events`, `decisions`, `sessions` tables with JSON payload columns
- [x] Indexed columns: `kind`, `timestamp`, `runId`, `actionType`, `fingerprint`
- [ ] Migration utility: bulk-import existing `.jsonl` files into SQLite (`agentguard migrate`)
- [x] Query API: filter by time range, event kind, action type, run ID without loading all events
- [x] Aggregation queries for analytics (replace in-memory `loadAllEvents()` pattern)
- [x] JSONL export compatibility — `agentguard export` still produces portable JSONL
- [x] Storage location: `~/.agentguard/agentguard.db` (home directory, out of repo tree)
- [x] Retain JSONL as optional fallback/streaming sink for real-time tailing
- [x] Firestore NoSQL storage backend for cross-session governance data sharing (`packages/storage/src/firestore-store.ts`, `firestore-sink.ts`, `firestore-analytics.ts`)
- [x] `agentguard init firestore` scaffold command for secure Firestore backend setup
- [x] Wire up `sessions` table — insert on `RunStarted`, update on `RunEnded` (`packages/storage/src/sqlite-session.ts`)
- [ ] Migration v2: add `action_type` column to `events` table, `severity` column to `decisions` table
- [ ] Add composite index `(kind, timestamp)` on events for covering index scans
- [ ] Add standalone index on `decisions.action_type` for filtered queries
- [ ] Built-in SQL analytics queries: top denied actions, violation rate over time, session duration/action count
- [ ] Replace `loadAllEventsSqlite` full table scan with SQL-native aggregation (`GROUP BY`, pagination)
- [x] Prepared statement caching for `EventStore.query()` hot paths (`packages/storage/src/sqlite-store.ts`)

### Phase 11 — Runtime Tracing & Observability `PLANNED`

> **Theme:** Close the trust gap between application-level logging and actual system behavior. Governance cost should scale with risk, not activity.

- [ ] Adaptive governance depth — tiered evaluation pipeline where known-safe patterns get cached fast-path allow (sub-ms), normal actions get full policy evaluation (~1ms), and high-risk actions get simulation + deep invariant checks (~10-50ms). Reduces throughput impact for typical workflows while maintaining deep analysis where it matters
- [ ] Enhanced telemetry beyond current flat event logging
- [x] Run comparison and diff (`agentguard diff <run1> <run2>`) (`apps/cli/src/commands/diff.ts`)
- [x] Risk scoring per agent run
- [x] Failure clustering and trend detection (`packages/analytics/src/cluster.ts`, `packages/analytics/src/trends.ts`)
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
- [x] Evidence packs attached to pull requests (`apps/cli/src/commands/evidence-pr.ts`, `apps/cli/src/evidence-summary.ts`)
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
- [x] Heartbeat mechanism for agent liveness (`packages/kernel/src/heartbeat.ts`)
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
- [ ] Plan-level simulation — simulate a sequence of actions as a batch, including plan-level threat assessment that analyzes the full action sequence for threat vectors (data exfiltration paths, privilege escalation chains, blast radius amplification) before any action executes
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

## Competitive Landscape

The agent governance space is emerging. Several projects address overlapping problem areas:

| Project | Approach | Differentiator vs. AgentGuard |
|---------|----------|-------------------------------|
| **Edictum** ([github](https://github.com/edictum-ai/edictum)) | Agent governance framework | Early stage; confirms market demand for execution governance |
| **ctrldot** ([github](https://github.com/ctrldot-dev/ctrldot)) | Agent control layer | Different architecture; worth studying for UX patterns |
| **GitHub Agentic Workflows** | Platform-level governance | Platform-native; AgentGuard is platform-agnostic and governs actions outside git |
| **Pre-commit/CI hooks** | Git-stage controls | Only govern code changes; AgentGuard governs all agent behavior including non-git actions |

**AgentGuard's key differentiators:** deterministic kernel (not prompt-based), pre-execution simulation engine, full event-sourced audit trail with replay, reference monitor architecture with academic lineage, platform-agnostic design.

---

## Legend

- **Status:** `STABLE` | `IN PROGRESS` | `NEXT` | `PLANNED`

## Community Contributions

AgentGuard is built for contributors. Here are the best places to start:

- **Write an invariant pack** — Define domain-specific invariants in `packages/invariants/src/community/`. See `packages/invariants/src/definitions.ts` for the 17 built-in invariants as a reference.
- **Create a policy pack** — Ship a reusable policy YAML in `policies/`. See `agentguard.yaml` for the format and `packages/policy/src/pack-loader.ts` for the pack loading contract.
- **Build an adapter** — Add support for a new agent framework in `packages/adapters/src/`. Follow the pattern in `packages/adapters/src/claude-code.ts`.
- **Add a renderer** — Create a custom governance output renderer implementing the `GovernanceRenderer` interface in `packages/renderers/src/types.ts`.
- **Write a replay processor** — Build session analysis tools using the `ReplayProcessor` interface in `packages/kernel/src/replay-processor.ts`.

See the [Plugin API specification](docs/plugin-api.md) for detailed contracts.
