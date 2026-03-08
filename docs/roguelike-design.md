# Roguelike Design — Debugging as Dungeon Crawling

BugMon implements a roguelike gameplay model where coding sessions become dungeon runs. Encounters are procedurally generated from real system failures. Every bug is an enemy. Every CI failure is a boss. Every session is a run.

This is not a metaphor applied after the fact. The roguelike structure is the core system model for how BugMon converts developer telemetry into interactive gameplay.

## The Mapping

| Software Development | Roguelike Mechanic |
|---------------------|-------------------|
| Coding session | Run |
| Source file | Room / floor |
| Lint warning | Weak enemy |
| Type error | Minor enemy |
| Test failure | Strong enemy |
| Build failure | Elite enemy |
| CI pipeline failure | Boss |
| Invariant violation | Elite boss |
| Agent authorization denial | Governance boss |
| Bug fix (error resolved) | Enemy defeated |
| All tests passing | Floor cleared |
| Session with zero errors | Perfect run |
| Stability collapse (cascading failures) | Run death |

## Run Structure

A **run** begins when the developer starts a coding session (CLI watch mode, editor session, or CI pipeline). The run ends when the session closes or stability collapses.

```
Run Start
    │
    ▼
┌─────────────┐
│  Monitoring  │◄──── Events flow in from:
│   Phase      │      - stderr
│              │      - test output
│              │      - linter
│              │      - CI
│              │      - AgentGuard
└──────┬──────┘
       │
       │ Event detected
       ▼
┌─────────────┐
│  Encounter   │  Event → enemy mapping
│  Generation  │  Severity → difficulty
│              │  Repeat count → escalation
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Battle     │  Turn-based combat
│              │  Fix the bug = defeat the enemy
│              │  Moves based on error type
└──────┬──────┘
       │
       ├──── Victory: XP, Grimoire entry, loot
       │
       ├──── Defeat: error persists, difficulty escalates
       │
       └──── Run continues until session ends
              or stability collapses
```

### Run Lifecycle

1. **Run Start** — session begins, event monitoring activates
2. **Steady State** — events flow in, encounters generated, battles fought
3. **Escalation** — unresolved errors compound, difficulty increases
4. **Boss Phase** — systemic failures (CI, build) trigger boss encounters
5. **Run End** — session closes; stats, Grimoire, and XP are persisted

### Stability Collapse

A run "dies" when too many unresolved errors accumulate. This mirrors the real experience of a coding session spiraling out of control.

Triggers:
- 10+ unresolved errors in a single session
- 3+ boss-level failures without resolution
- Cascading test failures (test count increasing per cycle)

On collapse, the run ends with a summary of what went wrong and what was left unresolved.

## Encounter Generation

Encounters are procedurally generated from real events. The generation pipeline:

```
Canonical Event
    │
    ▼
Species Selection ── match event to BugMon creature
    │                  (keyword match → type fallback → random)
    ▼
Difficulty Scaling ── severity + session context → enemy stats
    │
    ▼
Encounter Instance ── instantiated BugMon with scaled HP/attack
```

### Species Selection

Each BugMon has error patterns that it matches (e.g., NullPointer matches `"cannot read properties"`, `"null reference"`). The matcher selects the best-fit creature for each event.

Selection priority:
1. **Keyword match** — error message matches BugMon's `errorPatterns` array. Higher specificity = better match.
2. **Type fallback** — no keyword match, but error type maps to a BugMon type (e.g., `null-reference` → backend type).
3. **Random fallback** — no match at all; select from available roster.

Implementation: `core/matcher.js`

### Difficulty Scaling

Enemy stats scale based on two factors:

**Severity bonus:**
```
hp = baseHP + (severity - 1) * 2
```

**Session escalation:** As unresolved errors accumulate within a session, encounter difficulty increases:
- 0-2 unresolved: normal difficulty
- 3-5 unresolved: +10% HP and attack
- 6-9 unresolved: +25% HP and attack
- 10+: boss-level scaling, stability collapse warning

### Boss Escalation

Bosses spawn from systemic failures, not individual errors. The existing boss system (`ecosystem/bosses.js`) defines threshold-based triggers:

| Boss | Trigger | Threshold |
|------|---------|-----------|
| Test Suite Hydra | Multiple test failures | 3 in session |
| Memory Leak Titan | Heap growth warning | 1 occurrence |
| Dependency Kraken | npm conflict | 1 occurrence |
| CI Dragon | Pipeline failure | 1 occurrence |
| TypeError Swarm | Type explosion | 10 in session |
| Syntax Cascade | Syntax errors | 5 in session |

Governance violations produce governance bosses:
- `PolicyDenied` → Governance Guardian (severity 3)
- `UnauthorizedAction` → Scope Sentinel (severity 4)
- `InvariantViolation` → Invariant Titan (severity 5)
- `BlastRadiusExceeded` → Blast Radius Colossus (severity 4)

