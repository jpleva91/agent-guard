# BugMon Roadmap

> The codebase is infested with bugs. Time to cache 'em all.

## Vision

BugMon is a **CLI-first dev activity engine** with a browser game as the retention layer. The CLI is the wedge — it lives in developer workflows, intercepts real errors, and turns them into collectible encounters. The browser game is where progression, evolution, and visualization come alive.

The core loop:

```
dev starts CLI
↓
player auto-walks dungeon
↓
code errors spawn monsters
↓
battle occurs
↓
fix bug = defeat monster
↓
capture + xp → dex grows
↑                       |
└───────────────────────┘
```

Commit code, your BugMon evolve. Merge a PR, unlock new forms. Fix bugs, encounter rare creatures. The CLI doesn't compete with your work — it runs alongside it. The key mechanic: **bugs become enemies**. Gameplay is triggered by actual dev friction.

**Who is this for?** Developers at every stage of their coding journey. Whether you just wrote your first `Hello World` or you're debugging distributed systems, there's a BugMon that speaks to your experience.

**How people discover BugMon:**
- **CLI** — `npm install -g bugmon` or `npx bugmon watch -- npm run dev` — the primary entry point
- **Browser** — Play on GitHub Pages for RPG progression and visualization
- **Contribute** — Add a BugMon in 2 minutes with a JSON edit, no code required
- **VS Code extension** — Surface encounters in the editor sidebar (future)

### Product Strategy

Think of BugMon as: **product wedge → engagement loop → expansion surface**.

| Stage | What | Goal |
|-------|------|------|
| **Wedge** | CLI watcher + terminal battles | Get into the developer's workflow |
| **Engagement** | Browser game + evolution + BugDex | Keep them coming back |
| **Expansion** | IDE integration + AI debugging + social | Become indispensable |

**Strategic priorities:**
1. Make the **CLI the best way to discover BugMon** — reliable error detection, clean UX, instant setup
2. Expand **error coverage** — support more languages, frameworks, and tooling output
3. Keep the **browser game fun and shareable** — the retention layer that makes people come back
4. Keep the bundle **meaningfully small** (target: 16 KB gzipped, cap: 32 KB)
5. Make it **dead simple to contribute** — new BugMon, new moves, new art styles
6. Grow through community contributions and developer word-of-mouth
7. Layer in **real productivity value** — bug history, AI fix suggestions, team metrics

**Pragmatic about dependencies:** Zero runtime deps is the goal for the browser game. But dev tooling should be good — tests, build tools, linters, whatever makes the product better. The constraint is on the *shipped bundle*, not the development experience.

### Why It Can Work

Developers love weird dev tools, terminal toys, and gamification of pain. Projects like `sl`, `lolcat`, `cmatrix`, and `pokemon-cli` went viral on novelty alone. BugMon has an extra advantage: **it hooks into real developer problems.** The error-to-monster pipeline means every bug is content.

### Failure Modes to Avoid

| Risk | Mitigation |
|------|------------|
| **Novelty wears off** — people try it once and forget | Progression systems (XP, leveling, rare monsters, dex completion, bosses) create reasons to return |
| **Heavy graphics splits focus** — terminal is the natural habitat | Stay terminal-first; browser game is the *retention layer*, not the entry point |
| **Mobile-first dilutes the product** — developers are on desktops | Desktop/terminal is the primary platform; mobile is a nice-to-have, not a priority |
| **Large engine bloat** — contradicts the zero-dep philosophy | Enforce size budget religiously (`npm run budget`); every feature must fit within byte caps |
| **No real utility** — just a toy | Phase 2 (productivity layer) adds AI fix suggestions, bug history, and metrics that are genuinely useful |
| **Team/social features before solo is solid** — premature scaling | Complete V3-V5 (core QoL, battle depth, progression) before any multiplayer work |

### Legend

- **Effort:** `[S]` = hours | `[M]` = 1-2 days | `[L]` = 3+ days
- **Priority:** Must-have | Should-have | Nice-to-have
- **Status:** `DONE` | `IN PROGRESS` | `PLANNED` (assigned to a milestone) | `IDEA` (backlog only)

### Size Budget

Every feature must fit within the byte budget. Run `npm run budget` to check.

