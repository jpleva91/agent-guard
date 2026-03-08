# Current Priorities

## Active Phase: Phase 0 — Architecture Clarity

The system is in its architectural definition phase. Documentation and conceptual architecture are being established to define the unified AgentGuard + BugMon platform.

## What Is Implemented

The following systems are built and operational:

### Event Pipeline
- Error parser with 40+ patterns across JS, TS, Python, Go, Rust, Java (`core/error-parser.js`)
- Stack trace parser for 6+ frame formats (`core/stacktrace-parser.js`)
- Stable fingerprinting for event deduplication (`domain/ingestion/fingerprint.js`)
- Event classification with severity mapping (`core/bug-event.js`)
- Pipeline orchestration (`domain/ingestion/pipeline.js`)
- Universal EventBus (`domain/event-bus.js`)
- Canonical event definitions (`domain/events.js`)

### Battle Engine
- Pure deterministic battle engine with injected RNG (`domain/battle.js`)
- Damage formula with type effectiveness and critical hits
- Passive abilities (RandomFailure, NonDeterministic)
- Healing moves
- Combat system with turn-based battles
- Battle simulation framework with seeded RNG (`simulation/`)

### BugMon Roster
- 31 BugMon across 7 types (frontend, backend, devops, testing, architecture, security, ai)
- 72 moves
- 7x7 type effectiveness chart
- 7 evolution chains with 10 evolved forms
- Rarity system (common, uncommon, legendary, evolved)
- Error pattern matching for species selection

### Terminal Renderer
- ANSI-colored encounter display with type-specific ASCII art (`core/cli/renderer.js`)
- HP bar visualization
- Bug Grimoire display with completion tracking
- Stats display with XP progress
- Boss battle interactive encounter (`core/cli/boss-battle.js`)

### Browser Game
- Full RPG with tile-based exploration, random encounters, turn-based battles
- Canvas 2D rendering with procedural tile textures
- Synthesized audio (Web Audio API, no audio files)
- Mobile touch controls
- Save/load with auto-save
- CLI-to-browser sync via WebSocket

### Progression
- Bug Grimoire collection tracking (`ecosystem/bugdex.js`)
- Dev-activity evolution system with git hook tracking (`game/evolution/`)
- XP and leveling
- Boss encounter system with threshold triggers (`ecosystem/bosses.js`)

### Infrastructure
- 52 test files covering all modules
- Size budget enforcement (10 KB target, 17 KB cap gzipped)
- CI workflows (deploy, validate, size check, CodeQL, publish, release)
- Community submission workflow with automated validation
- Zero runtime dependencies

## What Is Next

### Phase 1 — Canonical Event Model
- Extend `domain/events.js` with the full event type taxonomy (governance events, session events)
- Implement formal event schema validation
- Add governance event types: `InvariantViolation`, `UnauthorizedAction`, `PolicyDenied`, `BlastRadiusExceeded`, `MergeGuardFailure`
- Define event persistence format for replay

### Phase 2 — AgentGuard Governance Runtime
- Action Authorization Boundary (AAB) implementation
- Policy definition format and loader
- Invariant monitoring engine
- Blast radius computation
- Evidence pack generation
- CLI governance commands

### Phase 3 — BugMon Terminal Roguelike MVP
- Run engine (session-scoped gameplay)
- Encounter difficulty scaling based on session context
- Stability collapse detection
- Run summary and scoring
- Governance boss encounters from AgentGuard events

## Open Questions

1. **Event persistence format** — file-based (`.bugmon/events/`) vs SQLite vs plain JSON files
2. **Policy definition language** — YAML vs JSON vs JavaScript
3. **Replay granularity** — full event streams vs checkpoint-based snapshots
4. **Cross-session evolution** — how dev-activity evolution interacts with run-scoped progression
