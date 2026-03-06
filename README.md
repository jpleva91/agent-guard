# BugMon

**Developer monsters battling in a type-safe ecosystem.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Play Now](https://img.shields.io/badge/Play-GitHub%20Pages-orange.svg)](https://jpleva91.github.io/BugMon/)
[![Size](https://img.shields.io/badge/gzipped-12_KB-brightgreen.svg)](LIGHTWEIGHT.md)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](LIGHTWEIGHT.md)

> The Pokémon game developers deserve.

A monster-taming RPG where the monsters are software bugs, the types are programming domains, and your real coding activity drives your monsters' evolution. Commit code, your BugMon evolve. Merge a PR, unlock new forms. Fix bugs, encounter rare creatures.

Fun for devs at every stage — whether you just wrote your first `Hello World` or you're debugging distributed systems.

Built with zero runtime dependencies, pure vanilla JS, and way too many puns. The entire game fits in a single 21 KB file (gzipped, smaller than jQuery).

**[Play Now](https://jpleva91.github.io/BugMon/)**

<p align="center">
  <img src="sprites/nullpointer.png" width="64" alt="NullPointer">
  <img src="sprites/racecondition.png" width="64" alt="RaceCondition">
  <img src="sprites/memoryleak.png" width="64" alt="MemoryLeak">
  <img src="sprites/deadlock.png" width="64" alt="Deadlock">
  <img src="sprites/offbyone.png" width="64" alt="OffByOne">
  <img src="sprites/mergeconflict.png" width="64" alt="MergeConflict">
  <img src="sprites/callbackhell.png" width="64" alt="CallbackHell">
  <img src="sprites/heisenbug.png" width="64" alt="Heisenbug">
</p>

## CLI Debugging Tool

BugMon also works as a CLI that wraps your dev commands and turns real errors into monster encounters:

```bash
bugmon watch -- npm run dev
bugmon watch -- node server.js
bugmon dex                      # View your BugDex
bugmon stats                    # View your bug hunter level and XP
```

Errors pass through unchanged — BugMon augments, never hides.

## Add a BugMon in Under 2 Minutes

BugMon is data-driven. Add a new monster by editing a single JSON file -- no code changes needed:

```json
{
  "id": 31,
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

- **30 BugMon** across 7 types with 7 evolution chains (10 evolved forms)
- **Dev-activity evolution** — your commits, PRs, and bug fixes trigger monster evolutions via git hooks
- **CLI companion** — wrap your dev commands with `bugmon watch`, turn real errors into encounters
- **Browser ↔ CLI sync** — cache BugMon in your terminal, see them in the browser game instantly
- Turn-based combat with speed priority, type effectiveness, and critical hits
- Tile-based exploration with random encounters in tall grass
- Cache mechanic with HP-based probability
- Synthesized sound effects (Web Audio API — zero audio files)
- Mobile touch controls (D-pad + A/B buttons)
- Save/load with auto-save and BugDex collection tracking
- **Zero runtime dependencies** — vanilla JS, HTML5 Canvas, no framework ([see the Lightweight Manifesto](LIGHTWEIGHT.md))

## How to Play

Walk through the world and step into tall grass to encounter wild BugMon.

### Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| Move | Arrow keys | D-pad |
| Confirm | Enter | A button |
| Back | Escape | B button |

### Battle Options

- **Fight** -- Pick a move. Faster BugMon acts first.
- **Capture** -- Lower HP = higher catch chance. Failed capture = enemy gets a free turn.
- **Run** -- Always succeeds.

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
npm run build                          # Build single-file dist/bugmon.html (~21 KB gzipped)
npm run budget                         # Check size budget compliance
npm run dev                            # Run CLI companion tool
```

## Architecture

```
BugMon/
├── game.js              # Game loop and orchestration
├── engine/              # State machine, input, rendering, title screen
├── battle/              # Turn-based battle engine + damage calc
├── world/               # Map, player, encounters
├── evolution/           # Dev-activity evolution system + animation
├── data/                # JSON content (monsters, moves, types, evolutions, map)
├── audio/               # Synthesized sound effects (Web Audio API)
├── sync/                # Save/load + CLI↔browser sync
├── sprites/             # Sprites + procedural generation
├── tests/               # Test suite (battle, damage, data, build, simulation)
├── scripts/             # Build tooling (single-file builder, data sync)
└── cli/                 # CLI debugging companion
    ├── bin.js           # Entry point
    ├── core/            # Error & stacktrace parsers
    ├── monsters/        # Error → monster matching
    ├── bugdex/          # BugDex persistence
    ├── ui/              # Terminal renderer (ANSI)
    └── adapters/        # CLI watch adapter
```

All game content (monsters, moves, types, evolutions) is defined in JSON and loaded at runtime. The engine never hardcodes game data. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical breakdown.

## Contributing

We welcome contributions! The easiest way to contribute is adding new BugMon or moves -- it only takes a JSON edit.

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
