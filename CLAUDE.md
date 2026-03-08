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
- TypeScript source (`src/`), compiled to `dist/` via tsc + esbuild. HTML5 Canvas 2D, Web Audio API
- CLI has runtime dependencies (`chokidar`, `commander`, `pino`); browser game remains zero-dep
- Build tooling: tsc + esbuild + terser + vitest (dev dependencies only)
- Deployed to GitHub Pages
- Community enemy submissions via GitHub Issues + automated validation
- Layered architecture: `src/core/` (shared logic), `src/cli/` (CLI), `src/game/` (browser), `src/domain/` (pure logic), `src/agentguard/` (governance), `ecosystem/data/` (game content)

## Quick Start

Build first, then start the dev server:

```bash
npm run build:ts     # Compile TypeScript → dist/
npm run serve        # Runs scripts/dev-server.js (zero deps, live reload)
# Then open http://localhost:8000
```

## Project Structure

TypeScript in `src/` is the **single source of truth**. It compiles to `dist/` via `tsc` (individual modules) + `esbuild` (CLI and game bundles). All tests and scripts import from `dist/`.

```
BugMon/
├── index.html              # Entry point (canvas, inline CSS, touch controls)
├── simulate.js             # Battle simulator CLI (node simulate.js)
├── package.json            # Node.js config for scripts
│
├── src/                    # TypeScript source (single source of truth)
│   ├── cli/                # Commander-based CLI (bugmon command)
│   │   ├── bin.ts          # CLI entry point
│   │   ├── index.ts        # CLI exports
│   │   └── commands/       # CLI subcommands (watch, scan, demo, etc.)
│   ├── core/               # Shared logic (EventBus, BugEngine, BugRegistry)
│   │   ├── event-bus.ts    # Universal EventBus (generic, typed)
│   │   ├── bug-event.ts    # Bug event definitions and severity mapping
│   │   ├── error-parser.ts # Error message parser (40+ patterns)
│   │   ├── stacktrace-parser.ts # Stack trace analysis
│   │   ├── matcher.ts      # Error → BugMon enemy matching
│   │   ├── types.ts        # Shared TypeScript type definitions
│   │   └── sources/        # Event source adapters
│   ├── game/               # Browser roguelike (client-side)
│   │   ├── game.ts         # Game entry point (auto-init, data loading)
│   │   ├── engine/         # Core framework (state, input, renderer, events)
│   │   ├── world/          # Dungeon (map, player, encounters)
│   │   ├── battle/         # Combat (battle-engine, damage, battle-core)
│   │   ├── evolution/      # Progression (tracker, animation)
│   │   ├── audio/          # Sound synthesis (Web Audio API)
│   │   ├── sync/           # Save/sync (localStorage, WebSocket)
│   │   └── sprites/        # Pixel art (procedural gen + PNG sprites)
│   ├── domain/             # Pure domain logic (no DOM, no Node.js APIs)
│   │   ├── battle.ts       # Pure battle engine (deterministic with injected RNG)
│   │   ├── encounters.ts   # Encounter trigger checks with rarity weights
│   │   ├── events.ts       # Canonical domain event definitions
│   │   ├── evolution.ts    # Progression condition checking
│   │   ├── source-registry.ts # Event source plugin registry
│   │   ├── contracts.ts    # Module contract registry
│   │   ├── shapes.ts       # Runtime shape definitions
│   │   ├── ingestion/      # Error ingestion pipeline
│   │   └── pipeline/       # Multi-agent pipeline orchestration
│   ├── agentguard/         # Governance runtime (RTA)
│   ├── ecosystem/          # Game content modules (bugdex, bosses, storage)
│   ├── watchers/           # Environment watchers (console, test, build)
│   └── ai/                 # AI integration interface
│
├── dist/                   # Compiled output (tsc + esbuild)
│   ├── cli/                # Bundled CLI (esbuild)
│   ├── game/               # Bundled game + sprites (esbuild + tsc)
│   ├── core/               # Individual modules (tsc)
│   ├── domain/             # Individual modules (tsc)
│   ├── agentguard/         # Individual modules (tsc)
│   └── ecosystem/          # Individual modules (tsc)
│
├── ecosystem/data/         # Game content (JSON source + inlined JS modules)
│   ├── monsters.json       # 31+ BugMon enemy definitions
│   ├── moves.json          # 72 move definitions
│   ├── types.json          # 7 types + effectiveness chart
│   ├── evolutions.json     # Progression chains
│   ├── map.json            # 15x10 tile grid
│   └── *.js                # Inlined JS modules (generated by sync-data)
│
├── simulation/             # Headless battle simulation
│   ├── cli.js              # CLI entry (--battles, --compare flags)
│   ├── simulator.js        # Round-robin matchup orchestrator
│   ├── headlessBattle.js   # Headless battle runner (no UI)
│   ├── strategies.js       # AI battle strategies
│   ├── rng.js              # Seeded RNG for reproducible sims
│   └── report.js           # Statistical report generation
├── tests/                  # Test suite (77 JS + 16 TS test files)
│   ├── run.js              # Custom test runner (JS tests import from dist/)
│   ├── *.test.js           # JavaScript tests
│   └── ts/                 # TypeScript tests (run via vitest)
├── scripts/                # Build tooling
├── spec/                   # Artifact-first development specs
├── policy/                 # Policy configuration (JSON)
│   ├── action_rules.json   # Agent action validation rules
│   └── capabilities.json   # Agent capability boundaries
├── docs/                   # System documentation
├── hooks/                  # Git hooks for dev activity tracking
│   ├── post-commit         # Logs commit events to .events.json
│   └── post-merge          # Logs merge events to .events.json
└── .github/                # CI/CD workflows and issue templates
    ├── workflows/          # 8 GitHub Actions workflows
    ├── ISSUE_TEMPLATE/     # 4 community submission templates
    └── scripts/            # Validation & generation utilities
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

# Quick statistical analysis (1,000 battles)
npm run simulate:quick

# Full roster balance check (50,000 battles)
npm run simulate:full

# Compare before/after balance changes
npm run simulate:compare

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

# TypeScript build (required before running JS tests or serving)
npm run build:ts           # Build TypeScript (tsc + esbuild → dist/)
npm run ts:check           # Type-check TypeScript (tsc --noEmit)
npm run ts:test            # Run TypeScript tests (vitest)
npm run ts:test:watch      # Run TypeScript tests in watch mode
```