| Metric | Target | Hard Cap |
|--------|-------:|--------:|
| Bundle (gzipped, no sprites) | 10 KB | 17 KB |
| Bundle (gzipped, with sprites) | ~19 KB | 32 KB |

See `size-budget.json` for per-subsystem budgets and `CONSTRAINTS.md` for design rules.

### Product Phase Map

```
Phase 1: Terminal Toy (viral stage)     ← V1 through V2.95 — DONE
Phase 2: Productivity Layer             ← V3 through V5
Phase 3: Social Layer                   ← V9 (new)
Phase 4: IDE Integration                ← V10 (new)
Phase 5: AI Debugging Companion         ← V11 (new)
```

### Milestone Dependency Map

```
V1 ──> V1.1 ──> V2 ──> V2.5 ──> V2.9 ──> V2.95 ──> V3 ──> V4 ──> V6 ──> V7
                                                              |       |
                                                              v       +──> V8
                                                             V5
                                                              |
                                                              v
                                                     V9 ──> V10 ──> V11
```

*V2.95 (Evolution) was built ahead of schedule. V5 (XP/leveling) adds traditional RPG progression on top. V9+ represents the expansion surface beyond the core game.*

---

## V1 — Playable Prototype `DONE`

- [x] Tile-based exploration (15x10 map)
- [x] Arrow key movement with grid snapping
- [x] 3 BugMon: NullPointer, RaceCondition, MemoryLeak
- [x] 5 moves: SegFault, Hotfix, ThreadLock, GarbageCollect, MemoryDump
- [x] Random encounters in tall grass (10% chance)
- [x] Turn-based battle with speed priority
- [x] Capture mechanic (HP-based probability)
- [x] Run option (always succeeds)
- [x] HUD showing active BugMon and party size

## V1.1 — Sprites & Polish `DONE`

> **Theme:** Make it look and sound like a real game

- [x] Pixel art battle sprites for all BugMon (64x64 PNG)
- [x] Player character sprite with 4 directional frames (cyberpunk debugger)
- [x] Battle transition animation (3x white flash + fade to black)
- [x] Mobile touch controls (D-pad + A/B buttons)
- [x] GitHub Pages deployment workflow
- [x] Sound effects (Web Audio API, synthesized — no audio files)
- [x] Mute toggle button
- [x] Procedural tile textures (ground, wall bricks, animated grass)
- [x] Battle background art (procedurally generated)
- [x] Title screen with retro synthwave design (ASCII logo, starfield, perspective grid)

## V2 — Type System & Expanded Roster `DONE`

> **Theme:** Give battles strategic depth through type matchups

- [x] 7 types: frontend, backend, devops, testing, architecture, security, ai
- [x] 7x7 type effectiveness chart (super effective 1.5x / not very effective 0.5x)
- [x] Types assigned to all BugMon and moves
- [x] 20 base BugMon across all 7 types (including 2 legendaries)
- [x] 72 moves across all 7 types
- [x] Rarity system: common, uncommon, legendary, evolved
- [x] Rarity-weighted encounter tables

## V2.5 — Open Source & Community `DONE`

> **Theme:** Make BugMon contributor-friendly

- [x] Community BugMon submission via GitHub Issue template (new-bugmon.yml form)
- [x] Auto-validation workflow (validate-bugmon.yml) — checks schema, stat ranges, move existence
- [x] Battle preview bot — auto-comments with matchup preview on valid submissions
- [x] Auto-generation workflow (approve-bugmon.yml) — "approved" label triggers PR creation
- [x] README overhaul (open source positioning, contributor teaser)
- [x] CONTRIBUTING.md (add BugMon in 2 minutes, schemas, guidelines)

## V2.9 — CLI ↔ Browser Sync & "Cache" Mechanic `DONE`

> **Theme:** Bridge terminal and browser — cache 'em all

- [x] Rename "Catch/Capture" to "Cache" throughout
- [x] Browser persistence via localStorage (party, BugDex, position, auto-save)
- [x] CLI sync server (`bugmon sync`) — Node.js built-in WebSocket, zero deps
- [x] Browser sync client — auto-connects to local sync server, real-time state push/pull
- [x] Shared BugDex — CLI and browser merge party, storage, seen counts, stats
- [x] Seamless handoff — cache BugMon in terminal, see them in browser game instantly
- [x] Title screen with continue/new game menu
- [x] Auto-save every 30 seconds during exploration

