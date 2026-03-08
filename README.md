# BugMon

**A CLI that turns your real bugs into collectible monsters.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![npm](https://img.shields.io/badge/npm-bugmon-cb3837.svg)](https://www.npmjs.com/package/bugmon)
[![Play Now](https://img.shields.io/badge/Play-GitHub%20Pages-orange.svg)](https://jpleva91.github.io/BugMon/)
[![Size](https://img.shields.io/badge/gzipped-12_KB-brightgreen.svg)](LIGHTWEIGHT.md)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](LIGHTWEIGHT.md)

## Try it now

```bash
npx bugmon demo
```

No install. No config. No dependencies. A wild BugMon appears.

### Wrap your dev command

```bash
npx bugmon watch -- npm run dev
```

Every error spawns a monster. Fix the bug, defeat the monster. Your real coding activity (commits, PRs merged, bugs fixed) drives their evolution.

<p align="center">
  <img src="game/sprites/nullpointer.png" width="64" alt="NullPointer">
  <img src="game/sprites/racecondition.png" width="64" alt="RaceCondition">
  <img src="game/sprites/memoryleak.png" width="64" alt="MemoryLeak">
  <img src="game/sprites/deadlock.png" width="64" alt="Deadlock">
</p>

### Claude Code integration

Using [Claude Code](https://docs.anthropic.com/en/docs/claude-code)? BugMon hooks into your sessions — errors trigger encounters automatically.

```bash
npx bugmon claude-init
```

### CLI

```bash
# Watch mode — intercept errors in real time
npx bugmon watch -- npm run dev
npx bugmon watch -- node server.js
npx bugmon watch -- tsc --watch

# Scan mode — find bugs in your project
npx bugmon scan

# Collection
npx bugmon dex                    # View your BugDex
npx bugmon party                  # View your party
npx bugmon stats                  # Bug hunter level and XP

# Sync CLI ↔ browser game
npx bugmon sync
```

Install globally for the shorter `bugmon` command: `npm i -g bugmon`

30+ error patterns recognized across Node.js, TypeScript, ESLint, Jest/Vitest, merge conflicts, security findings, and CI output. Zero runtime dependencies.

## Browser Game

The optional browser companion is a full RPG — explore a tile-based world, battle wild BugMon, and watch your evolution progress. It syncs with the CLI in real time via WebSocket.

**[Play Now](https://jpleva91.github.io/BugMon/)** — the entire game fits in a single 12 KB file (gzipped, smaller than jQuery).

### Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| Move | Arrow keys | D-pad |
| Confirm | Enter | A button |
| Back | Escape | B button |

### Battle Options

- **Fight** — Pick a move. Faster BugMon acts first.
- **Capture** — Lower HP = higher catch chance. Failed capture = enemy gets a free turn.
- **Run** — Always succeeds.

## Add a BugMon in Under 2 Minutes

BugMon is data-driven. Add a new monster by editing a single JSON file — no code changes needed:

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

## Features

- **31 BugMon** across 7 types with 7 evolution chains (10 evolved forms)
- **CLI encounter engine** — wraps your dev commands, classifies real errors, spawns matching BugMon
- **Dev-activity evolution** — your commits, PRs, and bug fixes trigger monster evolutions via git hooks
- **Browser ↔ CLI sync** — cache BugMon in your terminal, see them in the browser game instantly
- Turn-based combat with speed priority, type effectiveness, and critical hits
- Tile-based exploration with random encounters in tall grass
- Cache mechanic with HP-based probability
- Synthesized sound effects (Web Audio API — zero audio files)
- Mobile touch controls (D-pad + A/B buttons)
- Save/load with auto-save and BugDex collection tracking
- **Zero runtime dependencies** — vanilla JS, HTML5 Canvas, no framework ([see the Lightweight Manifesto](LIGHTWEIGHT.md))

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

## Contribute a BugMon

No coding required! Submit your own BugMon in 4 steps:

1. [Open a new BugMon submission](../../issues/new?template=new-bugmon.yml)
2. Fill out the form with your BugMon's name, type, stats, and moves
3. A bot will validate your submission and show a battle preview
4. Once approved by a maintainer, your BugMon joins the game!

See the [issue template](../../issues/new?template=new-bugmon.yml) to get started.

## Run Locally

```bash
git clone https://github.com/jpleva91/BugMon.git
cd BugMon
python3 -m http.server
# Open http://localhost:8000
```

Any static file server works. No build step, no `npm install`, no bundler.

### Development Commands

```bash
npm test                               # Run test suite
npm run simulate                       # Random battle matchup
npm run simulate -- --all --runs 100   # Full roster balance analysis
npm run build                          # Build single-file dist/bugmon.html (~19 KB gzipped)
npm run budget                         # Check size budget compliance
npm run dev                            # Run CLI companion tool
```

## Architecture

```
BugMon/
├── core/                # CLI encounter engine (Node.js)
│   ├── cli/             # CLI tool (bugmon command, watch adapter, sync server)
│   ├── matcher.js       # Error → BugMon matching
│   └── error-parser.js  # Error & stack trace parsing
├── game/                # Browser game (client-side)
│   ├── game.js          # Game loop and orchestration
│   ├── engine/          # State machine, input, rendering, title screen
│   ├── battle/          # Turn-based battle engine + damage calc
│   ├── world/           # Map, player, encounters
│   ├── evolution/       # Dev-activity evolution system + animation
│   ├── audio/           # Synthesized sound effects (Web Audio API)
│   ├── sync/            # Save/load + CLI↔browser sync
│   └── sprites/         # Sprites + procedural generation
├── ecosystem/           # Game content & metagame
│   ├── data/            # JSON + JS modules (monsters, moves, types, evolutions, map)
│   ├── bugdex.js        # BugDex collection system
│   └── bosses.js        # Boss definitions
├── domain/              # Pure domain logic (battle, encounters, evolution, ingestion)
├── tests/               # Test suite (52 test files)
├── scripts/             # Build tooling (single-file builder, data sync)
└── simulation/          # Headless battle simulation (strategies, RNG, reports)
```

All game content (monsters, moves, types, evolutions) is defined in JSON and loaded at runtime. The engine never hardcodes game data. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical breakdown.

## Contributing

We welcome contributions! The easiest way to contribute is adding new BugMon or moves — it only takes a JSON edit.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Tech Stack

- Vanilla JavaScript (ES6 modules)
- HTML5 Canvas 2D
- Web Audio API (synthesized sounds)
- Zero runtime dependencies
- Dev tooling: esbuild + terser (build), custom test runner
- CI: GitHub Actions (deploy, validate, size check)

## License

MIT
