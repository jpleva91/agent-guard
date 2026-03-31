# How AgentGuard Maps to the OWASP Agentic Top 10

*Published: [PENDING — LinkedIn draft]*
*Author: AgentGuard team*
*Source audit: docs/owasp-agentic-top10-coverage.md — 2026-03-25*

---

The OWASP Agentic Top 10 is the emerging security standard for AI coding agent risks. Most agent frameworks don't address it at all. Here's an honest, code-level audit of where AgentGuard stands — strengths and gaps included.

## TL;DR

AgentGuard scores **64/100** across the OWASP Agentic Top 10. Strong on governance fundamentals (excessive agency, logging, trust verification, data exfiltration). Honest gaps in sandboxing and multi-agent scenarios. The assessment comes from reading the source — not marketing copy.

---

## The 10 Categories and Where AgentGuard Stands

### 1. Prompt Injection — Moderate (6/10)

AgentGuard doesn't parse LLM prompts, so it can't detect semantic injection. What it *does* do: the Action Authorization Boundary (AAB) normalizes every tool call into a canonical action type before evaluation, so a prompt-injected `git push origin main` still gets blocked by the `protected-branch` invariant. Intent drift detection (`packages/kernel/src/intent.ts`) flags when observed actions diverge from declared session intent — advisory today, with a P0 roadmap item to make it blocking.

The gap: shell metacharacter expansion via user-controlled parameters (e.g., `git commit -m "$(malicious)"`) is not prevented.

### 2. Insecure Tool Implementation — Strong (8/10)

This is AgentGuard's core competency. Every agent tool call is normalized into one of 43 canonical action types across 10 classes (`file`, `git`, `shell`, `npm`, `http`, `deploy`, `infra`, `github`, `test`, `mcp`). Execution is dispatched through typed adapters — each handling one action class — rather than directly to the shell. Hook integrity verification confirms the governance hooks themselves haven't been tampered with before any execution occurs.

### 3. Excessive Agency — Strong (9/10)

26 built-in invariants enforce hard limits on what agents can do regardless of what the policy says:

- `blast-radius-limit` — pre-execution impact forecast blocks overly broad operations
- `no-permission-escalation` — blocks `chmod 777`, `sudo`, `chown root`
- `no-cicd-config-modification` — locks `.github/workflows/`, CI configs
- `no-governance-self-modification` — agents cannot modify their own governance hooks
- `commit-scope-guard` — enforces that commits stay within declared session scope

The escalation state machine (`NORMAL → ELEVATED → HIGH → LOCKDOWN`) automatically tightens restrictions as denials accumulate in a session window.

### 4. Insecure Output Handling — Weak (4/10)

AgentGuard checks what agents *write*, not what they *output*. The data protection plugin scans for PII patterns and hardcoded secrets in file writes. Shell stdout/stderr is not inspected before returning to the user or CI pipeline. This is a known gap with a roadmap fix planned (stdout/stderr PII scanning for the `shell.exec` adapter).

### 5. Inadequate Sandboxing — Minimal (3/10)

Honest answer: AgentGuard is a governance layer, not an OS security boundary. It intercepts tool calls and enforces policy before execution — it does not run agents in a container, chroot jail, or seccomp-bpf sandbox. The `no-network-egress` invariant limits outbound HTTP to an allowlist, and pre-execution simulation forecasts filesystem/git impact before it happens. Full OS-level isolation is on the P2 roadmap.

### 6. Implicit Trust — Strong (8/10)

AgentGuard builds a cryptographic trust chain through every governance session:
- Policy files are hash-verified at load time (`policy-trust.ts`)
- Hook settings are integrity-checked before any session starts (`hook-integrity.ts`)
- All decisions are cryptographically chained — the enforcement audit log can prove no decisions were altered after the fact
- Events emit `PolicyTrustVerified`, `PolicyTrustDenied`, `HookIntegrityVerified`, `HookIntegrityFailed`

The gap: agent *identity* is not cryptographically verified. An agent claiming to be `trust-tier:high` is taken at its word. Certificate-based identity is on the roadmap.

### 7. Data Exfiltration — Strong (8/10)

Three defense layers:
1. `no-network-egress` invariant — blocks `curl`, `wget`, `nc` to non-allowlisted domains with command-pattern scanning
2. `no-ide-socket-access` — prevents governance escape via VS Code/JetBrains/Cursor IPC sockets
3. `no-env-var-modification` — detects export of sensitive environment variables

The gap: DNS exfiltration isn't detected, and outbound HTTP request *bodies* aren't inspected for sensitive data.

### 8. Model Manipulation / Abuse — Moderate (5/10)

The denial learner (`packages/storage/src/denial-learner.ts`) accumulates session history and flags repeat-pattern behavior. The escalation monitor tightens restrictions dynamically as violations accumulate. Intent drift detection flags behavioral deviation from declared session scope.

The gap: these are mostly pattern-based, not semantic. No LLM-jailbreak detection. No cross-session behavioral baselines.

### 9. Insufficient Logging — Strong (9/10)

This is the most mature area. AgentGuard has 47 event kinds covering the full governance lifecycle — from `ActionRequested` through `ActionAllowed`/`ActionDenied` to `EvidencePackGenerated`. All events are persisted to SQLite with full indexing. Policy evaluation traces record every rule checked, every condition evaluated, and the outcome. Evidence packs are exportable for CI verification. The session viewer generates an interactive HTML audit trail.

The only gap: no automatic alert routing to external SIEM/PagerDuty/Slack.

### 10. Multi-Agent Trust — Weak (4/10)

AgentGuard has a persona system for agent identity (role, trust tier, autonomy level) and per-persona policy conditions. But inter-agent authorization isn't implemented: Agent A can overwrite Agent B's output files. There's no shared resource locking for concurrent swarm agents. Escalation counts are per-session, not aggregated across the swarm. This is the biggest architectural gap for teams running multi-agent workspaces.

---

## The Comparison Worth Making

Some vendors claim "10/10" across all categories based on self-assessment. AgentGuard's scores come from reading the source code and noting what the invariant checker actually enforces vs. what it doesn't touch.

Strong governance core covers 7 of 10 categories at 6+ score. The three gaps (sandboxing, output handling, multi-agent trust) are documented, on the roadmap, and not papered over.

---

## What's Next

**Before May conference (P0):**
- Enforce intent drift as blocking (not just advisory)
- Add stdout/stderr PII scanning in `shell.exec` adapter
- File-level mutex for concurrent swarm agent writes

**Design partner phase (P1):**
- Capability-based policies with path-scoped grants
- SIEM webhook integration for critical events
- Cryptographic agent identity verification

---

*AgentGuard is open source. Read the invariant definitions: `packages/invariants/src/definitions.ts`. Read the OWASP coverage audit: `docs/owasp-agentic-top10-coverage.md`.*

*[GitHub](https://github.com/AgentGuardHQ/agentguard) · `npx aguard claude-init`*
