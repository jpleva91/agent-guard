# Architecture

## Architectural Thesis

The system has a single architectural spine: the **canonical event model**.

All system activity — developer tooling failures, runtime errors, CI failures, agent actions, governance violations — is normalized into events. These events feed two systems:

- **AgentGuard** enforces deterministic execution constraints on AI coding agents
- **BugMon** visualizes events through a roguelike gameplay loop with hybrid idle/active encounters

Neither system exists in isolation. AgentGuard produces governance events. BugMon consumes all events and renders them as gameplay. The canonical event model is the contract between them.

For the full integration model, see [docs/unified-architecture.md](docs/unified-architecture.md). For the formal architecture brief with academic foundations, see [docs/agent-sdlc-architecture.md](docs/agent-sdlc-architecture.md).

## System Model

```
┌──────────────────────────────────────────────────────────────────┐
│                        Event Sources                             │
│                                                                  │
│  Developer Signals          Agent Actions        CI Systems      │
│  ├── stderr                 ├── file_write       ├── pipeline    │
│  ├── test output            ├── git_commit       ├── build       │
│  ├── linter output          ├── git_push         └── deploy      │
│  └── runtime crashes        └── config_change                    │
└──────────────────┬───────────────────┬───────────────┬───────────┘
                   │                   │               │
                   ▼                   ▼               ▼
         ┌─────────────────────────────────────────────────────┐
         │              Event Normalization Pipeline            │
         │  source → parse → normalize → classify → dedupe     │
         │  Implementation: domain/ingestion/                   │
         └──────────────────────┬──────────────────────────────┘
                                │
                   ┌────────────────────────┐
                   │  Canonical Event Model  │
                   │  { id, fingerprint,    │
                   │    type, severity,     │
                   │    source, file,       │
                   │    metadata, timestamp,│
                   │    resolved }          │
                   └───────────┬────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │ AgentGuard   │  │ Event Store  │  │  EventBus   │
    │ policies     │  │ persistence  │  │ pub/sub     │
    │ invariants   │  │ replay       │  │ broadcast   │
    │ evidence     │  │              │  │             │
    └──────┬───────┘  └──────────────┘  └──────┬──────┘
           │ governance events                  │ all events
           └────────────┬───────────────────────┘
                        ▼
              ┌──────────────────────┐
              │    Subscribers       │
              │  Terminal renderer   │
              │  Browser renderer    │
              │  Bug Grimoire        │
              │  Stats engine        │
              │  Replay engine       │
              └──────────────────────┘
```

## Project Structure

The codebase follows a **layered architecture** with five top-level directories plus supporting infrastructure:

