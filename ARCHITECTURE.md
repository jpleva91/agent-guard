# BugMon Architecture

## Overview

BugMon is a Pokémon-style browser game themed around software bugs. It runs entirely client-side with vanilla JS, HTML Canvas, and zero dependencies. Serve it with any static file server and open `index.html`.

```
python3 -m http.server
# open http://localhost:8000
```

Also deployable to GitHub Pages — see `.github/workflows/deploy.yml`.

## Project Structure

```
BugMon/
├── index.html              Entry point - canvas, touch controls, loads game.js
├── game.js                 Game loop, data loading, orchestration
│
├── engine/                 Core engine (framework-level)
│   ├── state.js            Game state machine: EXPLORE | BATTLE_TRANSITION | BATTLE | MENU
│   ├── input.js            Keyboard + touch input (pressed/just-pressed/simulate)
│   ├── renderer.js         All Canvas drawing functions
│   └── transition.js       Battle transition animation (flash/fade)
│
├── world/                  Overworld systems
│   ├── map.js              Map data loading, tile queries, collision
│   ├── player.js           Player position, movement, party
│   └── encounters.js       Wild encounter checks (10% in tall grass)
│
├── battle/                 Battle systems
│   ├── battleEngine.js     Turn-based battle state machine
│   └── damage.js           Damage formula
│
├── data/                   Game content (JSON, data-driven)
│   ├── monsters.json       BugMon creatures, stats, and sprite refs
│   ├── moves.json          Move definitions
│   └── map.json            Tile grid for the world map
│
├── audio/                  Sound effects (Web Audio API, no files)
│   └── sound.js            Synthesized sound effects and mute control
│
├── sprites/                Pixel art sprites (PNG images)
│   ├── sprites.js          Image loader with preload and fallback
│   ├── SPRITE_GUIDE.md     Art specs, palettes, and generation prompts
│   ├── nullpointer.png     Battle sprite (64x64)
│   ├── racecondition.png   Battle sprite (64x64)
│   ├── memoryleak.png      Battle sprite (64x64)
│   ├── deadlock.png        Battle sprite (64x64)
│   └── player_*.png        Player directional sprites (32x32 x4)
│
└── .github/workflows/
    └── deploy.yml          GitHub Pages auto-deploy on push to main
```

## Module Dependency Graph

```
game.js (entry point)
├── engine/state.js         (no deps)
├── engine/input.js         ← audio/sound.js
├── engine/renderer.js      ← sprites/sprites.js
├── engine/transition.js    ← audio/sound.js
├── world/map.js            (no deps)
├── world/player.js         ← engine/input.js, world/map.js, audio/sound.js
├── world/encounters.js     ← audio/sound.js (receives data via setter)
├── battle/damage.js        (no deps)
├── battle/battleEngine.js  ← battle/damage.js, engine/input.js,
│                              engine/state.js, world/player.js, audio/sound.js
├── audio/sound.js          (no deps, Web Audio API)
└── sprites/sprites.js      (no deps, image loader)
```

All modules use ES Module `import`/`export`. JSON data is loaded via `fetch()` at startup in `game.js` and passed to modules through setter functions.

## Game State Machine

```
┌─────────┐  encounter  ┌──────────────────┐  done  ┌─────────┐
│ EXPLORE │────────────>│ BATTLE_TRANSITION │──────>│ BATTLE  │
│         │<────────────│  (flash + fade)   │       │         │
└─────────┘  win/run/   └──────────────────┘       └─────────┘
     │       capture          ~860ms
     │
     │ Esc (future)
     v
┌─────────┐
│  MENU   │
└─────────┘
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

### monsters.json
```json
{
  "id": 1,
  "name": "NullPointer",
  "hp": 30, "attack": 8, "defense": 4, "speed": 6,
  "moves": ["segfault", "hotfix"],
  "color": "#e74c3c",
  "sprite": "nullpointer",
  "description": "Art prompt for sprite generation..."
}
```

### moves.json
```json
{ "id": "segfault", "name": "SegFault", "power": 10 }
```

### map.json
Tile values: `0` = ground, `1` = wall, `2` = tall grass
```json
{ "width": 15, "height": 10, "tiles": [[1,1,...], ...] }
```

## Sprite System

Image-based sprites loaded at startup via `sprites/sprites.js`:

- **Battle sprites**: 64x64 PNG, transparent background, loaded by `sprite` field in monsters.json
- **Player sprites**: 32x32 PNG, 4 directional frames (`player_down.png`, etc.)
- **Fallback**: colored rectangles if a PNG fails to load
- **Preload**: all sprites loaded via `preloadAll()` before game starts
- `imageSmoothingEnabled = false` keeps pixel art crisp when scaled

See `sprites/SPRITE_GUIDE.md` for art specs and generation prompts.

## Rendering

- Canvas: 480x320 (15×10 tiles at 32px)
- Scales to fit screen width on mobile (`max-width: 100%`)
- Tiles: colored rectangles (tan ground, gray walls, green grass with crosshatch)
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

- **Module**: `audio/sound.js` — single module with exported `play*()` functions
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

## Key Design Decisions

- **ES Modules** over script tags: proper scoping, explicit dependencies
- **Setter functions** for data injection: modules like `encounters.js` receive monster data via `setMonstersData()` rather than importing JSON directly (fetch requires async)
- **Single mutable state**: no framework, no event bus. Modules read/write shared state directly. Works at this scale.
- **Grid-locked movement**: player position is always integer tile coords. No sub-tile animation yet.
- **Message queue pattern**: battle uses `showMessage(text, callback)` to chain actions with visible pauses between them
- **Image sprites with fallback**: PNG files loaded at startup, graceful degradation to colored squares
- **Unified input**: keyboard and touch both feed into the same key state, so game logic doesn't need to know the input source
- **GitHub Pages deploy**: zero-config static hosting, auto-deploys on push to main
