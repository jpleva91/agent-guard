# Go Kernel Rewrite — Design Spec

**Date:** 2026-03-25
**Status:** Approved
**Author:** Jared + Claude

## Problem

The AgentGuard governance kernel is implemented in TypeScript (~24K LOC across 14 packages). While functionally complete, the TS kernel has inherent limitations:

- **Cold start**: ~50ms per hook invocation (Node.js startup). Process-per-invocation means every tool call pays this cost.
- **Native dependency fragility**: `better-sqlite3` requires Node version-matched native compilation. Version mismatches silently break the hook (the bug that started this session).
- **Deployment complexity**: Requires `node_modules/`, pnpm, and a compatible Node.js version. The stranger test revealed multiple friction points from this dependency chain.
- **Performance ceiling**: Node's single-threaded model limits concurrent evaluation. The kernel's hot path is CPU-bound pattern matching that Go handles natively.

The decision (2026-03-24) is Go-first for velocity, with Rust reserved for later selective hardening of hot-path components.

## Design

### Language & Rationale

Go. Learning curve is days vs weeks for Rust. The kernel workload (policy eval, command inspection, pattern matching) doesn't require Rust's ownership model. Go's goroutine model maps naturally to the daemon architecture. Static binary deployment eliminates the Node.js dependency chain entirely.

### Project Structure

The Go kernel lives in `go/` within the existing `agent-guard` repo. Single repo, shared CI, shared governance data files.

```
agent-guard/
├── go/
│   ├── go.mod                          # github.com/AgentGuardHQ/agent-guard/go
│   ├── cmd/
│   │   └── agentguard/
│   │       └── main.go                 # Binary: daemon, normalize, evaluate, hook subcommands
│   ├── pkg/
│   │   └── hook/
│   │       ├── hook.go                 # Public API: Claude Code + Copilot integration
│   │       ├── response.go             # Hook response formatting (guide/educate/enforce/monitor)
│   │       └── socket.go               # Unix socket client
│   ├── internal/
│   │   ├── action/
│   │   │   ├── types.go                # ActionContext, RawAction, PolicyRule, Suggestion
│   │   │   ├── normalize.go            # AAB: raw tool call → ActionContext
│   │   │   ├── scanner.go              # CommandScanner: Aho-Corasick + regex
│   │   │   ├── github.go              # GitHub CLI action detection
│   │   │   └── blast.go               # Blast radius computation
│   │   ├── engine/
│   │   │   ├── kernel.go              # Governance pipeline: propose → normalize → evaluate → decide
│   │   │   ├── policy.go              # Policy evaluator: rule matching, conditions, branches
│   │   │   ├── invariant.go           # 22 built-in invariant checks
│   │   │   ├── suggestion.go          # SuggestionRegistry + built-in generators
│   │   │   ├── monitor.go             # Escalation state machine
│   │   │   ├── decision.go            # GovernanceDecisionRecord builder
│   │   │   └── tier.go                # Fast/standard/deep tier routing
│   │   ├── event/
│   │   │   ├── schema.go              # Event kinds, DomainEvent factory
│   │   │   ├── sink.go                # EventSink + DecisionSink interfaces
│   │   │   └── envelope.go            # GovernanceEvent envelope
│   │   ├── config/
│   │   │   ├── yaml.go                # agentguard.yaml parser
│   │   │   ├── pack.go                # Policy pack loader
│   │   │   └── data.go                # //go:embed + disk overlay
│   │   ├── daemon/
│   │   │   ├── server.go              # Unix socket daemon
│   │   │   ├── session.go             # Session state (retries, written files)
│   │   │   └── lifecycle.go           # Start/stop/health
│   │   └── storage/
│   │       ├── sqlite.go              # SQLite sink (modernc.org/sqlite — pure Go, no CGo)
│   │       └── jsonl.go               # JSONL append-only sink
│   ├── data/                           # Symlinks to packages/core/src/data/
│   └── test/
│       ├── compliance/                 # TS↔Go decision parity tests
│       └── testdata/                   # Policies + sample payloads
```

### Package Design — Idiomatic Go

Two public packages, everything else internal:

