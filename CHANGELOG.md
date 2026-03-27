# Changelog

## 2.8.1 (2026-03-27)

### Features

* **Agent identity in all driver hooks** — All four hook drivers (Claude Code, Copilot CLI, Codex CLI, Gemini CLI) now resolve and pass agent identity into session tracking. Identity flows into SQLite session records for attribution and analytics.
* **Session `agentId` tracking** — Migration v5 adds an `agent_id` column and index to the sessions table, enabling per-agent session queries and aggregation filters.
* **`agentId` filter in aggregation queries** — Storage aggregation queries support filtering by `agentId` for agent-level analytics.
* **Agent identity in `inspect` output** — `aguard inspect` now displays the resolved agent identity alongside run metadata.

### Bug Fixes

* **Init all driver hooks** — Re-initializing hooks via `agentguard *-init` commands now correctly re-writes hook configs for all four drivers.

---

## 2.8.0 (2026-03-26)

### Features

* **Codex CLI hook support** — New `agentguard codex-hook` and `agentguard codex-init` commands integrate AgentGuard governance into OpenAI Codex CLI workflows via PreToolUse/PostToolUse hooks. New adapter: `packages/adapters/src/codex-cli.ts`.
* **Gemini CLI hook support** — New `agentguard gemini-hook` and `agentguard gemini-init` commands integrate AgentGuard governance into Google Gemini CLI workflows. New adapter: `packages/adapters/src/gemini-cli.ts`.
* **Four-driver hook parity** — Claude Code, Copilot CLI, Codex CLI, and Gemini CLI all support the same PreToolUse/PostToolUse governance hook pattern with consistent block/allow/guide responses.

---

## 2.7.3 (2026-03-25)

### Features

