# AgentGuard OSS — Public Roadmap

> Deterministic governance for AI coding agents.

**Last updated**: 2026-03-23
**License**: Apache 2.0
**Repository**: [AgentGuardHQ/agent-guard](https://github.com/AgentGuardHQ/agent-guard)

---

## Vision

AgentGuard is the **mandatory execution control plane for AI agents** — the runtime governance layer that sits between autonomous agents and the real world. All agent side effects must pass through deterministic governance before reaching the environment.

**Core thesis**: Once autonomous agents start modifying production systems, organizations need deterministic execution governance. Prompt alignment cannot solve this. Only a reference monitor architecture — default-deny, tamper-evident, fully auditable — provides the guarantees enterprises require.

**Engineering thesis**: The enforcement boundary must achieve sub-millisecond latency (p50 < 0.25ms) with zero network or disk I/O dependencies. The governance layer must be invisible during operation yet impenetrable during a violation.

---

## Current State — Production Ready

| Component | Status | Maturity |
|-----------|--------|----------|
| Governed action kernel (41 action types, 10 classes) | Implemented | Production |
| Action Authorization Boundary (AAB) | Implemented | Bypass vectors closed (3 fixed in v2.4.0) |
| Policy evaluator (YAML/JSON, composition, packs) | Implemented | Production |
| 26 built-in invariants | Implemented | Production |
| Canonical event model (47 event kinds) | Implemented | Production |
| Pre-execution simulation engine (3 simulators) | Implemented | Production |
| Blast radius computation | Implemented | Production |
| Escalation state machine (NORMAL → LOCKDOWN) | Implemented | Production |
| SQLite persistence (events, decisions, sessions) | Implemented | Production |
| Replay engine with deterministic comparison | Implemented | Production |
| Evidence pack generation | Implemented | Production |
| CLI (40+ commands) | Implemented | Production |
| Claude Code adapter (PreToolUse/PostToolUse) | Implemented | Production |
| VS Code extension | Implemented | Production |
| MCP governance server (15 tools) | Implemented | Production |
| Plugin ecosystem (discovery, registry, sandboxing) | Implemented | Production |
| 8 policy packs (essentials, strict, ci-safe, enterprise, open-source, soc2, hipaa, eng-standards) | Implemented | Production |
| 26-agent autonomous swarm templates | Implemented | Production |
| KE-1 Structured matchers (Aho-Corasick, globs, reason codes) | **Shipped v2.3.0** | `packages/matchers/` |
| All 47 event kinds mapped to cloud AgentEvent | **Shipped v2.3.0** | `packages/telemetry/src/event-mapper.ts` |
| Agent SDK for programmatic governance | **Shipped v2.3.0** | Programmatic governance integration |
| RunManifest YAML loader | **Shipped v2.3.0** | Declarative session configuration |
| Monitor mode for claude-hook | **Shipped v2.3.0** | `apps/cli/src/commands/claude-hook.ts` |
| Path traversal prevention in file adapter | **Shipped v2.3.0** | Canonicalization + project-root boundary check |
| Telemetry path responsibilities documented | **Shipped v2.3.0** | OSS↔Cloud telemetry contract |
| Agent identity system (session prompt, --agent-name, MCP persona) | **Shipped v2.4.0** | `packages/telemetry-client/`, `apps/cli/` |
| Pre-push branch protection hooks | **Shipped v2.4.0** | Enforced from agentguard.yaml |
| 3 governance bypass vectors closed | **Shipped v2.4.0** | Security hardening (#696) |
| Capability grants enforcement before adapter execution | **Shipped v2.4.0** | `packages/kernel/` |
| Cloud credential storage in project .env | **Shipped v2.4.0** | Per-project instead of global config |
| Copilot CLI adapter | **Shipped v2.4.0** | `packages/adapters/src/copilot-cli.ts` |
| Go kernel rewrite (Phase 1 — velocity-first) | Planned | Architecture phase |
| Rust kernel research (types, AAB, policy) | Paused | Experimental — informs Go design |

---

## Roadmap

### Now — Reference Monitor Hardening (Phase 6)

> Close all bypass vectors. Achieve true default-deny mediation.

This is the architectural hinge that transforms AgentGuard from advisory interception to mandatory execution control. **Must complete before Kernel Evolution Sprint.**

- [ ] **Default-deny unknown actions** — Change policy evaluator fallback from `allowed: true` to `allowed: false`. Unrecognized tool calls must be denied, not silently passed through.
- [x] ~~Deny actions with no registered adapter~~ — Emit `ActionDenied` instead of silently skipping
- [x] ~~Expand destructive command patterns~~ — 87 patterns (sudo, pkill, docker, systemctl, DB commands, etc.)
- [x] ~~Governance self-modification invariant~~ — Agents cannot modify `agentguard.yaml` or policies/
- [x] ~~Path traversal prevention in file adapter~~ — ✅ Done 2026-03-21 (v2.3.0)
- [ ] **Enforce PAUSE and ROLLBACK** — Currently metadata labels only; implement as enforced kernel behaviors
- [x] ~~Performance benchmark suite~~ — ✅ Done 2026-03-21 — CI regression gate operational (bench-regression-gate.yml)

---

### Now — Kernel Evolution Sprint (KE-1 through KE-6, 60 days)

> Transform the governance kernel from advisory heuristics to a production-grade Execution Firewall with sub-millisecond determinism.

This sprint implements the architectural upgrades required for AgentGuard to function as infrastructure-grade enforcement — comparable to kernel security modules and service mesh data planes. Each phase stabilizes before the next begins.

**Non-Negotiable Engineering Constraints:**
- **Zero I/O Sync Path** — No network or disk I/O in the synchronous enforcement loop
- **Algorithmic Determinism** — Replace regex-first logic with structured matchers (Tries, Bitmasks, Hash Sets)
- **Asynchronous Telemetry** — Memory Queue → SQLite (WAL) → Cloud Ingest; telemetry failures never alter enforcement
- **Zero-Allocation Hot Path** — Stack-allocated structs, fixed-size buffers, borrowed slices where possible
- **No JSON in the Hot Path** — Compact internal contexts and bitmask flags for policy checks

**Performance SLOs (enforced via CI regression gate):**

| Metric | Target (p50) | Target (p95) | Target (p99) |
|--------|-------------|-------------|-------------|
| Context Normalization | 50 µs | 100 µs | 200 µs |
| Sync Enforcement Hook | < 0.25 ms | < 0.75 ms | < 1.5 ms |
| Cold-Start Latency | < 15 ms | < 25 ms | < 50 ms |
| Memory Allocation | 0 allocs (Hot) | < 5 allocs (Hot) | N/A |

#### KE-1: Invariant Engine Evolution ✅ Done 2026-03-21

> Replace regex-based security with deterministic structured matchers.

- [x] ~~Audit all regex usage in the enforcement path (AAB, invariants, policy evaluator)~~
- [x] ~~Classify all patterns into EXACT, PREFIX, SUFFIX, PATH_PREFIX categories~~
- [x] ~~Implement compiled matcher library: Trie (prefix/path), Hash Set (exact), Bitmask (flags)~~ — `packages/matchers/src/` shipped
- [x] ~~Replace runtime regex scans with compiled matchers~~ — Aho-Corasick (commands) + picomatch (paths) — 90%+ replacement
- [x] ~~Produce machine-readable reason codes for all match results~~ — `packages/matchers/src/reason-codes.ts`
- [x] ~~Benchmark: total evaluation p50 < 0.25ms~~ — benchmark suite in CI

#### KE-2: Canonical Action Normalization (ActionContext)

> Formalize a vendor-neutral action representation that decouples the policy engine from provider-specific payloads.

- [ ] Design `ActionContext` contract: actor identity (agent/session/worktree), action category, structured arguments
- [ ] Build specialized adapter for Claude tool-calls → `ActionContext` mapping
- [ ] Ensure policy engine consumes only normalized `ActionContext` (no provider-specific logic)
- [ ] Benchmark: context normalization in 50–100µs

#### KE-3: Governance Event Envelope

> Standardize all telemetry into a versioned, runtime-agnostic schema that the Cloud can consume without special cases.

- [ ] Design versioned `GovernanceEvent` envelope: eventId, timestamp, policy version, decision codes, performance metrics (hook latency in µs)
- [ ] Ensure schema is runtime-agnostic (Claude, Copilot, LangGraph all produce identical envelopes)
- [ ] Migrate existing event model to envelope format (backward-compatible)
- [ ] 100% of telemetry follows the versioned schema
- [ ] **Integration point**: Cloud ingestion consumes envelopes directly — zero special cases

#### KE-4: Plane Separation (Evaluator / Emitter / Shipper)

> Decouple enforcement from telemetry. The three planes must be failure-isolated.

- [ ] **Evaluator** (Synchronous/Pure): Policy + invariant evaluation, returns decisions in constant time
- [ ] **Emitter** (Non-blocking): Memory queue for event buffering, zero backpressure on Evaluator
- [ ] **Shipper** (Background): Persistence to SQLite (WAL mode) + Cloud ingestion, crash-resilient
- [ ] Enforce: no coupling between planes. Evaluator continues if Shipper or Cloud is unavailable
- [ ] Enforce: telemetry failures never alter enforcement decisions

#### KE-5: Semantic CLI Expansion

> Replace string matching with AST-based shell command analysis for Copilot CLI and general shell governance.

- [ ] Implement shell command normalization layer using AST parsing
- [ ] Map parsed commands into `ActionContext` for semantic risk classification
- [ ] Detect semantically equivalent dangerous commands (e.g., `rm -rf /` ≡ `find / -delete` ≡ `sh -c 'rm -rf /'`)
- [ ] Implement semantic invariants: destructive file ops, privilege escalation (sudo/chmod), pipeline injection (curl | sh)
- [ ] Shared policy evaluation across CLI tool-calls and agent tool-calls
- [ ] Benchmark: CLI normalization + check < 1ms total

#### KE-6: Control Plane Signals

> Surface governance intelligence for Cloud consumption and operator visibility.

- [ ] Surface active policy versions per runtime
- [ ] Decision history by identity (agent, session, user)
- [ ] Violation statistics and pattern aggregation
- [ ] Identity-based audit views (operator can answer: "What was blocked, by which policy, for which agent?")
- [ ] **Integration point**: Cloud dashboard consumes these signals for real-time governance visibility

---

### Now — v3.0 Major Release

> Ship the governance kernel to the world. Default-deny + KE-2 = production-grade enforcement.

- [ ] Default-deny finalized + KE-2 ActionContext shipped
- [ ] 30-second demo video (install → configure → govern → Cloud dashboard)
- [ ] Site update with demo embed
- [ ] LinkedIn + dev community announcement
- [ ] npm publish v3.0

**Release cadence**: v3.0 (kernel), v3.1 (Runner + Claude Code adapter), v3.2 (Copilot adapters + workspace manager).

### Next — Pull-Based Runner (Phase 6.5 — `apps/runner`)

> Cloud-managed agent execution. Replaces cron + worker scripts with a pull-based executor.

Depends on: v3.0 released + Cloud Phase 2A (orchestrator + runner protocol).

**Design spec**: `docs/superpowers/specs/2026-03-23-autonomous-engineering-platform-design.md` (Section 5)

- [ ] `apps/runner` — Main loop: poll Cloud for work → claim → execute → report results
- [ ] **Runner ↔ Cloud protocol**: `GET /v1/runner/poll`, `POST /v1/runner/claim`, `POST /v1/runner/heartbeat`, `POST /v1/runner/complete`, `POST /v1/runner/register`
- [ ] **Claude Code adapter** — Launch `claude -p` with `--stream-json`, kernel governance hook, env vars (`AGENTGUARD_AGENT_ID`, `AGENTGUARD_RUN_ID`)
- [ ] **Copilot CLI adapter** — Launch `gh copilot` with governance hooks (similar to Claude Code hook setup)
- [ ] **Copilot Actions adapter** — Reactive: assign issue to `@copilot` via GitHub API, observe resulting PR via webhooks
- [ ] **Workspace manager** — Git clone, worktree isolation for concurrent runs, cleanup on completion
- [ ] **Heartbeat** — Background heartbeat every 30s while agent runs; Cloud can cancel via `continue: false`
- [ ] **Offline queue** — Buffer results locally when Cloud unreachable, flush on reconnect
- [ ] `agentguard runner start --token <TOKEN>` CLI command
- [ ] `agentguard runner install-service` — Generate systemd service for server deployment
- [ ] Adapter registry — Map runtime string → adapter implementation, fallback for unknown types

### Next — Capability-Scoped Sessions (Phase 7)

> Each governance run gets a bounded authority set. Declared intent becomes auditable.

Depends on: Phase 6 (default-deny) + KE-2 (ActionContext).

- [ ] `RunManifest` type with role and capability grants
- [ ] `IntentSpec` format — machine-readable contract of expected agent behavior
- [ ] Intent-vs-execution comparison in audit trail
- [ ] Shell adapter privilege profiles (allowlist/denylist per profile)
- [ ] Emit capability usage in audit trail (which grant authorized each action)
- [ ] `RunManifest` YAML format for declarative session configuration

### Next — Editor & Agent Integrations (Phase 9)

> Govern any agent, in any editor.

Depends on: KE-2 (ActionContext provides vendor-neutral normalization).

- [ ] Claude Code deep integration — full governance kernel in hook pipeline
- [x] ~~Monitor mode for claude-hook~~ — ✅ Done 2026-03-21 (v2.3.0)
- [ ] JetBrains plugin (IntelliJ/WebStorm)
- [ ] Cursor integration
- [ ] Framework-specific adapters (LangGraph, CrewAI, AutoGen, OpenAI Agents SDK)
- [x] ~~Agent SDK for programmatic governance integration~~ — ✅ Done 2026-03-21 (v2.3.0)
- [ ] Generic MCP adapter for any MCP-compatible tool

### Later — Policy Ecosystem (Phase 8)

> Shareable, composable, discoverable policies.

- [x] ~~Policy templates (strict, ci-safe, enterprise, open-source)~~
- [x] ~~Policy composition (multi-file merging with precedence)~~
- [ ] Community policy packs with versioning and compatibility
- [ ] Policy pack registry and discovery
- [ ] Domain-specific invariant packs (finance, healthcare, government)
- [ ] **Policy provider interface** — Pluggable evaluation backends (OPA/Rego, custom DSL, enterprise policy engines) for non-hot-path evaluations. The Evaluator plane remains pure (custom matchers, zero I/O); external providers handle business-rule and compliance-policy evaluation via async or pre-cached paths.
- [ ] **Remediation mode in decision model** — Expand decision responses beyond ALLOW/DENY/ESCALATE to include MODIFY (rewrite action to safe equivalent) and SUGGEST (return recommended alternative with explanation). Example: `terraform destroy prod` → DENY + SUGGEST: "Run `terraform plan` in staging, or request approval." Self-repair capability is the key differentiator vs hyperscaler guardrails.

### Later — Storage & Observability (Phase 10-11)

> Scale persistence and visibility.

- [ ] SQLite migration v2 — additional indexed columns
- [ ] Adaptive governance depth — tiered evaluation (fast-path for known-safe, full eval for normal, simulation for high-risk)
- [ ] Timeline viewer for governance sessions (`aguard replay --ui`)
- [ ] Application-level process and network monitoring

### Later — CI/CD Enforcement (Phase 12)

> Governance gates in the delivery pipeline.

- [x] ~~GitHub Actions reusable workflow~~
- [x] ~~Evidence packs attached to PRs~~
- [ ] Pre-merge policy validation (block PRs violating policy)
- [ ] CI replay verification (replay governance sessions in CI)
- [ ] Policy violation gating (fail CI on unresolved violations)

### Future — Advanced Research (Phases 13-18)

> Defense-in-depth, multi-agent governance, formal verification.

- [ ] OS-level sandboxing (Bubblewrap on Linux, Seatbelt on macOS)
- [ ] Multi-agent identity and privilege separation
- [ ] PID-bound capability tokens
- [ ] AI-assisted governance (context-aware policy suggestions, automated fix verification)
- [ ] Predictive governance (plan-level simulation, dependency graph simulation)
- [ ] Formal verification via Z3/SMT solver (liveness, safety, least privilege)
- [ ] Remote governance runtime (`agentguard serve`)

### Ongoing — Go Kernel Rewrite (Velocity-First)

> Ship a production-worthy kernel fast without painting into a corner.

**Decision (2026-03-24)**: Kernel rewrite language changed from Rust-first to **Go-first**. Go's learning curve maximizes shipping velocity. Architecture enforces clean boundaries (gRPC / local socket / WASM / FFI) so implementations can be swapped. Rust reserved for selective hot-path hardening later.

**Rust research preserved**: Phase 1 Rust work (types, AAB, policy evaluator) informs Go design and remains available for future selective rewrite.

---

## Performance Regression Gate

The following benchmark must pass before every merge to `main`:

> Execute `benchmark_suite` and compare against `baseline_metrics.json`. If p95 latency regresses by >10% or if any new heap allocations / synchronous I/O are detected in the Evaluator layer, the merge is blocked.

---

## Contributing

AgentGuard is built for contributors. Best starting points:

- **Write an invariant pack** — Domain-specific invariants in `packages/invariants/`
- **Create a policy pack** — Reusable policy YAML in `policies/`
- **Build an adapter** — Support a new agent framework in `packages/adapters/`
- **Add a renderer** — Custom governance output renderer
- **Write a replay processor** — Session analysis tools

See [CONTRIBUTING.md](CONTRIBUTING.md) and [Plugin API specification](docs/plugin-api.md).

---

## Legend

- **Now**: Actively being worked on
- **Next**: Queued for the next development cycle
- **Later**: Planned but not yet scheduled
- **Future**: Research-grade, exploratory