## Architecture & Key Patterns

### Unified System Model
The system has one architectural spine: the canonical event model.
- **AgentGuard** (governance runtime) produces events from policy violations
- **BugMon** (roguelike game) consumes events as encounters
- See `docs/unified-architecture.md` for the full integration model

### Layered Architecture
All source lives in `src/`, compiled to `dist/`. The codebase is organized into layers:
- **src/core/** — Shared logic (EventBus, error parsing, bug events). Used by CLI and game.
- **src/cli/** — Commander-based CLI companion tool. Runs in Node.js only.
- **src/game/** — Browser roguelike (engine, battle, dungeon, progression, audio, sprites). Runs in the browser only.
- **ecosystem/data/** — Game content (JSON source of truth + inlined JS modules). Consumed by both CLI and game.
- **src/domain/** — Pure domain logic with no DOM or Node.js-specific APIs. Battle engine, encounter logic, progression engine, event definitions, ingestion pipeline, governance primitives. All functions are pure and deterministic (when RNG is injected).
- **src/agentguard/** — Governance runtime implementing the Runtime Assurance Architecture. Evaluates agent actions against policies and invariants.

### Roguelike Model
- Coding sessions are dungeon **runs**
- Minor enemies (severity 1-2) **auto-resolve** in idle mode
- Bosses (severity 3+) require **active engagement**
- **Bug Grimoire** records defeated enemy types (not a collection game)

### Domain Layer & Ingestion Pipeline
The `src/domain/` layer provides environment-agnostic logic:
- **`src/domain/events.ts`** — Canonical event kinds (e.g., `ERROR_OBSERVED`, `MOVE_USED`, `EVOLUTION_TRIGGERED`)
- **`src/core/event-bus.ts`** — Generic typed EventBus that works in both Node.js and browser
- **`src/domain/event-store.ts`** — Event persistence interface
- **`src/domain/battle.ts`** — Pure battle engine with passive abilities, healing, and damage calculation
- **`src/domain/encounters.ts`** — Encounter trigger checks with rarity-weighted enemy selection
- **`src/domain/evolution.ts`** — Progression condition checking (takes event counts as input, no storage dependency)
- **`src/domain/source-registry.ts`** — Event source plugin registry
- **`src/domain/ingestion/`** — Multi-stage pipeline: raw stderr → parsed errors → fingerprinted → classified → mapped to BugMon species
- **`src/domain/pipeline/`** — Multi-agent pipeline orchestration (orchestrator, stages, roles)
- **`src/domain/invariants.ts`**, **`src/domain/policy.ts`**, **`src/domain/reference-monitor.ts`** — Governance primitives consumed by agentguard/

### Build & Module System
TypeScript source compiles via `tsc` (individual modules for tests/imports) + `esbuild` (bundles for CLI and browser game). Browser loads `dist/game/game.js` as a module via `<script type="module">`.

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
- Node.js ≥18 required (`engines` field in `package.json`)

### Configuration

**TypeScript** (`tsconfig.json`):
- Target: ES2022, Module: ESNext, ModuleResolution: bundler
- Strict mode enabled, plus `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- `verbatimModuleSyntax: true` — use `import type` for type-only imports
- Source: `src/`, Output: `dist/`, with declarations and source maps

**Prettier** (`.prettierrc`):
- Single quotes, trailing commas (es5), printWidth 100, tabWidth 2, semicolons

**ESLint** (`eslint.config.js`):
- Flat config with `typescript-eslint` recommended rules
- Key rules: `no-var`, `prefer-const`, `eqeqeq`, `no-undef`, `@typescript-eslint/no-explicit-any: warn`

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
3. **Review**: Verify the spec is consistent with `spec/system.md` invariants and the canonical event model in `src/domain/events.ts`.
4. **Implement**: Write code that fulfills the spec. The spec constrains naming, API surface, layer placement, and event usage.
5. **Verify**: Run tests. Confirm the implementation matches the interface contract.

### Contracts & Shapes

When to use:
- Any new module in `src/domain/` MUST have a contract entry in `src/domain/contracts.ts`
- Any new pipeline stage MUST define input/output shapes in `src/domain/shapes.ts`
- Any new data format in `ecosystem/data/` MUST have a validation function (see `src/ecosystem/bugdex-spec.ts`)

When NOT to use:
- Bug fixes to existing modules (unless they change the interface)
- Internal helper functions (only exported APIs need contracts)
- Sprite/asset additions

Key files:
- `src/domain/shapes.ts` — Runtime shape definitions with `validateShape()` and `assertShape()`
- `src/domain/contracts.ts` — Module contract registry with `validateContract()`
- `scripts/check-contracts.js` — Verifies all modules match their contracts (`npm run contracts:check`)

### Rules

- Feature specs must list all events produced and consumed
- Interface contracts must declare anti-dependencies (what the module must NOT import)
- Domain layer modules must remain pure — no DOM, no Node.js APIs
- Specs are living documents — update them when implementations evolve

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
npm test                               # Run JS tests (77 test files, import from dist/)
npm run ts:test                        # Run TypeScript tests (16 test files, vitest)
npm run test:coverage                  # Run with coverage (c8, 50% line threshold)
npm run simulate -- --all --runs 100   # Round-robin roster balance analysis
```

## CI/CD & Automation

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `validate.yml` | PR touching `ecosystem/data/**` | Validates game data JSON schema |
| `validate-bugmon.yml` | Issue opened/edited with `bugmon-submission` label | Validates community BugMon enemy submissions |
| `approve-bugmon.yml` | Issue labeled `approved` + `bugmon-submission` | Auto-generates PR to merge approved submissions |
| `size-check.yml` | PR (ignoring docs/markdown) | Runs linting and size budget checks |
| `deploy.yml` | Push to `main`/`master` | Deploys compiled game to GitHub Pages |
| `publish.yml` | GitHub Release published | Publishes npm package |
| `release.yml` | Push to `main`/`master` | Auto-generates release PRs via release-please |
| `codeql.yml` | PR to `main`/`master` + weekly schedule | CodeQL security analysis |

### Community Submissions

Community members can submit new BugMon enemies and moves via GitHub Issues using structured templates:
- `new-bugmon.yml` — Submit a new enemy (name, type, stats, moves, description)
- `new-move.yml` — Submit a new move (name, power, type)
- `balance-report.yml` — Report balance issues with existing enemies/moves
- `bug-report.yml` — Standard bug report

Submissions are validated automatically by `.github/scripts/validate-submission.cjs`, previewed with `.github/scripts/battle-preview.cjs`, and generated into data entries by `.github/scripts/generate-bugmon.cjs`.

## When Adding New Content

### New BugMon Enemy
1. Add entry to `ecosystem/data/monsters.json` following existing schema
2. Add 64x64 PNG sprite to `src/game/sprites/` (filename matches `sprite` field)
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
