# Sequence Diagrams

System flows for key operations in the AgentGuard + BugMon system.

## 1. Bug Detection → Encounter

A developer error flows through the pipeline and becomes a BugMon encounter.

```
Developer        CLI Adapter      Parser          Classifier      Fingerprint     EventBus        Renderer
    │                │               │               │               │               │               │
    │  run command   │               │               │               │               │               │
    │───────────────>│               │               │               │               │               │
    │                │               │               │               │               │               │
    │  stderr output │               │               │               │               │               │
    │───────────────>│               │               │               │               │               │
    │                │  raw text     │               │               │               │               │
    │                │──────────────>│               │               │               │               │
    │                │               │               │               │               │               │
    │                │               │  parsed error │               │               │               │
    │                │               │──────────────>│               │               │               │
    │                │               │               │               │               │               │
    │                │               │               │  BugEvent     │               │               │
    │                │               │               │──────────────>│               │               │
    │                │               │               │               │               │               │
    │                │               │               │               │  deduped      │               │
    │                │               │               │               │  event        │               │
    │                │               │               │               │──────────────>│               │
    │                │               │               │               │               │               │
    │                │               │               │               │               │  ERROR_       │
    │                │               │               │               │               │  OBSERVED     │
    │                │               │               │               │               │──────────────>│
    │                │               │               │               │               │               │
    │                │               │               │               │               │               │
    │                 ◄──────────────────────────────────────────────────────────────── encounter UI │
    │                                                                                               │
    │  "A wild NullPointer appeared!"                                                               │
    │                                                                                               │
```

**Key files:**
- CLI Adapter: `core/cli/adapter.js`
- Parser: `core/error-parser.js`
- Classifier: `core/bug-event.js`
- Fingerprint: `domain/ingestion/fingerprint.js`
- EventBus: `domain/event-bus.js`
- Renderer: `core/cli/renderer.js`

## 2. Agent Violation → Governance Boss

An AI agent attempts an unauthorized action, triggering AgentGuard and spawning a governance boss.

```
AI Agent         AgentGuard AAB    Policy Eval     Invariant       Evidence        EventBus        BugMon
    │                │               │            Checker          Generator          │               │
    │                │               │               │               │               │               │
    │  file_write    │               │               │               │               │               │
    │  (prod config) │               │               │               │               │               │
    │───────────────>│               │               │               │               │               │
    │                │               │               │               │               │               │
    │                │  check scope  │               │               │               │               │
    │                │──────────────>│               │               │               │               │
    │                │               │               │               │               │               │
    │                │  DENY:        │               │               │               │               │
    │                │  outside scope│               │               │               │               │
    │                │◄──────────────│               │               │               │               │
    │                │               │               │               │               │               │
    │                │  check        │               │               │               │               │
    │                │  invariants   │               │               │               │               │
    │                │──────────────────────────────>│               │               │               │
    │                │               │               │               │               │               │
    │                │  VIOLATED:    │               │               │               │               │
    │                │  prod-guard   │               │               │               │               │
    │                │◄──────────────────────────────│               │               │               │
    │                │               │               │               │               │               │
    │                │  generate     │               │               │               │               │
    │                │  evidence     │               │               │               │               │
    │                │──────────────────────────────────────────────>│               │               │
    │                │               │               │               │               │               │
    │                │               │               │               │  evp_abc123   │               │
    │                │               │               │               │◄──────────────│               │
    │                │               │               │               │               │               │
    │                │  emit InvariantViolation      │               │               │               │
    │                │──────────────────────────────────────────────────────────────>│               │
    │                │               │               │               │               │               │
    │  DENIED        │               │               │               │               │  governance   │
    │◄───────────────│               │               │               │               │  boss         │
    │                │               │               │               │               │──────────────>│
    │                │               │               │               │               │               │
    │                                                                                 "Invariant    │
    │                                                                                  Titan        │
    │                                                                                  appeared!"   │
```

## 3. Terminal Run Loop

A complete roguelike run in the terminal, from session start to end.

