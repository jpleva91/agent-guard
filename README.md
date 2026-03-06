# BugMon

A monster-taming RPG where the monsters are software bugs. Catch them all, if your code can handle it.

**[Play Now](https://jpleva91.github.io/BugMon/)**

<p align="center">
  <img src="sprites/nullpointer.png" width="64" alt="NullPointer">
  <img src="sprites/racecondition.png" width="64" alt="RaceCondition">
  <img src="sprites/memoryleak.png" width="64" alt="MemoryLeak">
  <img src="sprites/deadlock.png" width="64" alt="Deadlock">
</p>

## How to Play

Walk through the world and step into tall grass to encounter wild BugMon. Battle them, weaken them, and capture them for your party.

### Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| Move | Arrow keys | D-pad |
| Confirm / Select | Enter | A button |
| Back / Cancel | Escape | B button |

### Battle

When you encounter a wild BugMon, you have three options:

- **Fight** -- Pick a move to attack. Faster BugMon acts first.
- **Capture** -- Try to catch it. Lower HP = higher chance. A failed capture gives the enemy a free turn.
- **Run** -- Always succeeds.

Your BugMon auto-heals when it faints, so you can keep exploring.

## BugMon Roster

| Sprite | Name | HP | ATK | DEF | SPD | Moves |
|--------|------|---:|----:|----:|----:|-------|
| <img src="sprites/nullpointer.png" width="32"> | **NullPointer** | 30 | 8 | 4 | 6 | SegFault, Hotfix |
| <img src="sprites/racecondition.png" width="32"> | **RaceCondition** | 25 | 6 | 3 | 10 | ThreadLock, Hotfix |
| <img src="sprites/memoryleak.png" width="32"> | **MemoryLeak** | 40 | 5 | 6 | 3 | GarbageCollect, MemoryDump |
| <img src="sprites/deadlock.png" width="32"> | **Deadlock** | 35 | 7 | 8 | 2 | Mutex, ForceQuit |

## Features

- Tile-based exploration with random encounters in tall grass
- Turn-based combat with speed priority and damage calculation
- Capture mechanic with HP-based probability
- Pixel art sprites for all BugMon and player character
- Synthesized sound effects (Web Audio API, no audio files)
- Mobile touch controls with D-pad and action buttons
- Mute toggle (speaker icon, top-right corner)
- Zero dependencies -- pure vanilla JS and HTML5 Canvas

## Run Locally

```bash
git clone https://github.com/jpleva91/BugMon.git
cd BugMon
python3 -m http.server
# Open http://localhost:8000
```

Any static file server works. No build step required.

## Tech Stack

- Vanilla JavaScript (ES6 modules)
- HTML5 Canvas 2D
- Web Audio API (synthesized sounds)
- Zero dependencies, zero build tools

## Project Structure

See [ARCHITECTURE.md](ARCHITECTURE.md) for technical details and [ROADMAP.md](ROADMAP.md) for planned features.

## License

MIT
