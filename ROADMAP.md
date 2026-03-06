# BugMon Roadmap

> The codebase is infested with bugs. Time to catch 'em all.

### Legend

- **Effort:** `[S]` = hours | `[M]` = 1-2 days | `[L]` = 3+ days
- **Priority:** Must-have | Should-have | Nice-to-have
- **Status:** `DONE` | `PLANNED` (assigned to a milestone) | `IDEA` (backlog only)

### Milestone Dependency Map

```
V1 -> V1.1 -> V2 -> V2.1 -> V3 -> V4 -> V5 -> V6 -> V7
                                               |
                                               +-> V8
```

---

## V1 -- Playable Prototype (DONE)

- [x] Tile-based exploration (15x10 map)
- [x] Arrow key movement with grid snapping
- [x] 3 BugMon: NullPointer, RaceCondition, MemoryLeak
- [x] 5 moves: SegFault, Hotfix, ThreadLock, GarbageCollect, MemoryDump
- [x] Random encounters in tall grass (10% chance)
- [x] Turn-based battle with speed priority
- [x] Capture mechanic (HP-based probability)
- [x] Run option (always succeeds)
- [x] HUD showing active BugMon and party size

## V1.1 -- Sprites & Polish (DONE)

> **Theme:** Make it look and sound like a real game

