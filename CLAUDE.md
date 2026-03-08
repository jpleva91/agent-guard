# CLAUDE.md — AI Assistant Guide

## Project Overview

AgentGuard + BugMon is a unified platform consisting of two layers:

- **AgentGuard** — Deterministic governance runtime for AI coding agents. Evaluates agent actions against declared policies and invariants. Produces canonical events when violations occur.
- **BugMon** — Roguelike developer telemetry game. Consumes canonical events (developer errors, CI failures, governance violations) and renders them as interactive encounters. Coding sessions are dungeon runs. Bugs are enemies. CI failures are bosses.

The system has one architectural spine: the **canonical event model**. All system activity becomes events. AgentGuard produces governance events. BugMon consumes all events as gameplay.

**Key characteristics:**
- Hybrid idle/active roguelike — minor enemies auto-resolve, bosses demand engagement
- Bug Grimoire instead of collection — compendium of defeated enemy types
- 100% client-side browser game, zero runtime dependencies
- Vanilla JavaScript (ES6 modules), HTML5 Canvas 2D, Web Audio API
- Build tooling: esbuild + terser (dev dependencies only)
- Deployed to GitHub Pages
- Community enemy submissions via GitHub Issues + automated validation
- Layered architecture: `core/` (CLI), `game/` (browser), `ecosystem/` (shared data), `domain/` (pure logic)

## Quick Start

No build step required. Start the dev server:

```bash
npm run serve    # Runs scripts/dev-server.js (zero deps, live reload)
# Then open http://localhost:8000
```

## Project Structure

The codebase follows a **layered architecture** with four top-level directories:

```
BugMon/
├── index.html              # Entry point (canvas, inline CSS, touch controls)
├── simulate.js             # Battle simulator CLI (node simulate.js)
├── package.json            # Node.js config for scripts
│
├── core/                   # CLI companion & shared logic (Node.js)
│   ├── matcher.js          # Error → BugMon enemy matching logic
│   ├── error-parser.js     # Error message parser (40+ patterns, 6+ languages)
│   ├── stacktrace-parser.js # Stack trace analysis
│   ├── bug-event.js        # Bug event definitions and severity mapping
│   └── cli/                # CLI tool (bugmon command)
│       ├── bin.js           # Entry point (bugmon command)
│       ├── adapter.js       # CLI watch adapter (event source)
│       ├── auto-walk.js     # Auto-walk feature
│       ├── boss-battle.js   # Boss battle interactive encounter
│       ├── catch.js         # Combat resolution mechanic
│       ├── claude-hook.js   # Claude Code PostToolUse hook (error encounters)
│       ├── claude-init.js   # Claude Code integration setup
│       ├── colors.js        # Shared ANSI color constants
│       ├── contribute.js    # Contribution prompt
│       ├── demo.js          # Demo encounter launcher
│       ├── encounter.js     # CLI encounter logic
│       ├── init.js          # Git hooks installer for progression tracking
│       ├── renderer.js      # Terminal renderer (ANSI)
│       ├── resolve.js       # Bug resolve/XP mechanic
│       ├── args.js          # Lightweight CLI argument parser (zero deps)
│       ├── scan.js          # Error scanning feature
│       ├── sync-server.js   # WebSocket sync server (zero deps)
│       └── bugmon-legacy.js # Legacy CLI version
│
├── game/                   # Browser roguelike (client-side)
│   ├── game.js             # Game loop orchestration (entry point for JS)
│   ├── engine/             # Core framework systems
│   │   ├── state.js        # Game state machine (TITLE, EXPLORE, BATTLE_TRANSITION, BATTLE, EVOLVING, MENU)
│   │   ├── input.js        # Unified keyboard + touch input
│   │   ├── renderer.js     # Canvas 2D drawing
│   │   ├── transition.js   # Battle transition animation
│   │   ├── title.js        # Title screen (ASCII logo, starfield, menu)
│   │   └── events.js       # EventBus for decoupled communication between systems
│   ├── world/              # Dungeon / exploration
│   │   ├── map.js          # Map data, tile queries, collision
│   │   ├── player.js       # Player state, movement
│   │   └── encounters.js   # Random encounter logic (10% in tall grass)
│   ├── battle/             # Combat systems
│   │   ├── battle-core.js  # Pure battle engine (no UI/audio/DOM)
│   │   ├── battleEngine.js # UI-connected battle state machine
│   │   └── damage.js       # Damage calculation formula
│   ├── evolution/          # Progression system
│   │   ├── evolution.js    # Checks conditions, triggers progressions
│   │   ├── tracker.js      # Dev activity tracker (localStorage + .events.json)
│   │   └── animation.js    # Progression visual sequence (flash, morph, reveal)
│   ├── audio/              # Sound synthesis (no audio files)
│   │   └── sound.js        # Web Audio API synthesized effects
│   ├── sync/               # Save/sync system
│   │   ├── save.js         # Browser-side save/load (localStorage)
│   │   └── client.js       # Client-side sync (WebSocket to CLI)
│   └── sprites/            # Pixel art and rendering
│       ├── sprites.js      # Image loader with preload/fallback
│       ├── monsterGen.js   # Procedural monster sprite generation
│       ├── tiles.js        # Procedural tile texture generation
│       ├── SPRITE_GUIDE.md # Sprite creation guide
│       └── *.png           # 64x64 battle sprites, 32x32 player sprites
│
├── ecosystem/              # Game content & metagame systems
│   ├── data/               # Game content (JSON source + JS modules)
│   │   ├── monsters.json   # 31 BugMon enemy definitions (stats, moves, types)
│   │   ├── monsters.js     # Inlined JS module (imported by game)
│   │   ├── moves.json      # 72 move definitions
│   │   ├── moves.js        # Inlined JS module
│   │   ├── types.json      # 7 types + effectiveness chart
│   │   ├── types.js        # Inlined JS module
│   │   ├── evolutions.json # Progression chains with dev-activity triggers
│   │   ├── evolutions.js   # Inlined JS module
│   │   ├── map.json        # 15x10 tile grid
│   │   └── mapData.js      # Inlined JS module
│   ├── bugdex.js           # Bug Grimoire system
│   ├── bugdex-spec.js      # Grimoire specification
│   ├── bosses.js           # Boss encounter definitions
│   ├── storage.js          # Shared storage utilities
│   └── sync-protocol.js    # Shared WebSocket sync protocol constants
│
├── domain/                 # Pure domain logic (no DOM, no Node.js-specific APIs)
│   ├── battle.js           # Pure battle engine (deterministic with injected RNG)
│   ├── encounters.js       # Pure encounter logic (rarity weights, trigger checks)
│   ├── event-bus.js        # Universal EventBus (works in Node.js and browser)
│   ├── events.js           # Canonical domain event definitions
│   ├── evolution.js        # Pure progression engine (no localStorage)
│   └── ingestion/          # Error ingestion pipeline
│       ├── pipeline.js     # Orchestrates: parse → fingerprint → classify → map
│       ├── parser.js       # Error message and stack trace parsing
│       ├── fingerprint.js  # Error deduplication via stable fingerprinting
│       ├── classifier.js   # Parsed error → BugEvent classification
│       └── species-mapper.js # BugEvent → BugMon species mapping
│
├── simulation/             # Headless battle simulation
├── tests/                  # Test suite (52 test files)
├── scripts/                # Build tooling
├── docs/                   # System documentation
├── hooks/                  # Git hooks for dev activity tracking
└── .github/                # CI/CD workflows and issue templates
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

# Build single-file distribution
npm run build            # Full build with inline sprites
npm run build:tiny       # Build without sprites (smallest)
npm run build:debug      # Build with sourcemaps
npm run budget           # Check size budget compliance

# Sync JSON data → JS modules
npm run sync-data

# Code quality
npm run lint             # Run ESLint
npm run lint:fix         # Run ESLint with auto-fix
npm run format           # Check formatting (Prettier)
npm run format:fix       # Fix formatting (Prettier)
npm run test:coverage    # Run tests with coverage (c8, 50% line threshold)

# Run CLI companion tool
npm run dev
```

## Architecture & Key Patterns

### Unified System Model
The system has one architectural spine: the canonical event model.
- **AgentGuard** (governance runtime) produces events from policy violations
- **BugMon** (roguelike game) consumes events as encounters
- See `docs/unified-architecture.md` for the full integration model

