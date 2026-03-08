# CLAUDE.md — AI Assistant Guide

## Project Overview

AgentGuard + BugMon is a unified platform consisting of two layers:

- **AgentGuard** — Deterministic governance runtime for AI coding agents. Evaluates agent actions against declared policies and invariants. Produces canonical events when violations occur.
- **BugMon** — Roguelike developer telemetry game. Consumes canonical events (developer errors, CI failures, governance violations) and renders them as interactive encounters. Coding sessions are dungeon runs. Bugs are enemies. CI failures are bosses.

The system has one architectural spine: the **canonical event model**. All system activity becomes events. AgentGuard produces governance events. BugMon consumes all events as gameplay.

**Key characteristics:**
- Hybrid idle/active roguelike — minor enemies auto-resolve, bosses demand engagement
- Bug Grimoire instead of collection — compendium of defeated enemy types
- 100% client-side browser game with zero runtime dependencies
- Vanilla JavaScript (ES6 modules), HTML5 Canvas 2D, Web Audio API
- TypeScript refactoring in progress (`src/`) — parallel implementation, not yet replacing JS
- CLI has runtime dependencies (`chokidar`, `commander`, `pino`); browser game remains zero-dep
- Build tooling: esbuild + terser + TypeScript + vitest (dev dependencies only)
- Deployed to GitHub Pages
- Community enemy submissions via GitHub Issues + automated validation
- Layered architecture: `core/` (CLI), `game/` (browser), `ecosystem/` (shared data), `domain/` (pure logic), `agentguard/` (governance)

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
│   ├── sources/            # Event source adapters (plugin contract)
│   │   ├── watch-source.js  # Watch mode event source
│   │   ├── scan-source.js   # Scan mode event source
│   │   └── claude-hook-source.js # Claude Code hook event source
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
│   ├── event-store.js      # Event persistence interface
│   ├── evolution.js        # Pure progression engine (no localStorage)
│   ├── source-registry.js  # Event source plugin registry
│   ├── actions.js          # Action definitions
│   ├── invariants.js       # Invariant definitions
│   ├── policy.js           # Policy evaluation logic
│   ├── reference-monitor.js # Reference monitor for governance
│   ├── run-history.js      # Run history tracking
│   ├── run-session.js      # Run session management
│   ├── combo.js            # Combo system logic
│   ├── hash.js             # Hashing utilities
│   ├── contracts.js        # Module contract registry
│   ├── shapes.js           # Runtime shape definitions
│   ├── ingestion/          # Error ingestion pipeline
│   │   ├── pipeline.js     # Orchestrates: parse → fingerprint → classify → map
│   │   ├── parser.js       # Error message and stack trace parsing
│   │   ├── fingerprint.js  # Error deduplication via stable fingerprinting
│   │   ├── classifier.js   # Parsed error → BugEvent classification
│   │   ├── species-mapper.js # BugEvent → BugMon species mapping
│   │   └── invariant-mapper.js # Invariant violation → event mapping
│   ├── pipeline/           # Multi-agent pipeline orchestration
│   │   ├── index.js        # Pipeline entry point
│   │   ├── orchestrator.js # Pipeline orchestrator
│   │   ├── stages.js       # Pipeline stage definitions
│   │   └── roles.js        # Pipeline role definitions
│   └── execution/          # Execution adapters
│       └── adapters.js     # Execution environment adapters
│
├── agentguard/             # Governance runtime (deterministic RTA)
│   ├── monitor.js          # Closed-loop feedback (escalation, violation tracking)
│   ├── core/               # Core governance engine
│   │   ├── aab.js          # Action Authorization Boundary
│   │   └── engine.js       # Runtime Assurance (RTA) engine
│   ├── policies/           # Policy evaluation
│   │   ├── evaluator.js    # Policy compliance checking
│   │   └── loader.js       # Policy loader from JSON
│   ├── invariants/         # Invariant verification
│   │   ├── checker.js      # Runtime invariant checker
│   │   └── definitions.js  # Invariant registry
│   └── evidence/           # Audit trail
│       └── pack.js         # Evidence collection & reporting
│
├── policy/                 # Policy configuration (JSON)
│   ├── action_rules.json   # Capability rules per agent action
│   └── capabilities.json   # Available action categories
│
├── runtime/                # Event tracing & replay
│   ├── events/             # Event log storage
│   └── replay/             # Replay data
│
├── src/                    # TypeScript refactoring (in progress)
│   ├── cli/                # Commander-based CLI
│   ├── core/               # Typed core (EventBus, BugEngine, BugRegistry)
│   ├── game/               # Game engine modules
│   ├── watchers/           # Environment watchers (console, test, build)
│   └── ai/                 # AI integration interface
│
├── spec/                   # Artifact-first development specs
│   ├── system.md           # System spec (boundaries, invariants)
│   ├── TEMPLATE-feature.md # Feature spec template
│   ├── TEMPLATE-interface.md # Interface contract template
│   ├── features/           # Feature specs (fill before implementing)
│   └── interfaces/         # Interface contracts (module boundaries)
│
├── simulation/             # Headless battle simulation
├── tests/                  # Test suite (77 JS + 4 TS test files)
│   ├── run.js              # Custom test runner (JS tests)
│   ├── *.test.js           # JavaScript tests
│   └── ts/                 # TypeScript tests (run via vitest)
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
npm run contracts:check  # Verify module contracts
npm run lint             # Run ESLint
npm run lint:fix         # Run ESLint with auto-fix
npm run format           # Check formatting (Prettier)
npm run format:fix       # Fix formatting (Prettier)
npm run test:coverage    # Run tests with coverage (c8, 50% line threshold)

