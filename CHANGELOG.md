# Changelog

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
