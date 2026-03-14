# Strategic Roadmap — AgentGuard

> **Relationship to ROADMAP.md:** This document describes the *business strategy* (market phases, monetization, positioning). The technical implementation roadmap lives in [`ROADMAP.md`](../ROADMAP.md) (18 phases with checkboxes). Current implementation priorities are in [`docs/current-priorities.md`](current-priorities.md).
>
> **Phase cross-reference:**
> | Strategic Phase (this doc) | ROADMAP.md Phases | Status |
> |---------------------------|-------------------|--------|
> | Phase 0: Category Definition | Phases 5–6.5 (Editor Integration, Ref Monitor Hardening, Invariant Expansion) | IN PROGRESS |
> | Phase 1: Developer Platform | Phases 7–8 (Capability Sessions, Policy Ecosystem) | PLANNED |
> | Phase 2: Enterprise Enforcement | Phases 9, 12–14 (Agent Integrations, CI/CD, Environmental, Multi-Agent) | PLANNED |
> | Phase 3: Platform Lock-In | Phases 15–17 (AI-Assisted, Predictive, Formal Verification) | PLANNED |
> | Phase 4–5: Kernel Hardening | Phase 18 (Remote Governance) + Rust migration | PLANNED |
>
> Last reconciled: 2026-03-14

AgentGuard aims to evolve from a single-framework developer tool into a mission-critical enterprise Control Plane for autonomous agents — and ultimately, for any autonomous system including physical/embodied ones.

## Core Thesis

Software side effects and physical side effects belong to the same problem class. The governance kernel mediates all agent actions regardless of substrate.

## Informing Documents

- **ARSG Roadmap** — 4-phase evolution from OSS kernel → developer platform → enterprise enforcement → industry standard
- **Sentinel Document** — Extends the Reference Monitor to physical systems via the Sentinel AG-01 edge node, treating hardware (GPIO, sensors, actuators) as adapter surfaces. Introduces Rust kernel migration for the trust boundary.

## Current State

AgentGuard has a mature governance kernel (propose → evaluate → execute → emit), 17 built-in invariants, event-sourced JSONL audit trails, pre-execution simulation (filesystem/git/package), escalation state machine (NORMAL → LOCKDOWN), pluggable tracing, cross-session analytics (clustering, trends, risk scoring), a plugin ecosystem, a VS Code extension, SQLite and Firestore storage backends, and a fully autonomous SDLC control plane with 22+ coordinated agents. The only framework adapter is Claude Code.

Completed technical phases: Architecture Clarity, Canonical Event Model, Governance Runtime, Event Persistence + Replay, Plugin Ecosystem (Phases 0–4 STABLE). Currently working on: Editor Integrations (Phase 5), Reference Monitor Hardening (Phase 6), Structured Storage (Phase 10).

## Target Architectural Layers

| Layer | Runtime | Responsibility |
|-------|---------|----------------|
| Control Plane | TypeScript/Node | CLI, policy authoring, integration management |
| Governance Kernel | TypeScript now → Rust long-term | Action interpretation, invariant enforcement |
| Execution Adapters | Substrate-independent | Bridges: Shell, Git, GPIO, Cloud APIs |
| Edge Runtime | Python v1 | Physical enforcement via Sentinel AG-01 |

---

## Phase 0: Category Definition & The Open-Source Kernel (Months 0–3)

**Goal:** Establish the "Reference Monitor" as the default architecture for agent governance via multi-framework adapters and security credibility.

### 0.1 — Multi-Framework Adapter System

Expand beyond Claude Code to support MCP, LangChain/LangGraph, OpenAI Agents SDK, AutoGen, and Copilot CLI.

See: [docs/multi-framework-adapters.md](multi-framework-adapters.md)

### 0.2 — Threat Model & Security Benchmarks

Formal threat model covering agent privilege escalation, data exfiltration, supply chain attacks, prompt injection → tool abuse, and sandbox escape. Security benchmark suite validating invariant coverage. POLA enforcement audit of default-allow behavior.