## V2.95 — Evolution System `DONE`

> **Theme:** Your coding life drives your monsters' growth — BugMon's core differentiator

This was originally V5 but was built ahead of schedule due to being the game's unique selling point.

**Evolution engine:**
- [x] Dev-activity tracker (localStorage + .events.json) — 10 tracked event types
- [x] Evolution condition checker with progress percentage
- [x] 4-phase evolution animation (announce → flash → reveal → complete) with particles and glow
- [x] Git hooks (post-commit, post-merge) for automatic event tracking
- [x] Console API for testing (`window.bugmon.log('commits')`)

**7 evolution chains (10 evolved forms):**
- [x] CallbackHell → PromiseChain → AsyncAwait (commits, PRs merged)
- [x] NullPointer → OptionalChaining → TypeSafety (bugs fixed, tests passing)
- [x] DivSoup → Flexbox → CSSGrid (refactors, code reviews)
- [x] MergeConflict → RebaseMaster (conflicts resolved)
- [x] Monolith → Microservice (deploys)
- [x] MemoryLeak → GarbageCollector (CI passes)
- [x] PromptGoblin → PromptEngineer (docs written)

**HUD integration:**
- [x] Evolution progress shown in exploration HUD
- [x] EVOLVING game state with dedicated animation sequence
- [x] Sound effect for evolution

---

## V3 — Party Management & Core QoL `IN PROGRESS`

> **Depends on:** V2.95 | **Effort:** Medium | **Theme:** Make the game feel like a real play session

- [x] Save/load via localStorage — `[L]` *(done in V2.9)*
- [x] BugDex / collection tracker — `[M]` *(done in V2.9)*
- [x] Test suite (`npm test`) — `[M]` *(52 test files covering all modules)*
- [x] Build system with size budget enforcement (`npm run build`, `npm run budget`) — `[M]`
- [x] CI workflows for data validation and size checks — `[S]`
- [x] Layered architecture restructure (`core/`, `game/`, `ecosystem/`) — `[L]`
- [ ] Party management (swap active BugMon in and out of battle) — `[M]` *Must-have*
- [ ] Expanded error parser coverage (merge conflicts, security findings, CI failures) — `[M]` *Must-have*
- [ ] `bugmon init` command for project setup (install git hooks automatically) — `[S]` *Must-have*
- [ ] Error-to-BugMon mapping taxonomy documentation — `[S]` *Should-have*
- [ ] Settings menu (volume slider, text speed) — `[M]` *Should-have*
- [ ] Smooth tile-to-tile movement animation (lerp between tiles) — `[M]` *Should-have*
- [ ] PP system for moves (limited uses, restored at healing stations) — `[M]` *Should-have*
- [ ] More sprite art — only 4/31 BugMon have PNG sprites, rest use fallback — `[L]` *Should-have*

## V4 — Status Effects & Battle Depth

> **Depends on:** V3 | **Effort:** Large | **Theme:** Make every battle a strategic puzzle

**Status conditions:**
- [ ] Bugged (damage over time) — `[S]`
- [ ] Deprecated (reduced attack) — `[S]`
- [ ] Frozen (skip turn chance) — `[S]`
- [ ] Corrupted (random move override) — `[S]`
- [ ] Optimized (speed boost) — `[S]`

**Battle mechanics:**
- [ ] Moves that inflict/cure status effects — `[M]`
- [ ] Move categories: damage, heal, status, utility (currently all damage) — `[M]`
- [ ] Multi-turn moves (Compile: charge then hit hard) — `[M]`
- [ ] Healing moves (Hotfix reclassified from damage to heal) — `[S]`
- [x] Critical hits (6.25% chance for 1.5x damage) — `[S]` *(already implemented)*
- [ ] Accuracy/evasion stats — `[M]`
- [ ] Passive abilities (data exists for some BugMon, not yet used in battles) — `[M]`

## V5 — XP, Leveling & Move Learning

> **Depends on:** V4 | **Effort:** Large | **Theme:** Traditional progression alongside dev-activity evolution

