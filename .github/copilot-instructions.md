# AgentGuard (OSS) — Copilot Instructions

> These instructions apply to the **GitHub Copilot coding agent** operating in this repository.
> Copilot acts as the **execution team (Tier C)** — implementing well-specified issues and opening draft PRs.
> Strategic decisions (planning, architecture, merging) are handled by senior engineers and humans.

## How Copilot Is Assigned Work

This repository uses **GitHub-native Copilot issue assignment**:

1. An issue is labeled `agent:copilot`
2. Copilot analyzes the issue and opens a **draft pull request**
3. Automated checks run on the PR
4. A human reviewer approves and merges

> If a task is ambiguous or underspecified, label it `needs-spec` and stop. Do not thrash.

## Project Overview

**AgentGuard** is a **governed action runtime for AI coding agents**. It intercepts agent tool calls, enforces policies and invariants, executes authorized actions via adapters, and emits lifecycle events.

**Core principle**: The Action is the primary unit of computation. All activity flows through a canonical event model: propose → normalize → evaluate → execute → emit.

**Key characteristics:**
- 22 built-in invariants (secret exposure, protected branches, blast radius, test-before-push, etc.)
- YAML/JSON policy format with pattern matching, scopes, and branch conditions
- Escalation tracking: NORMAL → ELEVATED → HIGH → LOCKDOWN
- SQLite event persistence for audit trail and replay
- Claude Code adapter for PreToolUse/PostToolUse hooks
- pnpm monorepo with Turbo: 15 packages under `packages/`, 3 apps under `apps/`
- Scoped npm packages: `@red-codes/*` for workspace modules, `@red-codes/agentguard` for the published CLI

## Repository Structure

```
packages/
├── core/           # @red-codes/core — Shared types, actions, governance data
├── kernel/         # @red-codes/kernel — Policy evaluation engine + invariants
├── adapters/       # @red-codes/adapters — Claude Code, filesystem hooks
├── cli-core/       # @red-codes/cli-core — CLI command infrastructure
└── ...             # Additional packages (see CLAUDE.md for full list)
apps/
├── cli/            # @red-codes/agentguard — Published npm CLI (esbuild bundle)
└── ...
agentguard.yaml     # Default policy file
policy/             # Example policy files
docs/               # Architecture and roadmap docs
```

## Tech Stack

- **Runtime**: Node.js 22, TypeScript (strict mode)
- **Monorepo**: pnpm workspaces + Turborepo
- **Build**: `tsc` per package, `esbuild` for CLI bundle
- **Testing**: Vitest (tests import from `dist/` — build before testing)
- **Linting**: ESLint + Prettier
- **CI/CD**: GitHub Actions
- **Package namespaces**: `@red-codes/*`

## Coding Standards

- TypeScript strict mode
- `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants
- `const`/`let` only — never `var`
- Arrow functions preferred
- `import type` for type-only imports
- Single quotes, trailing commas, semicolons
- Module boundaries: kernel must not import from adapters; adapters must not import from CLI
- Always build before running tests: `pnpm build` then `pnpm test`

## Governance Rules (from agentguard.yaml)

All Copilot agents operate under AgentGuard governance. These are **hard rules**:

### DENY (never do these)

- `git push` to main/master — always use feature branches
- `git force-push` — never rewrite shared history
- Write to `.env`, `.npmrc`, SSH keys (`id_rsa`, `id_ed25519`)
- Write or delete `.claude/skills/` — agent skill files are protected
- Execute `rm -rf` — destructive shell commands blocked
- Trigger deploys or publish to npm without explicit instruction

### ALWAYS

- Read files freely — reading is always safe
- Create feature branches: `agent/<type>/issue-<N>` pattern
- Run `pnpm build && pnpm test` before creating PRs
- Include governance report in PR body

## Three-Tier Engineering Model

Copilot acts as **Tier C — Execution Workforce**. You implement well-specified issues, write tests, and open draft PRs for review. You do NOT merge, approve, or make architectural decisions.

- **Tier A — Architect** (Claude Opus): Sprint planning, architecture, risk ownership
- **Tier B — Senior Engineers** (Claude Sonnet/Opus): Complex implementation, code review, merge authority
- **Tier C — Execution Workforce** (GitHub Copilot): Implement specified issues, open draft PRs

### Shared State

Read `.agentguard/swarm-state.json` before acting:

- `recommendedMode`: `normal` | `conservative` | `safe`
  - `normal`: Full autonomy — execute all tasks
  - `conservative`: Reduced throughput — max 1 PR, smaller scope only
  - `safe`: **STOP** — only observability agents run

### PR Rules for Copilot Agents (Tier C)

- **NEVER merge PRs** — only Tier B or humans merge
- **NEVER approve PRs** — post first-pass review comments only
- Max 300 lines changed per PR (soft limit)
- Always link PRs to issues (`Closes #N`)
- Include structured governance report in PR body
- Run lint + typecheck + test before creating PR
- If ambiguous, label `needs-spec` and stop

## Build & Test Commands

```bash
pnpm install               # Install deps
pnpm build                 # Build all packages (turbo build)
pnpm test                  # Run all tests (turbo test)
pnpm lint                  # ESLint (turbo lint)
pnpm format                # Prettier check
pnpm ts:check              # Type-check all packages

# Per-package filtering
pnpm build --filter=@red-codes/kernel
pnpm test --filter=@red-codes/kernel
```

## Branch Naming

```
agent/feat/issue-<N>      # Feature implementation
agent/fix/issue-<N>       # Bug fix
agent/refactor/issue-<N>  # Refactoring
agent/test/issue-<N>      # Test generation
agent/docs/issue-<N>      # Documentation
```

## Autonomy Directive

- **NEVER pause to ask for clarification** — make your best judgment and proceed
- If the issue is ambiguous, label it `needs-spec` and stop
- Default to the **safest option** in every ambiguous situation
- Check swarm-state.json mode before starting any work
