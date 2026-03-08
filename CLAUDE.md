# CLAUDE.md — AI Assistant Guide for BugMon

## Project Overview

BugMon is a Pokémon-style monster-taming RPG browser game themed around software bugs. Players explore a tile-based world, encounter wild "BugMon" (creatures named after programming bugs like NullPointer, MergeConflict, StackOverflow), battle them with turn-based combat, and catch them for their party. BugMon evolve based on real developer activity (commits, PRs merged, bugs fixed) instead of XP grinding.

**Key characteristics:**
- 100% client-side, zero runtime dependencies
- Vanilla JavaScript (ES6 modules), HTML5 Canvas 2D, Web Audio API
- Build tooling: esbuild + terser (dev dependencies only)
- Deployed to GitHub Pages
- Community BugMon submissions via GitHub Issues + automated validation
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
│   ├── matcher.js          # Error → BugMon matching logic
│   ├── error-parser.js     # Error message parser
│   ├── stacktrace-parser.js # Stack trace analysis
│   ├── bug-event.js        # Bug event definitions
│   └── cli/                # CLI tool (bugmon command)
│       ├── bin.js           # Entry point (bugmon command)
│       ├── adapter.js       # CLI watch adapter
│       ├── auto-walk.js     # Auto-walk feature
│       ├── boss-battle.js   # Boss battle interactive encounter
│       ├── catch.js         # Catch/cache mechanic
│       ├── claude-hook.js   # Claude Code PostToolUse hook (error encounters)
│       ├── claude-init.js   # Claude Code integration setup
│       ├── colors.js        # Shared ANSI color constants
│       ├── contribute.js    # Contribution prompt
│       ├── demo.js          # Demo encounter launcher
│       ├── encounter.js     # CLI encounter logic
│       ├── init.js          # Git hooks installer for evolution tracking
│       ├── renderer.js      # Terminal renderer (ANSI)
│       ├── resolve.js       # Bug resolve/XP mechanic
│       ├── args.js          # Lightweight CLI argument parser (zero deps)
│       ├── scan.js          # Error scanning feature
│       ├── sync-server.js   # WebSocket sync server (zero deps)
│       └── bugmon-legacy.js # Legacy CLI version
│
├── game/                   # Browser game (client-side)
│   ├── game.js             # Game loop orchestration (entry point for JS)
│   ├── engine/             # Core framework systems
│   │   ├── state.js        # Game state machine (TITLE, EXPLORE, BATTLE_TRANSITION, BATTLE, EVOLVING, MENU)
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
│       ├── SPRITE_GUIDE.md # Sprite creation guide
│       └── *.png           # 64x64 battle sprites, 32x32 player sprites
│
├── ecosystem/              # Game content & metagame systems
│   ├── data/               # Game content (JSON source + JS modules)
│   │   ├── monsters.json   # 31 BugMon definitions (stats, moves, types, evolutions)
│   │   ├── monsters.js     # Inlined JS module (imported by game)
│   │   ├── moves.json      # 72 move definitions
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
│   ├── storage.js          # Shared storage utilities
│   └── sync-protocol.js    # Shared WebSocket sync protocol constants
│
├── domain/                 # Pure domain logic (no DOM, no Node.js-specific APIs)
│   ├── battle.js           # Pure battle engine (deterministic with injected RNG)
│   ├── encounters.js       # Pure encounter logic (rarity weights, trigger checks)
│   ├── event-bus.js        # Universal EventBus (works in Node.js and browser)
│   ├── events.js           # Canonical domain event definitions
│   ├── evolution.js        # Pure evolution engine (no localStorage)
│   └── ingestion/          # Error ingestion pipeline
│       ├── pipeline.js     # Orchestrates: parse → fingerprint → classify → map
│       ├── parser.js       # Error message and stack trace parsing
│       ├── fingerprint.js  # Error deduplication via stable fingerprinting
│       ├── classifier.js   # Parsed error → BugEvent classification
│       └── species-mapper.js # BugEvent → BugMon species mapping
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
│   ├── async-error.js
│   ├── module-error.js
│   ├── null-error.js
│   ├── reference-error.js
│   ├── stack-overflow.js
│   └── syntax-error.js
│
├── tests/                  # Test suite (52 test files)
│   ├── run.js              # Test runner
│   └── *.test.js           # Tests (auto-walk, battle-core, battle, battleEngine, bosses, bug-event,
│                           #   bugdex, bugdex-spec, build, catch, classifier, damage, data,
│                           #   domain-battle, domain-encounters, domain-event-bus, domain-evolution,
│                           #   encounters, error-parser, events, evolution, evolution-animation,
│                           #   fingerprint, game-damage, game-loop, headless-battle, ingestion-parser,
│                           #   input, integration, map, matcher, monsterGen, pipeline, player,
│                           #   renderer, report, rng, save, simulator, sound, species-mapper,
│                           #   sprites, stacktrace-parser, state, storage, strategies, sync-client,
│                           #   sync-protocol, tiles, title, tracker, transition)
│
├── scripts/                # Build tooling
│   ├── build.js            # Single-file builder (esbuild + terser → dist/index.html)
│   ├── dev-server.js       # Zero-dependency dev server with live reload
│   ├── sync-data.js        # JSON → JS module converter
│   └── prune-merged-branches.sh  # Git branch cleanup script
│
├── hooks/                  # Git hooks for dev activity tracking
│   ├── post-commit         # Increments commit counter in .events.json
│   └── post-merge          # Increments merge counter in .events.json
│
├── .github/
│   ├── dependabot.yml          # Dependabot configuration
│   ├── workflows/
│   │   ├── deploy.yml          # GitHub Pages auto-deploy on push to main
│   │   ├── validate-bugmon.yml # Validates community BugMon submissions
│   │   ├── approve-bugmon.yml  # Auto-adds approved BugMon to game data
│   │   ├── validate.yml        # General data validation
│   │   ├── size-check.yml      # Bundle size check (enforces byte budget)
│   │   ├── codeql.yml          # CodeQL security scanning
│   │   ├── publish.yml         # npm package publishing
│   │   └── release.yml         # Release automation
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
├── .claude/                # Claude Code custom skills & configuration
│   └── skills/             # Skill definitions
│       ├── add-bugmon.md       # Guided BugMon creation skill
│       ├── add-evolution.md    # Evolution chain skill
│       ├── add-move.md         # Move creation skill
│       ├── balance-check.md    # Balance analysis skill
│       ├── bugmon.md           # BugMon encounter skill
│       ├── full-test.md        # Full test suite skill
│       ├── roster-report.md    # Roster analysis skill
│       ├── update-docs.md      # Documentation update skill
│       ├── validate-data.md    # Data validation skill
│       ├── 21st-dev-magic/     # UI component generation via 21st.dev Magic MCP
│       └── ui-ux-pro-max/      # Comprehensive UI/UX design intelligence
│
├── .editorconfig           # Editor configuration
├── .prettierrc             # Prettier configuration
├── .prettierignore         # Prettier ignore rules
├── eslint.config.js        # ESLint flat config (no-var, prefer-const, eqeqeq, no-undef)
├── size-budget.json        # Bundle size budget (subsystem-level caps)
├── ARCHITECTURE.md         # Detailed technical architecture
├── CHANGELOG.md            # Project changelog
├── CODE_OF_CONDUCT.md      # Community guidelines
├── CONSTRAINTS.md          # Project constraints
├── CONTRIBUTING.md         # Contribution guide
├── LIGHTWEIGHT.md          # Lightweight implementation guide
├── ROADMAP.md              # Milestone planning and feature backlog
├── LICENSE                 # MIT license
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
npm run simulate:compare # Compare battle strategies

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

