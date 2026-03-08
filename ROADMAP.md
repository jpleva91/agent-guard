# Roadmap

> Deterministic governance. Roguelike debugging. One event model.

## Vision

AgentGuard + BugMon is a unified platform where **governance produces events** and **gameplay consumes them**.

AgentGuard provides deterministic governance for AI coding agents — policy evaluation, invariant monitoring, blast radius limits, evidence generation. BugMon provides the developer interaction layer — a roguelike where coding sessions become dungeon runs and real errors become enemies.

The canonical event model connects everything. Developer signals, agent actions, CI failures, and governance violations all normalize into the same event schema. BugMon renders those events as a hybrid idle/active roguelike: minor enemies auto-resolve in the background while bosses demand active engagement.

### Core Loop

```
developer codes
    ↓
errors / failures / violations produce events
    ↓
events normalize through pipeline
    ↓
AgentGuard evaluates governance
    ↓
BugMon generates encounters
    ↓
minor enemies auto-resolve (idle)
bosses require engagement (active)
    ↓
Bug Grimoire records defeated enemy types
XP accumulates across runs
    ↑                              |
    └──────────────────────────────┘
```

---

## Phase 0 — Architecture Clarity `CURRENT`

> **Theme:** Define the unified system model

Establish the conceptual architecture, documentation, and event model that connects AgentGuard and BugMon.

- [x] Canonical event model documentation (`docs/event-model.md`)
- [x] AgentGuard governance runtime specification (`docs/agentguard.md`)
- [x] Roguelike design document (`docs/roguelike-design.md`)
- [x] Bug event pipeline documentation (`docs/bug-event-pipeline.md`)
- [x] Unified architecture document (`docs/unified-architecture.md`)
- [x] Plugin API specification (`docs/plugin-api.md`)
- [x] Sequence diagrams (`docs/sequence-diagrams.md`)
- [x] Product positioning (`docs/product-positioning.md`)
- [x] Rewritten README, ARCHITECTURE, ROADMAP
- [x] Updated CLAUDE.md

## Phase 1 — Canonical Event Model

> **Theme:** Formalize the event spine

Extend the existing event system (`domain/events.js`, `domain/event-bus.js`) into the formal canonical event model.

- [ ] Full event type taxonomy (developer signals, governance events, session events)
- [ ] Event schema validation
- [ ] Governance event types: `InvariantViolation`, `UnauthorizedAction`, `PolicyDenied`, `BlastRadiusExceeded`, `MergeGuardFailure`
- [ ] Session event types: `RunStarted`, `RunEnded`, `CheckpointReached`
- [ ] Event factory with fingerprint generation
- [ ] Event store interface (persist, query, replay)
- [ ] Tests for all event types and lifecycle

## Phase 2 — AgentGuard Governance Runtime

> **Theme:** Deterministic agent governance

Build the governance runtime that evaluates agent actions against policies and invariants.

- [ ] Action Authorization Boundary (AAB) implementation
- [ ] Policy definition format (YAML/JSON)
- [ ] Policy loader and parser
- [ ] Deterministic policy evaluator
- [ ] Invariant monitoring engine
- [ ] Built-in invariants (layer boundaries, size budget, test suite)
- [ ] Blast radius computation
- [ ] Evidence pack generation and persistence
- [ ] CLI governance commands (`bugmon guard`, `bugmon audit`)
- [ ] Governance event emission into canonical event model
- [ ] Integration with Claude Code hook (governance events from agent actions)

## Phase 3 — BugMon Terminal Roguelike MVP

> **Theme:** Coding sessions become dungeon runs

Implement the roguelike run engine with hybrid idle/active encounters in the terminal.

- [ ] Run engine (session-scoped gameplay lifecycle)
- [ ] Idle mode: auto-resolve minor enemies (severity 1-2) in background
- [ ] Active mode: interrupt for bosses and elites (severity 3+)
- [ ] Configurable idle/active threshold
- [ ] Encounter difficulty scaling based on session context
- [ ] Session escalation (unresolved errors compound difficulty)
- [ ] Stability collapse detection (run death from cascading failures)
- [ ] Run summary and scoring at session end
- [ ] Governance boss encounters from AgentGuard events
- [ ] Bug Grimoire terminal display (enemy compendium)
- [ ] Run statistics (encounters, defeats, score, duration)

## Phase 4 — Event Persistence + Replay

> **Theme:** Every session is replayable

Implement durable event storage and deterministic replay.

- [ ] File-based event store (`.bugmon/events/`)
- [ ] Event stream serialization format
- [ ] Session metadata (run ID, RNG seed, timestamps)
- [ ] Replay engine: feed stored event stream through encounter generator
- [ ] Deterministic replay with seeded RNG
- [ ] Replay comparator (verify original vs replayed outcomes)
- [ ] CLI replay command (`bugmon replay <run-id>`)
- [ ] Event export/import for sharing sessions

## Phase 5 — Bug Grimoire + Progression

> **Theme:** Meta-progression across runs

Build the persistent progression system that spans coding sessions.

- [ ] Bug Grimoire: enemy compendium with defeat history, error patterns, fix strategies
- [ ] Grimoire completion tracking and unlock rewards
- [ ] Achievement system (first boss, perfect run, 100% Grimoire, etc.)
- [ ] Lifetime statistics aggregation
- [ ] Developer level with title progression
- [ ] Difficulty scaling based on developer level
- [ ] Idle combat effectiveness scaling with level
- [ ] Dev-activity progression via git hooks (commits, PRs, bug fixes)
- [ ] Session leaderboard (best scores, fastest boss defeats)

