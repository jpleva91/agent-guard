# System Specification

BugMon is a roguelike developer telemetry game. It monitors software bugs and converts them into interactive encounters. AgentGuard provides deterministic governance for AI coding agents. Together they form a unified platform where all system activity flows through the canonical event model.

## Core Event Flow

```
watcher detects failure (stderr, CI output, agent action)
↓
ingestion pipeline: parse → fingerprint → classify → map
↓
canonical event emitted (e.g., ERROR_OBSERVED)
↓
game engine spawns BugMon enemy
↓
developer fixes the bug
↓
BugMon enemy defeated → recorded in Bug Grimoire
```

## Gameplay Model

- Coding sessions are dungeon **runs**
- Bugs are **enemies** with stats derived from error severity
- CI failures are **bosses** requiring active engagement
- Minor errors (severity 1-2) **auto-resolve** in idle mode
- Severe errors (severity 3+) require **player interaction**
- The Bug Grimoire records defeated enemy types (compendium, not collection)

## Two-Layer System

| Layer | Role | Produces |
|-------|------|----------|
| **AgentGuard** | Governance runtime — evaluates agent actions against policies | Policy violation events |
| **BugMon** | Roguelike game — renders events as interactive encounters | Gameplay state |

Both layers share the **canonical event model** as their architectural spine.

## System Boundaries

### AgentGuard (Governance Runtime)
- **Input**: Agent actions (file edits, shell commands, API calls)
- **Output**: Canonical governance events (`PolicyDenied`, `InvariantViolation`, `BlastRadiusExceeded`)
- **Constraint**: Deterministic evaluation — same action + same policy = same result

### BugMon (Roguelike Game)
- **Input**: Canonical events (developer signals, governance violations, CI results)
- **Output**: Interactive encounters, Bug Grimoire entries, session scores
- **Constraint**: Hybrid idle/active — minor enemies auto-resolve, bosses demand engagement

### Domain Layer (Pure Logic)
- **Input**: Events, game data, injected RNG
- **Output**: Battle results, encounter triggers, progression checks
- **Constraint**: No DOM, no Node.js-specific APIs, deterministic when RNG is injected

## Invariants

1. All system activity flows through the canonical event model
2. Domain logic has zero environment dependencies
3. Zero runtime dependencies — dev dependencies only
4. Browser game is 100% client-side
5. All audio is synthesized at runtime (no audio files)
6. Size budget: 10 KB target / 17 KB cap (gzipped main bundle)

## Event Taxonomy

| Category | Examples | Producer | Consumer |
|----------|----------|----------|----------|
| Ingestion | `ErrorObserved`, `BugClassified` | Error watchers | Battle engine |
| Battle | `ENCOUNTER_STARTED`, `MOVE_USED`, `DAMAGE_DEALT` | Battle engine | UI renderers |
| Progression | `ActivityRecorded`, `EvolutionTriggered` | Dev activity tracker | Progression engine |
| Session | `RunStarted`, `RunEnded`, `CheckpointReached` | Run engine | Scoring, save system |
| Governance | `PolicyDenied`, `UnauthorizedAction`, `InvariantViolation` | AgentGuard | Boss encounters |
| Reference Monitor | `ActionRequested`, `ActionAllowed`, `ActionDenied`, `ActionExecuted` | Agent Action Boundary | Audit trail, governance |
| Developer Signals | `FileSaved`, `TestCompleted`, `CommitCreated` | Git hooks, watchers | Encounter triggers |

## Technical Constraints

- 100% client-side browser game, zero runtime dependencies
- Vanilla JavaScript (ES6 modules), HTML5 Canvas 2D, Web Audio API
- All audio synthesized at runtime (no audio files)
- Build: esbuild + terser (dev dependencies only)
- Deployed to GitHub Pages
- ESLint + Prettier enforced
