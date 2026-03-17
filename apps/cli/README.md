# @red-codes/agentguard

**Runtime governance for AI coding agents.** Intercepts tool calls, enforces policies and invariants, and produces a verifiable execution trail.

[![npm](https://img.shields.io/npm/v/@red-codes/agentguard.svg)](https://www.npmjs.com/package/@red-codes/agentguard)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/AgentGuardHQ/agentguard/blob/main/LICENSE)

## Install

```bash
# Install AgentGuard
npm install -g @red-codes/agentguard

# (Optional) Install RTK for 60-90% token savings on CLI output
# Homebrew: brew install rtk
# macOS/Linux: curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
# Windows: download from https://github.com/rtk-ai/rtk/releases

# Set up Claude Code hooks
agentguard claude-init
```

## What It Does

AgentGuard adds a deterministic decision layer between what an AI agent proposes and what actually runs. Every tool call passes through a governed action kernel:

```
agent proposes action  →  policy evaluated  →  invariants checked  →  allow/deny  →  events emitted
```

- **20 built-in invariants** — secret exposure, protected branches, blast radius, CI/CD config modification, permission escalation, and more
- **YAML policy format** — declare what agents can and can't do
- **Full audit trail** — every decision recorded to SQLite
- **Claude Code integration** — hooks fire on every tool call, zero config

## Quick Start

```bash
# Set up Claude Code hooks (one-time)
agentguard claude-init

# Check governance status
agentguard status

# Validate a policy file
agentguard policy validate agentguard.yaml

# Evaluate an action against policy (dry-run)
echo '{"tool":"Bash","command":"git push origin main"}' | agentguard guard --dry-run

# Inspect the most recent governance session
agentguard inspect --last
```

## Claude Code Integration

AgentGuard integrates via inline hooks — no daemon, no ports, no IPC:

```bash
agentguard claude-init    # Installs PreToolUse + PostToolUse + SessionStart hooks
```

| Hook | Purpose |
|------|---------|
| **PreToolUse** | Evaluates every tool call against policies and invariants before execution |
| **PostToolUse** | Reports Bash stderr errors (informational) |
| **SessionStart** | Ensures build is ready, shows governance status |

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
agentguard guard [--policy <file>] [--dry-run]   # Start governed runtime
agentguard inspect [--last]                       # Inspect action graph
agentguard events [--last]                        # Raw event stream
agentguard analytics                              # Violation patterns
agentguard traces [--last]                        # Policy evaluation traces

# Policy
agentguard policy validate <file>                 # Validate policy
agentguard policy suggest                         # Auto-suggest rules from violations
agentguard policy verify <file>                   # Verify against historical violations

# Simulation
agentguard simulate <action-json>                 # Predict impact without executing
agentguard simulate --plan <file>                 # Batch simulate an action plan

# Session tools
agentguard replay --last [--step]                 # Replay governance session
agentguard session-viewer --last                  # Interactive HTML timeline
agentguard diff <runA> <runB>                     # Compare two sessions
agentguard export/import                          # Portable JSONL sessions

# CI/CD
agentguard ci-check [--last]                      # Verify governance in CI
agentguard evidence-pr [--pr <num>]               # Attach evidence to PR
agentguard audit-verify [--last]                  # Verify audit chain integrity

# Integration
agentguard claude-init                            # Set up Claude Code hooks
agentguard auto-setup                             # Auto-detect and configure
agentguard status                                 # Check governance readiness
agentguard demo                                   # Interactive showcase

# Configuration
agentguard config show|get|set                    # Manage config
agentguard init --extension <type>                # Scaffold extensions
agentguard migrate                                # Import JSONL into SQLite
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
agentguard status                    # Confirms: ⚡ Token optimization active
```

Works with git, npm, cargo, tsc, docker, kubectl, and more. No configuration needed — AgentGuard detects RTK automatically.

## Agent Swarm

AgentGuard ships with a 26-agent autonomous development swarm:

```bash
agentguard init swarm    # Scaffolds agents, skills, and governance into your repo
```

Agents handle implementation, code review, CI triage, security audits, planning, docs, and more — all under governance.

## Links

- [GitHub](https://github.com/AgentGuardHQ/agentguard)
- [Documentation](https://agentguardhq.github.io/agentguard/)
- [Architecture](https://github.com/AgentGuardHQ/agentguard/blob/main/docs/unified-architecture.md)
- [Roadmap](https://github.com/AgentGuardHQ/agentguard/blob/main/ROADMAP.md)

## License

[Apache 2.0](https://github.com/AgentGuardHQ/agentguard/blob/main/LICENSE)
