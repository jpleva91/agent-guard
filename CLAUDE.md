# CLAUDE.md — BugMon AI Assistant Guide

## Project Overview

BugMon is a Pokémon-inspired monster-taming RPG where the monsters are software bugs (NullPointer, MemoryLeak, RaceCondition, etc.). Built with vanilla JavaScript, HTML5 Canvas, and Web Audio API — **zero external dependencies**.

## Quick Reference

```bash
# Run locally (any static file server works)
python3 -m http.server
# Open http://localhost:8000

# Validate game data
node .github/scripts/validate-data.mjs
```

There is no build step, no package manager, no bundler, no transpiler.

## Project Structure

```
index.html              # Entry point: canvas, touch controls, loads game.js
game.js                 # Game loop, initialization, data loading
engine/                 # Core framework
  state.js              # Game state machine (EXPLORE, BATTLE_TRANSITION, BATTLE, MENU)
  input.js              # Unified keyboard/touch input
  renderer.js           # All Canvas 2D drawing
  transition.js         # Battle transition animations
world/                  # Overworld systems
  map.js                # Map data, tile queries, collision
  player.js             # Player movement, party management
  encounters.js         # Wild encounter detection (10% in tall grass)
battle/                 # Turn-based battle engine
  battleEngine.js       # Battle state machine, turn resolution
  damage.js             # Damage calculation with type effectiveness
audio/
  sound.js              # Synthesized sound effects (Web Audio API, no audio files)
sprites/
  sprites.js            # Image loader with preload and fallback
  tiles.js              # Procedural tile textures and battle backgrounds
  *.png                 # Pixel art sprites (64x64 monsters, 32x32 player)
data/                   # Game content (data-driven, edit JSON to add content)
  monsters.json         # 20 BugMon definitions
  moves.json            # 25 moves
  types.json            # 8 types with effectiveness chart
  map.json              # 15x10 tile grid (0=ground, 1=wall, 2=tall grass)
```

Total codebase: ~1,200 lines of JavaScript across 13 source files.

## Architecture & Patterns

**ES6 Modules** — All JS uses `import`/`export`. No classes; modules export functions.

**Data injection via setter functions** — Modules receive data through setter functions (e.g., `setMonstersData()`) rather than importing data files directly. This avoids async import complexity.

**Game loop** — `requestAnimationFrame` drives a standard `update(dt)` → `render()` → `clearJustPressed()` cycle at 60 FPS.

**Data-driven design** — All game content lives in JSON under `data/`. Adding a new BugMon or move requires only JSON edits, no code changes.

**Graceful degradation** — Sprites fall back to colored rectangles if PNGs fail to load. Audio handles suspended contexts. Touch controls auto-show on mobile.

**Canvas rendering** — 480×320 canvas (15×10 tiles at 32px). `imageSmoothingEnabled = false` for crisp pixel art.

## Code Conventions

- **Naming**: camelCase for functions/variables, UPPER_CASE for constants
- **Style**: Simple, readable code over abstractions; no over-engineering
- **Comments**: Sparse — only where intent isn't obvious from the code
- **Error handling**: Graceful degradation, not defensive exception catching
- **State**: Single mutable state per module; no framework or event bus
- **Input**: Unified `wasPressed()`/`isDown()` API abstracts keyboard and touch

## Data File Formats

**monsters.json** entries:
```json
{
  "id": 1, "name": "NullPointer", "type": "memory",
  "hp": 30, "attack": 8, "defense": 4, "speed": 6,
  "moves": ["segfault", "hotfix"],
  "color": "#e74c3c", "sprite": "nullpointer",
  "description": "A spectral pointer..."
}
```
Stat ranges: HP 1–100, ATK/DEF/SPD 1–20.

**moves.json** entries:
```json
{ "id": "segfault", "name": "SegFault", "power": 10, "type": "memory" }
```
Power range: 1–20.

**types.json**: 8 types (memory, logic, runtime, syntax, frontend, backend, devops, testing) with a full 8×8 effectiveness matrix (1.0 normal, 1.5 super effective, 0.5 not very effective).

**map.json**: `{ "width": 15, "height": 10, "tiles": [[...]] }` — tile values 0/1/2.

## CI/CD

**Deploy** (`.github/workflows/deploy.yml`): Push to `main` or `master` auto-deploys to GitHub Pages.

**Validate** (`.github/workflows/validate.yml`): PRs touching `data/**` trigger JSON validation via `.github/scripts/validate-data.mjs` (Node.js v20). Checks:
- Valid JSON syntax
- Monster stats within allowed ranges
- Unique IDs and names
- Move references exist in moves.json
- Complete 8×8 type effectiveness chart
- Move power within range

## Testing

No formal test framework. Testing is manual (play the game locally). Data validation is automated in CI for PRs that modify `data/` files. Run validation locally with:

```bash
node .github/scripts/validate-data.mjs
```

## Common Tasks

**Add a new BugMon**: Edit `data/monsters.json` — add an entry with a unique id, name, type, stats, moves, color, and sprite field. Optionally add a 64×64 PNG sprite in `sprites/`.

**Add a new move**: Edit `data/moves.json` — add an entry with unique id, display name, power, and type.

**Modify the map**: Edit `data/map.json` — change tile values in the grid (0=ground, 1=wall, 2=tall grass). Map is 15×10.

**Add a sprite**: Place a 64×64 PNG in `sprites/` named to match the monster's `sprite` field. Player sprites are 32×32. See `sprites/SPRITE_GUIDE.md` for art specs.

**Modify game logic**: Edit the relevant module under `engine/`, `world/`, or `battle/`. The entry point is `game.js`.

## Key Documentation

- `README.md` — Overview, features, how to play
- `ARCHITECTURE.md` — Technical deep dive, module dependency graph, design decisions
- `CONTRIBUTING.md` — Contributor guide, step-by-step content addition
- `ROADMAP.md` — V1–V8 milestone planning and status
- `sprites/SPRITE_GUIDE.md` — Sprite art specifications