- [x] Pixel art battle sprites for all BugMon (64x64 PNG)
- [x] Player character sprite with 4 directional frames (cyberpunk debugger)
- [x] Battle transition animation (3x white flash + fade to black)
- [x] Mobile touch controls (D-pad + A/B buttons)
- [x] GitHub Pages deployment workflow
- [x] Deadlock BugMon (#4) with Mutex and ForceQuit moves
- [x] Sound effects (Web Audio API, synthesized -- no audio files)
- [x] Mute toggle button
- [x] Procedural tile textures (ground, wall bricks, animated grass)
- [x] Battle background art (procedurally generated)

## V2 -- Type System & Expanded Roster (DONE)

> **Theme:** Give battles strategic depth through type matchups

- [x] 4 types defined: Memory, Logic, Runtime, Syntax
- [x] Type effectiveness chart (super effective 1.5x / not very effective 0.5x)
- [x] Types assigned to all existing BugMon and moves
- [x] 8 new BugMon (12 total): OffByOne, MergeConflict, CallbackHell, Heisenbug, InfiniteLoop, SpaghettiCode, StackOverflow, IndexOutOfBounds
- [x] 10 new moves (17 total): PatchDeploy, Refactor, BlueScreen, CoreDump, Rollback, HotReload, TypeMismatch, Compile, NullCheck, BufferOverrun

## V2.1 -- Roster Polish & Battle UI

> **Depends on:** V2 | **Effort:** Medium | **Theme:** Finish what V2 started

- [ ] Pixel art sprites for 8 new BugMon (currently using color fallbacks) -- `[L]`
- [ ] Show move descriptions and types in battle UI -- `[M]`
- [ ] Move categories: damage, heal, status, utility -- `[S]`
- [ ] Reboot move (planned in V2 but not yet implemented) -- `[S]`

## V3 -- Save/Load & Core QoL

> **Depends on:** V2.1 | **Effort:** Large | **Theme:** Make the game feel like a real play session

- [ ] Save/load via localStorage -- `[L]`
- [ ] Party management (swap active BugMon) -- `[M]`
- [ ] Settings menu (volume, text speed) -- `[M]`
- [ ] BugDex / collection tracker -- `[M]`
- [ ] Smooth tile-to-tile movement animation -- `[M]`
- [ ] PP system for moves (limited uses, restored at healing stations) -- `[M]`

## V4 -- Status Effects & Battle Depth

> **Depends on:** V3 | **Effort:** Large | **Theme:** Make every battle a strategic puzzle

**Status conditions:**
- [ ] Bugged (damage over time) -- `[S]`
- [ ] Deprecated (reduced attack) -- `[S]`
- [ ] Frozen (skip turn chance) -- `[S]`
- [ ] Corrupted (random move override) -- `[S]`
- [ ] Optimized (speed boost) -- `[S]`

**Battle mechanics:**
- [ ] Moves that inflict/cure status effects -- `[M]`
- [ ] Multi-turn moves (Compile: charge then hit hard) -- `[M]`
- [ ] Healing moves (Hotfix reclassified from damage to heal) -- `[S]`
- [ ] Critical hits (small random chance for 1.5x damage) -- `[S]`
- [ ] Accuracy/evasion stats -- `[M]`

## V5 -- Progression & Evolution

> **Depends on:** V4 | **Effort:** Large | **Theme:** Watch your BugMon grow (and mutate)

**Leveling:**
- [ ] Experience points and leveling -- `[L]`
- [ ] Stat growth curves on level up -- `[M]`
- [ ] Learn new moves at level thresholds -- `[M]`
- [ ] Move replacement UI (pick which move to forget) -- `[M]`

**Evolution:**
- [ ] Evolution system with transformations: -- `[L]`
  - CallbackHell -> AsyncAwait
  - MemoryLeak -> GarbageCollector
  - SpaghettiCode -> CleanArchitecture
  - NullPointer -> OptionalChaining
  - RaceCondition -> MutexGuard
  - OffByOne -> ArrayOutOfBounds
  - MergeConflict -> RebaseHell
  - InfiniteLoop -> RecursionLimit
  - Heisenbug -> Schrodinbug
  - BitRot -> DataCorruption -> SystemFailure (3-stage)

**Scaling:**
- [ ] Wild BugMon level scaling by area -- `[M]`

## V6 -- World Expansion

> **Depends on:** V5 | **Effort:** Extra Large | **Theme:** A whole codebase to explore

**Maps:**
- [ ] Multiple maps with zone transitions -- `[L]`
- [ ] Map zones: -- `[L]`
  - Server Room (early game, Memory-type BugMon)
  - QA Lab (mid game, Logic-type BugMon)
  - Production Floor (late game, Runtime-type BugMon)
  - Legacy Basement (end game, mixed + rare)
  - Open Source Garden (optional area, community bugs)
- [ ] Minimap -- `[M]`

**NPCs:**
- [ ] NPC trainers: Junior Dev, Senior Dev, DevOps Engineer, QA Tester -- `[L]`
- [ ] Dialog system -- `[M]`

**Stations & items:**
- [ ] Healing station (the Coffee Machine) -- `[M]`
- [ ] Items: -- `[M]`
  - Energy Drink (heal HP)
  - Debug Log (capture boost)
  - Stack Trace (reveal enemy stats)
  - Repel (suppress encounters)
  - PP Restore (refill move uses)

## V7 -- Boss Battles & Story

> **Depends on:** V6 | **Effort:** Large | **Theme:** The final debug

**Boss trainers (unique dialog + custom teams):**
- [ ] The Tech Lead (mid-boss, Server Room) -- `[M]`
- [ ] The Architect (late-boss, Production Floor) -- `[M]`
- [ ] Legacy System (final boss, Legacy Basement -- ancient, overpowered, undocumented) -- `[L]`

**Story:**
- [ ] Simple story arc: "The codebase is infested. Debug them all." -- `[M]`
- [ ] Victory condition / ending screen -- `[S]`
- [ ] Post-game: harder encounters, rare BugMon, NewGame+ -- `[L]`

## V8 -- Music & Atmosphere

> **Depends on:** V6 | **Effort:** Large | **Theme:** Make it feel alive

- [ ] Background music (synthesized chiptune loops via Web Audio API) -- `[L]`
  - Overworld theme
  - Battle theme
  - Boss battle theme
  - Victory fanfare
- [ ] Weather/time-of-day visual effects -- `[M]`
- [ ] Animated battle sprites (idle bounce, attack flash) -- `[M]`
- [ ] Screen shake on critical hits -- `[S]`
- [ ] Encounter transition with species-specific flash color -- `[S]`

---

## Stretch Goals

- [ ] Procedural BugMon generator (random stats, names, sprites)
- [ ] Online trading (WebRTC or simple server)
- [ ] Online battles (WebRTC)
- [ ] Map editor
- [ ] Mod support (load custom JSON data)
- [ ] Achievements (catch all BugMon, win without taking damage, etc.)
- [ ] Accessibility (colorblind palette toggle, high contrast mode)
- [ ] Tutorial / onboarding flow
- [ ] Localization support
- [ ] Speedrun timer mode

---

## BugMon Ideas Backlog

| Name | Type | Status | Milestone | Concept |
|------|------|--------|-----------|---------|
| NullPointer | Memory | DONE | V1 | Points to nothing |
| RaceCondition | Logic | DONE | V1 | Unpredictably fast |
| MemoryLeak | Memory | DONE | V1 | Bloated, won't free |
| Deadlock | Logic | DONE | V1.1 | Two threads, neither yields |
| OffByOne | Logic | DONE | V2 | Always slightly wrong |
| MergeConflict | Syntax | DONE | V2 | Two versions collide |
| CallbackHell | Runtime | DONE | V2 | Nested chaos |
| Heisenbug | Logic | DONE | V2 | Changes when observed |
| InfiniteLoop | Runtime | DONE | V2 | Never stops |
| SpaghettiCode | Syntax | DONE | V2 | Tangled mess |
| StackOverflow | Runtime | DONE | V2 | Too deep, it collapses |
| IndexOutOfBounds | Memory | DONE | V2 | Reaches past the edge |
| SegFaultling | Memory | IDEA | -- | Illegal access creature |
| TypeCoercion | Runtime | IDEA | -- | Shapeshifter |
| ZeroDivide | Logic | IDEA | -- | Approaches infinity |
| UnhandledPromise | Runtime | IDEA | -- | Silently fails |
| BitRot | Memory | IDEA | -- | Decays over time |
| ForkBomb | Runtime | IDEA | -- | Multiplies endlessly |
| PhantomRead | Memory | IDEA | -- | Reads data that was never written |
| GitBlame | Syntax | IDEA | -- | Points fingers, deflects damage |
| RegexDenial | Logic | IDEA | -- | So complex it causes a denial of service |
| CSSFloat | Syntax | IDEA | -- | Floats unpredictably, hard to pin down |
| DeprecatedAPI | Runtime | IDEA | -- | Ancient, powerful, slowly fading |
| KernelPanic | Memory | IDEA | -- | The nuclear option |
| 404NotFound | Memory | IDEA | -- | Exists in theory, never where you look |
| BrokenPipe | Runtime | IDEA | -- | Leaks data everywhere |
| DarkPattern | Logic | IDEA | -- | Manipulative, tricks opponents |

## Move Ideas Backlog

| Name | Power | Category | Status | Concept |
|------|-------|----------|--------|---------|
| SegFault | 10 | Damage | DONE | Crashes hard |
| Hotfix | 6 | Damage* | DONE | Quick patch (*reclassified to Heal in V4) |
| ThreadLock | 8 | Damage | DONE | Seizes up |
| GarbageCollect | 7 | Damage | DONE | Cleans up |
| MemoryDump | 9 | Damage | DONE | Dumps everything |
| Mutex | 7 | Damage | DONE | Locks the resource |
| ForceQuit | 12 | Damage | DONE | Terminates with prejudice |
| PatchDeploy | 7 | Damage | DONE | Ships a fix |
| Refactor | 8 | Damage | DONE | Restructures for more damage |
| BlueScreen | 11 | Damage | DONE | Critical failure |
| CoreDump | 10 | Damage | DONE | Full memory spill |
| Rollback | 5 | Damage | DONE | Undo + slight heal |
| HotReload | 6 | Damage | DONE | Quick refresh |
| TypeMismatch | 8 | Damage | DONE | Wrong type, big consequences |
| Compile | 14 | Damage | DONE | 2-turn charge attack |
| NullCheck | 4 | Damage | DONE | Weak but never misses |
| BufferOverrun | 13 | Damage | DONE | High damage, high risk (recoil) |
| Reboot | 7 | Utility | PLANNED | Full system restart |
| CtrlZ | -- | Heal | IDEA | Undo last damage taken |
| DDoS | 6x3 | Damage | IDEA | Multi-hit, 3 weak strikes |
| Obfuscate | -- | Status | IDEA | Sharply lowers enemy accuracy |
| GitRevert | -- | Utility | IDEA | Reset all stat changes |
| Defragment | -- | Heal | IDEA | Heal + cure status condition |
| Transpile | 8 | Utility | IDEA | Changes user's type mid-battle |
| Overclock | -- | Status | IDEA | Raise ATK and SPD, lower DEF |
| SyntaxError | 11 | Damage | IDEA | High power, chance to confuse self |
| MemoryWipe | 15 | Damage | IDEA | Strongest memory move, recoil damage |
| UnitTest | -- | Utility | IDEA | Reveals enemy stats and moves |

## Evolution Chains

| From | To | Method |
|------|----|--------|
| CallbackHell | AsyncAwait | Level 20 |
| MemoryLeak | GarbageCollector | Level 18 |
| SpaghettiCode | CleanArchitecture | Level 22 |
| NullPointer | OptionalChaining | Level 16 |
| RaceCondition | MutexGuard | Level 18 |
| OffByOne | ArrayOutOfBounds | Level 15 |
| MergeConflict | RebaseHell | Level 20 |
| InfiniteLoop | RecursionLimit | Level 25 |
| Heisenbug | Schrodinbug | Level 22 |
| BitRot | DataCorruption | Level 14 |
| DataCorruption | SystemFailure | Level 28 |
