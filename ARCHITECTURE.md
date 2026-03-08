# BugMon Architecture

## Overview

BugMon is a Pokémon-style browser game themed around software bugs. It runs entirely client-side with vanilla JS, HTML Canvas, and zero runtime dependencies. Serve it with any static file server and open `index.html`.

```
python3 -m http.server
# open http://localhost:8000
```

Also deployable to GitHub Pages — see `.github/workflows/deploy.yml`.

## Project Structure

The codebase follows a **layered architecture** with four top-level directories separating concerns:

```
BugMon/
├── index.html              Entry point - canvas, touch controls, loads game.js
├── simulate.js             Battle simulator CLI (Node.js)
├── package.json            npm scripts (simulate, serve, build, test)
│
├── core/                   CLI companion & shared logic (Node.js)
│   ├── matcher.js          Error → BugMon matching logic
│   ├── error-parser.js     Error message parser
│   ├── stacktrace-parser.js Stack trace analysis
│   ├── bug-event.js        Bug event definitions
│   └── cli/                CLI tool (bugmon command)
│       ├── bin.js           Entry point (bugmon command)
│       ├── adapter.js       CLI watch adapter
│       ├── args.js          Lightweight CLI argument parser (zero deps)
│       ├── auto-walk.js     Auto-walk feature
│       ├── boss-battle.js   Boss battle interactive encounter
│       ├── catch.js         Catch/cache mechanic
│       ├── claude-hook.js   Claude Code PostToolUse hook (error encounters)
│       ├── claude-init.js   Claude Code integration setup
│       ├── colors.js        Shared ANSI color constants
│       ├── contribute.js    Contribution prompt
│       ├── demo.js          Demo encounter launcher
│       ├── encounter.js     CLI encounter logic
│       ├── init.js          Git hooks installer for evolution tracking
│       ├── renderer.js      Terminal renderer (ANSI)
│       ├── resolve.js       Bug resolve/XP mechanic
│       ├── scan.js          Error scanning feature
│       ├── sync-server.js   WebSocket sync server (zero deps)
│       └── bugmon-legacy.js Legacy CLI version
│
├── game/                   Browser game (client-side)
│   ├── game.js             Game loop, data loading, orchestration
│   ├── engine/             Core engine (framework-level)
│   │   ├── state.js        Game state machine with named transitions
│   │   ├── events.js       Event bus for decoupled system communication
│   │   ├── input.js        Keyboard + touch input (pressed/just-pressed/simulate)
│   │   ├── renderer.js     All Canvas drawing functions
│   │   ├── transition.js   Battle transition animation (flash/fade)
│   │   └── title.js        Title screen (ASCII logo, starfield, menu)
│   ├── world/              Overworld systems
│   │   ├── map.js          Map data loading, tile queries, collision
│   │   ├── player.js       Player position, movement, party
│   │   └── encounters.js   Wild encounter checks (10% in tall grass)
│   ├── battle/             Battle systems
│   │   ├── battle-core.js  Pure battle engine (no UI/audio — testable, simulatable)
│   │   ├── battleEngine.js Battle UI controller (connects core to input/audio)
│   │   └── damage.js       Damage formula
│   ├── evolution/          Evolution system
│   │   ├── evolution.js    Checks conditions, triggers evolutions
│   │   ├── tracker.js      Dev activity tracker (localStorage + .events.json)
│   │   └── animation.js    Evolution visual sequence (flash, morph, reveal)
│   ├── audio/              Sound effects (Web Audio API, no files)
│   │   └── sound.js        Synthesized sound effects and mute control
│   ├── sync/               Save/sync system
│   │   ├── save.js         Browser-side save/load (localStorage)
│   │   └── client.js       Client-side sync (WebSocket to CLI)
│   └── sprites/            Pixel art sprites (PNG images)
│       ├── sprites.js      Image loader with preload and fallback
│       ├── monsterGen.js   Procedural monster sprite generation
│       ├── tiles.js        Procedural tile texture generation
│       ├── SPRITE_GUIDE.md Art specs, palettes, and generation prompts
│       └── *.png           Battle sprites (64x64) and player sprites (32x32)
│
├── ecosystem/              Game content & metagame systems
│   ├── data/               All game data (JSON source + JS modules)
│   │   ├── monsters.json   BugMon creatures, stats, and sprite refs
│   │   ├── monsters.js     Inlined JS module (imported by game)
│   │   ├── moves.json      Move definitions
│   │   ├── moves.js        Inlined JS module
│   │   ├── types.json      Type system and effectiveness chart
│   │   ├── types.js        Inlined JS module
│   │   ├── evolutions.json Evolution chains with dev-activity triggers
│   │   ├── evolutions.js   Inlined JS module
│   │   ├── map.json        Tile grid for the world map
│   │   └── mapData.js      Inlined JS module
│   ├── bugdex.js           BugDex collection system
│   ├── bugdex-spec.js      BugDex specification
│   ├── bosses.js           Boss encounter definitions
│   ├── storage.js          Shared storage utilities
│   └── sync-protocol.js    Shared WebSocket sync protocol constants
│
├── domain/                 Pure domain logic (no DOM, no Node.js-specific APIs)
│   ├── battle.js           Pure battle engine (deterministic with injected RNG)
│   ├── encounters.js       Pure encounter logic (rarity weights, trigger checks)
│   ├── event-bus.js        Universal EventBus (works in Node.js and browser)
│   ├── events.js           Canonical domain event definitions
│   ├── evolution.js        Pure evolution engine (no localStorage)
│   └── ingestion/          Error ingestion pipeline
│       ├── pipeline.js     Orchestrates: parse → fingerprint → classify → map
│       ├── parser.js       Error message and stack trace parsing
│       ├── fingerprint.js  Error deduplication via stable fingerprinting
│       ├── classifier.js   Parsed error → BugEvent classification
│       └── species-mapper.js BugEvent → BugMon species mapping
│
├── tests/                  Test suite (52 test files)
│   ├── run.js              Test runner
│   └── *.test.js           Tests covering all modules (battle, damage, data, encounters,
│                           evolution, ingestion pipeline, CLI, game loop, and more)
│
├── scripts/                Build tooling
│   ├── build.js            Single-file builder (esbuild + terser → dist/index.html)
│   ├── dev-server.js       Zero-dependency dev server with live reload
│   ├── sync-data.js        JSON → JS module converter
│   └── prune-merged-branches.sh  Git branch cleanup
│
├── simulation/             Headless battle simulation
│   ├── cli.js              CLI entry point (seeded RNG version)
│   ├── simulator.js        Battle simulator engine
│   ├── headlessBattle.js   Headless battle runner
│   ├── strategies.js       AI battle strategies
│   ├── report.js           Simulation report generator
│   └── rng.js              Seeded random number generator
│
├── examples/               Error examples for CLI testing
│   ├── async-error.js
│   ├── null-error.js
│   ├── reference-error.js
│   ├── stack-overflow.js
│   ├── syntax-error.js
│   └── module-error.js
│
├── hooks/                  Git hooks for dev activity tracking
│   ├── post-commit         Increments commit counter in .events.json
│   └── post-merge          Increments merge counter in .events.json
│
└── .github/
    ├── workflows/
    │   ├── deploy.yml          GitHub Pages auto-deploy on push to main
    │   ├── validate-bugmon.yml Validates community BugMon submissions
    │   ├── approve-bugmon.yml  Auto-adds approved BugMon to game data
    │   ├── validate.yml        General data validation
    │   ├── size-check.yml      Bundle size check (enforces byte budget)
    │   ├── codeql.yml          CodeQL security scanning
    │   ├── publish.yml         npm package publishing
    │   └── release.yml         Release automation
    ├── scripts/
    │   ├── validate-submission.cjs  Parses + validates issue form data
    │   ├── battle-preview.cjs       Generates battle preview for submissions
    │   ├── generate-bugmon.cjs      Generates BugMon JSON from approved issue
    │   └── validate-data.mjs        Data validation script
    └── ISSUE_TEMPLATE/
        ├── new-bugmon.yml      Issue form for community BugMon submissions
        ├── new-move.yml        Issue form for new move submissions
        ├── bug-report.yml      Bug report template
        └── balance-report.yml  Balance issue reports
```

