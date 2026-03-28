<p align="center">
  <img src="site/assets/logo-wordmark.svg" alt="AgentGuard" width="320">
</p>

<p align="center"><strong>Run AI agents without fear.</strong><br>
Install in 30 seconds. Your agents can't break what matters.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@red-codes/agentguard"><img src="https://img.shields.io/npm/v/@red-codes/agentguard.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License: Apache 2.0"></a>
  <img src="https://github.com/AgentGuardHQ/agentguard/actions/workflows/size-check.yml/badge.svg" alt="CI">
  <a href="https://agentguardhq.github.io/agentguard/"><img src="https://img.shields.io/badge/Website-AgentGuardHQ.github.io-22C55E?style=flat&logo=github" alt="Website"></a>
</p>

---

AI coding agents (Claude Code, Codex CLI, GitHub Copilot CLI, Google Gemini CLI, OpenCode, DeepAgents, and more) run autonomously — writing files, executing commands, pushing code. AgentGuard prevents them from doing catastrophic things: no accidental pushes to main, no credential leaks, no runaway destructive loops. 24 built-in safety checks, zero config required.

**For individuals:** stop your AI from wrecking your machine or repo.
**For teams:** run fleets of agents safely at scale, with audit trails that pass compliance.

## Quick Start

```bash
npm install -g aguard
# or: npm install -g @red-codes/agentguard
cd your-project
agentguard claude-init
# Interactive wizard: choose enforcement mode and a policy pack
# → Creates agentguard.yaml, installs Claude Code hooks, and activates governance
```

Or use `npx` without a global install:

```bash
cd your-project
npx @red-codes/agentguard claude-init
```

The `claude-init` wizard walks you through setup interactively:

```
  Choose an enforcement mode:
    ❯ 1) Monitor  — log threats, don't block (recommended to start)
      2) Educate  — log + explain why the action was flagged
      3) Guide    — log + suggest a corrected command
      4) Enforce  — block dangerous actions immediately

  Enable a policy pack?
    ❯ 1) essentials — secrets, force push, protected branches, credentials
      2) strict — all 24 invariants enforced
      3) none — monitor only, configure later
```

Verify it's running:

```bash
agentguard status
# ✓ Claude Code hooks installed
# ✓ Policy file (agentguard.yaml)
# ✓ Runtime active
```

Test a deny rule without executing anything:

```bash
echo '{"tool":"Bash","command":"git push origin main"}' | agentguard guard --dry-run
# ✗ git.push main → DENIED (protect-main)
```

Non-interactive setup (CI or scripted installs):

```bash
agentguard claude-init --mode guide --pack essentials
```

## Cloud Dashboard

Connect to the AgentGuard Cloud for team governance, real-time telemetry, and multi-tenant management:

```bash
agentguard cloud login
# Opens browser → authenticate with GitHub or Google → CLI auto-configures
```