## Phase 6 — Plugin Ecosystem

> **Theme:** Extensible by design

Formalize the plugin system for third-party extensions.

- [ ] Event source plugin interface
- [ ] Content pack loading system (community enemies, moves, bosses)
- [ ] Renderer plugin interface
- [ ] Policy pack loading system
- [ ] Replay processor interface
- [ ] Plugin validation and sandboxing
- [ ] Plugin registry / discovery mechanism
- [ ] Language-specific content packs (Python BugMon, Go BugMon, Rust BugMon)

## Phase 7 — Browser / Mobile Renderers

> **Theme:** Enhanced visual experience

Upgrade the browser game to a roguelike dungeon renderer.

- [ ] Roguelike dungeon renderer (procedural floor layouts)
- [ ] Run-based browser gameplay (session → run mapping)
- [ ] Idle encounter log in browser UI
- [ ] Active encounter battle screen
- [ ] Bug Grimoire browser UI
- [ ] Mobile-optimized responsive renderer
- [ ] CLI ↔ browser sync for run state
- [ ] Sound effects for idle/active transitions

## Phase 8 — Editor Integrations

> **Theme:** The game moves into the editor

Bring BugMon encounters and AgentGuard governance into editor environments.

- [ ] VS Code extension: sidebar webview with run status
- [ ] VS Code: real-time error interception from diagnostics API
- [ ] VS Code: inline enemy encounters on error hover
- [ ] VS Code: Bug Grimoire panel
- [ ] VS Code: governance notifications for AgentGuard events
- [ ] JetBrains plugin (IntelliJ/WebStorm)
- [ ] Claude Code deep integration (governance-aware encounters)

## Phase 9 — AI-Assisted Debugging

> **Theme:** Explicitly deferred. Requires Phase 2 + 3 + 4.

AI features are intentionally placed last. The system must be useful without AI before AI is layered on.

- [ ] Context-aware fix suggestions based on error type + stack trace
- [ ] AI-suggested battle strategies based on error context
- [ ] Automated fix verification (does the fix resolve the event?)
- [ ] AI pattern detection (recurring error clusters across sessions)
- [ ] Team observability (aggregate Grimoire across a dev team)

---

## Current Enemy Roster (31 BugMon)

### Base Forms (21)

| # | Name | Type | Rarity |
|---|------|------|--------|
| 1 | NullPointer | backend | common |
| 2 | CallbackHell | backend | common |
| 3 | RaceCondition | backend | uncommon |
| 4 | MemoryLeak | backend | common |
| 5 | DivSoup | frontend | common |
| 6 | SpinnerOfDoom | frontend | common |
| 7 | StateHydra | frontend | uncommon |
| 8 | MergeConflict | devops | common |
| 9 | CIPhantom | devops | uncommon |
| 10 | DockerDaemon | devops | common |
| 11 | FlakyTest | testing | common |
| 12 | AssertionError | testing | common |
| 13 | Monolith | architecture | uncommon |
| 14 | CleanArchitecture | architecture | uncommon |
| 15 | SQLInjector | security | uncommon |
| 16 | XSSpecter | security | uncommon |
| 17 | PromptGoblin | ai | uncommon |
| 18 | HalluciBot | ai | common |
| 19 | TheSingularity | ai | legendary |
| 20 | TheLegacySystem | architecture | legendary |
| 31 | TodoComment | testing | common |

### Evolved Forms (10)

| # | Name | Type | Evolves From | Trigger |
|---|------|------|-------------|---------|
| 21 | OptionalChaining | backend | NullPointer | Fix 5 bugs |
| 22 | TypeSafety | backend | OptionalChaining | Pass 10 test runs |
| 23 | PromiseChain | backend | CallbackHell | Make 10 commits |
| 24 | AsyncAwait | backend | PromiseChain | Merge 3 PRs |
| 25 | Flexbox | frontend | DivSoup | Perform 5 refactors |
| 26 | CSSGrid | frontend | Flexbox | Complete 5 code reviews |
| 27 | RebaseMaster | devops | MergeConflict | Resolve 5 merge conflicts |
| 28 | Microservice | architecture | Monolith | Deploy 5 times |
| 29 | GarbageCollector | backend | MemoryLeak | Pass 8 CI builds |
| 30 | PromptEngineer | ai | PromptGoblin | Write 5 docs |

### Enemy Ideas Backlog

| Name | Type | Concept |
|------|------|---------|
| SegFaultling | backend | Illegal access creature |
| TypeCoercion | backend | Shapeshifter |
| ZeroDivide | backend | Approaches infinity |
| BitRot | backend | Decays over time |
| PhantomRead | backend | Reads data that was never written |
| KernelPanic | backend | The nuclear option |
| DarkPattern | frontend | Manipulative, tricks opponents |
| LeftPadCollapse | devops | One small removal breaks everything |
| CopilotShadow | ai | Writes code that almost works |
| ScopeCreep | architecture | Grows larger every turn |
| InvariantBreaker | governance | Violates system rules |
| PolicyPhantom | governance | Bypasses authorization |

---

## Size Budget

Every feature must fit within the byte budget:

| Metric | Target | Hard Cap |
|--------|-------:|--------:|
| Bundle (gzipped, no sprites) | 10 KB | 17 KB |
| Bundle (gzipped, with sprites) | ~19 KB | 32 KB |

Run `npm run budget` to check compliance.

## Legend

- **Effort:** `[S]` = hours | `[M]` = 1-2 days | `[L]` = 3+ days
- **Status:** `CURRENT` | `PLANNED` | `IDEA`
