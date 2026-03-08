# AgentGuard

**Deterministic runtime guardrails for AI-assisted software systems.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![npm](https://img.shields.io/badge/npm-agentguard-cb3837.svg)](https://www.npmjs.com/package/agentguard)
[![Play BugMon](https://img.shields.io/badge/BugMon-Play%20Now-orange.svg)](https://jpleva91.github.io/BugMon/)
[![Size](https://img.shields.io/badge/gzipped-12_KB-brightgreen.svg)](LIGHTWEIGHT.md)
[![Dependencies](https://img.shields.io/badge/browser_deps-0-brightgreen.svg)](LIGHTWEIGHT.md)

---

AgentGuard is an execution safety and observability platform for AI-assisted development. It monitors agent actions against declared policies and invariants, producing canonical events when violations occur.

**[BugMon](https://jpleva91.github.io/BugMon/)** is the gamified interface that visualizes system failures as monsters you battle while coding.

```
error detected  -->  policy evaluated  -->  event emitted  -->  monster spawns  -->  fix bug  -->  victory
```

<p align="center">
  <img src="game/sprites/nullpointer.png" width="64" alt="NullPointer">
  <img src="game/sprites/racecondition.png" width="64" alt="RaceCondition">
  <img src="game/sprites/memoryleak.png" width="64" alt="MemoryLeak">
  <img src="game/sprites/deadlock.png" width="64" alt="Deadlock">
</p>

## Quick Start

```bash
# Watch a command — errors become events
npx agentguard watch -- npm test

# Launch BugMon mode — gamified debugging
npx agentguard play

# No install. No config. No dependencies.
```

## How It Works

AgentGuard has two layers:

### Layer 1: Runtime Guardrails (Infrastructure)

AgentGuard evaluates AI agent actions against deterministic policies and invariants. When violations occur, it produces canonical events — structured, typed, auditable records of what happened.

```bash
agentguard watch -- npm run dev      # Monitor for errors and violations
agentguard scan ./src                # Scan files for bugs (eslint/tsc)
agentguard replay --last             # Replay a session timeline
```

### Layer 2: BugMon Mode (Gamified Interface)

BugMon consumes canonical events and renders them as roguelike encounters. Coding sessions are dungeon runs. Errors are enemies. CI failures are bosses.

```bash
agentguard play                      # Launch BugMon mode
agentguard watch --cache -- npm test  # Interactive: battle & cache BugMon!
agentguard dex                       # View your Bug Grimoire
```

### Examples

```
  Watching test output...

  ⚠ Error detected
  Spawned: NullPointer Beetle (Lv.3)

  [idle] NullPointer defeated         +15 XP     TypeError
  [idle] TypeCoercion defeated        +10 XP     lint warning
  [idle] ImportError defeated         +15 XP     module not found

  ⚠ BOSS: CI Dragon appeared!                    CIFailure
  ████████████████████████████░░  HP: 500/500    severity: 4
  Pipeline failed: deploy job exited with code 1
  .github/workflows/deploy.yml
  [1] Fight  [2] Run
```

## Plugin Architecture

AgentGuard uses a **SourceRegistry** to manage where signals come from. Any tool, service, or workflow that produces error output can be a source.

### Built-in Sources

| Source | Description |
|--------|-------------|
| `watch` | Wraps a child process, captures stderr errors |
| `scan` | Runs linters/compilers (eslint, tsc), captures output |
| `claude-hook` | Captures errors from Claude Code sessions |

### Write a Custom Source

```javascript
import { SourceRegistry } from './domain/source-registry.js';
import { EventBus } from './domain/event-bus.js';
import { ingest } from './domain/ingestion/pipeline.js';

const registry = new SourceRegistry({ eventBus: new EventBus(), ingest });

registry.register({
  name: 'my-ci-watcher',
  start(onRawSignal) {
    // Feed raw error text into the pipeline
    onRawSignal('TypeError: Cannot read properties of undefined');
  },
  stop() {},
});

registry.start();
```

Any raw text fed to `onRawSignal` goes through the ingestion pipeline (parse, fingerprint, classify) and becomes a canonical event on the EventBus.

See [Plugin API](docs/plugin-api.md) for the full extension guide.

## Features

### AgentGuard (Governance Runtime)
- **Deterministic policy evaluation** — declare what agents can and cannot do
- **Invariant monitoring** — system-wide constraints that must never be violated
- **Action Authorization Boundary** — central gatekeeper for all agent actions
- **Evidence packs** — full audit trail for every decision
- **Escalation levels** — normal, elevated, high, lockdown
- **Canonical event model** — 40+ structured event types

### BugMon Mode (Gamified Interface)
- **40+ error patterns** — JavaScript, TypeScript, Python, Go, Rust, Java, ESLint, CI output
- **Bug Grimoire** — compendium of every enemy type defeated, with encounter history
- **Dev-activity progression** — commits, PRs, and bug fixes drive level-ups via git hooks
- **34 named enemies** across 7 types — community-contributed creatures with sprites and lore
- **Hybrid idle/active** — minor enemies auto-resolve, bosses demand engagement
- Turn-based combat with speed priority, type effectiveness, critical hits, and passive abilities
- Synthesized sound effects (Web Audio API — zero audio files)
- **Zero browser runtime dependencies** — vanilla JS, HTML5 Canvas, no framework

## The Roguelike Model

Coding sessions are **runs**. Errors are **enemies**. CI failures are **bosses**.

| Software Development | Roguelike Mechanic |
|---------------------|-------------------|
| Coding session | Run |
| Lint warning | Weak enemy (idle) |
| Type error | Minor enemy (idle) |
| Test failure | Strong enemy (active) |
| CI failure | Boss (active) |
| Bug fix | Enemy defeated |
| Policy violation | Elite boss |

Minor enemies auto-resolve while you code. Boss encounters interrupt your session and require active input. Governance violations from AgentGuard spawn elite bosses. The **Bug Grimoire** records every enemy type you've defeated.

See [docs/roguelike-design.md](docs/roguelike-design.md) for the full design.

## CLI

```bash
# === AgentGuard Core ===
npx agentguard watch -- npm run dev       # Monitor errors in real time
npx agentguard watch -- tsc --watch       # Watch TypeScript compilation
npx agentguard scan                       # Scan for bugs (eslint/tsc)
npx agentguard replay --last              # Replay last session

# === BugMon Mode ===
npx agentguard play                       # Launch BugMon mode
npx agentguard watch --cache -- npm test  # Interactive battle mode
npx agentguard dex                        # View your Bug Grimoire
npx agentguard stats                      # Bug hunter level and XP
npx agentguard party                      # View your BugMon party

# === Tools ===
npx agentguard sync                       # Sync CLI <-> browser game
npx agentguard init                       # Install git hooks
npx agentguard claude-init                # Set up Claude Code integration
```

Install globally: `npm i -g agentguard`

The `bugmon` binary is also available as an alias for backwards compatibility.

## Governance Integration

AgentGuard's governance runtime evaluates agent actions against declared policies and invariants. Violations produce canonical events that BugMon renders as elite boss encounters.

```
  ⚠ GOVERNANCE: Invariant Titan appeared!         InvariantViolation
  ██████████████████████████████  HP: 600/600    severity: 5
  Agent modified production schema outside scope
  src/database/schema.sql
  [1] Fight  [2] Run
```

See [docs/agentguard.md](docs/agentguard.md) for the governance runtime specification.

## Claude Code Integration

Using [Claude Code](https://docs.anthropic.com/en/docs/claude-code)? AgentGuard hooks into your sessions — errors trigger encounters automatically.

```bash
npx agentguard claude-init
```

## Browser Game

The BugMon browser companion provides a visual roguelike experience — explore a tile-based dungeon, battle enemies, and track your Grimoire progress. It syncs with the CLI in real time via WebSocket.

**[Play Now](https://jpleva91.github.io/BugMon/)** — the entire game fits in a single 12 KB file (gzipped, smaller than jQuery).

### Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| Move | Arrow keys | D-pad |
| Confirm | Enter | A button |
| Back | Escape | B button |

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    AgentGuard Platform                        │
├────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────────────────────────────────────────────┐     │
│   │              Governance Runtime                    │     │
│   │   policies │ invariants │ AAB │ evidence packs    │     │
│   └──────────────────────┬───────────────────────────┘     │
│                           │ canonical events                 │
│   ┌──────────────────────┴───────────────────────────┐     │
│   │              Event Sources (plugins)               │     │
│   │   stderr │ test output │ linter │ CI │ custom     │     │
│   └──────────────────────┬───────────────────────────┘     │
│                           │                                  │
│            ┌──────────────┼──────────────┐                  │
│            ▼              ▼              ▼                  │
│     ┌───────────┐ ┌──────────┐ ┌──────────┐              │
│     │ Terminal  │ │ BugMon   │ │  Bug     │              │
│     │ Renderer  │ │ Browser  │ │ Grimoire │              │
│     │           │ │ Game     │ │          │              │
│     │ CLI mode  │ │ play mode│ │ history  │              │
│     └───────────┘ └──────────┘ └──────────┘              │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

### Repository Structure

```
AgentGuard/
├── src/                    # TypeScript source (single source of truth)
│   ├── agentguard/         # Governance runtime (deterministic RTA)
│   │   ├── core/           # AAB + RTA engine
│   │   ├── policies/       # Policy evaluation + loading
│   │   ├── invariants/     # Invariant checking
│   │   └── evidence/       # Evidence pack generation
│   ├── cli/                # CLI interface (agentguard command)
│   │   └── commands/       # Subcommands (watch, scan, play, etc.)
│   ├── core/               # Shared logic (EventBus, parsing, matching)
│   ├── domain/             # Pure domain logic (no DOM, no Node.js APIs)
│   │   ├── ingestion/      # Error normalization pipeline
│   │   └── pipeline/       # Multi-agent pipeline orchestration
│   ├── game/               # BugMon browser game (client-side)
│   │   ├── engine/         # State machine, input, rendering
│   │   ├── battle/         # Turn-based battle engine
│   │   ├── world/          # Map, player, encounters
│   │   ├── evolution/      # Dev-activity progression
│   │   ├── audio/          # Synthesized sounds (Web Audio API)
│   │   └── sprites/        # Sprites + procedural generation
│   ├── ecosystem/          # Game content & metagame
│   └── watchers/           # Environment watchers
├── dist/                   # Compiled output (tsc + esbuild)
├── ecosystem/data/         # Game content (JSON + JS modules)
├── policy/                 # Policy configuration (JSON)
├── simulation/             # Headless battle simulation
├── tests/                  # Test suite (77 JS + 16 TS)
└── docs/                   # System documentation
```

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
npm run build:ts     # Compile TypeScript
npm run serve        # Start dev server
# Open http://localhost:8000
```

### Development Commands

```bash
npm test                               # Run test suite
npm run simulate                       # Random battle matchup
npm run simulate -- --all --runs 100   # Full roster balance analysis
npm run build                          # Build single-file dist (~12 KB gzipped)
npm run budget                         # Check size budget compliance
npm run dev                            # Run AgentGuard CLI
npm run lint                           # Run ESLint
npm run format                         # Check formatting (Prettier)
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](ARCHITECTURE.md) | Technical architecture and system design |
| [AgentGuard](docs/agentguard.md) | Governance runtime specification |
| [Unified Architecture](docs/unified-architecture.md) | How AgentGuard and BugMon integrate |
| [Plugin API](docs/plugin-api.md) | Event sources, content packs, renderers |
| [Roguelike Design](docs/roguelike-design.md) | BugMon mode mechanics |
| [Event Model](docs/event-model.md) | Canonical event schema and lifecycle |
| [Bug Event Pipeline](docs/bug-event-pipeline.md) | Signal normalization pipeline |
| [Agent-Native SDLC](docs/agent-sdlc-architecture.md) | Formal architecture brief |
| [Product Positioning](docs/product-positioning.md) | What this is and isn't |
| [Sequence Diagrams](docs/sequence-diagrams.md) | System flow diagrams |
| [Roadmap](ROADMAP.md) | Phased development plan |
| [Contributing](CONTRIBUTING.md) | How to contribute |
| [Lightweight Manifesto](LIGHTWEIGHT.md) | Zero-dependency philosophy |

## Tech Stack

- TypeScript (source of truth in `src/`, compiled to `dist/` via tsc + esbuild)
- HTML5 Canvas 2D
- Web Audio API (synthesized sounds)
- Zero browser runtime dependencies; CLI uses `chokidar`, `commander`, `pino`
- Dev tooling: esbuild + terser (build), vitest (TS tests), custom test runner (JS tests)
- CI: GitHub Actions (deploy, validate, size check, CodeQL)

## License

[Apache 2.0](LICENSE)