## Layered Architecture

The codebase is organized into four layers:

```
┌─────────────────────────────────────────────────────────┐
│  index.html / simulate.js        (entry points)        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  core/                     CLI companion & shared logic  │
│  ├── cli/*                 Terminal UI, watch adapter    │
│  ├── matcher.js            Error → BugMon matching      │
│  └── error-parser.js       Error parsing                │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  game/                     Browser game (client-side)    │
│  ├── engine/*              State, input, rendering       │
│  ├── battle/*              Combat engine + damage calc   │
│  ├── world/*               Map, player, encounters       │
│  ├── evolution/*           Dev-activity evolution        │
│  ├── audio/*               Synthesized sound effects     │
│  ├── sync/*                Save/load + CLI sync          │
│  └── sprites/*             Sprite loading + generation   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  domain/                   Pure domain logic (no deps)   │
│  ├── battle.js             Pure battle engine            │
│  ├── encounters.js         Encounter logic               │
│  ├── evolution.js          Evolution engine               │
│  ├── event-bus.js          Universal EventBus            │
│  ├── events.js             Domain event definitions      │
│  └── ingestion/*           Error ingestion pipeline      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ecosystem/                Game content & metagame        │
│  ├── data/*.json           Source data (monsters, moves)  │
│  ├── data/*.js             Inlined JS modules            │
│  ├── bugdex.js             Collection tracking           │
│  └── bosses.js             Boss definitions              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Key separation:**
- **core/** — Node.js code for the CLI companion tool. Parses errors, matches them to BugMon, renders to terminal. Runs in Node.js only.
- **game/** — Browser game code. Engine, battle, world, evolution, audio, sprites. Runs in the browser only.
- **domain/** — Pure domain logic with no DOM or Node.js-specific APIs. Battle engine, encounter logic, evolution engine, event bus, and error ingestion pipeline. All functions are pure and deterministic (when RNG is injected). Consumed by both core/ and game/.
- **ecosystem/** — Shared game content (JSON data, BugDex, bosses). Consumed by both core/ and game/.

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
├── game/world/encounters.js     ← game/audio/sound.js (receives data via setter)
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

simulate.js (entry point, Node.js CLI)
└── game/battle/battle-core.js   ← game/battle/damage.js (pure logic only)

core/cli/bin.js (entry point, Node.js CLI companion)
├── core/error-parser.js         ← error parsing
├── core/stacktrace-parser.js    ← stack trace analysis
├── core/matcher.js              ← error → monster matching
└── core/cli/*                   ← CLI subsystems
```

