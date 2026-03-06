# CLAUDE.md — AI Assistant Guide for BugMon

## Project Overview

BugMon is a Pokémon-style monster-taming RPG browser game themed around software bugs. Players explore a tile-based world, encounter wild "BugMon" (creatures named after programming bugs like NullPointer, MergeConflict, StackOverflow), battle them with turn-based combat, and catch them for their party. BugMon evolve based on real developer activity (commits, PRs merged, bugs fixed) instead of XP grinding.

**Key characteristics:**
- 100% client-side, zero runtime dependencies
- Vanilla JavaScript (ES6 modules), HTML5 Canvas 2D, Web Audio API
- Build tooling: esbuild + terser (dev dependencies only)
- Deployed to GitHub Pages
- Community BugMon submissions via GitHub Issues + automated validation
- Layered architecture: `core/` (CLI), `game/` (browser), `ecosystem/` (shared data)

## Quick Start

No build step required. Serve with any static file server:

```bash
npm run serve
# or: python3 -m http.server
# Then open http://localhost:8000
```

## Project Structure

The codebase follows a **layered architecture** with three top-level directories:

```
BugMon/
├── index.html              # Entry point (canvas, inline CSS, touch controls)
├── simulate.js             # Battle simulator CLI (node simulate.js)
├── package.json            # Node.js config for scripts
│
├── core/                   # CLI companion & shared logic (Node.js)
│   ├── matcher.js          # Error → BugMon matching logic
│   ├── error-parser.js     # Error message parser
│   ├── stacktrace-parser.js # Stack trace analysis
│   ├── bug-event.js        # Bug event definitions
│   └── cli/                # CLI tool (bugmon command)
│       ├── bin.js           # Entry point (bugmon command)
│       ├── adapter.js       # CLI watch adapter
│       ├── catch.js         # Catch/cache mechanic
│       ├── encounter.js     # CLI encounter logic
│       ├── renderer.js      # Terminal renderer (ANSI)
│       ├── sync-server.js   # WebSocket sync server (zero deps)
│       └── ...              # Other CLI modules
│
├── game/                   # Browser game (client-side)
│   ├── game.js             # Game loop orchestration (entry point for JS)
│   ├── engine/             # Core framework systems
│   │   ├── state.js        # Game state machine (EXPLORE, BATTLE_TRANSITION, BATTLE, MENU)
│   │   ├── input.js        # Unified keyboard + touch input
│   │   ├── renderer.js     # Canvas 2D drawing
│   │   ├── transition.js   # Battle transition animation
│   │   ├── title.js        # Title screen (ASCII logo, starfield, menu)
│   │   └── events.js       # EventBus for decoupled communication between systems
│   ├── world/              # Overworld / exploration
│   │   ├── map.js          # Map data, tile queries, collision
│   │   ├── player.js       # Player state, movement, party
│   │   └── encounters.js   # Random wild encounter logic (10% in tall grass)
│   ├── battle/             # Combat systems
│   │   ├── battle-core.js  # Pure battle engine (no UI/audio/DOM) — two APIs
│   │   ├── battleEngine.js # UI-connected battle state machine
│   │   └── damage.js       # Damage calculation formula
│   ├── evolution/          # Evolution system
│   │   ├── evolution.js    # Checks conditions, triggers evolutions
│   │   ├── tracker.js      # Dev activity tracker (localStorage + .events.json)
│   │   └── animation.js    # Evolution visual sequence (flash, morph, reveal)
│   ├── audio/              # Sound synthesis (no audio files)
│   │   └── sound.js        # Web Audio API synthesized effects
│   ├── sync/               # Save/sync system
│   │   ├── save.js         # Browser-side save/load (localStorage)
│   │   └── client.js       # Client-side sync (WebSocket to CLI)
│   └── sprites/            # Pixel art and rendering
│       ├── sprites.js      # Image loader with preload/fallback
│       ├── monsterGen.js   # Procedural monster sprite generation
│       ├── tiles.js        # Procedural tile texture generation
│       └── *.png           # 64x64 battle sprites, 32x32 player sprites
│
├── ecosystem/              # Game content & metagame systems
│   ├── data/               # Game content (JSON source + JS modules)
│   │   ├── monsters.json   # 30 BugMon definitions (stats, moves, types, evolutions)
│   │   ├── monsters.js     # Inlined JS module (imported by game)
│   │   ├── moves.json      # 69 move definitions
│   │   ├── moves.js        # Inlined JS module
│   │   ├── types.json      # 7 types + effectiveness chart
│   │   ├── types.js        # Inlined JS module
│   │   ├── evolutions.json # Evolution chains with dev-activity triggers
│   │   ├── evolutions.js   # Inlined JS module
│   │   ├── map.json        # 15x10 tile grid
│   │   └── mapData.js      # Inlined JS module
│   ├── bugdex.js           # BugDex collection system
│   ├── bugdex-spec.js      # BugDex specification
│   ├── bosses.js           # Boss encounter definitions
│   └── storage.js          # Shared storage utilities
│
├── simulation/             # Headless battle simulation
│   ├── cli.js              # CLI entry point (seeded RNG version)
│   ├── simulator.js        # Battle simulator engine
│   ├── headlessBattle.js   # Headless battle runner
│   ├── strategies.js       # AI battle strategies
│   ├── report.js           # Simulation report generator
│   └── rng.js              # Seeded random number generator
│
├── examples/               # Error examples for CLI testing
│
├── tests/                  # Test suite (8 test files)
│   ├── run.js              # Test runner
│   └── *.test.js           # Tests (battle, damage, data, build, simulation, strategies, rng, report)
│
├── scripts/                # Build tooling
│   ├── build.js            # Single-file builder (esbuild + terser → dist/index.html)
│   └── sync-data.js        # JSON → JS module converter
│
├── hooks/                  # Git hooks for dev activity tracking
│   ├── post-commit         # Increments commit counter in .events.json
│   └── post-merge          # Increments merge counter in .events.json
│
├── .github/
│   ├── workflows/
│   │   ├── deploy.yml          # GitHub Pages auto-deploy on push to main
│   │   ├── validate-bugmon.yml # Validates community BugMon submissions
│   │   ├── approve-bugmon.yml  # Auto-adds approved BugMon to game data
│   │   ├── validate.yml        # General data validation
│   │   └── size-check.yml      # Bundle size check (enforces byte budget)
│   ├── scripts/
│   │   ├── validate-submission.cjs  # Parses + validates issue form data
│   │   ├── battle-preview.cjs       # Generates battle preview for submissions
│   │   ├── generate-bugmon.cjs      # Generates BugMon JSON from approved issue
│   │   └── validate-data.mjs        # Data validation script
│   └── ISSUE_TEMPLATE/
│       ├── new-bugmon.yml      # Issue form for community BugMon submissions
│       ├── new-move.yml        # Issue form for new move submissions
│       ├── bug-report.yml      # Bug report template
│       └── balance-report.yml  # Balance issue reports
│
├── ARCHITECTURE.md         # Detailed technical architecture
├── ROADMAP.md              # Milestone planning and feature backlog
└── README.md               # User-facing guide
```