## Idle / Active Hybrid

Not every encounter demands the developer's attention. The system uses a hybrid model:

### Idle Mode (Minor Enemies)

Minor enemies (severity 1-2: lint warnings, type errors, deprecations) auto-resolve in the background. The developer sees a notification log:

```
  [idle] NullPointer defeated        +15 XP    severity 2
  [idle] TypeCoercion defeated       +10 XP    severity 1
  [idle] ImportError defeated        +15 XP    severity 2
```

Auto-resolution uses the developer's current level and loadout to simulate combat. Weaker enemies are dispatched automatically. The developer benefits from XP and Grimoire entries without interruption.

### Active Mode (Bosses and Elites)

Boss encounters (severity 4-5: CI failures, invariant violations, build failures) interrupt idle mode and require active engagement. The terminal prompts the developer:

```
  ⚠ BOSS ENCOUNTER: CI Dragon appeared!
  Pipeline failed: deploy job exited with code 1
  [1] Fight  [2] Run
```

Active encounters have meaningful choices (move selection, risk assessment) and larger rewards.

### Threshold

The idle/active threshold is configurable. Default: severity 1-2 auto-resolve, severity 3+ requires input. Developers who want full engagement can set all encounters to active.

## Meta Progression

Progression persists across runs. A single run is ephemeral; progression is permanent.

### Within a Run
- XP earned from defeating enemies (proportional to severity)
- Bug Grimoire entries recorded for new enemy types defeated
- Run score based on enemies defeated, bosses cleared, errors resolved

### Across Runs
- **Bug Grimoire** — permanent compendium of all enemy types defeated. Records encounter count, first defeat date, error patterns, and fix strategies. Completion percentage drives unlock rewards.
- **Developer Level** — XP accumulates across runs. Level determines title, idle combat effectiveness, and unlock thresholds.
- **Achievements** — milestone rewards (first boss defeated, 100% Grimoire, perfect run, etc.)
- **Statistics** — lifetime stats: total encounters, win rate, most common error types, longest streak, best run score

### Difficulty Scaling Across Runs

As the developer levels up, encounters scale:
- Higher-level developers encounter rarer enemies more frequently
- Boss HP scales with developer level
- New error patterns unlock at higher levels
- Idle combat becomes more effective against lower-severity enemies

This prevents the game from becoming trivial while rewarding progression.

## Replayable Runs

Because encounters are generated from a deterministic event stream, any past session can be replayed:

1. **Event stream** — the ordered sequence of canonical events from a session
2. **RNG seed** — the random seed used for battle outcomes
3. **Replay** — feed the event stream through the encounter generator with the same RNG seed to reproduce exact encounters and battles

Use cases:
- Post-session review ("what went wrong in that coding session?")
- Debugging encounter generation logic
- Sharing memorable runs with other developers
- Regression testing of the encounter system

## Terminal-First UX

The primary BugMon interface is the terminal. The roguelike runs alongside the developer's existing workflow.

```
┌─────────────────────────────────────────────────────┐
│  BugMon Run #47 ─── Floor: src/auth/ ─── Lv.12     │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  A wild NullPointer appeared!               │    │
│  │                                             │    │
│  │  ██████████░░░░░░░░░░  HP: 32/32            │    │
│  │                                             │    │
│  │  TypeError: Cannot read 'token'             │    │
│  │  at src/auth/session.js:42                  │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  [1] Fight  [2] Run                                  │
│                                                     │
│  Session: 3 encounters │ 1 resolved │ Score: 450    │
└─────────────────────────────────────────────────────┘
```

The terminal renderer displays:
- Current run status (run number, current "floor", developer level)
- Encounter details (BugMon name, HP, error message, source location)
- Battle options
- Session statistics

Browser and mobile renderers provide enhanced visual experiences but are not required. The terminal is the canonical interface.

## Design Rationale

Roguelike mechanics map naturally to debugging because both share the same structural properties:

1. **Procedural generation** — bugs are not scripted encounters; they emerge from real code.
2. **Permadeath / session scope** — each coding session is self-contained. Unresolved bugs compound.
3. **Risk-reward** — harder bugs yield better rewards (XP, rare Grimoire entries).
4. **Progressive difficulty** — left unchecked, errors cascade and overwhelm.
5. **Meta progression** — individual sessions end, but knowledge and Grimoire persist.
6. **Replayability** — no two sessions are the same because no two coding sessions produce the same errors.

The roguelike model does not trivialize debugging. It reframes it. The errors are real. The encounters are generated from those real errors. Defeating a BugMon means fixing the underlying bug. The game layer adds engagement and tracking to an activity developers already perform.