All modules use ES Module `import`/`export`. Game data lives in `ecosystem/data/` as both JSON source files and inlined JS modules. The game imports the JS modules directly (no `fetch()` needed).

## Game State Machine

```
┌─────────┐  new/continue  ┌─────────┐  encounter  ┌──────────────────┐  done  ┌─────────┐
│  TITLE  │───────────────>│ EXPLORE │────────────>│ BATTLE_TRANSITION │──────>│ BATTLE  │
│         │                │         │<────────────│  (flash + fade)   │       │         │
└─────────┘                └─────────┘  win/run/   └──────────────────┘       └─────────┘
                                │       cache            ~860ms
                                │
                           evolution trigger
                                │
                                v
                           ┌──────────┐
                           │ EVOLVING │  (4-phase animation)
                           └──────────┘
```

### EXPLORE State
- Player moves on a tile grid (arrow keys or D-pad)
- 150ms cooldown between moves
- Walking on grass (tile 2) has 10% encounter chance

### BATTLE_TRANSITION State
- 3 quick white flashes over the map view
- Fade to black
- Hold black briefly
- Total duration: ~860ms
- Then enters BATTLE state

### BATTLE State
Battle has its own sub-states:

```
┌──────┐  pick move   ┌───────┐
│ menu │──────────────>│ fight │
│      │<──── Esc ─────│       │
└──┬───┘               └───┬───┘
   │                       │
   │ capture/run     Enter │
   │                       v
   └──────────────>┌─────────┐  timer  ┌──────────┐
                   │ message │────────>│ next     │
                   └─────────┘         │ action   │
                                       └──────────┘
```

