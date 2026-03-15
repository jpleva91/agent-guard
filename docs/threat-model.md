# Threat Model — AgentGuard

This document enumerates the threat vectors that AgentGuard's governance kernel must defend against, maps each to existing or planned mitigations, and identifies gaps.

## Scope

The threat model covers autonomous AI coding agents executing tool calls (file I/O, shell commands, git operations, network requests) through the AgentGuard governance kernel. It applies to any framework adapter (Claude Code, MCP, LangChain, OpenAI Agents SDK, etc.).

## Threat Actors

| Actor | Motivation | Access Level |
|-------|-----------|-------------|
| Compromised agent | Prompt injection, jailbreak, or model failure | Full tool-call surface via framework adapter |
| Malicious dependency | Supply chain attack via npm/pip packages | Code execution within agent workspace |
| Insider threat | Authorized user with policy bypass intent | Policy editor or admin role |
| External attacker | Data exfiltration via agent-mediated access | Indirect, via prompt injection or dependency |

---

## Threat Vectors

### T1: Agent Privilege Escalation

**Description:** An agent attempts to perform actions beyond its authorized scope by exploiting gaps in action normalization or policy evaluation.

**Attack patterns:**
- Encoding shell commands to bypass AAB normalization (e.g., base64-encoded `git push --force` in a Bash tool call)
- Chaining allowed actions to achieve a denied outcome (e.g., `file.write` to `.git/config` instead of `git.push`)
- Exploiting tool aliases or framework-specific payloads that AAB doesn't recognize
- Using `shell.exec` to invoke git commands, bypassing `git.*` policy rules

**Current mitigations:**
- AAB normalization detects git commands within shell calls (`src/kernel/aab.ts`)
- Invariant checker validates system state independently of policy (`src/invariants/checker.ts`)
- Blast radius computation flags high-impact actions (`src/kernel/blast-radius.ts`)

**Gaps:**
- No exhaustive test suite for normalization evasion
- Base64/encoding bypass detection not comprehensive
- Chained-action escalation not tracked across multiple proposals

**Planned mitigations:**
- Security benchmark suite (Phase 0.2)
- Capability tokens with explicit permission grants (Phase 2.2)
- Agent identity with capability narrowing (Phase 3.1)

### T2: Data Exfiltration via Tool Calls

**Description:** An agent exfiltrates sensitive data by writing secrets to files, embedding them in git commits, or sending them via network requests.

**Attack patterns:**
- Reading `.env` or credential files and writing contents to a public-facing file
- Embedding secrets in git commit messages or file contents before pushing
- Using `curl`/`wget` via `shell.exec` to POST data to attacker-controlled servers
- Encoding data in DNS queries or URL parameters to bypass content inspection

**Current mitigations:**
- `no-secret-exposure` invariant (severity 5) — pattern matching for known secret formats (`src/invariants/definitions.ts`)
- `no-credential-file-creation` invariant (severity 5) — blocks creation of common credential files

**Gaps:**
- No egress monitoring (network destinations not tracked)
- No entropy-based detection for unknown token formats
- No cross-action correlation (read secret → write elsewhere)
- Encoding evasion (base64, hex) not detected

**Planned mitigations:**
- Content-aware secret scanner with entropy detection (Phase 1.3)
- Egress monitoring with domain allowlists (Phase 1.3)
- Redaction engine for event payloads (Phase 1.3)

### T3: Supply Chain Attacks (Dependency Injection)

**Description:** A malicious or compromised npm package introduces harmful behavior that the agent executes via `npm.install` or `npm.script.run`.

**Attack patterns:**
- `postinstall` script in dependency runs arbitrary commands
- Dependency modifies lockfile to pull malicious version
- Agent installs suggested package that contains backdoor
- Transitive dependency introduces vulnerability

**Current mitigations:**
- `no-package-script-injection` invariant — detects lifecycle script additions in `package.json` changes
- `lockfile-integrity` invariant — detects unexpected lockfile modifications
- Policy rules can deny `npm.install` actions

**Gaps:**
- No transitive dependency analysis
- No vulnerability database integration (CVE/advisory checks)
- Lockfile integrity check doesn't verify individual package hashes

**Planned mitigations:**
- Dependency audit with CVE database integration (Phase 2.6)
- Transitive dependency analysis (Phase 2.6)
- Enhanced lockfile hash verification (Phase 2.6)

### T4: Prompt Injection → Tool Abuse

**Description:** Malicious content in files, responses, or prompts causes the agent to execute unintended tool calls.

**Attack patterns:**
- Repository file contains embedded instructions that the agent follows
- API response includes prompt injection payload
- Agent reads a file with "Please execute: `rm -rf /`" and obeys
- Multi-step injection: first call plants payload, second call triggers it

