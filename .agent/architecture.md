# Architecture Contract

## Layers

The codebase is organized into four layers with strict dependency rules.

```
                ┌──────────┐    ┌──────────┐
                │  core/   │    │  game/   │
                │ (Node.js │    │ (Browser │
                │   CLI)   │    │ Canvas)  │
                └────┬─────┘    └────┬─────┘
                     │               │
           ┌─────────┼───────────────┼─────────┐
           │         ▼               ▼         │
           │    ┌────────────────────────┐     │
           │    │     ecosystem/         │     │
           │    │  (Shared game content) │     │
           │    └────────────────────────┘     │
           │                                   │
           │    ┌────────────────────────┐     │
           │    │      domain/           │     │
           │    │  (Pure domain logic)   │     │
           │    └────────────────────────┘     │
           └───────────────────────────────────┘
```

### domain/ — Pure Domain Logic

Environment-agnostic. No DOM APIs, no Node.js-specific APIs. All functions are pure and deterministic when RNG is injected. Contains:

- `events.js` — Canonical event schema (45 event kinds) and factory
- `event-bus.js` — Universal pub/sub (works in Node.js and browser)
- `battle.js` — Deterministic battle engine with passive abilities
- `encounters.js` — Encounter trigger logic with rarity-weighted selection
- `evolution.js` — Progression condition checking
- `hash.js` — Deterministic string hashing (DJB2)
- `ingestion/` — Multi-stage error normalization pipeline

### core/ — CLI Companion (Node.js)

Node.js runtime code. Depends on domain/ and ecosystem/. Contains:

- `error-parser.js` — 40+ regex patterns across 6+ languages
- `stacktrace-parser.js` — Stack trace analysis
- `bug-event.js` — BugEvent type definition and severity mapping
- `matcher.js` — Error-to-creature matching
- `cli/` — Terminal UI, encounter logic, Claude Code hook, WebSocket sync

### game/ — Browser Roguelike (Client-Side)

Browser-only code using Canvas 2D and Web Audio API. Depends on domain/ and ecosystem/. Contains:

- `engine/` — State machine, input, renderer, transitions
- `world/` — Map, player, encounter triggers
- `battle/` — UI-connected battle system (delegates to domain/battle.js)
- `evolution/` — Progression UI and dev activity tracking
- `audio/` — Synthesized sound effects (no audio files)
- `sprites/` — Procedural and static pixel art
- `sync/` — Save system (localStorage) and WebSocket client

### ecosystem/ — Shared Game Content

Consumed by both core/ and game/. Contains:

- `data/` — JSON source of truth + inlined JS modules (monsters, moves, types, evolutions, map)
- `bugdex.js` — Bug Grimoire system
- `bosses.js` — Boss encounter definitions
- `storage.js` — Persistence abstraction (localStorage or filesystem)
- `sync-protocol.js` — WebSocket message constants

## Dependency Rules

1. **domain/ depends on nothing** — it is the pure foundation
2. **ecosystem/ depends on nothing** — it is shared data
3. **core/ depends on domain/ and ecosystem/** — never on game/
4. **game/ depends on domain/ and ecosystem/** — never on core/
5. **No circular dependencies** between any layers
6. **No cross-environment code** — domain/ must not use DOM or Node.js APIs

## Module System

All source uses ES6 `import`/`export`. No CommonJS. No bundler required. Browser loads `game/game.js` as a `<script type="module">`.

## Data Flow

```
Event Sources (stderr, tests, CI, agent actions)
    → domain/ingestion/ (parse → fingerprint → classify → map)
    → Canonical Event (domain/events.js schema)
    → EventBus (domain/event-bus.js)
    → Subscribers (BugMon renderers, Grimoire, stats, AgentGuard audit)
```