- **menu**: Choose Fight / Capture / Run
- **fight**: Pick a move from your BugMon's moveset
- **message**: Display result text for 1.5s, then execute next action

### Turn Resolution
1. Compare speeds - faster BugMon goes first (ties: player)
2. Apply damage: `power + attack - floor(defense/2) + random(1-3)` (min 1)
3. Check KO after each attack
4. If both alive, return to menu

### Capture Formula
```
chance = (1 - enemyHP/maxHP) * 0.5 + 0.1
```
At full HP: 10% chance. At 1 HP: ~60% chance. Failed capture = enemy gets a free turn.

## Input System

Unified input system supporting both keyboard and touch:

- **Keyboard**: `keydown`/`keyup` events tracked in `keys` map
- **Touch**: `simulatePress(key)`/`simulateRelease(key)` called by touch button handlers in `index.html`
- **API**: `wasPressed(key)` for one-shot actions, `isDown(key)` for held state
- `clearJustPressed()` called each frame after update

### Controls
| Action | Keyboard | Touch |
|--------|----------|-------|
| Move | Arrow keys | D-pad |
| Confirm | Enter | A button |
| Back | Escape | B button |

## Data Formats

All game data lives in `ecosystem/data/`. JSON files are the source of truth; JS modules are generated from them via `node scripts/sync-data.js`.

### monsters.json
```json
{
  "id": 1,
  "name": "NullPointer",
  "type": "backend",
  "hp": 30, "attack": 8, "defense": 4, "speed": 6,
  "moves": ["segfault", "unhandledexception", "memoryaccess"],
  "color": "#e74c3c",
  "sprite": "nullpointer",
  "rarity": "common",
  "theme": "runtime error",
  "evolution": "OptionalChaining",
  "evolvesTo": 21,
  "passive": null,
  "description": "Art prompt for sprite generation..."
}
```

### moves.json
```json
{ "id": "segfault", "name": "SegFault", "power": 10, "type": "backend" }
```

### types.json
7 types: `frontend`, `backend`, `devops`, `testing`, `architecture`, `security`, `ai`. Effectiveness chart is a nested object mapping attacker type → defender type → multiplier (0.5x / 1.0x / 1.5x).

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
Tile values: `0` = ground, `1` = wall, `2` = tall grass
```json
{ "width": 15, "height": 10, "tiles": [[1,1,...], ...] }
```

## Sprite System

Image-based sprites loaded at startup via `game/sprites/sprites.js`:

- **Battle sprites**: 64x64 PNG, transparent background, loaded by `sprite` field in monsters.json
- **Player sprites**: 32x32 PNG, 4 directional frames (`player_down.png`, etc.)
- **Fallback**: colored rectangles if a PNG fails to load
- **Preload**: all sprites loaded via `preloadAll()` before game starts
- `imageSmoothingEnabled = false` keeps pixel art crisp when scaled

See `game/sprites/SPRITE_GUIDE.md` for art specs and generation prompts.

## Rendering

- Canvas: 480x320 (15x10 tiles at 32px)
- Scales to fit screen width on mobile (`max-width: 100%`)
- Tiles: procedurally generated textures (ground with pebbles, brick walls, animated grass)
- Player: directional sprite (cyberpunk debugger with teal visor)
- Battle: split screen with sprites, HP bars, and text menu
- Transition: white flash overlay → fade to black between explore and battle

## Mobile Support

- Touch controls auto-shown on touch devices and narrow screens (<600px)
- D-pad (left) for movement, A/B buttons (right) for confirm/back
- `touch-action: none` prevents browser zoom/scroll
- `user-scalable=no` in viewport meta
- Canvas scales responsively

## Audio System

All sound effects are synthesized at runtime using the Web Audio API — no audio files needed.

