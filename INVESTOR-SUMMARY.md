# AgentGuard — Investor Summary

**Date:** March 2026

---

## One-Liner

AgentGuard is a **runtime governance layer for AI coding agents** — intercepting every action an AI proposes, enforcing security policies, and producing a verifiable audit trail before anything executes.

---

## The Problem

AI coding agents (Claude Code, GitHub Copilot, Cursor, etc.) can autonomously execute file writes, shell commands, git operations, and deployments. Today there is **no governance layer** between what an agent proposes and what actually runs. One bad tool call can:

- Push untested code to production branches
- Leak secrets and credentials
- Delete critical files or infrastructure
- Exceed intended scope of changes

Enterprises adopting AI-assisted development have **zero standardized tooling** to enforce policy, limit blast radius, or audit what agents actually did. Current mitigations are ad-hoc prompt engineering — non-deterministic and unauditable.

---

## The Solution

AgentGuard adds a **deterministic decision point** between every AI agent action proposal and its execution:

```
Agent proposes action → Policy evaluated → Invariants checked → Allow/Deny → Execute → Audit event emitted
```

**Key capabilities:**
- **Declarative YAML policies** — teams define what agents can and cannot do, version-controlled alongside code
- **8 built-in safety invariants** — secret exposure prevention, protected branch enforcement, blast radius limits, force-push blocking, lockfile integrity, and more
- **Escalation engine** — repeated violations automatically escalate to lockdown (all actions blocked until human review)
- **Full audit trail** — every action, decision, and execution recorded as structured JSONL events, replayable and inspectable
- **Deterministic kernel** — no AI in the governance loop; same action + same policy = same decision, every time

---

## Current State of the Product

| Metric | Value |
|--------|-------|
| **Version** | 1.0.0 (published on npm as `@red-codes/agentguard`) |
| **Source code** | ~15,300 lines of TypeScript across 88 source files |
| **Test coverage** | 76 test files (vitest + custom harness) |
| **Total commits** | 166 |
| **License** | Apache 2.0 (open source) |
| **First integration** | Claude Code (Anthropic) via PreToolUse/PostToolUse hooks |

### What's Built and Working

- **Governed action kernel** — full propose → normalize → evaluate → execute → emit pipeline
- **Action Authorization Boundary (AAB)** — normalizes Claude Code tool calls (Bash, Write, Edit, Read) into 23 canonical action types across 8 classes (file, git, shell, test, npm, http, deploy, infra)
- **Policy engine** — YAML/JSON policy format with pattern matching, scope rules, branch conditions, multi-file composition, and community policy packs (ci-safe, enterprise, open-source, strict)
- **Invariant system** — 8 built-in invariants enforced on every action
- **Escalation state machine** — NORMAL → ELEVATED → HIGH → LOCKDOWN with automatic tracking
- **JSONL event persistence** — complete audit trail with replay capability
- **CLI tooling** — 12 commands including `guard`, `inspect`, `events`, `replay`, `simulate`, `analytics`, `ci-check`, `export/import`, `policy validate`, `claude-init`
- **Cross-session analytics** — violation aggregation, clustering, trend analysis, and risk scoring
- **Plugin ecosystem** — discovery, registry, validation, and sandboxing for third-party extensions
- **VS Code extension** — sidebar panels for run status, history, recent events, and violation diagnostics
- **Pre-execution simulation** — filesystem, git, and package impact prediction before actions run
- **CI/CD integration** — GitHub Actions workflow for governance verification in pipelines
- **Evidence packs** — structured audit records for every governance decision

### Architecture Highlights

- **TypeScript** with strict mode, compiled via tsc + esbuild
- **Zero runtime AI dependencies** — governance is deterministic pattern matching, not inference
- **Minimal production dependencies** — only 3 runtime packages (chokidar, commander, pino)
- **Canonical event model** — all system activity flows through a single event spine, enabling audit, replay, analytics, and rendering from one data stream

---

## Market Opportunity

**AI coding agents are the fastest-growing category in developer tools.** Every major platform (Anthropic, GitHub, Google, Cursor, Windsurf) is shipping autonomous coding capabilities. As agents gain more autonomy, the governance gap widens:

- **Enterprise adoption is blocked by risk** — security, compliance, and engineering teams need policy enforcement and audit trails before greenlighting AI agents in production workflows
- **No incumbent** — there is no standard governance tool for AI agent actions today. The space is greenfield.
- **Regulatory tailwinds** — AI governance frameworks (EU AI Act, NIST AI RMF) are creating compliance requirements that AgentGuard directly addresses at the execution layer

### Target customers:
1. **Developers using AI coding agents** — want guardrails without losing productivity
2. **Engineering teams at scale** — need policy enforcement and audit trails for AI-assisted development
3. **Agent framework builders** — want a reusable governance layer they can integrate

---

## Technical Differentiators

| | AgentGuard | Alternatives |
|---|---|---|
| **Enforcement** | Active runtime — blocks actions before execution | Prompt engineering (non-deterministic) |
| **Policy format** | Declarative YAML, version-controlled | Ad-hoc rules embedded in prompts |
| **Audit trail** | Structured JSONL with full action lifecycle | Manual logging or none |
| **Determinism** | Same action + same policy = same decision | Probabilistic / model-dependent |
| **Escalation** | Automatic lockdown on repeated violations | None |
| **Agent-agnostic** | Canonical action model supports any framework | Tied to single agent/model |

---

## Business Model Potential

- **Open-source core** (Apache 2.0) drives adoption and community trust
- **Enterprise tier** opportunities: centralized policy management, team dashboards, SSO/RBAC, SLA-backed support, compliance reporting
- **Platform integrations** — expand beyond Claude Code to Copilot, Cursor, Windsurf, custom agents
- **Policy marketplace** — community and curated policy packs for industry-specific compliance (SOC 2, HIPAA, PCI-DSS)

---

## Team & Development Velocity

- Primary developer: **Jared Pleva** (@jpleva91)
- 166 commits in ~2 days of active development — extremely high velocity
- Clean architecture with comprehensive documentation (CLAUDE.md, ARCHITECTURE.md, feature specs)
- CI/CD with GitHub Actions (lint, type-check, tests, CodeQL security analysis, npm publishing)

---

## What's Next

- Expand agent framework integrations (GitHub Copilot, Cursor, open-source agent frameworks)
- Enterprise features: centralized policy management, team-level analytics, compliance dashboards
- Policy pack ecosystem: community-contributed and curated policy sets
- Cloud-hosted governance service for teams that don't want to self-host
- Deeper CI/CD integration: governance gates in deployment pipelines

---

## Links

- **GitHub:** https://github.com/jpleva91/agent-guard
- **npm:** https://www.npmjs.com/package/@red-codes/agentguard
- **License:** Apache 2.0