### Layered Architecture
The codebase is organized into four layers:
- **core/** — Node.js code for the CLI companion tool. Runs in Node.js only.
- **game/** — Browser game code (engine, battle, world, evolution, audio, sprites). Runs in the browser only.
- **ecosystem/** — Shared game content (JSON data, inlined JS modules, BugDex, bosses). Consumed by both core/ and game/.
- **domain/** — Pure domain logic with no DOM or Node.js-specific APIs. Contains the canonical battle engine, encounter logic, evolution engine, event definitions, and the error ingestion pipeline. All functions are pure and deterministic (when RNG is injected). Consumed by both core/ and game/.

### Domain Layer & Ingestion Pipeline
The `domain/` layer provides environment-agnostic logic:
- **`domain/events.js`** — Canonical event kinds (e.g., `ERROR_OBSERVED`, `MOVE_USED`, `EVOLUTION_TRIGGERED`)
- **`domain/event-bus.js`** — Universal EventBus that works in both Node.js and browser
- **`domain/battle.js`** — Pure battle engine with passive abilities, healing, and damage calculation
- **`domain/encounters.js`** — Encounter trigger checks with rarity-weighted monster selection
- **`domain/evolution.js`** — Evolution condition checking (takes event counts as input, no storage dependency)
- **`domain/ingestion/`** — Multi-stage pipeline: raw stderr → parsed errors → fingerprinted → classified → mapped to BugMon species. Each stage is independently testable and replaceable.

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
- **TITLE** — title screen with ASCII logo, starfield, and menu
- **EXPLORE** — grid-based overworld movement
- **BATTLE_TRANSITION** — flash + fade animation (860ms)
- **BATTLE** — turn-based combat with menu system
- **EVOLVING** — evolution animation sequence (flash, morph, reveal)
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
- **Security Scanning**: `.github/workflows/codeql.yml` runs CodeQL analysis.
- **Publishing**: `.github/workflows/publish.yml` handles npm package publishing.
- **Releases**: `.github/workflows/release.yml` automates release creation.

## Size Budget

The project enforces strict bundle size limits via `size-budget.json` and the `size-check.yml` CI workflow:

- **Main bundle**: 10 KB target / 17 KB cap (gzipped, built with `--no-sprites`)
- **Subsystem caps** (raw bytes): engine (7.5 KB), rendering (15.5 KB), battle (14.5 KB), data (13.2 KB), game-logic (19.5 KB), infrastructure (7 KB)

Run `npm run budget` to check compliance locally.

## Testing

```bash
npm test                               # Run all tests (52 test files)
npm run test:coverage                  # Run with coverage (c8, 50% line threshold)
npm run simulate -- --all --runs 100   # Round-robin roster balance analysis
```

Test suite covers: auto-walk, battle-core, battle logic, battleEngine, bosses, bug events, bugdex, bugdex-spec, build output, catch, classifier, damage formula, data integrity, domain-battle, domain-encounters, domain-event-bus, domain-evolution, encounters, error parsing, event bus, evolution, evolution-animation, fingerprint, game-damage, game-loop, headless-battle, ingestion-parser, input, integration, map, matcher, monsterGen, pipeline, player, renderer, reporting, RNG, save, simulator, sound, species-mapper, sprites, stacktrace parsing, state, storage, strategies, sync-client, sync-protocol, tiles, title, tracker, transition.

## Claude Code Skills

Custom skills are defined in `.claude/skills/` for guided workflows:
- **add-bugmon** / **add-move** / **add-evolution** — Step-by-step content creation
- **balance-check** / **roster-report** — Game balance analysis
- **bugmon** — BugMon encounter skill
- **full-test** / **validate-data** — Testing and validation
- **update-docs** — Documentation maintenance

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