- **Module**: `game/audio/sound.js` — single module with exported `play*()` functions
- **AudioContext**: Created lazily on first call, resumed on user interaction to comply with autoplay policies
- **Unlock**: `unlock()` is called on every `keydown` and `simulatePress` (idempotent)
- **Master volume**: All sounds route through a single `GainNode` for volume/mute control
- **Mute toggle**: `toggleMute()` sets master gain to 0 or restores it; wired to the speaker button in the UI

### Sound Effects

| Event | Function | Synthesis |
|-------|----------|-----------|
| Menu navigate | `playMenuNav()` | Square wave blip, 880Hz |
| Menu confirm | `playMenuConfirm()` | Two ascending square tones |
| Menu cancel | `playMenuCancel()` | Descending frequency sweep |
| Footstep | `playFootstep()` | Quiet triangle blip |
| Encounter | `playEncounterAlert()` | 4-note ascending arpeggio (C-E-G-C) |
| Transition flash | `playTransitionFlash()` | White noise burst |
| Attack hit | `playAttack()` | Noise burst + descending sine sweep |
| Faint | `playFaint()` | Long descending triangle tone |
| Capture success | `playCaptureSuccess()` | 5-note ascending sine jingle |
| Capture failure | `playCaptureFailure()` | "Boing" pitch sweep |
| Battle victory | `playBattleVictory()` | Ascending jingle (lower octave) |

## Evolution System

BugMon evolve based on real developer activity tracked via git hooks and localStorage:

- **game/evolution/tracker.js** — tracks 10 event types (commits, PRs merged, bugs fixed, etc.)
- **game/evolution/evolution.js** — checks if conditions are met, calculates progress percentage
- **game/evolution/animation.js** — renders 4-phase visual sequence (announce → flash → reveal → complete) with particles and glow
- **ecosystem/data/evolutions.json** — defines evolution chains with dev-activity triggers
- **Git hooks** — `hooks/post-commit` and `hooks/post-merge` write to `.events.json` for the tracker

Console API for testing: `window.bugmon.log('commits')`

## Save/Sync System

- **game/sync/save.js** — browser-side persistence via localStorage (party, BugDex, position, auto-save every 30s)
- **game/sync/client.js** — WebSocket client that auto-connects to CLI sync server for real-time state push/pull
- **core/cli/sync-server.js** — zero-dependency WebSocket server for CLI ↔ browser bridge

## Build System

The build system produces a single-file distribution (`dist/index.html`):

```bash
npm run build          # Full build with inline sprites
npm run build:tiny     # Build without sprites (smallest)
npm run budget         # Check size budget compliance
```

Pipeline: esbuild (minification, dead code elimination) → terser (3-pass compression, property mangling) → single HTML file with inlined CSS and JS.

Size budget enforcement is defined in `size-budget.json` with per-subsystem targets and hard caps. CI runs `size-check.yml` on every push.

## Testing

```bash
npm test               # Run all tests (52 test files)
npm run simulate       # Random battle matchup
npm run simulate -- --all --runs 100   # Full roster balance analysis
```

Test suite covers: auto-walk, battle-core, battle logic, battleEngine, bosses, bug events, bugdex, bugdex-spec, build output, catch, classifier, damage formula, data integrity, domain battle, domain encounters, domain event-bus, domain evolution, encounters, error-parser, events, evolution, evolution-animation, fingerprint, game-damage, game-loop, headless-battle, ingestion-parser, input, integration, map, matcher, monsterGen, pipeline, player, renderer, reporting, RNG, save, simulator, sound, species-mapper, sprites, stacktrace-parser, state, storage, strategies, sync-client, sync-protocol, tiles, title, tracker, transition.

## Architectural Invariants

These are hard rules, not suggestions. They protect the system as it scales.

1. **Layer boundaries are strict.** `core/` must not import from `game/`. `game/` must not import from `core/`. Both may import from `ecosystem/`. This keeps the CLI and browser game independently deployable.

2. **`battle-core.js` must stay pure.** `game/battle/battle-core.js` must have zero UI, audio, or DOM dependencies. It is the only battle module imported by the simulator (`simulate.js`). If battle logic needs UI feedback, it goes in `battleEngine.js`.