* **Denial-retry-escalation invariant** — New invariant that detects and escalates repeated denial retries within a session (closes #908).
* **Decisions index** — Added `action_type` index on the decisions table for faster filtered queries (closes #727).

### Bug Fixes

* **Path manipulation hardening** — Policy scope matching in `packages/matchers` is hardened against path traversal manipulation (closes #640).
* **Credential pattern expansion** — Shell command stripping now catches additional AI/k8s/vault credential patterns (closes #639).
* **CLI exports subpaths** — Added missing `bin` and `postinstall` subpaths to `apps/cli` package exports (closes missing export paths).

---

## 2.7.2 (2026-03-25)

### Other

* **CLI rename** — CLI binary renamed from `agentguard` to `aguard` (shorter alias). Documentation updated across 58 files.

---

## 2.7.1 (2026-03-25)

### Bug Fixes

* **Version bump** — Patch release to sync CLI version after 2.7.0 publish.

---

## 2.7.0 (2026-03-25)

### Features

* **`aguard` convenience package** — Registered `aguard` (and `aiguard`) as unscoped npm packages for shorter install and invocation: `npx aguard guard`.

---

## 2.6.0 (2026-03-25)

### Features

* **Go kernel** — Complete Go rewrite of the governance kernel ships as a static binary (`apps/cli/dist/go-bin/agentguard-go`). Delivered in phases: event system, invariant suite, hook protocol, decisions + escalation, blast radius engine, simulation, and full kernel orchestrator. Binary is distributed via GitHub Releases and downloaded via npm postinstall.
* **Go kernel performance** — Single 3.2 MB static binary; hook evaluation < 3ms end-to-end (33× faster startup, ~100× faster hook evaluation vs Node.js kernel). Zero npm dependencies at runtime.
* **Go kernel: AST shell parser** — Structural parsing of compound shell commands for normalization (KE-5).
* **Go kernel: control plane signals API** — External governance intelligence API for consuming escalation state and decisions from outside the kernel process (KE-6).
* **Go kernel: telemetry shipper** — Structured telemetry with stdout/file/HTTP sinks, correlation IDs, and performance span tracking (KE-4).
* **Telemetry spans** — Structured spans, correlation IDs, and performance metrics added to Node.js telemetry pipeline.
* **Write-then-execute bypass fix** — Invariants now correctly detect governance bypasses that write a file and immediately execute it in the same session (#862).
* **Supply chain hardening** — All GitHub Actions workflow steps pinned to full SHA digests.

---

## 2.5.0 (2026-03-25)

### Features

* **Corrective enforcement modes** — four modes on two axes (block × suggest): `monitor` (observe), `educate` (allow + teach), `guide` (block + suggest corrected command), `enforce` (hard block). Policy rules support `suggestion` and `correctedCommand` fields with `{{branch}}`, `{{target}}` template variables. Built-in suggestion generators for git.push, force-push, reset-hard, file.write secrets, and rm -rf. Retry budget (3 max) prevents infinite correction loops.
* **SuggestionRegistry** — kernel-level registry with shell-escaped template rendering, action-scope validation for correctedCommand, and policy-pack trust verification.
* **Fail-closed governance** — PreToolUse hook crashes now output `{"decision":"block"}` + exit 2 instead of silently allowing actions through. PostToolUse errors remain fail-open.
* **Default mode changed to enforce** — `resolveInvariantMode` defaults to `enforce` (was `monitor`). `claude-init` generates `mode: guide` for new installs.

### Bug Fixes

* **Identity scaffolding (#850)** — `claude-init` now creates `.agentguard-identity` with auto-detected `driver:model:role`. CI/cron agents override via `AGENTGUARD_AGENT_NAME` env var.
* **Hook validation (#849)** — `claude-init` validates that referenced wrapper scripts and binaries exist before reporting "Already configured". Warns and offers repair when hooks are broken.
* **Status identity check (#851)** — `agentguard status` now checks for `.agentguard-identity` and wrapper script existence with actionable hints when missing.
* **Wrapper binary resolution (#852)** — Hook wrapper resolves agentguard binary from `node_modules/.bin/` first, then PATH. Fails closed if binary not found.
* **Hook wrapper fail-closed** — wrapper script outputs block response instead of silently failing when binary is missing.

### Other

* **Claude Code + Copilot adapters** — `formatHookResponse` extended for guide (suggestion in `permissionDecisionReason`) and educate (`additionalContext`). Copilot adapter mirrors Claude Code with protocol-appropriate fallbacks.
* **Invariant suggest callback** — `AgentGuardInvariant` interface now supports optional `suggest` callback for future invariant-level corrective suggestions.
* **Site + README updates** — four-mode documentation, "What's Inside" section, updated meta descriptions.

## 2.4.0 (2026-03-22)

### Features

* **Agent identity system** — session identity prompt, auto-detecting wizard, MCP persona, and worktree enforcement. Agents declare identity (role + driver) for telemetry attribution and persona-scoped policy rules. Set via `--agent-name` flag or interactive prompt (#715, #714, #713, #712, #709, #707, #706)
* **Pre-push branch protection** — enforce branch protection rules from `agentguard.yaml` via git pre-push hooks, installed automatically by `agentguard claude-init` (#704)
* **Capability grants enforcement** — enforce capability grants before adapter execution (#681)
* **Cloud credential storage** — store cloud credentials in project `.env` instead of global config (#679, #678)

### Bug Fixes

* **Security: governance bypass vectors** — closed three governance bypass vectors (#696)
* **ESM bundle fix** — added `createRequire` shim and updated help text for ESM compatibility (#703)

### Other

* **Site redesign** — floating nav, dark/light toggle, social proof, newsletter signup (#708)
* **Messaging pivot** — governance-first to outcome-first positioning (#701)
* **CLI wizard docs** — YAML policy format documentation updated (#697)

## 1.0.0 (2026-03-07)


### Features

* add Claude Code integration and one-liner onboarding ([8c712af](https://github.com/jpleva91/BugMon/commit/8c712afe412a0b2e4b53c6b504b909c91c42bb40))
* audit and improve JS tooling across CI, build, CLI, and monorepo ([18c256e](https://github.com/jpleva91/BugMon/commit/18c256eaf284b2c125bef83daf313b11e5757808))
* complete CLI MVP architecture — add init, demo, resolve, heal, boss battles, auto-walk ([1c48cb5](https://github.com/jpleva91/BugMon/commit/1c48cb52ad86d623b7d373d8d906e02b1ce7ef49))


### Bug Fixes

* correct bundle size claims to match actual build output ([6474fd5](https://github.com/jpleva91/BugMon/commit/6474fd5f1fc98d435c8172cb37bf60784ed8f471))