# Run CLI companion tool
npm run dev

# TypeScript (in-progress refactoring)
npm run ts:check           # Type-check TypeScript (tsc --noEmit)
npm run ts:test            # Run TypeScript tests (vitest)
npm run ts:test:watch      # Run TypeScript tests in watch mode
npm run build:ts           # Build TypeScript (tsc + esbuild)
```

## Architecture & Key Patterns

### Unified System Model
The system has one architectural spine: the canonical event model.
- **AgentGuard** (governance runtime) produces events from policy violations
- **BugMon** (roguelike game) consumes events as encounters
- See `docs/unified-architecture.md` for the full integration model

### Layered Architecture
The codebase is organized into five layers:
- **core/** — Node.js code for the CLI companion tool. Runs in Node.js only. Includes `sources/` for event source adapters.
- **game/** — Browser roguelike (engine, battle, dungeon, progression, audio, sprites). Runs in the browser only.
- **ecosystem/** — Shared game content (JSON data, inlined JS modules, Bug Grimoire, bosses). Consumed by both core/ and game/.
- **domain/** — Pure domain logic with no DOM or Node.js-specific APIs. Contains the canonical battle engine, encounter logic, progression engine, event definitions, error ingestion pipeline, multi-agent pipeline orchestration, governance primitives, and source registry. All functions are pure and deterministic (when RNG is injected). Consumed by both core/ and game/.
- **agentguard/** — Governance runtime implementing the Runtime Assurance Architecture. Evaluates agent actions against policies and invariants. Produces canonical governance events.

### Roguelike Model
- Coding sessions are dungeon **runs**
- Minor enemies (severity 1-2) **auto-resolve** in idle mode
- Bosses (severity 3+) require **active engagement**
- **Bug Grimoire** records defeated enemy types (not a collection game)

### Domain Layer & Ingestion Pipeline
The `domain/` layer provides environment-agnostic logic:
- **`domain/events.js`** — Canonical event kinds (e.g., `ERROR_OBSERVED`, `MOVE_USED`, `EVOLUTION_TRIGGERED`)
- **`domain/event-bus.js`** — Universal EventBus that works in both Node.js and browser
- **`domain/event-store.js`** — Event persistence interface
- **`domain/battle.js`** — Pure battle engine with passive abilities, healing, and damage calculation
- **`domain/encounters.js`** — Encounter trigger checks with rarity-weighted enemy selection
- **`domain/evolution.js`** — Progression condition checking (takes event counts as input, no storage dependency)
- **`domain/source-registry.js`** — Event source plugin registry
- **`domain/ingestion/`** — Multi-stage pipeline: raw stderr → parsed errors → fingerprinted → classified → mapped to BugMon species
- **`domain/pipeline/`** — Multi-agent pipeline orchestration (orchestrator, stages, roles)
- **`domain/invariants.js`**, **`domain/policy.js`**, **`domain/reference-monitor.js`** — Governance primitives consumed by agentguard/

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
- No external dependencies in browser game code — CLI may use runtime deps (`chokidar`, `commander`, `pino`)
- `imageSmoothingEnabled = false` on canvas for crisp pixel art
- All audio is synthesized at runtime via Web Audio API (no audio files)
- **ESLint** enforced via `eslint.config.js` (flat config): `no-var`, `prefer-const`, `eqeqeq`, `no-undef`
- **Prettier** enforced via `.prettierrc` for consistent formatting
- Run `npm run lint` and `npm run format` before committing

## Artifact-First Development

When adding new features or domain modules, follow this order:

1. **Spec** — Write a feature spec in `docs/` using `docs/FEATURE_SPEC_TEMPLATE.md`
2. **Contract** — Define module contracts in `domain/contracts.js` (exports, invariants, dependencies)
3. **Shapes** — Define input/output shapes in `domain/shapes.js` if new data structures are introduced
4. **Implementation** — Write the code. Use `assertShape()` at module boundaries.
5. **Verification** — Run `npm run contracts:check` and `npm test`

### When to Use Contracts
- Any new module in `domain/` MUST have a contract entry in `domain/contracts.js`
- Any new pipeline stage MUST define input/output shapes in `domain/shapes.js`
- Any new data format in `ecosystem/data/` MUST have a validation function (see `ecosystem/bugdex-spec.js`)

### When NOT to Use Contracts
- Bug fixes to existing modules (unless they change the interface)
- Internal helper functions (only exported APIs need contracts)
- Sprite/asset additions

### Key Files
- `domain/shapes.js` — Runtime shape definitions with `validateShape()` and `assertShape()`
- `domain/contracts.js` — Module contract registry with `validateContract()`
- `scripts/check-contracts.js` — Verifies all modules match their contracts (`npm run contracts:check`)

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
npm test                               # Run JS tests (77 test files)
npm run ts:test                        # Run TypeScript tests (4 test files, vitest)
npm run test:coverage                  # Run with coverage (c8, 50% line threshold)
npm run simulate -- --all --runs 100   # Round-robin roster balance analysis
```

