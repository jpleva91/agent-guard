<p align="center">
  <img src="site/assets/logo-wordmark.svg" alt="AgentGuard" width="320">
</p>

<p align="center"><strong>Governed action runtime for AI coding agents.</strong></p>

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![npm](https://img.shields.io/npm/v/@red-codes/agentguard.svg)](https://www.npmjs.com/package/@red-codes/agentguard)
[![Website](https://img.shields.io/badge/Website-AgentGuardHQ.github.io/agent--guard-22C55E?style=flat&logo=github)](https://agentguardhq.github.io/agent-guard/)

---

AgentGuard intercepts AI agent tool calls, enforces policies and invariants, and produces a verifiable execution trail. Traditional AI safety focuses on model behavior — AgentGuard enforces safety at the execution layer through deterministic governance of every action.

```
agent proposes action  →  policy evaluated  →  invariants checked  →  allow/deny  →  execute  →  events emitted
```

## Quick Start

**30 seconds to see it work:**

```bash
git clone https://github.com/AgentGuardHQ/agent-guard.git
cd agent-guard
pnpm install && pnpm build

# Evaluate a sample action against the default policy
echo '{"tool":"Bash","command":"git push origin main"}' | npx agentguard guard --dry-run
```

**Try it on your own repo:**

```bash
# Pipe an action into the kernel
echo '{"tool":"Bash","command":"git push origin main"}' | npx @red-codes/agentguard guard --dry-run

# Start the runtime with a policy file
npx @red-codes/agentguard guard --policy agentguard.yaml

# Inspect the last run
npx @red-codes/agentguard inspect --last
```

## Why AgentGuard Exists

AI coding agents execute file writes, shell commands, and git operations autonomously — but there's no governance layer between what an agent proposes and what actually runs. One bad tool call can push to main, leak secrets, or delete production files.

AgentGuard adds a **deterministic decision point** between proposal and execution:

- **Safety policies** — declare what agents can and cannot do in YAML
- **Invariant enforcement** — 10 built-in checks (secrets, protected branches, blast radius, skill/task protection, package script injection, lockfile integrity) run on every action
- **Audit trail** — every decision is recorded as structured JSONL, inspectable after the fact
- **Session debugging** — replay any agent session to see exactly what happened and why

## How It Works

AgentGuard evaluates every agent action through a **governed action kernel**:

1. **Normalize** — Claude Code tool calls (Bash, Write, Edit, Read) are mapped to canonical action types (shell.exec, file.write, file.read)
2. **Evaluate** — policies match against the action (deny git.push to main, deny destructive commands, enforce scope limits)
3. **Check invariants** — 10 built-in safety checks run on every action
4. **Execute** — if allowed, the action runs via adapters (file, shell, git handlers)
5. **Emit events** — full lifecycle events sunk to JSONL for audit trail

### Example Output

```
  AgentGuard Runtime Active
  policy: agentguard.yaml | invariants: 10 active

  ✓ file.write src/auth/service.ts
  ✓ shell.exec npm test
  ✗ git.push main → DENIED (protect-main)
  ⚠ invariant violated: protected-branch
```

## Policy Format

Policies are YAML or JSON files that declare what agents can and cannot do:

```yaml
id: project-policy
name: Project Policy
severity: 4
rules:
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: Protected branch

  - action: git.force-push
    effect: deny
    reason: Force push not allowed

  - action: file.write
    effect: deny
    target: .env
    reason: No secrets modification

  - action: file.read
    effect: allow
    reason: Reading is always safe
```

Drop an `agentguard.yaml` in your repo root — the CLI picks it up automatically.

## Built-in Invariants

10 safety invariants run on every action evaluation:

| Invariant | Severity | Description |
|-----------|----------|-------------|
| **no-secret-exposure** | 5 (critical) | Blocks access to .env, credentials, .pem, .key files |
| **no-credential-file-creation** | 5 (critical) | Blocks creation or modification of well-known credential files (SSH keys, cloud configs, auth tokens) |
| **protected-branch** | 4 (high) | Prevents direct push to main/master |
| **no-force-push** | 4 (high) | Forbids force push |
| **no-skill-modification** | 4 (high) | Prevents modification of .claude/skills/ files |
| **no-scheduled-task-modification** | 4 (high) | Prevents modification of scheduled task files |
| **no-package-script-injection** | 4 (high) | Blocks package.json modifications that alter lifecycle script entries |
| **blast-radius-limit** | 3 (medium) | Enforces file modification limit (default 20) |
| **test-before-push** | 3 (medium) | Requires tests pass before push |
| **lockfile-integrity** | 2 (low) | Ensures package.json changes sync with lockfiles |

## Escalation

AgentGuard tracks repeated denials and invariant violations. If an agent repeatedly attempts blocked actions, the runtime escalates to lockdown — all actions denied until a human intervenes. See [escalation state machine](docs/unified-architecture.md) for the full detail.

## CLI

```bash
# === Governance ===
agentguard guard                          # Start governed action runtime
agentguard guard --policy <file>          # Use a specific policy file (YAML/JSON)
agentguard guard --policy a --policy b   # Compose multiple policies with precedence
agentguard guard --dry-run                # Evaluate without executing actions
agentguard inspect [runId]                # Show action graph and decisions for a run
agentguard inspect --last                 # Inspect most recent run
agentguard events [runId]                 # Show raw event stream for a run
agentguard analytics                      # Analyze violation patterns across sessions

# === Portability ===
agentguard export <runId>                 # Export a governance session to JSONL
agentguard export --last                  # Export the most recent run
agentguard import <file>                  # Import a governance session from JSONL

# === Replay ===
agentguard replay --last                  # Replay a governance session timeline
agentguard replay --last --step           # Step through events interactively

# === Plugins ===
agentguard plugin list                    # List installed plugins
agentguard plugin install <path>          # Install a plugin from a local path
agentguard plugin remove <id>            # Remove a plugin by ID
agentguard plugin search [query]          # Search for plugins on npm

# === Simulation ===
agentguard simulate <action-json>         # Simulate action and show predicted impact
agentguard simulate --action <type>       # Simulate by action type and flags

# === Policy ===
agentguard policy validate <file>        # Validate a policy file without starting the runtime

# === CI/CD ===
agentguard ci-check <session>             # Verify governance session for violations
agentguard ci-check --last                # Check most recent run locally

# === Comparison ===
agentguard diff <run1> <run2>             # Compare two governance sessions side-by-side
agentguard diff --last                   # Compare the two most recent runs

# === Evidence ===
agentguard evidence-pr                    # Attach governance evidence summary to a PR
agentguard evidence-pr --pr <number>     # Post evidence to a specific PR
agentguard evidence-pr --dry-run         # Preview evidence report

# === Traces ===
agentguard traces [runId]                 # Display policy evaluation traces for a run
agentguard traces --last                  # Show traces for the most recent run
agentguard traces --last --summary       # Summary statistics only
agentguard traces --last --json          # JSON output

# === Integration ===
agentguard claude-init                    # Set up Claude Code hook integration
agentguard init <type>                    # Scaffold governance extensions or storage backends
agentguard help                           # Show all commands
```

Install globally: `npm i -g @red-codes/agentguard`

## Claude Code Integration

AgentGuard hooks into [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions via PreToolUse/PostToolUse hooks. Every tool call is normalized into a canonical action and evaluated by the kernel.

```bash
npx @red-codes/agentguard claude-init    # Set up Claude Code hooks
```

Tool call mapping:

| Claude Code Tool | AgentGuard Action |
|-----------------|-------------------|
| Write | file.write |
| Edit | file.write |
| Read | file.read |
| Bash | shell.exec (or git.push, git.commit if git command detected) |
| Glob | file.read |
| Grep | file.read |

## Event Trail

Every action proposal, decision, and execution is recorded as JSONL:

```
.agentguard/events/<runId>.jsonl
```

Inspect with:

```bash
agentguard inspect --last     # Action summary + event stream
agentguard events --last      # Raw JSONL to stdout (pipe to jq, etc.)
```

## Architecture

```
Agent Tool Call  →  AgentGuard Kernel  →  Policy + Invariants  →  allow / deny
                                                                       │
                                              ┌────────────────────────┤
                                              ▼                        ▼
                                     Execution Adapter           Event Stream
                                    (file, shell, git)        (JSONL audit trail)
```

Full kernel loop detail: [docs/unified-architecture.md](docs/unified-architecture.md)

### Repository Structure

This is a **pnpm monorepo** orchestrated by **Turbo**. Workspace packages live in `packages/`, applications in `apps/`.

```
packages/
├── core/src/               # @red-codes/core — Shared types, actions, hash, rng, execution-log
├── events/src/             # @red-codes/events — Canonical event model (schema, bus, store, JSONL)
├── policy/src/             # @red-codes/policy — Policy evaluation, YAML/JSON loaders, composition
├── invariants/src/         # @red-codes/invariants — 10 built-in invariant definitions + checker
├── kernel/src/             # @red-codes/kernel — Governed action kernel (orchestrator, AAB, decisions, simulation)
├── adapters/src/           # @red-codes/adapters — Execution adapters (file, shell, git, claude-code)
├── analytics/src/          # @red-codes/analytics — Cross-session violation analytics
├── storage/src/            # @red-codes/storage — SQLite + Firestore backends (opt-in)
├── telemetry/src/          # @red-codes/telemetry — Runtime telemetry and logging
├── plugins/src/            # @red-codes/plugins — Plugin ecosystem (discovery, registry, sandboxing)
├── renderers/src/          # @red-codes/renderers — Renderer plugin system (TUI renderer)
├── runtime/src/            # @red-codes/runtime — Agent runtime (placeholder)
├── sentinel01/src/         # @red-codes/sentinel01 — Robotics/edge module (placeholder)
├── adapter-openclaw/src/   # @red-codes/adapter-openclaw — OpenClaw adapter (placeholder)
└── telemetry-client/src/   # @red-codes/telemetry-client — Telemetry client (placeholder)

apps/
├── cli/src/                # @red-codes/agentguard — CLI (published npm package)
│   ├── bin.ts              # CLI entry point
│   ├── evidence-summary.ts # Evidence summary generator for PR reports
│   └── commands/           # analytics, guard, inspect, replay, export, import, simulate, ci-check, etc.
├── vscode-extension/src/   # agentguard-vscode — VS Code extension
│   ├── extension.ts        # Sidebar panels, file watcher, notifications
│   ├── providers/          # Tree data providers (run status, run history, recent events)
│   └── services/           # Event reader, notification formatter, diagnostics, violation mapper
└── telemetry-server/src/   # Telemetry server (placeholder)

policies/                   # Policy packs (YAML: ci-safe, enterprise, open-source, strict)
```

## Run Locally

```bash
git clone https://github.com/AgentGuardHQ/agent-guard.git
cd agent-guard
pnpm install            # Install dependencies
pnpm build              # Build all packages (turbo build)
pnpm test               # Run all tests (turbo test)
```

## Documentation

| Document | Description |
|----------|-------------|
| [AgentGuard Spec](docs/agentguard.md) | Governance runtime specification |
| [Architecture](docs/unified-architecture.md) | Governed action kernel model |
| [Priorities](docs/current-priorities.md) | Current roadmap and next steps |
| [Product Positioning](docs/product-positioning.md) | What this is and isn't |
| [Event Model](docs/event-model.md) | Canonical event schema |
| [Plugin API](docs/plugin-api.md) | Event sources and extension points |
| [Contributing](CONTRIBUTING.md) | How to contribute |

## License

[Apache 2.0](LICENSE)