See: [docs/threat-model.md](threat-model.md)

### 0.3 — Developer Experience & Distribution

- npm package improvements: install cleanly as a dependency (not just CLI)
- Programmatic API (`src/index.ts`): export kernel, policy evaluator, invariant checker as library
- Quick-start templates: one-command setup per framework
- GitHub Action for CI governance (extend existing `agentguard-governance.yml`)

---

## Phase 1: Developer Platform & Initial Monetization (Months 3–9)

**Goal:** Transform from community tool to essential infrastructure with paid offerings.

### 1.1 — Cloud Policy Service ("GitHub for Agent Security Policies")

Policy versioning with git-like version tracking, diff, and rollback. Remote policy sync with conflict resolution (deny-wins merge). Team RBAC model (admin, policy-editor, viewer, agent). Policy validation webhooks for Slack/GitHub/email alerts.

See: [docs/cloud-policy-service.md](cloud-policy-service.md)

### 1.2 — Observability & Action Traces

Full action trace construction from span trees. Trace querying by time range, agent, action type, outcome. OpenTelemetry-compatible export. Real-time event streaming via WebSocket/SSE. Enhanced TUI with interactive trace exploration and live dashboard mode.

See: [docs/observability-traces.md](observability-traces.md)

### 1.3 — Secrets & Exfiltration Protection (Enhanced)

Content-aware secret scanner with regex patterns for major cloud providers, entropy-based detection, and Base64 scanning. Egress monitoring tracking `http.request` and `shell.exec` with domain allowlists/denylists and volume thresholds. Redaction engine for event payloads.

See: [docs/secrets-exfiltration-protection.md](secrets-exfiltration-protection.md)

---

## Phase 2: Enterprise Enforcement & Compliance Platform (Months 9–24)

**Goal:** Transition from advisory (visibility) to enforcement (runtime control) for Fortune 500 customers.

### 2.1 — Sandboxed Execution

Docker-based action isolation, chroot/namespace file access restriction, iptables/nftables network isolation, CPU/memory/time limits. Platform-specific: seccomp + AppArmor (Linux), Seatbelt (macOS), Job objects (Windows), Docker fallback (cross-platform).

### 2.2 — Capability Tokens

Typed capability system for agents with minting, validation, expiry, and revocation. Fine-grained capabilities like `file:read:<glob>`, `git:push:<branch>`, `shell:exec:<pattern>`, `network:egress:<domain>`.

See: [docs/capability-tokens.md](capability-tokens.md)

### 2.3 — Kill Switches & Circuit Breakers

Circuit breaker pattern (CLOSED → OPEN → HALF-OPEN) with per-agent and per-action-class granularity. Remote kill switch for immediate cross-session halt. Graceful degradation with progressive restriction and read-only mode.

See: [docs/kill-switches-circuit-breakers.md](kill-switches-circuit-breakers.md)

### 2.4 — Compliance Mapping (SOC2, ISO 27001, HIPAA)

Map AgentGuard capabilities to compliance framework controls. Pre-built policy templates per framework. CLI command for compliance audit reports.

See: [docs/compliance-framework.md](compliance-framework.md)

### 2.5 — Cryptographic Non-Repudiation

Ed25519/HMAC-SHA256 event signing. Hash chain for tamper-evident logs. Decision record signing with policy version hash. Signed attestation artifacts exportable as PKCS#7/JWS. Periodic integrity verification.

See: [docs/cryptographic-non-repudiation.md](cryptographic-non-repudiation.md)

### 2.6 — CI/CD Governance & Incident Response

PR governance gate (block merge on violations). Supply chain protection with transitive dependency analysis. Incident response toolkit: root cause tracing, agent revocation, session quarantine, incident report generation.

### 2.7 — Sentinel AG-01: Physical Proof of Concept