## Artifact-First Development

When implementing new features or systems, agents must produce structured artifacts before writing code. This enforces staged reasoning and produces more consistent, architecturally sound implementations.

### The Pipeline

```
prompt → spec artifact → interface contract → implementation → verification
```

Never skip directly to implementation. Each stage constrains the next.

### Artifact Types

| Artifact | Location | Purpose |
|----------|----------|---------|
| System spec | `spec/system.md` | Defines system boundaries, invariants, constraints |
| Feature spec | `spec/features/<name>.md` | Requirements, events produced/consumed, dependencies |
| Interface contract | `spec/interfaces/<name>.md` | Module exports, types, anti-dependencies |
| Templates | `spec/TEMPLATE-feature.md`, `spec/TEMPLATE-interface.md` | Starting point for new artifacts |

### Workflow for New Features

1. **Spec first**: Copy `spec/TEMPLATE-feature.md` to `spec/features/<name>.md`. Fill in requirements, events, interface contract, layer placement, and constraints.
2. **Interface definition**: If the feature introduces a new module, copy `spec/TEMPLATE-interface.md` to `spec/interfaces/<name>.md`. Define exports, types, invariants, and anti-dependencies.
3. **Review**: Verify the spec is consistent with `spec/system.md` invariants and the canonical event model in `domain/events.js`.
4. **Implement**: Write code that fulfills the spec. The spec constrains naming, API surface, layer placement, and event usage.
5. **Verify**: Run tests. Confirm the implementation matches the interface contract.

### Why This Matters

- Agents reason better in stages than in a single leap
- Specs prevent architectural drift and naming inconsistency
- Interface contracts act as boundaries between agents working on different modules
- The canonical event model (`domain/events.js`) is the architectural spine — specs must reference it

### Rules

- Feature specs must list all events produced and consumed
- Interface contracts must declare anti-dependencies (what the module must NOT import)
- Domain layer modules must remain pure — no DOM, no Node.js APIs
- Specs are living documents — update them when implementations evolve

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
