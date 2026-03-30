# OWASP Agentic Top 10 Coverage — AgentGuard

> Audit date: 2026-03-25 | AgentGuard kernel: 26 invariants, 41 action types, 95+ command patterns

## Coverage Summary

| # | OWASP Category | Coverage | Score |
|---|----------------|----------|-------|
| 1 | Prompt Injection | MODERATE | 6/10 |
| 2 | Insecure Tool Implementation | STRONG | 8/10 |
| 3 | Excessive Agency / Permissions | STRONG | 9/10 |
| 4 | Insecure Output Handling | WEAK | 4/10 |
| 5 | Inadequate Sandboxing | MINIMAL | 3/10 |
| 6 | Implicit Trust / Insufficient Verification | STRONG | 8/10 |
| 7 | Data Exfiltration via Agent | STRONG | 8/10 |
| 8 | Model Manipulation / Abuse | MODERATE | 5/10 |
| 9 | Insufficient Logging / Monitoring | STRONG | 9/10 |
| 10 | Multi-Agent Trust Issues | WEAK | 4/10 |

**Overall: 64/100** — Strong governance core with gaps in sandboxing, output handling, and multi-agent scenarios.

---

## Detailed Analysis

### 1. Prompt Injection (Direct/Indirect)

**Coverage: MODERATE (6/10)**

| Mechanism | Component | What It Does |
|-----------|-----------|-------------|
| Policy evaluation | `packages/policy/src/evaluator.ts` | Matches action intent against rules, blocks mismatched commands |
| AAB normalization | `packages/kernel/src/aab.ts` | Normalizes raw agent actions into canonical types |
| Command scanning | `packages/matchers/src/command-scanner.ts` | Two-tier Aho-Corasick + RegExp matching for 95+ destructive patterns |
| Intent drift detection | `packages/kernel/src/intent.ts` | Compares declared intent against observed execution |
| Transitive effect analysis | Invariant `no-transitive-effect-analysis` | Detects written scripts containing dangerous commands |

**Gaps:**
- No semantic injection analysis (e.g., `git commit -m "$(malicious)"`)
- No input sanitization enforcement in policy rules
- Shell metacharacter expansion via user-controlled parameters not prevented
- Intent drift is advisory only

---

### 2. Insecure Tool Implementation

**Coverage: STRONG (8/10)**

| Mechanism | Component | What It Does |
|-----------|-----------|-------------|
| Canonical action types | `packages/core/src/actions.ts` | 41 types across 10 classes with strict hierarchy |
| Execution adapters | `packages/adapters/src/*.ts` | Separate handlers for file, shell, git, claude-code, copilot-cli |
| Hook integrity | `packages/adapters/src/hook-integrity.ts` | Validates hook signatures and settings before execution |
| Execution failure events | `ACTION_FAILED` event kind | All failures emit audit events |
| Blast radius | `packages/kernel/src/blast-radius.ts` | Pre-execution impact forecast for overly broad operations |

**Gaps:**
- No runtime sandboxing (seccomp/eBPF/container isolation)
- No per-adapter resource limits (timeout, file count, memory)
- File adapter lacks `realpath()` enforcement against symlink attacks

---

### 3. Excessive Agency / Permissions

**Coverage: STRONG (9/10)**

| Mechanism | Component | What It Does |
|-----------|-----------|-------------|
| 22 built-in invariants | `packages/invariants/src/definitions.ts` | `blast-radius-limit`, `no-force-push`, `no-permission-escalation`, `no-cicd-config-modification`, `no-governance-self-modification` |
| Escalation state machine | `packages/kernel/src/monitor.ts` | NORMAL -> ELEVATED -> HIGH -> LOCKDOWN based on denial/violation thresholds |
| Persona-based policy | `packages/core/src/persona.ts` | Trust tier, role, autonomy, risk tolerance scoping |
| Intent alignment | `packages/kernel/src/intent.ts` | Drift detection when actions deviate from declared scope |
| Skill/schedule protection | Invariants `no-skill-modification`, `no-scheduled-task-modification` | Locks agent skill and schedule definitions |