Validates the kernel's universality by treating hardware as just another adapter surface. Expanded action taxonomy for GPIO, sensors, actuators, power, motion. Physical invariants for thermal limits, battery thresholds, spatial boundaries. Python v1 edge runtime on Raspberry Pi 5.

See: [docs/sentinel-architecture.md](sentinel-architecture.md)

---

## Phase 3: Platform Lock-In & Industry Standardization (Months 24–48)

**Goal:** Become the industry standard with high switching costs through identity, policy language, and protocol leadership.

### 3.1 — Agent Identity & Delegation Chains

First-class agent identity model with registration, attestation, and lifecycle management. Delegation chain tracking (human → agent → sub-agent) with capability narrowing. Human-in-the-loop approval workflows via CLI, webhook, Slack, email.

See: [docs/agent-identity-delegation.md](agent-identity-delegation.md)

### 3.2 — Declarative Policy Language ("OPA for Agents")

Custom DSL with package system, default rules, pattern matching, and built-in functions. Policy testing framework with coverage reporting and regression testing. Migration tooling from YAML. Backward compatibility maintained.

See: [docs/policy-dsl-spec.md](policy-dsl-spec.md)

### 3.3 — Protocol Standardization

Agent Governance Protocol (AGP) formal specification. Standard formats for events, policies, and audit trails. Reference implementation with validation tooling. Open-source under Apache 2.0.

See: [docs/agent-governance-protocol.md](agent-governance-protocol.md)

---

## Phase 4–5: Kernel Hardening & Multi-Node Coordination (Months 36–60)

**Goal:** Migrate the governance kernel trust boundary to Rust for memory safety and deterministic performance. Enable multi-node governance coordination.

### 4.1 — Rust Governance Kernel

The governance kernel is the trust boundary — it must be tamper-resistant, memory-safe, and deterministic. Gradual migration: invariant checker first, then policy evaluator, then full kernel. N-API bindings maintain TypeScript API compatibility.

See: [docs/rust-kernel-migration.md](rust-kernel-migration.md)

### 4.2 — Multi-Node Governance Coordination

Multi-node kernel cluster with leader election and state sync. Policy consensus across nodes (deny-wins merge). Event stream replication. Federated policy enforcement with local fallback on network partition. CRDTs for escalation state.

---

## Implementation Priority & Sequencing

> See [ROADMAP.md](../ROADMAP.md) for granular technical items with checkboxes.

### Immediate (Current Sprint)

- Default-deny unknown actions in policy evaluator (ROADMAP Phase 6)
- PAUSE/ROLLBACK enforcement in kernel (ROADMAP Phase 6)
- Governance self-modification invariant (ROADMAP Phase 6)
- CI/CD config and network egress invariants (ROADMAP Phase 6.5)

### Near-term (Months 1–3)

- `FrameworkAdapter` interface + MCP adapter (ROADMAP Phase 9)
- RunManifest capability-scoped sessions (ROADMAP Phase 7)
- SQLite migration v2 + SQL-native analytics (ROADMAP Phase 10)
- Threat model document

### Mid-term (Months 3–9 — Phase 1)

- LangChain + OpenAI Agents SDK adapters
- Policy versioning and remote sync
- Content-aware secret scanner
- Egress monitoring
- OTel trace backend
- Real-time event streaming

### Long-term (Months 9–24 — Phase 2)

- Capability tokens
- Circuit breakers & kill switches
- Compliance framework mappings
- Cryptographic event signing
- Sandboxed execution
- Incident response toolkit
- Physical action taxonomy + invariants (Sentinel foundation)
- Hardware adapters + Sentinel AG-01 edge runtime

### Strategic (Months 24–48 — Phase 3)

- Agent identity & delegation chains
- Declarative policy DSL
- Protocol standardization

### Long-Horizon (Months 36–60 — Phase 4–5)

- Rust kernel migration (invariant checker first, then policy evaluator, then full kernel)
- Multi-node governance coordination
- Federated policy enforcement

---

## Verification Strategy

See: [docs/verification-strategy.md](verification-strategy.md)
