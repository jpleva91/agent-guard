# Product Positioning

## What This Is

**BugMon** is a developer experience platform that turns debugging into gameplay. It consumes developer signals — errors, CI failures, lint warnings, governance violations — and transforms them into interactive encounters. Coding sessions become dungeon runs. Bugs become enemies. CI failures become bosses.

BugMon integrates with **AgentGuard**, a deterministic governance runtime for AI coding agents. AgentGuard evaluates agent actions against policies and invariants, producing canonical events when violations occur. These events feed into BugMon as elite boss encounters.

Together, they form a system where all development activity flows through a single event model and surfaces as engaging, trackable gameplay.

## What This Is Not

### Not just a game

BugMon encounters are generated from real system failures. The error pipeline detects 40+ error patterns across 6+ languages. The encounter difficulty scales with actual error severity. The battle system maps to real debugging activity. There is no scripted content — every encounter comes from a real event.

### Not an observability platform

The system does not replace Sentry, Datadog, or PagerDuty. It operates at the developer workstation level — intercepting local errors, CI output, and agent actions during coding sessions. It is a development-time tool, not a production monitoring system.

### Not a testing framework

BugMon does not run tests or lint code. It observes the output of tools that do and translates failures into gameplay events. It works alongside existing tooling, not instead of it.

## Why This Architecture

The **SourceRegistry** plugin system and canonical event model solve a real problem: developer telemetry is fragmented across dozens of tools (linters, test runners, CI systems, error trackers). By normalizing all signals through a single pipeline:

1. **Any error source** can feed into BugMon — just register a source that calls `onRawSignal(rawText)`
2. **Every encounter** is generated from real errors through the same parse-fingerprint-classify pipeline
3. **Developers** get a single, engaging view of their session's health through the roguelike metaphor
4. **Plugin authors** get clean extension points (new event sources, new renderers, new content packs)

## Who This Is For

### Primary: Developers who want engaging feedback on their errors

Any developer who runs tests, builds, or lints. BugMon adds a layer of engagement to debugging — every error becomes a challenge to defeat, and every fix earns progress.

### Secondary: Developers using AI coding agents

Developers who use AI assistants (Claude Code, Copilot, Cursor, etc.) get automatic encounter generation from agent errors. Combined with AgentGuard governance, the system provides both visibility and guardrails.

### Tertiary: Teams that enjoy gamified tooling

Developers who appreciate terminal toys and gamification of development activity. BugMon turns the tedium of debugging into a persistent, trackable game.

## How Developers Discover This

1. **CLI** — `npx bugmon demo` or `npx bugmon watch -- npm run dev`. Zero install, immediate encounter.
2. **Claude Code** — `npx bugmon claude-init` hooks into Claude Code sessions. Errors trigger encounters automatically.
3. **Browser** — Play on GitHub Pages for the full RPG experience. Syncs with CLI via WebSocket.
4. **Community** — Add a BugMon creature in 2 minutes with a JSON edit. No code changes needed.

## Competitive Position

| Category | Existing Tools | BugMon |
|----------|---------------|--------|
| Error detection | Sentry, Datadog | Development-time, not production. Local errors, not deployed services. |
| Developer gamification | GitHub achievements, WakaTime | Roguelike model with real error-driven encounters, not time tracking. |
| AI agent governance | No standard tool | AgentGuard integration: deterministic runtime with policy evaluation. |
| Terminal toys | sl, cmatrix, pokemon-cli | Functional system integrated into dev workflow, not novelty-only. |

## Technical Differentiators

- **Zero runtime dependencies** — vanilla JavaScript, no framework, no build required for development
- **12 KB gzipped** — entire browser game fits in a single file smaller than jQuery
- **Plugin architecture** — SourceRegistry lets anyone add new bug sources with 3 functions
- **Terminal-first** — primary interface is the terminal, not a web dashboard
- **Community-driven content** — new BugMon creatures submitted via GitHub Issues with automated validation
- **Canonical event model** — every signal becomes a structured event that can be replayed, analyzed, or rendered