- **`pkg/hook/`** — The only public API. Adapters (Claude Code, Copilot, future LangGraph) import this to send actions and receive decisions.
- **`cmd/agentguard/`** — Binary entry point with subcommands.
- **`internal/`** — All engine internals. Free to refactor without breaking consumers.

Key internal packages:
- **`internal/action/`** — Types + normalization. One responsibility: turn a raw tool call into a classified `ActionContext`.
- **`internal/engine/`** — The governance pipeline. Policy matching, invariant checking, suggestion resolution, escalation, decision records. This is the kernel.
- **`internal/event/`** — Event schema and sink interfaces. Decoupled from storage backend.
- **`internal/config/`** — YAML/JSON loading with embedded defaults.
- **`internal/daemon/`** — Socket server, session state, lifecycle.
- **`internal/storage/`** — SQLite and JSONL persistence (async, behind sink interfaces).

### Daemon Architecture

**Model:** Long-running daemon per Claude Code session, communicating over Unix domain socket.

**Socket:** `/tmp/agentguard-{session_id}.sock`

**Protocol:** Newline-delimited JSON (same schema as current stdin/stdout hook protocol):
```
→ {"tool":"Bash","input":{"command":"git push origin main"},"hook":"PreToolUse","session_id":"abc123"}
← {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}
```

**Lifecycle:**
```
SessionStart hook → agentguard-go daemon --session $CLAUDE_SESSION_ID &
PreToolUse hook   → agentguard-go hook pre --session $CLAUDE_SESSION_ID < stdin > stdout
Stop hook         → agentguard-go daemon stop --session $CLAUDE_SESSION_ID
```

**Daemon internals:**
- Loads policy + governance data once at startup
- Creates kernel instance once, reused across all tool calls in the session
- Session state (retry counts, written files, escalation level) held in memory, guarded by `sync.Mutex` for concurrent access safety
- One goroutine per incoming connection — session state access serialized via mutex (not lock-free; Claude Code can issue overlapping tool calls via parallel subagents)
- SQLite writer runs in a dedicated goroutine (channel-based, no lock contention on hot path)
- Telemetry flushes on configurable interval + on shutdown

**Socket lifecycle:**
- On startup, if socket path already exists: attempt connect. If refused (stale), remove and proceed. If connected (already running), exit with info message.
- Register `signal.NotifyContext` for `SIGTERM`/`SIGINT` to remove socket file before exit
- `defer os.Remove(socketPath)` as belt-and-suspenders cleanup

**Fallback:** If daemon socket is missing, `agentguard-go hook pre` falls back to process-per-invocation mode (same as the `evaluate` subcommand). Governance never fails because the daemon didn't start.

### Data Loading — Embed + Overlay

**Compile-time defaults:**
```go
//go:embed data/*.json
var embeddedData embed.FS
```

All 7 governance JSON files baked into the binary. Zero file I/O for defaults.

**Runtime overlay order** (later wins):
1. Embedded defaults (always present)
2. `agentguard.yaml` rules (project policy from disk)
3. Policy pack files (`policies/*.yaml` from disk)
4. `.agentguard/data/*.json` overrides (user-customized patterns, if present)

**Shared source-of-truth:** `//go:embed` cannot follow symlinks. A `go generate` step copies files from `packages/core/src/data/` into `go/internal/config/data/` before build:

```go
//go:generate cp -r ../../packages/core/src/data ./data
//go:embed data/*.json
var embeddedData embed.FS
```

CI validates the copy is fresh (hash comparison against canonical source). The copy is gitignored; the canonical source remains in `packages/core/src/data/`.

### TS Integration — Graceful Migration

The Go kernel is additive. The TS kernel continues to work. Migration is opt-in via the wrapper script.

**`scripts/claude-hook-wrapper.sh` resolution order:**
```bash
# Go daemon (fastest) > Go binary (fast) > TS node_modules > TS PATH
if [ -S "/tmp/agentguard-${CLAUDE_SESSION_ID}.sock" ]; then
  exec go/bin/agentguard hook pre --session "$CLAUDE_SESSION_ID"
elif [ -x "$AGENTGUARD_WORKSPACE/go/bin/agentguard" ]; then
  exec "$AGENTGUARD_WORKSPACE/go/bin/agentguard" evaluate --policy "$AGENTGUARD_WORKSPACE/agentguard.yaml"
elif [ -x "$AGENTGUARD_WORKSPACE/node_modules/.bin/agentguard" ]; then
  exec "$AGENTGUARD_WORKSPACE/node_modules/.bin/agentguard" claude-hook pre --store sqlite
fi
```