**Gaps:**
- Permissions are binary (allow/deny), not capability-scoped
- Dynamic scoping not supported (scopes don't adapt to runtime state)
- Blast radius uses static multipliers, not domain-adaptive weights

---

### 4. Insecure Output Handling

**Coverage: WEAK (4/10)**

| Mechanism | Component | What It Does |
|-----------|-----------|-------------|
| PII detection | `invariant-data-protection` plugin, `no-pii-in-logs` | 28 PII patterns (SSN, credit card, phone, email, passport) in log files |
| Secret detection | `no-hardcoded-secrets` invariant | Three-layer: regex + fingerprint hashing + entropy-based (>4.5 bits/char) |
| Batch limits | `max-file-count-per-action` invariant | Limits batch operations to 50 files |

**Gaps:**
- No output sanitization enforcement for agent responses
- Shell stdout/stderr not scanned before returning to user/CI
- Only file writes checked — no API response, database result, or network output inspection
- No PII validation for structured output (JSON/CSV)

---

### 5. Inadequate Sandboxing

**Coverage: MINIMAL (3/10)**

| Mechanism | Component | What It Does |
|-----------|-----------|-------------|
| Adapter registry | `packages/adapters/src/registry.ts` | Dispatches actions to type-specific handlers |
| Execution audit log | `packages/core/src/execution-log/` | Tamper-resistant event log |
| Pre-execution simulation | `packages/kernel/src/simulation/` | Filesystem/git/package change prediction (advisory) |

**Gaps:**
- No process isolation — agents run in same process as kernel
- No filesystem chroot/jail
- No network isolation (except network egress invariant allowlist)
- No CPU/memory/time limits for adapter execution
- No capability dropping (libcap/seccomp)
- Full environment variables inherited ($PATH, $HOME, $LD_PRELOAD)

---

### 6. Implicit Trust / Insufficient Verification

**Coverage: STRONG (8/10)**

| Mechanism | Component | What It Does |
|-----------|-----------|-------------|
| Policy trust | `packages/policy/src/policy-trust.ts` | Validates policy file signatures and version constraints |
| Hook integrity | `packages/adapters/src/hook-integrity.ts` | Verifies hook settings match expected hash |
| Enforcement audit chain | `packages/kernel/src/enforcement-audit.ts` | Tamper-resistant decision records with cryptographic chaining |
| Trust events | `PolicyTrustVerified/Denied`, `HookIntegrityVerified/Failed` | Full audit trail of trust decisions |
| Persona trust tiers | Policy conditions | Rules can require specific trust levels |

**Gaps:**
- No end-to-end proof of execution exportable to external systems
- Agent identity not cryptographically verified (policy accepts name as input)
- No cross-session trust credentials

---

### 7. Data Exfiltration via Agent

**Coverage: STRONG (8/10)**

| Mechanism | Component | What It Does |
|-----------|-----------|-------------|
| Network egress | Invariant `no-network-egress` | Blocks HTTP to non-allowlisted domains, detects curl/wget/nc in shell |
| IDE socket blocking | Invariant `no-ide-socket-access` | Prevents governance escape via VS Code/JetBrains/Cursor IPC sockets |
| Secret detection | Invariant `no-hardcoded-secrets` | Three-layer detection prevents writing secrets to files |
| Env var protection | Invariant `no-env-var-modification` | Detects export of sensitive env vars |

**Gaps:**
- No outbound data DLP (HTTP request body/headers not inspected)
- DNS exfiltration not detected
- Allowlists are static, not context-adaptive

---

### 8. Model Manipulation / Abuse

**Coverage: MODERATE (5/10)**

| Mechanism | Component | What It Does |
|-----------|-----------|-------------|
| Intent drift | `packages/kernel/src/intent.ts` | Advisory flagging when actions deviate from declared intent |
| Denial learning | `packages/storage/src/denial-learner.ts` | Accumulates denial history for pattern detection |
| Escalation monitoring | `packages/kernel/src/monitor.ts` | Tracks denials/violations, escalates on thresholds (5 denials or 3 violations per 5-min window) |

**Gaps:**
- Intent drift is advisory-only, not enforced
- No prompt injection / jailbreak detection patterns
- No anomaly detection over session behavior history
- No model fine-tuning governance

---

### 9. Insufficient Logging / Monitoring

**Coverage: STRONG (9/10)**

| Mechanism | Component | What It Does |
|-----------|-----------|-------------|
| 38+ event kinds | `packages/events/src/schema.ts` | Governance, reference monitor, decision, simulation, integrity, heartbeat |
| SQLite persistence | `packages/storage/src/sqlite-sink.ts` | All events sunk to indexed database with migrations |
| Policy traces | `PolicyTraceRecorded` event | Logs all rules checked, conditions evaluated, outcomes |
| Heartbeat monitoring | `packages/kernel/src/heartbeat.ts` | `HeartbeatEmitted`, `HeartbeatMissed`, `AgentUnresponsive` |
| Evidence packs | `packages/kernel/src/evidence.ts` | Explainable decision records with violation chains |
| Session viewer | CLI `session-viewer` command | Interactive HTML dashboard of governance sessions |

**Gaps:**
- No automatic alert routing (Slack, PagerDuty, SIEM webhook)
- No log retention policy enforcement
- Cloud telemetry is opt-in

---

### 10. Multi-Agent Trust Issues

**Coverage: WEAK (4/10)**

| Mechanism | Component | What It Does |
|-----------|-----------|-------------|
| Persona system | `packages/core/src/persona.ts` | Agent identity with role, trust tier, autonomy level |
| Per-persona policies | Policy evaluator | Rules conditioned on trust tier, role, tags |
| Agent tracking | Event model | `ACTION_REQUESTED` includes agentRole |
| Swarm templates | `packages/swarm/src/` | Config and manifest parsing for agent swarm setup |

**Gaps:**
- No inter-agent authorization (Agent A can modify Agent B's output)
- No shared resource locking (concurrent file access)
- No trust delegation between agents
- Escalation counts per-session, not across swarm
- MCP call outputs not policy-verified

---

## Comparison: AgentGuard vs Microsoft Agent Governance Toolkit

| Category | AgentGuard | Microsoft AGT (claimed) |
|----------|-----------|------------------------|
| Prompt Injection | Moderate (detect + block destructive) | Claimed 10/10 |
| Insecure Tool Impl | Strong (typed actions, adapters) | Claimed 10/10 |
| Excessive Agency | Strong (26 invariants, escalation) | Claimed 10/10 |
| Insecure Output | Weak (PII/secret detection only) | Claimed 10/10 |
| Inadequate Sandboxing | Minimal (no OS isolation) | Claimed 10/10 |
| Implicit Trust | Strong (crypto trust chain) | Claimed 10/10 |
| Data Exfiltration | Strong (egress control, secret detection) | Claimed 10/10 |
| Model Manipulation | Moderate (advisory drift only) | Claimed 10/10 |
| Insufficient Logging | Strong (38+ events, SQLite) | Claimed 10/10 |
| Multi-Agent Trust | Weak (persona only) | Claimed 10/10 |

> Note: Microsoft's "10/10" claim is self-reported. AgentGuard's scores are from code-level audit.

---

## Roadmap: Closing the Gaps

### P0 — Before Conference (May 6)

1. **Enforce intent drift** — Switch from advisory to blocking mode (flag: `--strict-intent`)
2. **Output sanitization** — Add stdout/stderr PII scanning for `shell.exec` adapter
3. **Multi-agent resource locks** — File-level mutex for concurrent swarm agents

### P1 — Phase 2 (Design Partners)

4. **Capability-based policies** — Path-scoped, size-limited permission grants
5. **SIEM webhook integration** — Route critical events to external alerting
6. **Agent identity certificates** — Cryptographic agent identity verification

### P2 — GA

7. **OS-level sandboxing** — seccomp-bpf / Landlock integration for Linux adapters
8. **DLP rules** — HTTP request body inspection for sensitive data patterns
9. **Anomaly detection** — Behavioral baselines per-agent with deviation scoring
10. **Cross-agent escalation** — Aggregate violation counts across swarm sessions
