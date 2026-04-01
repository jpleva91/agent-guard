# Architecture

## Architectural Thesis

The system has a single architectural spine: the **canonical event model**.

All system activity — agent tool calls, governance decisions, invariant violations, escalation state changes — is normalized into structured events. AgentGuard enforces deterministic execution constraints on AI coding agents through a governed action kernel that produces a complete audit trail.

## System Diagram

```
┌──────────────┐
│  AI Agent     │  (Claude Code, etc.)
│  Tool Call    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Identity   │  Declare role + driver (prompt or --agent-name flag)
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│              AgentGuard Kernel                │
│                                              │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
│  │   AAB   │→ │  Policy  │→ │ Invariants │  │
│  │normalize│  │ evaluate │  │   check    │  │
│  └─────────┘  └──────────┘  └────────────┘  │
│       │                           │          │
│       ▼                           ▼          │
│  ┌─────────┐              ┌────────────┐     │
│  │ Execute │              │  Escalate  │     │
│  │ Adapter │              │  if needed │     │
│  └─────────┘              └────────────┘     │
│       │                                      │
│       ▼                                      │
│  ┌──────────────────────┐                    │
│  │   Event Stream       │                    │
│  │  (SQLite audit trail)│                    │
│  └──────────────────────┘                    │
└──────────────────────────────────────────────┘
```

## Package Layout

This is a **pnpm monorepo** orchestrated by **Turbo**. Each workspace package maps to a single architectural concept:

```
packages/
├── core/          @red-codes/core — Shared utilities (types, actions, hash, execution-log)
├── events/        @red-codes/events — Canonical event model (schema, bus, store)
├── policy/        @red-codes/policy — Policy system (composer, evaluator, loaders, pack loader)
├── invariants/    @red-codes/invariants — Invariant system (26 built-in definitions, checker)
├── invariant-data-protection/ @red-codes/invariant-data-protection — Data protection invariant plugin
├── matchers/      @red-codes/matchers — Structured matchers (Aho-Corasick, globs, hash sets)
├── kernel/        @red-codes/kernel — Governed action kernel (orchestrate, normalize, decide, escalate)
├── adapters/      @red-codes/adapters — Execution adapters (file, shell, git, claude-code, copilot-cli, codex-cli, gemini-cli)
├── storage/       @red-codes/storage — SQLite storage backend (opt-in)
├── telemetry/     @red-codes/telemetry — Runtime telemetry and logging
├── plugins/       @red-codes/plugins — Plugin ecosystem (discovery, registry, validation, sandboxing)
├── renderers/     @red-codes/renderers — Renderer plugin system (registry, TUI renderer)
├── sdk/           @red-codes/sdk — Agent SDK for programmatic governance integration
├── scheduler/     @red-codes/scheduler — Task scheduler, queue, lease manager, and worker orchestration
└── telemetry-client/ @red-codes/telemetry-client — Telemetry client (identity, signing, queue, sender)

apps/
├── cli/           @red-codes/agentguard — CLI entry point and commands (published npm package)
├── mcp-server/    @red-codes/mcp-server — MCP governance server (15 governance tools)
└── vscode-extension/  agentguard-vscode — VS Code extension (sidebar panels, notifications, diagnostics)

policies/          Policy packs (YAML: ci-safe, engineering-standards, enterprise, hipaa, open-source, soc2, strict)
```

## Layer Rules

Package boundaries enforce these dependency rules via `package.json` workspace dependencies:

- **@red-codes/kernel** may import from events, policy, invariants, telemetry, core
- **@red-codes/events** may import from core only
- **@red-codes/policy** may import from core only
- **@red-codes/invariants** may import from core, events, matchers only
- **@red-codes/matchers** may import from core only
- **@red-codes/adapters** may import from core, kernel only
- **@red-codes/plugins** may import from core only
- **@red-codes/renderers** may import from core, kernel, plugins only
- **@red-codes/storage** may import from core, events, kernel, telemetry only
- **@red-codes/agentguard** (cli) may import from all workspace packages
- **@red-codes/telemetry** may import from core only
- **@red-codes/core** has no project imports (leaf layer)

## Policy Format

Policies are defined in YAML (`agentguard.yaml`). The format supports:

- **`mode`**: `monitor` (warn but allow) or `enforce` (block) — top-level enforcement mode
- **`pack`**: Named policy pack shorthand (`essentials`, `strict`, etc.)
- **`extends`**: Compose multiple policies with precedence (paths or built-in pack names)
- **`rules`**: Deny/allow rules with action types, target globs, branch conditions, blast radius limits
- **`invariants`**: Per-invariant mode overrides (`enforce` or `monitor`)
- **`persona`**: Agent persona conditions (model, trust tier, autonomy level)
- **`forecast`**: Predictive conditions (test risk score, blast radius, risk level)

The `claude-init` command provides an interactive wizard that generates a starter policy with mode and pack selection.

## Key Design Decisions

1. **Action as primary unit** — Every agent tool call becomes a canonical Action with type, target, and justification
2. **Deterministic evaluation** — Policy matching and invariant checking are pure functions with no side effects
3. **Event-sourced audit** — Every decision is recorded in SQLite; runs are fully replayable (JSONL export supported)
4. **Escalation state machine** — Repeated violations escalate: NORMAL → ELEVATED → HIGH → LOCKDOWN
5. **Adapter pattern** — Execution is abstracted behind adapters, making the kernel testable without real file/git operations
6. **YAML-first policy** — Human-readable policy-as-code, version-controlled alongside the project

## Agent Identity

Agents declare their identity (role + driver) at the start of each governance session. If the `--agent-name` flag is not provided, an interactive prompt collects the identity.

**Roles:** `developer`, `reviewer`, `ops`, `security`, `planner`
**Drivers:** `human`, `claude-code`, `copilot`, `opencode`, `ci`

Identity serves three purposes:

1. **Persona-scoped policy rules** — Policy rules can match on agent role or driver, enabling different governance for different agent types (e.g., stricter rules for autonomous CI agents than for human-supervised development agents).
2. **Telemetry attribution** — Every event in the audit trail carries the agent identity, enabling per-agent analysis in the cloud dashboard.
3. **Cloud dashboard grouping** — The cloud dashboard groups sessions by agent identity for fleet-level visibility.

The `telemetry-client` package (`packages/telemetry-client/`) handles identity signing, queue management, and sender logic. Identity is attached to all outbound telemetry payloads. Worktree enforcement ensures that agents operating in git worktrees are correctly identified and isolated