**`claude-init` updated to:**
- Build Go binary if `go/` exists and Go toolchain is available
- Add SessionStart hook for daemon startup
- Fall back to TS if Go isn't available

## Phased Delivery

Each phase is an independent spec → plan → implementation cycle. Later phases depend on earlier ones but each ships a testable artifact.

### Phase 1: Foundation + Evaluator (~9K LOC equivalent)

**Packages:** `internal/action/`, `internal/engine/policy.go`, `internal/config/`, `cmd/agentguard/` (evaluate subcommand)

**Delivers:**
- Go structs for all core types (ActionContext, PolicyRule, EvalResult, Suggestion, etc.)
- CommandScanner with regex pattern matching (git, github, destructive)
- AAB normalization: raw tool call → classified ActionContext
- Blast radius computation (stateless, pure logic — needed for compliance parity)
- Policy evaluator: load `agentguard.yaml`, match rules, return allow/deny with suggestions
- `agentguard-go evaluate --policy agentguard.yaml` CLI subcommand
- Compliance tests: same inputs → same decisions as TS kernel (full hook response comparison, not just decision structs)

**Does NOT include:** invariants, daemon, adapters, storage, telemetry

### Phase 2: Invariants + Full Kernel (~4K LOC equivalent)

**Packages:** `internal/engine/invariant.go`, `internal/engine/kernel.go`, `internal/engine/monitor.go`, `internal/engine/suggestion.go`, `internal/engine/decision.go`, `internal/event/`

**Delivers:**
- 22 built-in invariant definitions with SystemState checker
- Full `propose()` pipeline: normalize → evaluate → check invariants → build decision record → emit events
- Escalation state machine (NORMAL → ELEVATED → HIGH → LOCKDOWN)
- SuggestionRegistry with template rendering + shell escaping
- Tier routing (fast/standard/deep)
- `agentguard-go evaluate` now includes invariant checking

### Phase 3: Daemon + Integration (~5K LOC equivalent)

**Packages:** `internal/daemon/`, `pkg/hook/`, `internal/storage/`, updated `cmd/agentguard/`

**Delivers:**
- Unix socket daemon (start/stop/health)
- `agentguard-go hook pre` socket client (drop-in replacement for TS hook)
- `agentguard-go daemon --session $ID` command
- SQLite + JSONL sinks (async, goroutine-based)
- Session state management (retry counts, written files)
- Updated `claude-hook-wrapper.sh` with Go resolution
- Updated `claude-init` with daemon SessionStart hook

**This is the milestone where Go replaces TS in production.**

### Phase 4: Extensions (~3K LOC equivalent)

**Delivers:**
- Plugin ecosystem (discovery, registry, sandboxing)
- TUI renderer for action stream
- Agent SDK (programmatic governance API)
- Copilot CLI adapter

### Phase 5: Optimization

**Delivers:**
- Performance benchmark suite (Go-native, replaces Node bench)
- Memory pooling for hot-path allocations
- Connection pooling for concurrent socket clients
- Rust FFI exploration for CommandScanner hot path (if warranted by benchmarks)

## Compliance Testing

The Go kernel must produce identical decisions to the TS kernel for all inputs. This is validated continuously:

**Test corpus:** `go/test/testdata/payloads/` — 100+ sample hook payloads covering:
- All 41 action types
- All deny rules (protected branches, force push, secrets, rm -rf, deploy, infra)
- All allow rules (file.read, shell.exec, git.commit, github.pr.create, etc.)
- Edge cases (compound commands, template variables, governance self-modification)
- Guide mode (suggestion + correctedCommand in response)
- Educate mode (additionalContext in response)

**CI job:** Runs both kernels on every payload, diffs outputs. Any mismatch fails the build.

## Non-Goals

- Rewriting the TS kernel or CLI (additive, not replacement)
- GUI or web dashboard in Go (stays in TS/React)
- Full Rust rewrite (Go first, Rust for selective hot-path hardening later)
- Windows daemon support (Unix socket only; Windows uses process-per-invocation fallback)
