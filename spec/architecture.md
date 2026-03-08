# Architecture Specification

## Four-Layer Model

```
┌─────────────────────────────────────────┐
│ core/    (Node.js only)                 │
│   CLI companion, error parsing, hooks   │
└────────────────┬────────────────────────┘
                 │ imports ↓
┌────────────────┴────────────────────────┐
│ domain/  (Environment-agnostic)         │
│   Pure logic: events, battle, encounters│
│   ingestion pipeline, evolution engine  │
└────────────────┬────────────────────────┘
                 │ imports ↓
┌────────────────┴────────────────────────┐
│ ecosystem/  (Shared content)            │
│   JSON data, Grimoire, bosses, storage  │
└────────────────┬────────────────────────┘
                 │ imports ↓
┌────────────────┴────────────────────────┐
│ game/    (Browser only)                 │
│   Canvas rendering, audio, UI, sprites  │
└─────────────────────────────────────────┘
```

## Dependency Rules

- **domain/** has zero external dependencies. No DOM APIs, no Node.js-specific APIs.
- **core/** depends on domain/ and ecosystem/. Never imports from game/.
- **game/** depends on domain/ and ecosystem/. Never imports from core/.
- **ecosystem/** depends on domain/ only. Never imports from core/ or game/.

## Key Subsystems

### Ingestion Pipeline (`domain/ingestion/`)

Five-stage pipeline converting raw errors into game entities:

1. **Parse** — Regex matching against 40+ error patterns across 6+ languages
2. **Fingerprint** — Stable hash for deduplication (same error = same fingerprint)
3. **Classify** — Map error type to severity (1-5 scale) and BugEvent
4. **Create Event** — Wrap in canonical event envelope with ID + fingerprint
5. **Map to Species** — BugEvent → BugMon monster species

### Battle Engine (`domain/battle.js`)

Pure, deterministic combat with injected RNG. Supports passive abilities, healing, and type effectiveness.

### Event System (`domain/events.js`, `domain/event-bus.js`)

Canonical event kinds: `ERROR_OBSERVED`, `MOVE_USED`, `EVOLUTION_TRIGGERED`, etc. EventBus provides pub/sub that works in both Node.js and browser.

### Game State Machine (`game/engine/state.js`)

States: `TITLE → EXPLORE → BATTLE_TRANSITION → BATTLE → EVOLVING → MENU`

## Data Flow

```
External Source → Ingestion Pipeline → Canonical Event → EventBus
                                                           ├→ Game (spawn enemy)
                                                           └→ AgentGuard (check policy)
```

## Size Budget

- Main bundle: 10 KB target / 17 KB cap (gzipped, no sprites)
- Subsystem caps enforced per module group
