# @red-codes/agentguard

**Run AI agents without fear.** Prevents catastrophic actions — no pushes to main, no credential leaks, no runaway loops. Full audit trail included.

[![npm](https://img.shields.io/npm/v/@red-codes/agentguard.svg)](https://www.npmjs.com/package/@red-codes/agentguard)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/AgentGuardHQ/agentguard/blob/main/LICENSE)

## Install

```bash
# Install AgentGuard
npm install -g aguard

# (Optional) Install RTK for 60-90% token savings on CLI output
# Homebrew: brew install rtk
# macOS/Linux: curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
# Windows: download from https://github.com/rtk-ai/rtk/releases

# Set up Claude Code hooks
aguard claude-init
```

> `aguard` is a convenience alias for `@red-codes/agentguard`. Both work identically.

## What It Does

AgentGuard sits between what an AI agent proposes and what actually runs. Every tool call is checked against 21 safety rules before it executes:

```
agent proposes action  →  safety checked  →  allow/deny  →  action recorded
```

- **21 built-in safety checks** — secret exposure, protected branches, blast radius, credential leaks, permission escalation, and more
- **YAML policy format** — declare what agents can and can't do
- **Full audit trail** — every decision recorded to SQLite
- **Claude Code integration** — hooks fire on every tool call, zero config

## Quick Start

```bash
# Set up Claude Code hooks (one-time)
aguard claude-init

# Check governance status
aguard status

# Validate a policy file
aguard policy validate agentguard.yaml

# Evaluate an action against policy (dry-run)
echo '{"tool":"Bash","command":"git push origin main"}' | aguard guard --dry-run

# Inspect the most recent governance session
aguard inspect --last
```

## Claude Code Integration

AgentGuard integrates via inline hooks — no daemon, no ports, no IPC:

```bash
aguard claude-init    # Installs PreToolUse + PostToolUse + SessionStart hooks
```

| Hook | Purpose |
|------|---------|
| **PreToolUse** | Evaluates every tool call against policies and invariants before execution. Enforces agent identity hard gate. |
| **PostToolUse** | Reports Bash stderr errors (informational) |
| **SessionStart** | Ensures build is ready, shows governance status |
| **Stop** | Blanks `.agentguard-identity` to prevent stale identity leaking |

### Agent Identity

Every governance session requires an agent identity. Resolution order:

1. `AGENTGUARD_AGENT_NAME` env var (per-process)
2. `.agentguard-identity` file (written by orchestrator or previous resolution)
3. Interactive prompt (guard command only)

If no identity is set, PreToolUse hooks **block all actions** with a message directing the agent to identify itself. The `.agentguard-identity` file is session-scoped and gitignored — it is blanked on session start/stop to prevent stale values.

For multi-agent setups, pass identity via env var per-process or `--agent-name` flag:

```bash
aguard guard --agent-name "builder-agent-3" --policy agentguard.yaml
```

Tool call mapping:

| Claude Code Tool | AgentGuard Action |
|-----------------|-------------------|
| Write / Edit | file.write |
| Read / Glob / Grep | file.read |
| Bash | shell.exec (or git.push, git.commit if git command detected) |

## Policy Format

```yaml
id: project-policy
name: Project Policy
severity: 4
rules:
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: Protected branch

  - action: file.write
    effect: deny
    target: .env
    reason: No secrets modification
```

Drop an `agentguard.yaml` in your repo root — the CLI picks it up automatically.

### Worktree Enforcement

Use the `requireWorktree` condition to force agents to use git worktrees instead of direct checkout:

```yaml
rules:
  - action: git.checkout
    effect: deny
    conditions:
      requireWorktree: true
    reason: "Use 'git worktree add <path> <branch>' instead of checkout"

  - action: git.worktree.add
    effect: allow

  - action: git.worktree.list
    effect: allow
```

When `requireWorktree: true` is set, the deny rule is bypassed if the agent is already operating inside a worktree. New action types: `git.worktree.add`, `git.worktree.remove`, `git.worktree.list`.

## Built-in Invariants

20 safety invariants run on every action:

| Invariant | Severity | What it does |
|-----------|----------|-------------|
| no-secret-exposure | Critical | Blocks .env, .pem, .key, credentials files |
| no-credential-file-creation | Critical | Blocks SSH keys, cloud configs, auth tokens |
| no-cicd-config-modification | Critical | Protects CI/CD pipeline configs |
| no-governance-self-modification | Critical | Prevents agents from modifying governance |
| protected-branch | High | Prevents push to main/master |
| no-force-push | High | Forbids force push |
| no-package-script-injection | High | Blocks lifecycle script tampering |
| no-permission-escalation | High | Catches chmod world-writable, setuid |
| no-network-egress | High | Denies HTTP to non-allowlisted domains |
| transitive-effect-analysis | High | Analyzes written files for downstream effects |
| blast-radius-limit | Medium | Enforces file modification limit |
| test-before-push | Medium | Requires tests pass before push |
| large-file-write | Medium | Per-file size limit |
| ...and 7 more | Low-Medium | Container config, env vars, migrations, lockfiles, recursive ops |

## CLI Commands

```bash
# Governance
aguard guard [--policy <file>] [--dry-run] [--agent-name <name>]  # Start governed runtime
aguard inspect [--last]                       # Inspect action graph
aguard events [--last]                        # Raw event stream
aguard analytics                              # Violation patterns
aguard traces [--last]                        # Policy evaluation traces

# Policy
aguard policy validate <file>                 # Validate policy
aguard policy suggest                         # Auto-suggest rules from violations
aguard policy verify <file>                   # Verify against historical violations

# Simulation
aguard simulate <action-json>                 # Predict impact without executing
aguard simulate --plan <file>                 # Batch simulate an action plan

# Session tools
aguard replay --last [--step]                 # Replay governance session
aguard session-viewer --last                  # Interactive HTML timeline
aguard diff <runA> <runB>                     # Compare two sessions
aguard export/import                          # Portable JSONL sessions

# CI/CD
aguard ci-check [--last]                      # Verify governance in CI
aguard evidence-pr [--pr <num>]               # Attach evidence to PR
aguard audit-verify [--last]                  # Verify audit chain integrity

# Integration
aguard claude-init                            # Set up Claude Code hooks
aguard auto-setup                             # Auto-detect and configure
aguard status                                 # Check governance readiness
aguard demo                                   # Interactive showcase

# Configuration
aguard config show|get|set                    # Manage config
aguard init --extension <type>                # Scaffold extensions
aguard migrate                                # Import JSONL into SQLite
```

## Library Packages

For building integrations, the core types and event model are available as separate packages:

```bash
npm install @red-codes/core      # Types, actions, utilities
npm install @red-codes/events    # Canonical event model
```

## RTK Token Optimization

AgentGuard integrates with [RTK](https://github.com/rtk-ai/rtk) to reduce token consumption by 60-90%. When RTK is installed, shell commands are automatically rewritten for compact output after governance approval.

```bash
npm install -g @anthropic-ai/rtk    # Install RTK (optional)
aguard status                    # Confirms: ⚡ Token optimization active
```

Works with git, npm, cargo, tsc, docker, kubectl, and more. No configuration needed — AgentGuard detects RTK automatically.

## Links

- [GitHub](https://github.com/AgentGuardHQ/agentguard)
- [Documentation](https://agentguardhq.github.io/agentguard/)
- [Architecture](https://github.com/AgentGuardHQ/agentguard/blob/main/docs/unified-architecture.md)
- [Roadmap](https://github.com/AgentGuardHQ/agentguard/blob/main/ROADMAP.md)

## License

[Apache 2.0](https://github.com/AgentGuardHQ/agentguard/blob/main/LICENSE)
