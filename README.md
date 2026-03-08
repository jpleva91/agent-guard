# AgentGuard + BugMon

**Deterministic AI agent governance. Roguelike developer telemetry.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![npm](https://img.shields.io/badge/npm-bugmon-cb3837.svg)](https://www.npmjs.com/package/bugmon)
[![Play Now](https://img.shields.io/badge/Play-GitHub%20Pages-orange.svg)](https://jpleva91.github.io/BugMon/)
[![Size](https://img.shields.io/badge/gzipped-12_KB-brightgreen.svg)](LIGHTWEIGHT.md)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](LIGHTWEIGHT.md)

---

**AgentGuard** is a deterministic governance runtime for AI coding agents. It evaluates agent actions against declared policies and invariants, produces structured evidence of every decision, and emits canonical events when violations occur. No inference. No heuristics. Pure policy evaluation.

**BugMon** is a roguelike developer telemetry game. It consumes events — developer errors, CI failures, governance violations — and turns them into interactive encounters. Your coding session is a dungeon run. Your bugs are enemies. Your CI failures are bosses.

The system has one architectural spine: the **canonical event model**. All system activity becomes events. AgentGuard produces governance events. BugMon consumes all events and renders them as gameplay.

## Try it now

```bash
npx bugmon demo
```

No install. No config. No dependencies. A wild bug appears.

### Wrap your dev command

```bash
npx bugmon watch -- npm run dev
```

Every error spawns an enemy. Fix the bug, defeat the enemy. Minor enemies auto-resolve in the background. Bosses interrupt your session and demand attention.

<p align="center">
  <img src="game/sprites/nullpointer.png" width="64" alt="NullPointer">
  <img src="game/sprites/racecondition.png" width="64" alt="RaceCondition">
  <img src="game/sprites/memoryleak.png" width="64" alt="MemoryLeak">
  <img src="game/sprites/deadlock.png" width="64" alt="Deadlock">
</p>

## How It Works

```
Developer Signals / Agent Actions
    → Event Normalization Pipeline
    → Canonical Event Model
    → Policy + Invariant Evaluation (AgentGuard)
    → Event Store
    → Subscribers (BugMon, Grimoire, stats, replay)
```

A TypeError in your code becomes a canonical event. That event flows through the pipeline, gets classified by severity, and spawns a BugMon enemy. Minor enemies (severity 1-2) auto-resolve in idle mode. Bosses and elites (severity 3+) demand active engagement.

An AI agent trying to modify production config triggers AgentGuard. The policy evaluator denies the action. An `InvariantViolation` event is emitted. BugMon spawns an elite governance boss. The evidence pack records exactly what happened and why.

### Examples

```
  [idle] NullPointer defeated         +15 XP     TypeError
  [idle] TypeCoercion defeated        +10 XP     lint warning
  [idle] ImportError defeated         +15 XP     module not found

  ⚠ BOSS: CI Dragon appeared!                    CIFailure
  ████████████████████████████░░  HP: 500/500    severity: 4
  Pipeline failed: deploy job exited with code 1
  .github/workflows/deploy.yml
  [1] Fight  [2] Run

  ⚠ GOVERNANCE: Invariant Titan appeared!         InvariantViolation
  ██████████████████████████████  HP: 600/600    severity: 5
  Agent modified production schema outside scope
  src/database/schema.sql
  [1] Fight  [2] Run
```

## The Roguelike Model

Coding sessions are **runs**. Errors are **enemies**. CI failures are **bosses**. Governance violations are **elite bosses**.

| Software Development | Roguelike Mechanic |
|---------------------|-------------------|
| Coding session | Run |
| Lint warning | Weak enemy (idle) |
| Type error | Minor enemy (idle) |
| Test failure | Strong enemy (active) |
| CI failure | Boss (active) |
| Invariant violation | Elite boss (active) |
| Bug fix | Enemy defeated |
| Cascading failures | Run death |

Minor enemies auto-resolve in the background while you code. Boss encounters interrupt your session and require active input. The **Bug Grimoire** records every enemy type you've defeated — a compendium of all the bugs you've conquered.

Difficulty scales within a session. Unresolved errors compound. Boss encounters escalate from repeated failures. Meta-progression (Grimoire, XP, achievements) persists across runs.

See [docs/roguelike-design.md](docs/roguelike-design.md) for the full design.

## Claude Code Integration

Using [Claude Code](https://docs.anthropic.com/en/docs/claude-code)? BugMon hooks into your sessions — errors trigger encounters automatically.

```bash
npx bugmon claude-init
```

## CLI

```bash
# Watch mode — intercept errors in real time
npx bugmon watch -- npm run dev
npx bugmon watch -- node server.js
npx bugmon watch -- tsc --watch

# Scan mode — find bugs in your project
npx bugmon scan

# Grimoire and stats
npx bugmon dex                    # View your Bug Grimoire
npx bugmon stats                  # Bug hunter level and XP

# Sync CLI ↔ browser game
npx bugmon sync
```

Install globally for the shorter `bugmon` command: `npm i -g bugmon`

40+ error patterns recognized across Node.js, TypeScript, Python, Go, Rust, Java, ESLint, Jest/Vitest, merge conflicts, security findings, and CI output. Zero runtime dependencies.

## Browser Game

The optional browser companion provides a visual roguelike experience — explore a tile-based dungeon, battle BugMon enemies, and track your Grimoire progress. It syncs with the CLI in real time via WebSocket.

**[Play Now](https://jpleva91.github.io/BugMon/)** — the entire game fits in a single 12 KB file (gzipped, smaller than jQuery).

### Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| Move | Arrow keys | D-pad |
| Confirm | Enter | A button |
| Back | Escape | B button |

### Battle Options

- **Fight** — Pick a move. Faster combatant acts first.
- **Run** — Always succeeds.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                      Event Sources                         │
│  stderr │ test output │ linter │ CI │ agent actions        │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Normalization       │
              │  Pipeline            │
              │  parse → classify    │
              │  → dedupe → emit     │
              └──────────┬───────────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
     ┌───────────┐ ┌──────────┐ ┌──────────┐
     │ AgentGuard│ │  Event   │ │ EventBus │
     │           │ │  Store   │ │          │
     │ policies  │ │          │ │ pub/sub  │
     │ invariants│ │ persist  │ │ broadcast│
     │ evidence  │ │ replay   │ │          │
     └─────┬─────┘ └──────────┘ └────┬─────┘
           │                         │
           │ governance events       │ all events
           └────────────┬────────────┘
                        ▼
              ┌──────────────────────┐
              │    Subscribers       │
              │                      │
              │  Terminal renderer   │
              │  Browser game        │
              │  Bug Grimoire        │
              │  Stats engine        │
              │  Replay engine       │
              └──────────────────────┘
```

### Current Repository Structure

```
BugMon/
├── core/                # CLI encounter engine (Node.js)
│   ├── cli/             # CLI tool (bugmon command, watch, sync)
│   ├── matcher.js       # Error → enemy matching
│   └── error-parser.js  # Error & stack trace parsing (40+ patterns)
├── game/                # Browser game (client-side)
│   ├── engine/          # State machine, input, rendering
│   ├── battle/          # Turn-based battle engine
│   ├── world/           # Map, player, encounters
│   ├── evolution/       # Dev-activity progression system
│   └── sprites/         # Sprites + procedural generation
├── domain/              # Pure domain logic (no DOM, no Node.js APIs)
│   ├── battle.js        # Deterministic battle engine
│   ├── events.js        # Canonical event definitions
│   ├── event-bus.js     # Universal EventBus
│   └── ingestion/       # Error normalization pipeline
├── ecosystem/           # Game content & metagame
│   ├── data/            # JSON + JS modules (monsters, moves, types)
│   ├── bugdex.js        # Bug Grimoire system
│   └── bosses.js        # Boss encounter definitions
├── simulation/          # Headless battle simulation
├── tests/               # Test suite (52 test files)
├── docs/                # System documentation
└── scripts/             # Build tooling
```

### Target Structure

```
agentguard/              # Governance runtime
├── core/                # AAB, evaluation loop
├── policies/            # Policy definitions
├── invariants/          # Invariant monitoring
└── evidence/            # Evidence packs

bugmon/                  # Roguelike game layer
├── core/                # Run engine, encounter generation
├── battle-engine/       # Turn-based combat
├── grimoire/            # Enemy compendium and progression
└── renderers/           # Terminal, browser, mobile

shared/                  # Canonical event model
├── events/              # Event schema
├── fingerprints/        # Deduplication
└── replay/              # Event stream replay
```

## Features

- **31 named enemies** across 7 types — community-contributed creatures with sprites and lore
- **Hybrid idle/active** — minor enemies auto-resolve, bosses demand engagement
- **CLI encounter engine** — wraps your dev commands, classifies real errors, spawns matching enemies
- **40+ error patterns** — JavaScript, TypeScript, Python, Go, Rust, Java, ESLint, CI output
- **Bug Grimoire** — compendium of every enemy type defeated, with encounter history and fix strategies
- **Dev-activity progression** — your commits, PRs, and bug fixes drive level-ups via git hooks
- Turn-based combat with speed priority, type effectiveness, critical hits, and passive abilities
- Browser roguelike with tile-based dungeon exploration and random encounters
- Synthesized sound effects (Web Audio API — zero audio files)
- Mobile touch controls
- Save/load with auto-save
- **Zero runtime dependencies** — vanilla JS, HTML5 Canvas, no framework ([Lightweight Manifesto](LIGHTWEIGHT.md))

## Type System

7 types with effectiveness matchups:

| | Front | Back | DevOps | Test | Arch | Sec | AI |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Frontend** | -- | **1.5x** | 1x | **1.5x** | 0.5x | 1x | 0.5x |
| **Backend** | 0.5x | -- | **1.5x** | 1x | **1.5x** | 0.5x | 1x |
| **DevOps** | 1x | 0.5x | -- | **1.5x** | 1x | **1.5x** | 0.5x |
| **Testing** | 0.5x | 1x | 0.5x | -- | **1.5x** | 1x | **1.5x** |
| **Architecture** | **1.5x** | 0.5x | 1x | 0.5x | -- | **1.5x** | 1x |
| **Security** | 1x | **1.5x** | 0.5x | 1x | 0.5x | -- | **1.5x** |
| **AI** | **1.5x** | 1x | **1.5x** | 0.5x | 1x | 0.5x | -- |

## Add a BugMon Enemy

BugMon is data-driven. Add a new enemy by editing a single JSON file — no code changes needed:

```json
{
  "id": 32,
  "name": "YourBugName",
  "type": "frontend",
  "hp": 30, "attack": 7, "defense": 5, "speed": 6,
  "moves": ["layoutshift", "zindexwar"],
  "color": "#3498db",
  "sprite": "yourbugname"
}
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

## Contribute a BugMon

No coding required! Submit your own BugMon enemy in 4 steps:

1. [Open a new BugMon submission](../../issues/new?template=new-bugmon.yml)
2. Fill out the form with your BugMon's name, type, stats, and moves
3. A bot will validate your submission and show a battle preview
4. Once approved by a maintainer, your BugMon joins the game!

## Run Locally

```bash
git clone https://github.com/jpleva91/BugMon.git
cd BugMon
npm run serve
# Open http://localhost:8000
```

Any static file server works. No build step, no `npm install` required, no bundler.

### Development Commands

```bash
npm test                               # Run test suite (52 test files)
npm run simulate                       # Random battle matchup
npm run simulate -- --all --runs 100   # Full roster balance analysis
npm run build                          # Build single-file dist (~12 KB gzipped)
npm run budget                         # Check size budget compliance
npm run dev                            # Run CLI companion tool
npm run lint                           # Run ESLint
npm run format                         # Check formatting (Prettier)
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](ARCHITECTURE.md) | Technical architecture and system design |
| [Unified Architecture](docs/unified-architecture.md) | How AgentGuard and BugMon integrate |
| [AgentGuard](docs/agentguard.md) | Governance runtime specification |
| [Event Model](docs/event-model.md) | Canonical event schema and lifecycle |
| [Bug Event Pipeline](docs/bug-event-pipeline.md) | Signal normalization pipeline |
| [Roguelike Design](docs/roguelike-design.md) | Debugging-as-roguelike mechanics |
| [Plugin API](docs/plugin-api.md) | Extension points |
| [Sequence Diagrams](docs/sequence-diagrams.md) | System flow diagrams |
| [Agent-Native SDLC](docs/agent-sdlc-architecture.md) | Formal architecture brief and academic foundations |
| [Product Positioning](docs/product-positioning.md) | What this is and isn't |
| [Current Priorities](docs/current-priorities.md) | Active development phase |
| [Roadmap](ROADMAP.md) | Phased development plan |
| [Contributing](CONTRIBUTING.md) | How to contribute |
| [Lightweight Manifesto](LIGHTWEIGHT.md) | Zero-dependency philosophy |
| [Constraints](CONSTRAINTS.md) | Design constraints |

## Tech Stack

- Vanilla JavaScript (ES6 modules)
- HTML5 Canvas 2D
- Web Audio API (synthesized sounds)
- Zero runtime dependencies
- Dev tooling: esbuild + terser (build), custom test runner
- CI: GitHub Actions (deploy, validate, size check, CodeQL)

## License

Apache 2.0
