# Product Positioning

## What This Is

**AgentGuard** is a deterministic governance runtime for AI coding agents. It evaluates agent actions against declared policies and invariants, produces structured evidence of every decision, and emits canonical events when violations occur.

**BugMon** is a roguelike developer telemetry game. It consumes events — developer errors, CI failures, governance violations — and turns them into interactive encounters. Coding sessions become dungeon runs. Bugs become enemies. CI failures become bosses.

Together, they form a system where **governance produces events** and **gameplay consumes them**.

## What This Is Not

### Not just a game

BugMon encounters are generated from real system failures. The error pipeline detects 40+ error patterns across 6+ languages. The encounter difficulty scales with actual error severity. The battle system maps to real debugging activity. There is no scripted content — every encounter comes from a real event.

### Not just an AI wrapper

AgentGuard is not a prompt engineering layer or an AI-powered linting tool. It is a deterministic runtime that evaluates boolean policies against concrete actions. No inference, no heuristics, no model calls. The governance layer does not use AI; it governs AI.

### Not an observability platform

The system does not replace Sentry, Datadog, or PagerDuty. It operates at the developer workstation level — intercepting local errors, CI output, and agent actions during coding sessions. It is a development-time tool, not a production monitoring system.

### Not a testing framework

BugMon does not run tests or lint code. It observes the output of tools that do and translates failures into gameplay events. It works alongside existing tooling, not instead of it.

## Why This Architecture

The canonical event model solves a real problem: developer telemetry is fragmented across dozens of tools (linters, test runners, CI systems, error trackers), and AI agent governance has no standard runtime model. By normalizing all signals into a single event schema:

1. **AgentGuard** gets a uniform action evaluation model regardless of what the agent is doing
2. **BugMon** gets a uniform encounter generation model regardless of where the error came from
3. **Developers** get a single view of their session's health through the roguelike metaphor
4. **Plugin authors** get clean extension points (new event sources, new renderers, new policy packs)

## Who This Is For

### Primary: Developers using AI coding agents

Developers who use AI assistants (Claude Code, Copilot, Cursor, etc.) in their daily workflow need both governance (preventing the agent from doing things it shouldn't) and visibility (understanding what happened in a session). The system provides both through a single event model.

### Secondary: Developers who enjoy gamified tooling

Developers who appreciate terminal toys (`sl`, `lolcat`, `cmatrix`) and gamification of development activity. BugMon adds engagement to an activity (debugging) that is otherwise tedious.

### Tertiary: Teams seeking lightweight agent governance

Teams deploying AI coding agents at scale who need deterministic, auditable governance without the overhead of enterprise policy engines.

## How Developers Discover This

1. **CLI** — `npx bugmon demo` or `npx bugmon watch -- npm run dev`. Zero install, immediate encounter.
2. **Claude Code** — `npx bugmon claude-init` hooks into Claude Code sessions. Errors trigger encounters automatically.
3. **Browser** — Play on GitHub Pages for the full RPG experience. Syncs with CLI via WebSocket.
4. **Community** — Add a BugMon creature in 2 minutes with a JSON edit. No code changes needed.

## Competitive Position

| Category | Existing Tools | AgentGuard + BugMon |
|----------|---------------|---------------------|
| Error detection | Sentry, Datadog | Development-time, not production. Local errors, not deployed services. |
| AI agent governance | No standard tool | Deterministic runtime with policy evaluation and evidence packs. |
| Developer gamification | GitHub achievements, WakaTime | Roguelike model with real error-driven encounters, not time tracking. |
| Terminal toys | sl, cmatrix, pokemon-cli | Functional system integrated into dev workflow, not novelty-only. |

## Technical Differentiators

- **Zero runtime dependencies** — vanilla JavaScript, no framework, no build required for development
- **12 KB gzipped** — entire browser game fits in a single file smaller than jQuery
- **Deterministic governance** — no AI in the governance layer, pure policy evaluation
- **Event replay** — stored event streams can reconstruct any past session
- **Terminal-first** — primary interface is the terminal, not a web dashboard
- **Community-driven content** — new BugMon creatures submitted via GitHub Issues with automated validation