The evolution system (dev-activity triggers) is done. This milestone adds the traditional RPG progression layer.

**Leveling:**
- [ ] Experience points from battles — `[L]`
- [ ] Stat growth curves on level up — `[M]`
- [ ] Learn new moves at level thresholds — `[M]`
- [ ] Move replacement UI (pick which move to forget) — `[M]`

**Dev-activity bonuses:**
- [ ] Commit streak bonuses (consecutive days → XP multiplier) — `[M]`
- [ ] Bug fix commits unlock rare encounters — `[M]`
- [ ] CI failures spawn boss-like encounters — `[M]`
- [ ] Code review activity rewards (reviewer XP) — `[S]`

**Scaling:**
- [ ] Wild BugMon level scaling by area — `[M]`

## V6 — World Expansion

> **Depends on:** V5 | **Effort:** Extra Large | **Theme:** A whole codebase to explore

**Maps:**
- [ ] Multiple maps with zone transitions — `[L]`
- [ ] Map zones: — `[L]`
  - Server Room (early game, backend-type BugMon)
  - QA Lab (mid game, testing-type BugMon)
  - Production Floor (late game, devops-type BugMon)
  - Legacy Basement (end game, mixed + rare)
  - Open Source Garden (optional area, community-submitted BugMon)
- [ ] Minimap — `[M]`

**NPCs:**
- [ ] NPC trainers: Junior Dev, Senior Dev, DevOps Engineer, QA Tester — `[L]`
- [ ] Dialog system — `[M]`

**Stations & items:**
- [ ] Healing station (the Coffee Machine) — `[M]`
- [ ] Items: — `[M]`
  - Energy Drink (heal HP)
  - Debug Log (capture boost)
  - Stack Trace (reveal enemy stats)
  - Repel (suppress encounters)
  - PP Restore (refill move uses)

## V7 — Boss Battles & Story

> **Depends on:** V6 | **Effort:** Large | **Theme:** The final debug

**Boss trainers (unique dialog + custom teams):**
- [ ] The Tech Lead (mid-boss, Server Room) — `[M]`
- [ ] The Architect (late-boss, Production Floor) — `[M]`
- [ ] Legacy System (final boss, Legacy Basement — ancient, overpowered, undocumented) — `[L]`

**Story:**
- [ ] Simple story arc: "The codebase is infested. Debug them all." — `[M]`
- [ ] Victory condition / ending screen — `[S]`
- [ ] Post-game: harder encounters, rare BugMon, NewGame+ — `[L]`

## V8 — Music & Atmosphere

> **Depends on:** V6 | **Effort:** Large | **Theme:** Make it feel alive

- [ ] Background music (synthesized chiptune loops via Web Audio API) — `[L]`
  - Overworld theme
  - Battle theme
  - Boss battle theme
  - Victory fanfare
- [ ] Weather/time-of-day visual effects — `[M]`
- [ ] Animated battle sprites (idle bounce, attack flash) — `[M]`
- [x] Screen shake on damage — `[S]` *(already implemented)*
- [ ] Encounter transition with species-specific flash color — `[S]`

---

## V9 — Productivity Layer & Social `PLANNED`

> **Depends on:** V5 | **Effort:** Extra Large | **Theme:** From toy to tool — make BugMon genuinely useful

This is where BugMon crosses from "fun novelty" to "thing developers actually keep running." The game becomes a lightweight developer observability layer.

**Bug history & metrics:**
- [ ] Error frequency tracking over time (per-type, per-file, per-session) — `[M]` *Must-have*
- [ ] "Hot zones" — visualize which parts of the codebase spawn the most BugMon — `[M]` *Must-have*
- [ ] Most defeated bug types report (common error patterns) — `[S]` *Must-have*
- [ ] Weekly/monthly dev activity summaries as in-game rewards — `[S]` *Should-have*
- [ ] Daily challenges ("Today: fix 5 NullPointers") with bonus XP — `[M]` *Should-have*
- [ ] Commit streak bonuses (consecutive days → XP multiplier) — `[M]` *Should-have*
- [ ] Performance mode — "speed run" timer for fixing bugs fastest — `[S]` *Nice-to-have*