### Layered Architecture
The codebase is organized into four layers:
- **core/** — Node.js code for the CLI companion tool. Runs in Node.js only.
- **game/** — Browser roguelike (engine, battle, dungeon, progression, audio, sprites). Runs in the browser only.
- **ecosystem/** — Shared game content (JSON data, inlined JS modules, Bug Grimoire, bosses). Consumed by both core/ and game/.
- **domain/** — Pure domain logic with no DOM or Node.js-specific APIs. Contains the canonical battle engine, encounter logic, progression engine, event definitions, and the error ingestion pipeline. All functions are pure and deterministic (when RNG is injected). Consumed by both core/ and game/.

### Roguelike Model
- Coding sessions are dungeon **runs**
- Minor enemies (severity 1-2) **auto-resolve** in idle mode
- Bosses (severity 3+) require **active engagement**
- **Bug Grimoire** records defeated enemy types (not a collection game)

### Domain Layer & Ingestion Pipeline
The `domain/` layer provides environment-agnostic logic:
- **`domain/events.js`** — Canonical event kinds (e.g., `ERROR_OBSERVED`, `MOVE_USED`, `EVOLUTION_TRIGGERED`)
- **`domain/event-bus.js`** — Universal EventBus that works in both Node.js and browser
- **`domain/battle.js`** — Pure battle engine with passive abilities, healing, and damage calculation
- **`domain/encounters.js`** — Encounter trigger checks with rarity-weighted enemy selection
- **`domain/evolution.js`** — Progression condition checking (takes event counts as input, no storage dependency)
- **`domain/ingestion/`** — Multi-stage pipeline: raw stderr → parsed errors → fingerprinted → classified → mapped to BugMon species

### ES6 Modules
All source uses ES6 `import`/`export`. No CommonJS, no bundler. Browser loads `game/game.js` as a module via `<script type="module">`.

### Data as Inlined JS Modules
Game data lives in `ecosystem/data/` as both JSON (source of truth) and JS modules (imported by the game). To regenerate JS modules from JSON: `npm run sync-data`

### Battle System
Turn order: faster combatant goes first (ties: player wins). Damage formula:
```
damage = (power + attack - floor(defense / 2) + random(1-3)) * typeMultiplier
```
Type multipliers: 0.5x (not effective), 1.0x (neutral), 1.5x (super effective).

## Coding Conventions

- **camelCase** for functions and variables
- **UPPER_SNAKE_CASE** for constants (e.g., `STATES`, `TILE`, `Events`)
- **const/let** only, no `var`
- Arrow functions preferred
- No external dependencies — keep it zero-dependency
- `imageSmoothingEnabled = false` on canvas for crisp pixel art
- All audio is synthesized at runtime via Web Audio API (no audio files)
- **ESLint** enforced via `eslint.config.js` (flat config): `no-var`, `prefer-const`, `eqeqeq`, `no-undef`
- **Prettier** enforced via `.prettierrc` for consistent formatting
- Run `npm run lint` and `npm run format` before committing

## Data Formats

### monsters.json
```json
{ "id": 1, "name": "NullPointer", "type": "backend",
  "hp": 30, "attack": 8, "defense": 4, "speed": 6,
  "moves": ["segfault", "unhandledexception", "memoryaccess"],
  "color": "#e74c3c", "sprite": "nullpointer",
  "rarity": "common", "theme": "runtime error",
  "passive": null, "description": "..." }
```

### moves.json
```json
{ "id": "segfault", "name": "SegFault", "power": 10, "type": "backend" }
```

### types.json
7 types: `frontend`, `backend`, `devops`, `testing`, `architecture`, `security`, `ai`. Effectiveness chart is a nested object mapping attacker type → defender type → multiplier.

### evolutions.json
```json
{ "id": "callback_chain", "name": "Async Evolution",
  "stages": [{ "monsterId": 2, "name": "CallbackHell" }, ...],
  "triggers": [{ "from": 2, "to": 23,
    "condition": { "event": "commits", "count": 10 },
    "description": "Make 10 commits" }] }
```

## Size Budget

- **Main bundle**: 10 KB target / 17 KB cap (gzipped, built with `--no-sprites`)
- **Subsystem caps** (raw bytes): engine (7.5 KB), rendering (15.5 KB), battle (14.5 KB), data (13.2 KB), game-logic (19.5 KB), infrastructure (7 KB)

## Testing

```bash
npm test                               # Run all tests (52 test files)
npm run test:coverage                  # Run with coverage (c8, 50% line threshold)
npm run simulate -- --all --runs 100   # Round-robin roster balance analysis
```

## When Adding New Content

### New BugMon Enemy
1. Add entry to `ecosystem/data/monsters.json` following existing schema
2. Add 64x64 PNG sprite to `game/sprites/` (filename matches `sprite` field)
3. Ensure moves referenced exist in `ecosystem/data/moves.json`
4. If it has a progression chain, update `ecosystem/data/evolutions.json`
5. Run `npm run sync-data` to regenerate JS modules from JSON
6. Run simulation to verify balance: `npm run simulate -- --all`

### New Moves
1. Add entry to `ecosystem/data/moves.json` following existing schema
2. Ensure the move's `type` exists in `ecosystem/data/types.json`
3. Run `npm run sync-data` to regenerate JS modules

### New Progression Chain
1. Add chain to `ecosystem/data/evolutions.json` with stages and trigger conditions
2. Add evolved BugMon entries to `ecosystem/data/monsters.json` with `rarity: "evolved"`
3. Run `npm run sync-data` to regenerate JS modules
