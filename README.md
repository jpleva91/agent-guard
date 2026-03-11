# AgentGuard

**Governed action runtime for AI coding agents.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![npm](https://img.shields.io/npm/v/@red-codes/agentguard.svg)](https://www.npmjs.com/package/@red-codes/agentguard)

---

AgentGuard intercepts AI agent tool calls, enforces policies and invariants, and produces a verifiable execution trail. Traditional AI safety focuses on model behavior — AgentGuard enforces safety at the execution layer through deterministic governance of every action.

```
agent proposes action  →  policy evaluated  →  invariants checked  →  allow/deny  →  execute  →  events emitted
```

## Quick Start

**30 seconds to see it work:**

```bash
git clone https://github.com/jpleva91/agent-guard.git
cd agent-guard
npm install && npm run build:ts

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
- **Invariant enforcement** — 8 built-in checks (secrets, protected branches, blast radius, skill/task protection) run on every action
- **Audit trail** — every decision is recorded as structured JSONL, inspectable after the fact
- **Session debugging** — replay any agent session to see exactly what happened and why

## How It Works

AgentGuard evaluates every agent action through a **governed action kernel**:

1. **Normalize** — Claude Code tool calls (Bash, Write, Edit, Read) are mapped to canonical action types (shell.exec, file.write, file.read)
2. **Evaluate** — policies match against the action (deny git.push to main, deny destructive commands, enforce scope limits)
3. **Check invariants** — 8 built-in safety checks run on every action
4. **Execute** — if allowed, the action runs via adapters (file, shell, git handlers)
5. **Emit events** — full lifecycle events sunk to JSONL for audit trail

### Example Output

```
  AgentGuard Runtime Active
  policy: agentguard.yaml | invariants: 8 active

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

8 safety invariants run on every action evaluation:

| Invariant | Severity | Description |
|-----------|----------|-------------|
| **no-secret-exposure** | 5 (critical) | Blocks access to .env, credentials, .pem, .key files |
| **protected-branch** | 4 (high) | Prevents direct push to main/master |
| **no-force-push** | 4 (high) | Forbids force push |
| **no-skill-modification** | 4 (high) | Prevents modification of .claude/skills/ files |
| **no-scheduled-task-modification** | 4 (high) | Prevents modification of scheduled task files |
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

# === Integration ===
agentguard claude-init                    # Set up Claude Code hook integration
agentguard init <type>                    # Scaffold governance extensions
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

```
src/
├── kernel/                 # Governed action kernel
│   ├── kernel.ts           # Orchestrator (propose → evaluate → execute → emit)
│   ├── aab.ts              # Action Authorization Boundary (normalization)
│   ├── blast-radius.ts     # Weighted blast radius computation engine
│   ├── decision.ts         # Runtime assurance engine
│   ├── monitor.ts          # Escalation state machine
│   ├── evidence.ts         # Evidence pack generation
│   ├── replay-comparator.ts # Replay outcome comparison
│   ├── replay-engine.ts    # Deterministic replay engine
│   ├── replay-processor.ts # Replay event processor
│   ├── heartbeat.ts        # Agent heartbeat monitor
│   ├── decisions/          # Typed decision records
│   └── simulation/         # Pre-execution impact simulation
├── events/                 # Canonical event model
│   ├── schema.ts           # Event kinds, factory, validation
│   ├── bus.ts              # Generic typed EventBus
│   ├── store.ts            # In-memory event store
│   ├── jsonl.ts            # JSONL event persistence (audit trail)
│   └── decision-jsonl.ts   # Decision record persistence
├── policy/                 # Policy system
│   ├── composer.ts         # Policy composition (multi-file merging)
│   ├── evaluator.ts        # Rule matching engine
│   ├── loader.ts           # Policy validation + loading
│   ├── pack-loader.ts      # Policy pack loader (community policy sets)
│   └── yaml-loader.ts      # YAML policy parser
├── invariants/             # Invariant system
│   ├── definitions.ts      # 8 built-in invariants
│   └── checker.ts          # Invariant evaluation engine
├── analytics/              # Cross-session violation analytics
│   ├── aggregator.ts       # Violation aggregation across sessions
│   ├── cluster.ts          # Violation clustering by dimension
│   ├── engine.ts           # Analytics engine orchestrator
│   ├── reporter.ts         # Output formatters (terminal, JSON, markdown)
│   ├── risk-scorer.ts      # Per-run risk scoring engine
│   ├── trends.ts           # Violation trend computation
│   └── types.ts            # Analytics type definitions
├── adapters/               # Execution adapters
│   ├── file.ts, shell.ts, git.ts  # Action handlers
│   ├── claude-code.ts      # Claude Code hook adapter
│   └── registry.ts         # Adapter registry
├── plugins/                # Plugin ecosystem
│   ├── discovery.ts        # Plugin discovery mechanism
│   ├── registry.ts         # Plugin registry
│   ├── sandbox.ts          # Plugin sandboxing
│   ├── validator.ts        # Plugin validation
│   ├── types.ts            # Plugin type definitions
│   └── index.ts            # Module re-exports
├── renderers/              # Renderer plugin system
│   ├── registry.ts         # Renderer registry
│   ├── tui-renderer.ts     # TUI renderer implementation
│   ├── types.ts            # Renderer type definitions
│   └── index.ts            # Module re-exports
├── cli/                    # CLI entry point + commands
│   ├── bin.ts              # Main entry
│   └── commands/           # analytics, guard, inspect, replay, export, import, simulate, ci-check, plugin, policy, claude-hook, claude-init, init
├── storage/                # SQLite storage backend (opt-in alternative to JSONL)
├── telemetry/              # Runtime telemetry and logging
└── core/                   # Shared utilities (types, actions, hash, rng, execution-log)

vscode-extension/              # VS Code extension
├── src/
│   ├── extension.ts           # Sidebar panels, file watcher, notifications
│   ├── providers/             # Tree data providers (run status, run history, recent events)
│   └── services/              # Event reader, notification formatter + service, diagnostics, violation mapper
└── package.json               # Extension manifest

policies/                      # Policy packs (YAML: ci-safe, enterprise, open-source, strict)
```

## Run Locally

```bash
git clone https://github.com/jpleva91/agent-guard.git
cd agent-guard
npm install
npm run build:ts        # Compile TypeScript → dist/
npm run ts:test         # Run TypeScript tests (vitest)
npm test                # Run JavaScript tests
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