3. **JSON is the source of truth.** `ecosystem/data/*.json` files are canonical game data. The corresponding `*.js` modules are generated build artifacts produced by `scripts/sync-data.js`. Never hand-edit the `.js` modules — edit the JSON and run `npm run sync-data`.

4. **Contributed monsters require no code changes.** New BugMon are added entirely through JSON edits to `monsters.json` (and optionally `evolutions.json`, `moves.json`). The engine reads data at runtime. This is enforced by the community submission workflow.

5. **Sync is eventually consistent.** The CLI-to-browser sync system (`core/cli/sync-server.js` + `game/sync/client.js`) uses last-write-wins per field. Neither side is authoritative. BugDex, party, and storage merge independently.

6. **npm package ships CLI only.** `package.json` `"files"` includes only `core/` and `ecosystem/`. The browser game (`game/`) is excluded from the npm package and deployed separately via GitHub Pages.

## Key Design Decisions

- **Layered architecture** — `core/` (CLI), `game/` (browser), `ecosystem/` (shared data). Clear separation of concerns between Node.js CLI code, browser game code, and shared game content.
- **Inlined data modules** — Game data lives in `ecosystem/data/` as both JSON (source of truth) and JS modules (imported by the game). Run `npm run sync-data` to regenerate JS from JSON. No runtime `fetch()` needed.
- **ES Modules** over script tags: proper scoping, explicit dependencies
- **Setter functions** for data injection: some modules receive monster data via `setMonstersData()` for flexibility
- **Pure battle engine**: `game/battle/battle-core.js` contains all battle logic with zero UI/audio/DOM dependencies. This enables battle simulations, balance testing, and multiplayer without touching UI code
- **Event bus**: systems communicate via events (`MOVE_USED`, `BUGMON_FAINTED`, etc.) instead of calling each other directly, preventing tight coupling between battle logic, UI, and audio
- **State machine with named transitions**: `enterBattle()`, `exitBattle()`, etc. instead of raw `setState()` calls, making state flow explicit and preventing invalid transitions
- **Data-driven content**: all BugMon, moves, types, maps, and evolution chains live in `ecosystem/data/` JSON files. The engine reads data at runtime — no hardcoded monsters
- **Grid-locked movement**: player position is always integer tile coords. No sub-tile animation yet.
- **Message queue pattern**: battle uses `showMessage(text, callback)` to chain actions with visible pauses between them
- **Image sprites with fallback**: PNG files loaded at startup, graceful degradation to colored squares
- **Unified input**: keyboard and touch both feed into the same key state, so game logic doesn't need to know the input source
- **GitHub Pages deploy**: zero-config static hosting, auto-deploys on push to main

## Battle Simulator CLI

Run battles from the command line using the pure battle engine:

```bash
npm run simulate                              # Random matchup (verbose)
npm run simulate -- NullPointer Deadlock       # Specific matchup (verbose)
npm run simulate -- NullPointer Deadlock --runs 1000  # Statistical analysis
npm run simulate -- --all                      # Full roster round-robin
npm run simulate -- --all --runs 500           # Round-robin with custom sample
```

The simulator uses `game/battle/battle-core.js` directly with no browser dependencies. This enables balance testing, AI training data generation, and quick debugging.

## Event Bus

Systems subscribe to game events for decoupled communication:

```js
import { eventBus, Events } from './game/engine/events.js';

// Any system can listen
eventBus.on(Events.BUGMON_FAINTED, ({ name, side }) => { ... });
eventBus.on(Events.MOVE_USED, ({ attacker, move, damage }) => { ... });

// Battle engine emits events
eventBus.emit(Events.MOVE_USED, { attacker: 'NullPointer', move: 'SegFault', damage: 12 });
```

Available events: `BATTLE_STARTED`, `TURN_STARTED`, `MOVE_USED`, `DAMAGE_DEALT`, `BUGMON_FAINTED`, `CAPTURE_ATTEMPTED`, `CAPTURE_SUCCESS`, `CAPTURE_FAILED`, `BATTLE_ENDED`, `STATE_CHANGED`, `PLAYER_MOVED`, `ENCOUNTER_TRIGGERED`.
