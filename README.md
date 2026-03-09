# AgentGuard

**Governed action runtime for AI coding agents.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![npm](https://img.shields.io/badge/npm-agentguard-cb3837.svg)](https://www.npmjs.com/package/agentguard)

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
npm run demo:guard
```

Expected output:

```
  AgentGuard Runtime Active
  policy: Demo Safety Policy | invariants: 6 active

  ✓ file.read src/auth/service.ts (dry-run)
  ✓ file.write src/auth/service.ts (dry-run)
  ✓ shell.exec npm test (dry-run)
  ✗ git.push main → DENIED (demo-policy)
    Protected branch — use a PR
  ✗ file.write .env → DENIED (demo-policy)
    Secrets files must not be modified

  3 allowed, 2 denied, 15 events emitted
```

**Try it on your own repo:**

```bash
# Pipe an action into the kernel
echo '{"tool":"Bash","command":"git push origin main"}' | npx agentguard guard --dry-run

# Start the runtime with a policy file
npx agentguard guard --policy agentguard.yaml

# Inspect the last run
npx agentguard inspect --last
```

## Why AgentGuard Exists

AI coding agents execute file writes, shell commands, and git operations autonomously — but there's no governance layer between what an agent proposes and what actually runs. One bad tool call can push to main, leak secrets, or delete production files.

AgentGuard adds a **deterministic decision point** between proposal and execution:

- **Safety policies** — declare what agents can and cannot do in YAML
- **Invariant enforcement** — 6 built-in checks (secrets, protected branches, blast radius) run on every action
- **Audit trail** — every decision is recorded as structured JSONL, inspectable after the fact
- **Session debugging** — replay any agent session to see exactly what happened and why

## How It Works

AgentGuard evaluates every agent action through a **governed action kernel**:

1. **Normalize** — Claude Code tool calls (Bash, Write, Edit, Read) are mapped to canonical action types (shell.exec, file.write, file.read)
2. **Evaluate** — policies match against the action (deny git.push to main, deny destructive commands, enforce scope limits)
3. **Check invariants** — 6 built-in safety checks run on every action
4. **Execute** — if allowed, the action runs via adapters (file, shell, git handlers)
5. **Emit events** — full lifecycle events sunk to JSONL for audit trail

### Example Output

```
  AgentGuard Runtime Active
  policy: agentguard.yaml | invariants: 6 active

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

6 safety invariants run on every action evaluation:

| Invariant | Severity | Description |
|-----------|----------|-------------|
| **no-secret-exposure** | 5 (critical) | Blocks access to .env, credentials, .pem, .key files |
| **protected-branch** | 4 (high) | Prevents direct push to main/master |
| **no-force-push** | 4 (high) | Forbids force push |
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
agentguard guard --dry-run                # Evaluate without executing actions
agentguard inspect [runId]                # Show action graph for a run
agentguard inspect --last                 # Inspect most recent run
agentguard events [runId]                 # Show raw event stream for a run

# === Monitoring ===
agentguard watch -- <command>             # Monitor a command for errors
agentguard scan [path]                    # Scan files for bugs (eslint/tsc)
agentguard replay --last                  # Replay a session timeline

# === Tools ===
agentguard init                           # Install git hooks
agentguard claude-init                    # Set up Claude Code integration
agentguard help                           # Show all commands
```

Install globally: `npm i -g agentguard`

## Claude Code Integration

AgentGuard hooks into [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions via PreToolUse/PostToolUse hooks. Every tool call is normalized into a canonical action and evaluated by the kernel.

```bash
npx agentguard claude-init    # Set up Claude Code hooks
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
├── agentguard/             # Governance runtime (active focus)
│   ├── kernel.ts           # Governed action kernel
│   ├── monitor.ts          # Escalation tracking
│   ├── core/               # AAB + RTA engine
│   ├── policies/           # Policy evaluator + JSON/YAML loaders
│   ├── invariants/         # Invariant checker + 6 defaults
│   ├── evidence/           # Evidence pack generation
│   ├── adapters/           # Execution adapters (file, shell, git, claude-code)
│   ├── renderers/          # TUI renderer
│   └── sinks/              # JSONL event persistence
├── domain/                 # Pure domain logic (no DOM, no Node.js APIs)
│   ├── actions.ts          # 23 canonical action types
│   ├── events.ts           # Structured lifecycle events
│   ├── reference-monitor.ts
│   └── execution/          # Adapter registry
├── core/                   # Shared infrastructure (EventBus, types)
├── cli/                    # CLI entry point + commands
└── game/                   # BugMon browser game (deprioritized)
```

## Run Locally

```bash
git clone https://github.com/jpleva91/agent-guard.git
cd agent-guard
npm install
npm run build:ts        # Compile TypeScript → dist/
npm run ts:test         # Run 345 TypeScript tests
npm test                # Run 1085 JavaScript tests
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