**AI fix suggestions (when a BugMon spawns from a real error):**
- [ ] Context-aware fix hint based on error type + stack trace — `[M]` *Must-have*
- [ ] Severity → monster strength scaling (TypeError = grunt, build failure = boss) — `[S]` *Must-have*
- [ ] "AI spell" battle mechanic — cast a fix suggestion as an attack (if it compiles, critical hit) — `[L]` *Nice-to-have*

**Shared BugDex & social:**
- [ ] Upload/share monsters and sprites to community gallery — `[M]` *Should-have*
- [ ] Team leaderboards (compare BugDex across a dev team) — `[M]` *Should-have*
- [ ] GitHub Action that posts BugMon evolution announcements to PRs — `[M]` *Should-have*
- [ ] Repo-specific encounter tables (different projects spawn different BugMon) — `[M]` *Should-have*
- [ ] Social sharing — screenshot/share your team, evolution milestones, rare catches — `[S]` *Nice-to-have*

**Error coverage expansion:**
- [ ] Python tracebacks (`Traceback (most recent call last)`) — `[S]`
- [ ] Go panics and compile errors — `[S]`
- [ ] Rust compile errors (`error[E0308]`) — `[S]`
- [ ] Java/Kotlin stack traces — `[S]`

## V10 — IDE Integration `PLANNED`

> **Depends on:** V9 | **Effort:** Extra Large | **Theme:** The game moves into the editor

The CLI proves the concept. The IDE extension makes it frictionless. BugMon becomes a side panel dungeon that runs while you code.

**VS Code extension:**
- [ ] Extension scaffold with side panel webview — `[L]` *Must-have*
- [ ] Real-time error interception from diagnostics API — `[M]` *Must-have*
- [ ] Inline BugMon encounters on error hover — `[M]` *Must-have*
- [ ] Mini dungeon view in sidebar — `[L]` *Should-have*
- [ ] Party/BugDex status bar item — `[S]` *Should-have*
- [ ] Evolution notifications as VS Code toasts — `[S]` *Should-have*

**JetBrains plugin:**
- [ ] IntelliJ/WebStorm plugin with tool window — `[L]` *Nice-to-have*

**Claude Code integration:**
- [x] PostToolUse hook for automatic BugMon encounters on errors — `[M]` *Must-have*
- [x] `bugmon claude-init` setup command (install/remove hook) — `[S]` *Must-have*
- [x] `/bugmon` Claude Code skill for in-session collection management — `[S]` *Should-have*

**npm distribution:**
- [x] npm package — `npx bugmon` to play instantly in any terminal — `[M]` *Must-have*

## V11 — AI Debugging Companion `IDEA`

> **Depends on:** V10 | **Effort:** Extra Large | **Theme:** Sentry meets roguelike

The frontier. BugMon evolves from a game into a genuinely novel developer tool — an AI debugging companion with game mechanics.

**AI battle spells:**
- [ ] "Cast GPT Patch" — AI proposes a code fix as an attack; if it compiles, critical hit — `[L]`
- [ ] Mana system — AI spells cost mana, regenerated by manual bug fixes — `[M]`
- [ ] AI-suggested battle strategies based on error context — `[M]`

**Multiplayer / team dungeons:**
- [ ] Team repo = shared bug dungeon — `[L]`
- [ ] Collaborative boss fights (large errors require multiple developers to fix) — `[L]`
- [ ] Online trading (WebRTC or simple server) — `[L]`
- [ ] Online battles (WebRTC) — `[L]`

**Observability integration:**
- [ ] Sentry/Datadog webhook → BugMon encounter pipeline — `[L]`
- [ ] Production error monitoring as a passive BugMon spawner — `[L]`
- [ ] Streamer mode — display party/stats overlay for streaming dev sessions — `[M]`

---

## Stretch Goals

**Distribution & virality:**
- [ ] Console injection mode — drop BugMon into any website's dev tools console
- [ ] Embeddable widget — `<script src="bugmon.js">` adds a mini-game to any site
- [ ] Browser extension — encounter BugMon while browsing, catches persist