| Link | Description |
|------|-------------|
| [agentguard-cloud-dashboard.vercel.app](https://agentguard-cloud-dashboard.vercel.app) | Team dashboard — runs, violations, analytics |
| [agentguard-cloud-office-sim.vercel.app](https://agentguard-cloud-office-sim.vercel.app) | Live Office — 2D visualization of agent activity |

## Agent Identity

Every governed session has an identity. Set it via the CLI flag or let the interactive prompt ask:

```bash
agentguard guard --agent-name my-agent
# Or omit --agent-name and an interactive prompt will ask for role + driver
```

Identity consists of a **role** (`developer`, `reviewer`, `ops`, `security`, `ci`) and a **driver** (`human`, `claude-code`, `copilot`, `opencode`, `ci`). Identity flows to cloud telemetry for attribution, dashboard grouping, and persona-scoped policy rules.

## What It Does

| Capability | Details |
|------------|---------|
| **Policy enforcement** | YAML rules with deny / allow / escalate — drop `agentguard.yaml` in your repo |
| **24 built-in invariants** | Secret exposure, protected branches, blast radius, path traversal, CI/CD config, package script injection, and more |
| **47 event kinds** | Full lifecycle telemetry: `ActionRequested → ActionAllowed/Denied → ActionExecuted` |
| **Real-time cloud dashboard** | Telemetry streams to your team dashboard; opt-in, anonymous by default |
| **Multi-tenant** | Team workspaces, GitHub/Google OAuth, SSO-ready |
| **Live Office visualization** | 2D view of agents working in real time — share a link with your team |
| **Agent SDK** | Programmatic governance for custom integrations and RunManifest-driven workflows |
| **Agent identity** | Declare agent role + driver for governance telemetry — automatic prompt or CLI flag |
| **Pre-push hooks** | Branch protection enforcement via git pre-push hooks, configured from agentguard.yaml |
| **Works with** | Claude Code, Codex CLI, GitHub Copilot CLI, Google Gemini CLI, OpenCode, DeepAgents (LangChain), any MCP client |

## Policy Format (YAML)

Drop `agentguard.yaml` in your repo root. It's picked up automatically.

### Minimal policy

```yaml
mode: guide        # monitor | educate | guide | enforce
pack: essentials   # curated invariant profile

rules:
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: Protected branch — use a PR
```

### Enforcement Modes

Four enforcement modes control how AgentGuard responds to policy violations:

| Mode | Blocks? | Suggests? | Behavior |
|------|---------|-----------|----------|
| `monitor` | No | No | Log only — observe violations without interfering |
| `educate` | No | Yes | Allow + attach a `suggestion` explaining the violation via `additionalContext` |
| `guide` | Yes | Yes | Block + attach a `suggestion` with a `correctedCommand` the agent can retry |
| `enforce` | Yes | No | Deny the action outright |

Set the mode globally and override per-invariant:

```yaml
mode: guide                  # global default

invariants:
  no-secret-exposure: enforce   # always block secrets (hardcoded)
  blast-radius-limit: educate   # explain but don't suggest a fix
  no-force-push: guide          # suggest the safe alternative
```

In `educate` and `guide` modes, denied decisions include a `suggestion` field:

```json
{
  "effect": "deny",
  "mode": "guide",
  "suggestion": {
    "message": "Force push is not allowed on protected branches",
    "correctedCommand": "git push origin main"
  }
}
```

### Full schema reference

```yaml
# Metadata
id: my-project
name: My Project Policy
description: Governance for the Acme repo
severity: 4                   # 1 (lowest) – 5 (highest)
version: "1.0.0"
agentguardVersion: ">=2.3.0"  # minimum AgentGuard version

# Enforcement mode
mode: enforce                 # monitor | educate | guide | enforce

# Policy pack (curated invariant profiles)
pack: essentials              # essentials | strict | or a named pack

# Compose with other policies (paths or built-in pack names)
extends:
  - soc2
  - hipaa
  - ./policies/team-overrides

# Per-invariant mode overrides
invariants:
  no-secret-exposure: enforce
  blast-radius-limit: monitor
  no-force-push: enforce

# Disable specific invariants entirely
disabledInvariants:
  - lockfile-integrity

# Default persona (conditions for the agent running this policy)
persona:
  model: claude-sonnet-4-6
  provider: anthropic
  trustTier: verified
  autonomy: supervised
  riskTolerance: low
  role: developer
  tags: [internal, ci]

# Rules
rules:
  # Basic deny rule
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: Protected branch — use a PR

  # Target glob pattern
  - action: file.write
    effect: deny
    target: "**/.env"
    reason: No secrets modification

  # Multiple action types in one rule
  - action:
      - file.write
      - file.delete
    effect: deny
    target: "*.key"
    reason: Cryptographic key files are protected

  # Blast radius limit
  - action: file.write
    effect: deny
    limit: 20
    reason: Too many files modified at once

  # Require tests before push
  - action: git.push
    effect: deny
    requireTests: true
    reason: Tests must pass before pushing

  # Persona-scoped rule
  - action: deploy.trigger
    effect: deny
    persona:
      trustTier: [untrusted, limited]
      autonomy: [autonomous]
    reason: Only trusted agents can deploy

  # Forecast-conditioned rule (predictive governance)
  - action: git.push
    effect: deny
    forecast:
      testRiskScore: 70
      blastRadiusScore: 80
      riskLevel: [high]
    reason: Predicted risk too high

  # Intervention type
  - action: infra.destroy
    effect: deny
    intervention: PAUSE
    reason: Infrastructure destruction requires human approval

  # Allow rule
  - action: file.read
    effect: allow
    reason: Read access is unrestricted
```

### Supported rule fields

| Field | Type | Description |
|-------|------|-------------|
| `action` | `string \| string[]` | Action type(s): `file.read`, `git.push`, `shell.exec`, `mcp.call`, etc. (41 types across 10 classes) |
| `effect` | `string` | `deny` or `allow` |
| `target` | `string` | Glob pattern for file paths or command patterns |
| `branches` | `string[]` | Git branch names this rule applies to |
| `reason` | `string` | Human-readable explanation |
| `limit` | `number` | Max file count (blast radius) |
| `requireTests` | `boolean` | Require passing tests |
| `requireFormat` | `boolean` | Require passing format check |
| `persona` | `object` | Agent persona conditions (`trustTier`, `role`, `autonomy`, `riskTolerance`, `tags`) |
| `forecast` | `object` | Predictive conditions (`testRiskScore`, `blastRadiusScore`, `predictedFileCount`, `dependencyCount`, `riskLevel`) |
| `intervention` | `string` | Intervention type: `deny`, `pause`, `rollback`, `modify` |
| `suggestion` | `string` | Suggested alternative command or action |
| `correctedCommand` | `string` | Auto-corrected command (e.g., safer equivalent) |
| `requireWorktree` | `boolean` | Require action to run inside a git worktree |

## Built-in Invariants

24 safety invariants run on every action evaluation:

| Invariant | Severity | What it blocks |
|-----------|----------|----------------|
| `no-secret-exposure` | Critical | `.env`, credentials, `.pem`, `.key` files |
| `no-credential-file-creation` | Critical | SSH keys, cloud configs, auth tokens |
| `no-cicd-config-modification` | Critical | `.github/workflows/`, `.gitlab-ci.yml`, Jenkinsfile |
| `no-governance-self-modification` | Critical | Agents modifying their own governance config |
| `no-scheduled-task-modification` | Critical | Cron jobs, scheduled task files |
| `protected-branch` | High | Direct push to main/master |
| `no-force-push` | High | `git push --force` |
| `no-network-egress` | High | HTTP requests outside your allowlist |
| `no-permission-escalation` | High | `chmod` world-writable, setuid/setgid |
| `no-skill-modification` | High | `.claude/skills/` files |
| `no-package-script-injection` | High | `package.json` lifecycle script changes |
| `transitive-effect-analysis` | High | Downstream policy violations from a file write |
| `no-ide-socket-access` | High | VS Code IPC socket files |
| `commit-scope-guard` | High | Staged files not written by the current session |
| `script-execution-tracking` | High | Shell commands executing session-written scripts (write-then-execute bypass) |
| `blast-radius-limit` | Medium | Caps file modification count per action (default: 20) |
| `no-container-config-modification` | Medium | Dockerfile, docker-compose.yml |
| `no-env-var-modification` | Medium | Shell profile and env var files |
| `no-destructive-migration` | Medium | Migration files with DROP/TRUNCATE DDL |
| `large-file-write` | Medium | Per-file size limit (prevents data dumps) |
| `test-before-push` | Medium | Requires tests to pass before push |
| `recursive-operation-guard` | Low | `find -exec`, `xargs` with write/delete |
| `lockfile-integrity` | Low | `package.json` changes without lockfile sync |
| `no-verify-bypass` | High | `git push/commit --no-verify` — prevents skipping pre-push/pre-commit hooks |

## Architecture

```
Agent tool call
      │
      ▼
AgentGuard Kernel
  1. Normalize   — map tool call to canonical action type
  2. Evaluate    — match policy rules (deny / allow / escalate)
  3. Check       — run 24 built-in invariants
  4. Execute     — run action via adapter (file, shell, git)
  5. Emit        — 47 event kinds → SQLite audit trail + cloud telemetry
```

**Storage:** SQLite audit trail at `.agentguard/`. Every decision is recorded and verifiable.

**Kernel overhead:** < 3ms end-to-end with the Go kernel (policy evaluation < 100µs, full invariant suite < 300µs).

### Go Kernel — Performance

AgentGuard ships a high-performance Go kernel that runs as a single 3.2MB static binary. It evaluates every agent tool call with near-zero overhead:

| Metric | Go Kernel | Node.js Kernel | Improvement |
|--------|-----------|----------------|-------------|
| **Startup** | 2ms | 67ms | 33x faster |
| **Hook evaluation** | <3ms | 290ms | ~100x faster |
| **Memory** | 2.7 MB | 80 MB | 30x less |
| **Binary size** | 3.2 MB | 281 MB (node_modules) | 88x smaller |
| **Dependencies** | 1 | ~400 npm packages | 400x fewer |

**Normalization benchmarks** (AMD EPYC, Go 1.18+):

| Action Type | Latency | Allocations |
|-------------|---------|-------------|
| File read/write | 105 ns | 1 |
| Git push | 70 µs | 6 |
| Destructive command | 82 µs | 3 |
| GitHub CLI | 89 µs | 2 |
| Compound command (AST) | 130 µs | 6 |

**Per-session impact** — at 100 tool calls per agent session, governance adds **0.3 seconds** total overhead with the Go kernel vs **29 seconds** with Node.js:

| Scenario | Node.js Kernel | Go Kernel | Time Saved |
|----------|---------------|-----------|------------|
| Single agent session (100 calls) | 29s overhead | 0.3s | **28.7s** |
| 30-min coder session (~400 calls) | 116s (2 min) | 1.2s | **~2 min back for coding** |
| Daily fleet (100 agents × 2 runs) | 96 min/day | 1 min/day | **95 min/day** |
| Monthly fleet | 48 hours/month | 30 min/month | **~47.5 hours/month** |

For teams running agent fleets, governance becomes invisible. Agents get 8% more productive time in every session — no startup tax, no dependency overhead, no bootstrap delays.

**Zero-dependency deployment** — the Go kernel is a single static binary. No `node_modules`, no `pnpm install`, no bootstrap deadlocks. Drop it in a worktree and it works. This is critical for CI/CD and fleet scenarios where agents spin up fresh environments.

The Go kernel includes: action normalization with AST-based shell parsing, policy evaluation, 24 invariants, escalation state machine, blast radius engine, telemetry shipper (stdout/file/HTTP), and a control plane signals API. It ships automatically via `npm install` — a postinstall script downloads the prebuilt binary for your platform.

## For Teams and Enterprise

| Feature | Details |
|---------|---------|
| **Compliance packs** | `extends: soc2`, `extends: hipaa` — pre-built policy packs mapping to SOC 2 CC6/CC7 and HIPAA 164.312 controls |
| **Audit trail** | Tamper-resistant SQLite event chain; export to JSONL for SIEM ingestion |
| **Evidence PRs** | `agentguard evidence-pr` — attach governance evidence summary to any PR |
| **CI gates** | `agentguard ci-check <session>` — fail CI if a governance session contains violations |
| **Branch protection** | Policy-enforced push controls on top of GitHub branch rules |
| **SSO** | GitHub and Google OAuth via cloud dashboard |
| **Multi-tenant** | Isolated workspaces per team or project |

## CLI Reference

```bash
# Setup (interactive wizard)
agentguard claude-init                    # Interactive wizard: mode + pack → creates policy + hooks
agentguard claude-init --global           # Install hooks globally (~/.claude/settings.json)
agentguard claude-init --mode guide --pack essentials  # Non-interactive setup
agentguard copilot-init                   # Set up GitHub Copilot CLI hook integration
agentguard deepagents-init                # Set up DeepAgents (.deepagents/agentguard_middleware.py) middleware
agentguard init --template strict         # Scaffold policy from a template
agentguard status                         # Show governance status

# Runtime
agentguard guard                          # Start governed action runtime
agentguard guard --policy <file>          # Use a specific policy file
agentguard guard --dry-run                # Evaluate without executing
agentguard guard --agent-name <name>      # Set agent identity for session

# Inspect
agentguard inspect --last                 # Show last run action graph
agentguard events --last                  # Raw event stream (pipe to jq)
agentguard traces [runId]                 # Policy evaluation traces
agentguard replay --last                  # Replay session timeline

# Cloud
agentguard cloud login                    # Device code auth — opens browser
agentguard cloud status                   # Check cloud connection
agentguard cloud events                   # Query events from cloud
agentguard cloud runs                     # List governance runs
agentguard cloud summary                  # Analytics summary

# CI / Compliance
agentguard ci-check <session>             # Verify session for violations (CI gate)
agentguard evidence-pr                    # Attach evidence summary to PR
agentguard audit-verify                   # Verify tamper-resistant audit chain
agentguard analytics                      # Violation pattern analysis

# Policy
agentguard policy validate <file>         # Validate a policy file
agentguard policy verify <file>           # Verify policy structure and rules
agentguard init --template <name>         # Scaffold from template (strict/permissive/ci-only/development)
```

## Agent SDK

Use AgentGuard programmatically in your own tooling:

```bash
npm install @red-codes/core @red-codes/events
```

```typescript
import { createKernel } from '@red-codes/kernel';

const kernel = createKernel({ policy: './agentguard.yaml' });
const decision = await kernel.propose({
  tool: 'Bash',
  command: 'git push origin main',
});
// decision.effect === 'deny'
```

## Policy Packs

Use `pack` for quick setup or `extends` for composition:

```yaml
# Quick: single pack with the pack shorthand
pack: essentials

# Advanced: compose multiple policies
extends:
  - soc2
  - hipaa
  - ./policies/team-overrides
```

| Pack | Description |
|------|-------------|
| `essentials` | Core safety: secrets, force push, protected branches, credentials, blast radius (default for new installs) |
| `soc2` | SOC 2 Type II access controls and change management (CC6.1, CC6.6, CC7.1-7.2) |
| `hipaa` | HIPAA technical safeguards for PHI protection (164.312(a)-(e)) |
| `engineering-standards` | Balanced dev-friendly guardrails: test-before-push, format checks, safe deps |
| `ci-safe` | Strict CI/CD pipeline protection |
| `enterprise` | Full enterprise governance |
| `strict` | Maximum restriction — all 24 invariants enforced |
| `open-source` | OSS contribution-friendly defaults |

## Community & Updates

Stay in the loop and connect with other AgentGuard users:

- **[Sign up for early access](https://agentguard-cloud-dashboard.vercel.app/signup)** — cloud dashboard, team governance, real-time telemetry
- **[GitHub Discussions](https://github.com/AgentGuardHQ/agentguard/discussions)** — ask questions, share setups, give feedback
- **[Issues](https://github.com/AgentGuardHQ/agentguard/issues)** — bug reports and feature requests

From the CLI:

```bash
agentguard cloud signup    # Open cloud early access signup
agentguard cloud login     # Connect after you have an API key
```

## Links

| Resource | URL |
|----------|-----|
| Dashboard | [agentguard-cloud-dashboard.vercel.app](https://agentguard-cloud-dashboard.vercel.app) |
| Live Office | [agentguard-cloud-office-sim.vercel.app](https://agentguard-cloud-office-sim.vercel.app) |
| Website | [agentguardhq.github.io/agentguard](https://agentguardhq.github.io/agentguard/) |
| Docs | [docs/](docs/) |
| Architecture | [docs/unified-architecture.md](docs/unified-architecture.md) |
| Hook design | [docs/hook-architecture.md](docs/hook-architecture.md) |
| Event model | [docs/event-model.md](docs/event-model.md) |
| Roadmap | [ROADMAP.md](ROADMAP.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Issues | [github.com/AgentGuardHQ/agentguard/issues](https://github.com/AgentGuardHQ/agentguard/issues) |

## License

[Apache 2.0](LICENSE)