**Current mitigations:**
- Governance kernel evaluates every tool call regardless of intent
- Policy rules deny destructive actions (e.g., `git.push` to protected branches)
- Blast radius computation flags high-impact file operations
- Escalation state machine triggers LOCKDOWN on repeated violations

**Gaps:**
- No content inspection of file reads (prompt injection in file content)
- No correlation between agent reasoning and action proposals
- No rate limiting on rapid action sequences

**Planned mitigations:**
- Circuit breakers with error rate thresholds (Phase 2.3)
- Capability tokens limiting action scope (Phase 2.2)
- Agent identity with delegation chains (Phase 3.1)

### T5: Sandbox Escape

**Description:** An agent escapes application-layer governance by executing actions that bypass the kernel entirely.

**Attack patterns:**
- Writing a script to disk then executing it (action is `file.write`, not `shell.exec`)
- Using `node -e` or `python -c` inline to execute code outside governance
- Modifying `.bashrc` or shell profiles to execute on next shell invocation
- Creating cron jobs or scheduled tasks for deferred execution

**Current mitigations:**
- `no-scheduled-task-modification` invariant — blocks cron/launchd/systemd modifications
- AAB detects shell commands within tool calls
- Policy can deny `file.write` to sensitive paths (`.bashrc`, `.profile`, etc.)

**Gaps:**
- No OS-level sandbox enforcement (application-layer only)
- File write → later shell execution not correlated
- Agent can potentially write to paths that auto-execute (`.git/hooks/`, etc.)

**Planned mitigations:**
- Sandboxed execution with Docker/seccomp/AppArmor (Phase 2.1)
- Filesystem jail restricting writable paths (Phase 2.1)
- Network fence isolating agent execution (Phase 2.1)

---

## POLA (Principle of Least Authority) Audit

### Current Default: Allow

The policy evaluator (`src/policy/evaluator.ts`) currently defaults to **allow** when no matching rule exists. This violates the Reference Monitor principle (complete mediation requires explicit authorization).

### Recommendation: Configurable Default Effect

Add `defaultEffect: 'deny' | 'allow'` to policy configuration:

```yaml
# agentguard.yaml
version: "1.0"
defaultEffect: deny  # Deny actions with no matching rule

action_rules:
  - pattern: "file.read"
    effect: allow
    scope: ["src/**", "tests/**"]
  # All other actions denied by default
```

**Key files affected:**
- `src/policy/evaluator.ts` — check `defaultEffect` when no rule matches
- `src/policy/loader.ts` — validate `defaultEffect` in policy schema

**Migration path:** Default remains `allow` for backward compatibility. New installations and security-focused templates use `deny`.

---

## Security Benchmark Suite

### Purpose

Automated tests that validate each threat vector is mitigated by the invariant system, AAB normalization, and policy evaluation.

### Test Categories

| Category | Coverage Target | Location |
|----------|----------------|----------|
| Normalization evasion | AAB correctly classifies obfuscated commands | `tests/ts/security/normalization.test.ts` |
| Secret detection | All known patterns detected in test corpus | `tests/ts/security/secrets.test.ts` |
| Policy bypass | No action bypasses policy when `defaultEffect: deny` | `tests/ts/security/policy-bypass.test.ts` |
| Escalation abuse | Escalation cannot be reset without authorization | `tests/ts/security/escalation.test.ts` |
| Blast radius accuracy | Computation matches expected weights | `tests/ts/security/blast-radius.test.ts` |
| Invariant completeness | Each threat vector has at least one invariant | `tests/ts/security/invariant-coverage.test.ts` |

### Benchmark Methodology

1. Define test corpus of known attack patterns per threat vector
2. Run each pattern through the governance kernel
3. Assert: all attacks are detected and denied
4. Report: coverage percentage per threat vector
5. Regression: benchmark runs in CI on every PR

---

## Risk Matrix

| Threat | Likelihood | Impact | Current Risk | Post-Mitigation Risk |
|--------|-----------|--------|-------------|---------------------|
| T1: Privilege escalation | Medium | High | **High** | Low (Phase 2.2) |
| T2: Data exfiltration | High | Critical | **High** | Low (Phase 1.3) |
| T3: Supply chain | Medium | High | **Medium** | Low (Phase 2.6) |
| T4: Prompt injection | High | High | **Medium** | Low (Phase 2.3) |
| T5: Sandbox escape | Low | Critical | **Medium** | Low (Phase 2.1) |

---

## References

- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [NIST AI Risk Management Framework](https://www.nist.gov/artificial-intelligence/ai-risk-management-framework)
- [Unified Architecture](unified-architecture.md)