```
BugMon/
├── index.html              Entry point - canvas, touch controls, loads game.js
├── simulate.js             Battle simulator CLI (Node.js)
├── package.json            npm scripts (simulate, serve, build, test)
│
├── core/                   CLI companion & shared logic (Node.js)
│   ├── matcher.js          Error → BugMon enemy matching logic
│   ├── error-parser.js     Error message parser (40+ patterns, 6+ languages)
│   ├── stacktrace-parser.js Stack trace analysis
│   ├── bug-event.js        Bug event definitions and severity mapping
│   ├── sources/            Event source adapters (watch, scan, claude-hook)
│   └── cli/                CLI tool (bugmon command)
│       ├── bin.js           Entry point (bugmon command)
│       ├── adapter.js       CLI watch adapter (event source)
│       ├── auto-walk.js     Auto-walk feature
│       ├── boss-battle.js   Boss battle interactive encounter
│       ├── catch.js         Combat resolution mechanic
│       ├── claude-hook.js   Claude Code PostToolUse hook (error encounters)
│       ├── claude-init.js   Claude Code integration setup
│       ├── colors.js        Shared ANSI color constants
│       ├── contribute.js    Contribution prompt
│       ├── demo.js          Demo encounter launcher
│       ├── encounter.js     CLI encounter logic
│       ├── init.js          Git hooks installer for progression tracking
│       ├── renderer.js      Terminal renderer (ANSI)
│       ├── resolve.js       Bug resolve/XP mechanic
│       ├── args.js          Lightweight CLI argument parser (zero deps)
│       ├── scan.js          Error scanning feature
│       ├── sync-server.js   WebSocket sync server (zero deps)
│       └── bugmon-legacy.js Legacy CLI version
│
├── game/                   Browser roguelike (client-side)
│   ├── game.js             Game loop, data loading, orchestration
│   ├── engine/             Core engine (framework-level)
│   │   ├── state.js        Game state machine
│   │   ├── events.js       Event bus for decoupled communication
│   │   ├── input.js        Keyboard + touch input
│   │   ├── renderer.js     All Canvas drawing functions
│   │   ├── transition.js   Battle transition animation
│   │   └── title.js        Title screen (ASCII logo, starfield, menu)
│   ├── world/              Dungeon / exploration
│   │   ├── map.js          Map data loading, tile queries, collision
│   │   ├── player.js       Player position, movement
│   │   └── encounters.js   Wild encounter checks (10% in tall grass)
│   ├── battle/             Battle systems
│   │   ├── battle-core.js  Pure battle engine (no UI/audio — testable)
│   │   ├── battleEngine.js Battle UI controller
│   │   └── damage.js       Damage formula
│   ├── evolution/          Progression system
│   │   ├── evolution.js    Checks conditions, triggers progressions
│   │   ├── tracker.js      Dev activity tracker (localStorage + .events.json)
│   │   └── animation.js    Progression visual sequence
│   ├── audio/              Sound effects (Web Audio API, no files)
│   │   └── sound.js        Synthesized sound effects
│   ├── sync/               Save/sync system
│   │   ├── save.js         Browser-side save/load (localStorage)
│   │   └── client.js       Client-side sync (WebSocket to CLI)
│   └── sprites/            Pixel art sprites
│       ├── sprites.js      Image loader with preload and fallback
│       ├── monsterGen.js   Procedural sprite generation
│       ├── tiles.js        Procedural tile texture generation
│       └── *.png           Battle sprites (64x64) and player sprites (32x32)
│
├── ecosystem/              Game content & metagame systems
│   ├── data/               All game data (JSON source + JS modules)
│   │   ├── monsters.json   31 BugMon enemy definitions
│   │   ├── monsters.js     Inlined JS module
│   │   ├── moves.json      72 move definitions
│   │   ├── moves.js        Inlined JS module
│   │   ├── types.json      7 types + effectiveness chart
│   │   ├── types.js        Inlined JS module
│   │   ├── evolutions.json Progression chains with dev-activity triggers
│   │   ├── evolutions.js   Inlined JS module
│   │   ├── map.json        Tile grid for the dungeon
│   │   └── mapData.js      Inlined JS module
│   ├── bugdex.js           Bug Grimoire system
│   ├── bugdex-spec.js      Grimoire specification
│   ├── bosses.js           Boss encounter definitions and triggers
│   ├── storage.js          Shared storage utilities
│   └── sync-protocol.js    Shared WebSocket sync protocol constants
│
├── domain/                 Pure domain logic (no DOM, no Node.js-specific APIs)
│   ├── battle.js           Pure battle engine (deterministic with injected RNG)
│   ├── encounters.js       Pure encounter logic (rarity weights, trigger checks)
│   ├── event-bus.js        Universal EventBus (works in Node.js and browser)
│   ├── events.js           Canonical domain event definitions
│   ├── event-store.js      Event persistence interface
│   ├── evolution.js        Pure progression engine (no localStorage)
│   ├── source-registry.js  Event source plugin registry
│   ├── actions.js          Action definitions
│   ├── invariants.js       Invariant definitions
│   ├── policy.js           Policy evaluation logic
│   ├── reference-monitor.js Reference monitor for governance
│   ├── run-history.js      Run history tracking
│   ├── run-session.js      Run session management
│   ├── combo.js            Combo system logic
│   ├── hash.js             Hashing utilities
│   ├── contracts.js        Module contract registry
│   ├── shapes.js           Runtime shape definitions
│   ├── ingestion/          Error ingestion pipeline
│   │   ├── pipeline.js     Orchestrates: parse → fingerprint → classify → map
│   │   ├── parser.js       Error message parsing
│   │   ├── fingerprint.js  Error deduplication via stable fingerprinting
│   │   ├── classifier.js   Parsed error → BugEvent classification
│   │   ├── species-mapper.js BugEvent → BugMon species mapping
│   │   └── invariant-mapper.js Invariant violation → event mapping
│   ├── pipeline/           Multi-agent pipeline orchestration
│   │   ├── index.js        Pipeline entry point
│   │   ├── orchestrator.js Pipeline orchestrator
│   │   ├── stages.js       Pipeline stage definitions
│   │   └── roles.js        Pipeline role definitions
│   └── execution/          Execution adapters
│       └── adapters.js     Execution environment adapters
│
├── agentguard/             Governance runtime (deterministic RTA)
│   ├── monitor.js          Closed-loop feedback (escalation, violation tracking)
│   ├── core/               Core governance engine
│   │   ├── aab.js          Action Authorization Boundary
│   │   └── engine.js       Runtime Assurance (RTA) engine
│   ├── policies/           Policy evaluation
│   │   ├── evaluator.js    Policy compliance checking
│   │   └── loader.js       Policy loader from JSON
│   ├── invariants/         Invariant verification
│   │   ├── checker.js      Runtime invariant checker
│   │   └── definitions.js  Invariant registry
│   └── evidence/           Audit trail
│       └── pack.js         Evidence collection & reporting
│
├── policy/                 Policy configuration (JSON)
│   ├── action_rules.json   Capability rules per agent action
│   └── capabilities.json   Available action categories
│
├── runtime/                Event tracing & replay
│   ├── events/             Event log storage
│   └── replay/             Replay data
│
├── src/                    TypeScript refactoring (in progress)
│   ├── cli/                Commander-based CLI (index.ts, commands/)
│   ├── core/               Typed core (types.ts, event-bus.ts, bug-engine.ts)
│   ├── game/               Game engine modules (engine.ts, renderer.ts, loop.ts)
│   ├── watchers/           Environment watchers (console, test, build)
│   └── ai/                 AI integration interface
│
├── simulation/             Headless battle simulation
│   ├── cli.js              CLI entry point (seeded RNG)
│   ├── simulator.js        Battle simulator engine
│   ├── headlessBattle.js   Headless battle runner
│   ├── strategies.js       AI battle strategies
│   ├── report.js           Simulation report generator
│   └── rng.js              Seeded random number generator
│
├── tests/                  Test suite (77 JS + 4 TS test files)
│   ├── run.js              Test runner
│   └── *.test.js           Tests covering all modules
│
├── scripts/                Build tooling
│   ├── build.js            Single-file builder (esbuild + terser → dist/index.html)
│   ├── dev-server.js       Zero-dependency dev server with live reload
│   ├── sync-data.js        JSON → JS module converter
│   └── prune-merged-branches.sh  Git branch cleanup
│
├── docs/                   System documentation
│   ├── unified-architecture.md  AgentGuard + BugMon integration
│   ├── agentguard.md       Governance runtime specification
│   ├── event-model.md      Canonical event schema
│   ├── bug-event-pipeline.md Signal normalization pipeline
│   ├── roguelike-design.md Debugging-as-roguelike mechanics
│   ├── plugin-api.md       Extension points
│   ├── sequence-diagrams.md System flow diagrams
│   ├── product-positioning.md What this is and isn't
│   └── current-priorities.md Active development phase
│
├── hooks/                  Git hooks for dev activity tracking
│   ├── post-commit         Increments commit counter
│   └── post-merge          Increments merge counter
│
└── .github/
    ├── workflows/          CI/CD automation
    ├── scripts/            Validation and generation scripts
    └── ISSUE_TEMPLATE/     Community submission forms
```

## Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│  index.html / simulate.js        (entry points)        │
├─────────────────────────────────────────────────────────┤
│  core/                     CLI companion & shared logic  │
│  ├── cli/*                 Terminal UI, watch adapter    │
│  ├── sources/*             Event source adapters         │
│  ├── matcher.js            Error → enemy matching        │
│  └── error-parser.js       Error parsing (40+ patterns)  │
├─────────────────────────────────────────────────────────┤
│  game/                     Browser roguelike             │
│  ├── engine/*              State, input, rendering       │
│  ├── battle/*              Combat engine + damage calc   │
│  ├── world/*               Dungeon, player, encounters   │
│  ├── evolution/*           Dev-activity progression      │
│  ├── audio/*               Synthesized sound effects     │
│  ├── sync/*                Save/load + CLI sync          │
│  └── sprites/*             Sprite loading + generation   │
├─────────────────────────────────────────────────────────┤
│  agentguard/               Governance runtime (RTA)      │
│  ├── core/*                AAB + RTA engine              │
│  ├── policies/*            Policy evaluation + loading   │
│  ├── invariants/*          Invariant checking            │
│  ├── evidence/*            Evidence pack generation      │
│  └── monitor.js            Closed-loop feedback          │
├─────────────────────────────────────────────────────────┤
│  domain/                   Pure domain logic (no deps)   │
│  ├── battle.js             Pure battle engine            │
│  ├── encounters.js         Encounter logic               │
│  ├── evolution.js          Progression engine            │
│  ├── event-bus.js          Universal EventBus            │
│  ├── events.js             Domain event definitions      │
│  ├── source-registry.js    Event source plugin registry  │
│  ├── ingestion/*           Error ingestion pipeline      │
│  └── pipeline/*            Multi-agent orchestration     │
├─────────────────────────────────────────────────────────┤
│  ecosystem/                Game content & metagame        │
│  ├── data/*.json           Source data (monsters, moves)  │
│  ├── data/*.js             Inlined JS modules            │
│  ├── bugdex.js             Bug Grimoire                  │
│  └── bosses.js             Boss definitions              │
├─────────────────────────────────────────────────────────┤
│  src/ (TypeScript)         In-progress TS refactoring    │
│  ├── cli/*                 Commander-based CLI           │
│  ├── core/*                Typed EventBus, BugEngine     │
│  ├── game/*                Game engine modules           │
│  └── watchers/*            Environment watchers          │
└─────────────────────────────────────────────────────────┘
```

**Key separation:**
- **core/** — Node.js code for the CLI. Parses errors, matches them to enemies, renders to terminal. Includes `sources/` for event source adapters. Runs in Node.js only.
- **game/** — Browser roguelike. Engine, battle, dungeon, progression, audio, sprites. Runs in the browser only.
- **agentguard/** — Governance runtime implementing the Runtime Assurance Architecture. Evaluates agent actions against policies and invariants. Produces canonical governance events.
- **domain/** — Pure domain logic with no DOM or Node.js-specific APIs. Battle engine, encounter logic, progression engine, event bus, error ingestion pipeline, multi-agent pipeline orchestration, governance primitives, and source registry. All functions are pure and deterministic (when RNG is injected). Consumed by both core/ and game/.
- **ecosystem/** — Shared game content (JSON data, Bug Grimoire, bosses). Consumed by both core/ and game/.

**Invariant:** `core/` and `game/` have no cross-imports. Both consume from `ecosystem/` and `domain/`.

## AgentGuard Governance Pipeline

AgentGuard evaluates agent actions through a deterministic pipeline. See [docs/agentguard.md](docs/agentguard.md) for the full specification.

```
Agent Action → AAB → Policy Evaluation → Invariant Check → Blast Radius
    │                                                           │
    ├─ ALLOW → execute action                                   │
    └─ DENY → emit governance event → evidence pack             │
              → BugMon spawns governance boss                   │
```

Governance events conform to the canonical event schema:
- `PolicyDenied` (severity 3)
- `UnauthorizedAction` (severity 4)
- `InvariantViolation` (severity 5)
- `BlastRadiusExceeded` (severity 4)
- `MergeGuardFailure` (severity 4)

## BugMon Roguelike Engine

BugMon implements a roguelike with hybrid idle/active encounters. See [docs/roguelike-design.md](docs/roguelike-design.md) for the full design.

**Run lifecycle:** Session start → event monitoring → encounter generation → idle/active combat → run end

**Idle mode:** Minor enemies (severity 1-2) auto-resolve in background. Developer sees notification log.

**Active mode:** Bosses and elites (severity 3+) interrupt and require player input.

**Bug Grimoire:** Permanent compendium of defeated enemy types. Records encounter history, error patterns, and fix strategies.

## Event Normalization Pipeline

The pipeline transforms raw signals into canonical events. See [docs/bug-event-pipeline.md](docs/bug-event-pipeline.md) for the full pipeline specification.

```
source → parse → normalize → classify → dedupe → persist → emit
```

Implementation: `domain/ingestion/` with supporting modules in `core/`.

## Module Dependency Graph

```
game/game.js (entry point, browser)
├── game/engine/events.js        (no deps — event bus)
├── game/engine/state.js         ← game/engine/events.js
├── game/engine/input.js         ← game/audio/sound.js
├── game/engine/renderer.js      ← game/sprites/sprites.js, game/sprites/monsterGen.js
├── game/engine/transition.js    ← game/audio/sound.js
├── game/engine/title.js         ← game/engine/input.js, game/engine/state.js, game/audio/sound.js
├── game/world/map.js            (no deps)
├── game/world/player.js         ← game/engine/input.js, game/world/map.js, game/audio/sound.js
├── game/world/encounters.js     ← game/audio/sound.js
├── game/battle/damage.js        (no deps — pure math)
├── game/battle/battleEngine.js  ← game/battle/damage.js, game/engine/input.js, game/engine/state.js,
│                                   game/engine/events.js, game/world/player.js, game/audio/sound.js
├── game/evolution/tracker.js    (localStorage + .events.json)
├── game/evolution/evolution.js  ← game/evolution/tracker.js
├── game/evolution/animation.js  ← game/engine/renderer.js, game/audio/sound.js
├── game/sync/save.js            (localStorage persistence)
├── game/audio/sound.js          (no deps, Web Audio API)
├── game/sprites/sprites.js      (no deps, image loader)
├── game/sprites/monsterGen.js   (no deps, procedural sprite gen)
├── game/sprites/tiles.js        (no deps, procedural tile gen)
├── ecosystem/data/monsters.js   (inlined data module)
├── ecosystem/data/moves.js      (inlined data module)
├── ecosystem/data/types.js      (inlined data module)
└── ecosystem/data/evolutions.js (inlined data module)

core/cli/bin.js (entry point, Node.js CLI)
├── core/error-parser.js         ← error parsing
├── core/stacktrace-parser.js    ← stack trace analysis
├── core/matcher.js              ← error → enemy matching
└── core/cli/*                   ← CLI subsystems
```

## Game State Machine

```
┌─────────┐  new/continue  ┌─────────┐  encounter  ┌──────────────────┐  done  ┌─────────┐
│  TITLE  │───────────────>│ EXPLORE │────────────>│ BATTLE_TRANSITION │──────>│ BATTLE  │
│         │                │         │<────────────│  (flash + fade)   │       │         │
└─────────┘                └─────────┘  win/run    └──────────────────┘       └─────────┘
                                │                        ~860ms
                                │
                           progression trigger
                                │
                                v
                           ┌──────────┐
                           │ EVOLVING │  (4-phase animation)
                           └──────────┘
```

States: `TITLE`, `EXPLORE`, `BATTLE_TRANSITION`, `BATTLE`, `EVOLVING`, `MENU`

## Battle System

Two battle APIs coexist in `game/battle/battle-core.js`:
1. **Original API** (`executeTurn`, `simulateBattle`) — used by `simulate.js` and `battleEngine.js`
2. **Spec-based API** (`resolveTurn`, `createPureBattleState`) — fully immutable, PP tracking, accuracy

### Turn Resolution
1. Compare speeds — faster combatant goes first (ties: player)
2. Apply damage: `power + attack - floor(defense/2) + random(1-3)` (min 1)
3. Type multiplier: 0.5x (not effective), 1.0x (neutral), 1.5x (super effective)
4. Critical hit: 6.25% chance for 1.5x damage
5. Check KO after each attack
6. If both alive, return to menu

### Passive Abilities
- **RandomFailure** (50% threshold): Defender negates incoming damage
- **NonDeterministic** (25% threshold): Attacker acts twice in same turn

### Boss Encounters

Bosses spawn from systemic failures via threshold triggers defined in `ecosystem/bosses.js`:

| Boss | Trigger | Threshold |
|------|---------|-----------|
| Test Suite Hydra | Multiple test failures | 3 in session |
| CI Dragon | Pipeline failure | 1 occurrence |
| Dependency Kraken | npm conflict | 1 occurrence |
| Memory Leak Titan | Heap growth | 1 occurrence |

## Data Formats

All game data lives in `ecosystem/data/`. JSON files are the source of truth; JS modules are generated via `npm run sync-data`.

### monsters.json
```json
{
  "id": 1, "name": "NullPointer", "type": "backend",
  "hp": 30, "attack": 8, "defense": 4, "speed": 6,
  "moves": ["segfault", "unhandledexception", "memoryaccess"],
  "color": "#e74c3c", "sprite": "nullpointer",
  "rarity": "common", "theme": "runtime error",
  "passive": null, "description": "..."
}
```

### moves.json
```json
{ "id": "segfault", "name": "SegFault", "power": 10, "type": "backend" }
```

### types.json
7 types: `frontend`, `backend`, `devops`, `testing`, `architecture`, `security`, `ai`. Effectiveness chart maps attacker → defender → multiplier (0.5x / 1.0x / 1.5x).

### evolutions.json
```json
{
  "id": "callback_chain", "name": "Async Evolution",
  "stages": [{ "monsterId": 2, "name": "CallbackHell" }, ...],
  "triggers": [{ "from": 2, "to": 23,
    "condition": { "event": "commits", "count": 10 },
    "description": "Make 10 commits" }]
}
```

### map.json
Tile values: `0` = ground, `1` = wall, `2` = tall grass (encounter zone)

## Plugin Architecture

The system supports five extension categories. See [docs/plugin-api.md](docs/plugin-api.md).

1. **Event sources** — feed new signal types into the normalization pipeline
2. **Content packs** — community-contributed enemies, moves, and progression chains
3. **Renderers** — terminal, browser, mobile, editor integrations
4. **Policy packs** — AgentGuard governance rule sets
5. **Replay processors** — event stream analysis and transformation

## Event Replay

Events are immutable and ordered. A stored event stream can be replayed to reconstruct any past session. Given the same events and RNG seed, replay produces identical encounters.

See [docs/sequence-diagrams.md](docs/sequence-diagrams.md) for replay flow diagrams.

## Build System

```bash
npm run build          # Full build with inline sprites
npm run build:tiny     # Build without sprites (smallest)
npm run budget         # Check size budget compliance
```

Pipeline: esbuild (minification, dead code elimination) → terser (3-pass compression) → single HTML file with inlined CSS and JS.

## Size Budget

| Metric | Target | Hard Cap |
|--------|-------:|--------:|
| Bundle (gzipped, no sprites) | 10 KB | 17 KB |
| Bundle (gzipped, with sprites) | ~19 KB | 32 KB |

Subsystem caps (raw bytes): engine (7.5 KB), rendering (15.5 KB), battle (14.5 KB), data (13.2 KB), game-logic (19.5 KB), infrastructure (7 KB).

## Testing

```bash
npm test               # Run JS tests (77 test files)
npm run ts:test        # Run TypeScript tests (4 test files, vitest)
npm run test:coverage  # Run with coverage (c8, 50% threshold)
npm run simulate -- --all --runs 100   # Balance analysis
```

81 test files (77 JS + 4 TS) covering: battle, damage, encounters, evolution, ingestion pipeline, event bus, game loop, input, map, renderer, save, simulation, sprites, sync, governance (AAB, RTA, invariants, monitor), and more.

## Architectural Invariants

1. **Layer boundaries are strict.** `core/` must not import from `game/`. `game/` must not import from `core/`.
2. **`battle-core.js` must stay pure.** Zero UI, audio, or DOM dependencies.
3. **JSON is the source of truth.** `.js` data modules are generated artifacts.
4. **Contributed enemies require no code changes.** New BugMon are added entirely through JSON edits.
5. **Zero runtime dependencies in browser game.** No npm packages in shipped browser code. CLI has runtime deps (`chokidar`, `commander`, `pino`).
6. **Deterministic battle engine.** Same inputs + same RNG seed = same outputs.
7. **Universal EventBus.** Works identically in Node.js and browser.