```
Developer        Run Engine       Event Monitor    Encounter Gen    Battle Engine    Stats
    │                │               │               │               │               │
    │  bugmon watch  │               │               │               │               │
    │───────────────>│               │               │               │               │
    │                │               │               │               │               │
    │                │  Run #47      │               │               │               │
    │                │  started      │               │               │               │
    │                │──────────────>│               │               │               │
    │                │               │               │               │               │
    │  (coding...)   │               │               │               │               │
    │                │               │               │               │               │
    │  TypeError     │               │               │               │               │
    │  in stderr     │               │               │               │               │
    │───────────────────────────────>│               │               │               │
    │                │               │               │               │               │
    │                │               │  event        │               │               │
    │                │               │──────────────>│               │               │
    │                │               │               │               │               │
    │                │               │               │  NullPointer  │               │
    │                │               │               │  (severity 2) │               │
    │                │               │               │──────────────>│               │
    │                │               │               │               │               │
    │  encounter UI  │               │               │               │               │
    │◄──────────────────────────────────────────────────────────────│               │
    │                │               │               │               │               │
    │  [Fight]       │               │               │               │               │
    │───────────────────────────────────────────────────────────────>│               │
    │                │               │               │               │               │
    │  (fixes bug)   │               │               │               │               │
    │                │               │               │               │               │
    │  Victory!      │               │               │               │               │
    │◄──────────────────────────────────────────────────────────────│               │
    │                │               │               │               │               │
    │                │               │               │               │  +XP,Grimoire │
    │                │               │               │               │──────────────>│
    │                │               │               │               │               │
    │  (more coding...)              │               │               │               │
    │                │               │               │               │               │
    │  CI failure    │               │               │               │               │
    │───────────────────────────────>│               │               │               │
    │                │               │               │               │               │
    │                │  boss trigger │               │               │               │
    │                │  threshold    │               │               │               │
    │                │  reached      │               │               │               │
    │                │◄──────────────│               │               │               │
    │                │               │               │               │               │
    │                │               │  boss event   │               │               │
    │                │               │──────────────>│               │               │
    │                │               │               │               │               │
    │                │               │               │  CI Dragon    │               │
    │                │               │               │  (severity 4) │               │
    │                │               │               │──────────────>│               │
    │                │               │               │               │               │
    │  BOSS encounter│               │               │               │               │
    │◄──────────────────────────────────────────────────────────────│               │
    │                │               │               │               │               │
    │  (session end) │               │               │               │               │
    │───────────────>│               │               │               │               │
    │                │               │               │               │               │
    │                │  Run #47      │               │               │               │
    │                │  summary      │               │               │  persist      │
    │                │──────────────────────────────────────────────────────────────>│
    │                │               │               │               │               │
    │  Run summary:  │               │               │               │               │
    │  5 encounters  │               │               │               │               │
    │  3 resolved    │               │               │               │               │
    │  1 boss        │               │               │               │               │
    │  Score: 1,250  │               │               │               │               │
    │◄───────────────│               │               │               │               │
```

## 4. Event Replay

Replaying a stored event stream to reconstruct a past session.

```
Operator         Replay Engine    Event Store      Encounter Gen    Battle Engine    Comparator
    │                │               │               │               │               │
    │  replay        │               │               │               │               │
    │  run #47       │               │               │               │               │
    │───────────────>│               │               │               │               │
    │                │               │               │               │               │
    │                │  load events  │               │               │               │
    │                │  for run #47  │               │               │               │
    │                │──────────────>│               │               │               │
    │                │               │               │               │               │
    │                │  event stream │               │               │               │
    │                │  (ordered)    │               │               │               │
    │                │◄──────────────│               │               │               │
    │                │               │               │               │               │
    │                │  load RNG     │               │               │               │
    │                │  seed         │               │               │               │
    │                │◄──────────────│               │               │               │
    │                │               │               │               │               │
    │                │               │               │               │               │
    │                │  ─── for each event ───       │               │               │
    │                │               │               │               │               │
    │                │  feed event   │               │               │               │
    │                │──────────────────────────────>│               │               │
    │                │               │               │               │               │
    │                │               │               │  encounter    │               │
    │                │               │               │──────────────>│               │
    │                │               │               │               │               │
    │                │               │               │  battle       │               │
    │                │               │               │  result       │               │
    │                │               │               │◄──────────────│               │
    │                │               │               │               │               │
    │                │  ─── end loop ───             │               │               │
    │                │               │               │               │               │
    │                │  compare with │               │               │               │
    │                │  original     │               │               │               │
    │                │──────────────────────────────────────────────────────────────>│
    │                │               │               │               │               │
    │                │               │               │               │  match /      │
    │                │               │               │               │  divergence   │
    │                │               │               │               │  report       │
    │                │◄──────────────────────────────────────────────────────────────│
    │                │               │               │               │               │
    │  replay        │               │               │               │               │
    │  report        │               │               │               │               │
    │◄───────────────│               │               │               │               │
```

**Use cases for replay:**
- Verify encounter generation determinism (same events + same seed = same encounters)
- Debug unexpected encounter behavior
- Post-session analysis of what went wrong
- Share sessions between developers
- Regression testing of pipeline changes