## Development Commands

```bash
# Serve locally
npm run serve

# Run tests
npm test

# Run battle simulation (random matchup, verbose)
npm run simulate

# Specific matchup
npm run simulate -- NullPointer Deadlock

# Statistical analysis
npm run simulate -- NullPointer Deadlock --runs 1000

# Full roster round-robin
npm run simulate -- --all

# Legacy simulation (seeded RNG)
npm run simulate:quick   # 1,000 battles
npm run simulate:full    # 50,000 battles

# Build single-file distribution
npm run build            # Full build with inline sprites
npm run build:tiny       # Build without sprites (smallest)
npm run budget           # Check size budget compliance

# Sync JSON data → JS modules
npm run sync-data

# Run CLI companion tool
npm run dev
```

## Architecture & Key Patterns

### Layered Architecture
The codebase is organized into three layers:
- **core/** — Node.js code for the CLI companion tool. Runs in Node.js only.
- **game/** — Browser game code (engine, battle, world, evolution, audio, sprites). Runs in the browser only.
- **ecosystem/** — Shared game content (JSON data, inlined JS modules, BugDex, bosses). Consumed by both core/ and game/.

### ES6 Modules
All source uses ES6 `import`/`export`. No CommonJS, no bundler. Browser loads `game/game.js` as a module via `<script type="module">`. GitHub scripts use `.cjs` extension for CommonJS (Node.js workflow context).

### Data as Inlined JS Modules
Game data lives in `ecosystem/data/` as both JSON (source of truth) and JS modules (imported by the game). The game imports JS modules directly — no runtime `fetch()` needed:
```js
// In game/game.js
import { MONSTERS } from '../ecosystem/data/monsters.js';
import { MOVES } from '../ecosystem/data/moves.js';
```
To regenerate JS modules from JSON: `npm run sync-data`

Some modules still use setter functions (e.g., `setMonstersData()`) for flexibility.

### Event Bus
`game/engine/events.js` provides a decoupled pub/sub system for cross-module communication:
```js
import { eventBus, Events } from './engine/events.js';
eventBus.on(Events.BUGMON_FAINTED, (data) => { ... });
eventBus.emit(Events.BUGMON_FAINTED, { name: 'NullPointer' });
```

### Game State Machine
Defined in `game/engine/state.js`. States:
- **EXPLORE** — grid-based overworld movement
- **BATTLE_TRANSITION** — flash + fade animation (860ms)
- **BATTLE** — turn-based combat with menu system
- **MENU** — settings/party management (future)

### Battle System
Two battle APIs coexist in `game/battle/battle-core.js`:
1. **Original API** (`executeTurn`, `simulateBattle`) — used by `simulate.js` and `battleEngine.js`
2. **Spec-based API** (`resolveTurn`, `createPureBattleState`) — fully immutable, PP tracking, accuracy

Turn order: faster BugMon goes first (ties: player wins). Battle uses a message queue pattern with callbacks for action chaining.

### Damage Formula
```
damage = (power + attack - floor(defense / 2) + random(1-3)) * typeMultiplier
```
Type multipliers: 0.5x (not effective), 1.0x (neutral), 1.5x (super effective).

### Evolution System
BugMon evolve based on real developer activity tracked via git hooks and localStorage:
- `game/evolution/tracker.js` — tracks events (commits, PRs merged, bugs fixed, etc.)
- `game/evolution/evolution.js` — checks if conditions are met for evolution
- `game/evolution/animation.js` — renders the evolution visual sequence
- `ecosystem/data/evolutions.json` — defines evolution chains and trigger conditions
- `hooks/post-commit` / `hooks/post-merge` — write to `.events.json` for the tracker

### Sprite System
PNG sprites are preloaded at startup. If a sprite fails to load, a colored rectangle fallback is rendered. Tile textures are procedurally generated at runtime (no tile image files).

## Coding Conventions

- **camelCase** for functions and variables
- **UPPER_SNAKE_CASE** for constants (e.g., `STATES`, `TILE`, `Events`)
- **const/let** only, no `var`
- Arrow functions preferred
- No external dependencies — keep it zero-dependency
- `imageSmoothingEnabled = false` on canvas for crisp pixel art
- All audio is synthesized at runtime via Web Audio API (no audio files)
- Try-catch around AudioContext creation (browser compatibility)
- Console.error for startup failures, null checks for optional data

## Data Formats

### monsters.json
```json
{ "id": 1, "name": "NullPointer", "type": "backend",
  "hp": 30, "attack": 8, "defense": 4, "speed": 6,
  "moves": ["segfault", "unhandledexception", "memoryaccess"],
  "color": "#e74c3c", "sprite": "nullpointer",
  "rarity": "common", "theme": "runtime error",
  "evolution": "OptionalChaining", "evolvesTo": 21,
  "passive": null, "description": "..." }
```
Rarities: `common`, `uncommon`, `legendary`, `evolved`.

### moves.json
```json
{ "id": "segfault", "name": "SegFault", "power": 10, "type": "backend" }
```

### types.json
7 types: `frontend`, `backend`, `devops`, `testing`, `architecture`, `security`, `ai`. Effectiveness chart is a nested object mapping attacker type → defender type → multiplier.

### evolutions.json
Defines evolution chains with dev-activity triggers:
```json
{ "id": "callback_chain", "name": "Async Evolution",
  "stages": [{ "monsterId": 2, "name": "CallbackHell" }, ...],
  "triggers": [{ "from": 2, "to": 23,
    "condition": { "event": "commits", "count": 10 },
    "description": "Make 10 commits" }] }
```

### map.json
`{ "width": 15, "height": 10, "tiles": [[...], ...] }` — tile values: 0=ground, 1=wall, 2=grass.

## CI/CD

- **Deploy**: GitHub Pages auto-deploy on push to `main` or `master` (`.github/workflows/deploy.yml`). Uses esbuild + terser build pipeline.
- **Data Validation**: `.github/workflows/validate.yml` validates game data on push.
- **Size Check**: `.github/workflows/size-check.yml` enforces byte budget on every push.
- **BugMon Submissions**: Community can submit new BugMon via GitHub Issue template. `validate-bugmon.yml` auto-validates and previews. `approve-bugmon.yml` auto-adds approved submissions to game data.

## Testing

```bash
npm test                               # Run all tests (8 test files)
npm run simulate -- --all --runs 100   # Round-robin roster balance analysis
```

Test suite covers: battle logic, damage formula, data integrity, build output, simulation, strategies, RNG, reporting.

## When Adding New Content

### New BugMon
1. Add entry to `ecosystem/data/monsters.json` following existing schema (include `rarity`, `theme`, `passive`, `evolution` fields)
2. Add 64x64 PNG sprite to `game/sprites/` (filename matches `sprite` field)
3. Ensure moves referenced exist in `ecosystem/data/moves.json`
4. If it has an evolution, add the evolved form and update `ecosystem/data/evolutions.json`
5. Run `npm run sync-data` to regenerate JS modules from JSON
6. Run simulation to verify balance: `npm run simulate -- --all`

### New Moves
1. Add entry to `ecosystem/data/moves.json` following existing schema
2. Ensure the move's `type` exists in `ecosystem/data/types.json`
3. Run `npm run sync-data` to regenerate JS modules

### New Evolution Chain
1. Add chain to `ecosystem/data/evolutions.json` with stages and trigger conditions
2. Add evolved BugMon entries to `ecosystem/data/monsters.json` with `rarity: "evolved"` and `evolvedFrom` field
3. Set `evolvesTo` on the base BugMon pointing to the evolved form's ID
4. Run `npm run sync-data` to regenerate JS modules

### New Map Tiles
1. Add tile type constant and collision logic in `game/world/map.js`
2. Add procedural texture generation in `game/sprites/tiles.js`
3. Update `ecosystem/data/map.json` with new tile values
4. Run `npm run sync-data` to regenerate JS modules