**Visual upgrades:**
- [ ] Upgrade from pixel art to a more polished art style (SVG, vector, illustrated)
- [ ] Animated battle sprites (idle bounce, attack flash, evolution particles)
- [ ] Procedural monster sprite generation (canvas-drawn creatures by type/color)

**Game features:**
- [ ] Procedural BugMon generator (random stats, names, sprites)
- [ ] Map editor
- [ ] Mod support (load custom JSON data)
- [ ] Achievements (catch all BugMon, win without taking damage, etc.)
- [ ] Accessibility (colorblind palette toggle, high contrast mode)
- [ ] Tutorial / onboarding flow
- [ ] Localization support
- [ ] Speedrun timer mode

---

## Current Roster (31 BugMon)

### Base Forms (21)

| # | Name | Type | Rarity | Evolves To |
|---|------|------|--------|------------|
| 1 | NullPointer | backend | common | OptionalChaining → TypeSafety |
| 2 | CallbackHell | backend | common | PromiseChain → AsyncAwait |
| 3 | RaceCondition | backend | uncommon | — |
| 4 | MemoryLeak | backend | common | GarbageCollector |
| 5 | DivSoup | frontend | common | Flexbox → CSSGrid |
| 6 | SpinnerOfDoom | frontend | common | — |
| 7 | StateHydra | frontend | uncommon | — |
| 8 | MergeConflict | devops | common | RebaseMaster |
| 9 | CIPhantom | devops | uncommon | — |
| 10 | DockerDaemon | devops | common | — |
| 11 | FlakyTest | testing | common | — |
| 12 | AssertionError | testing | common | — |
| 13 | Monolith | architecture | uncommon | Microservice |
| 14 | CleanArchitecture | architecture | uncommon | — |
| 15 | SQLInjector | security | uncommon | — |
| 16 | XSSpecter | security | uncommon | — |
| 17 | PromptGoblin | ai | uncommon | PromptEngineer |
| 18 | HalluciBot | ai | common | — |
| 19 | TheSingularity | ai | legendary | — |
| 20 | TheLegacySystem | architecture | legendary | — |
| 31 | TodoComment | testing | common | — |

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

## BugMon Ideas Backlog

| Name | Type | Concept |
|------|------|---------|
| SegFaultling | backend | Illegal access creature |
| TypeCoercion | backend | Shapeshifter |
| ZeroDivide | backend | Approaches infinity |
| BitRot | backend | Decays over time (3-stage evo: BitRot → DataCorruption → SystemFailure) |
| PhantomRead | backend | Reads data that was never written |
| KernelPanic | backend | The nuclear option |
| DarkPattern | frontend | Manipulative, tricks opponents |
| TabsVsSpaces | architecture | The eternal debate — dual-type? |
| LeftPadCollapse | devops | One small removal breaks everything |
| CopilotShadow | ai | Writes code that almost works |

## Move Ideas Backlog

| Name | Power | Category | Concept |
|------|-------|----------|---------|
| Reboot | 7 | Utility | Full system restart (planned for V3) |
| CtrlZ | — | Heal | Undo last damage taken |
| DDoS | 6x3 | Damage | Multi-hit, 3 weak strikes |
| Obfuscate | — | Status | Sharply lowers enemy accuracy |
| GitRevert | — | Utility | Reset all stat changes |
| Defragment | — | Heal | Heal + cure status condition |
| Transpile | 8 | Utility | Changes user's type mid-battle |
| Overclock | — | Status | Raise ATK and SPD, lower DEF |
| SyntaxError | 11 | Damage | High power, chance to confuse self |
| MemoryWipe | 15 | Damage | Strongest memory move, recoil damage |
| UnitTest | — | Utility | Reveals enemy stats and moves |

## Evolution Chain Ideas

| From | To | Dev-Activity Trigger |
|------|----|---------------------|
| RaceCondition | MutexGuard | Resolve 5 merge conflicts |
| SpinnerOfDoom | ProgressBar | Complete 10 deploys |
| FlakyTest | IntegrationTest | Pass 20 test runs |
| DockerDaemon | KubernetesOrchestrator | Deploy 15 times |
| HalluciBot | GroundedAgent | Write 10 docs |
| BitRot | DataCorruption | 7-day commit streak |
| DataCorruption | SystemFailure | 3 CI failures in one day |
