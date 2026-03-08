# Contributing to BugMon

Thanks for wanting to contribute! BugMon is designed so you can add content without touching game code.

## Quick Start

```bash
git clone https://github.com/jpleva91/BugMon.git
cd BugMon
python3 -m http.server
# Open http://localhost:8000
```

No dependencies. No build step. That's it.

## Ways to Contribute

| What | Difficulty | Files to edit |
|------|-----------|---------------|
| Add a new BugMon | Easy | `ecosystem/data/monsters.json` |
| Add a new move | Easy | `ecosystem/data/moves.json` |
| Add a sprite | Easy | `game/sprites/` |
| Balance stats | Easy | `ecosystem/data/monsters.json` |
| Fix a bug | Medium | Source files |
| Add a feature | Medium-Hard | Source files |

---

## Add a New BugMon (2 minutes)

1. Open `ecosystem/data/monsters.json`
2. Add an entry at the end of the array:

```json
{
  "id": 32,
  "name": "YourBugName",
  "type": "frontend",
  "hp": 30,
  "attack": 7,
  "defense": 5,
  "speed": 6,
  "moves": ["cacheinvalidation", "hotfix"],
  "color": "#3498db",
  "sprite": "yourbugname",
  "description": "A sentence describing what the sprite should look like."
}
```

### BugMon Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique integer. Use the next available number. |
| `name` | string | PascalCase name. Should be a programming concept, bug, or dev culture reference. |
| `type` | string | One of: `frontend`, `backend`, `devops`, `testing`, `architecture`, `security`, `ai` |
| `hp` | number | Hit points. Range: 20-50. |
| `attack` | number | Attack power. Range: 3-10. |
| `defense` | number | Defense. Range: 2-8. |
| `speed` | number | Turn priority. Range: 1-10. |
| `moves` | string[] | Array of 2-3 move IDs from `data/moves.json`. |
| `color` | string | Hex color for the fallback sprite. |
| `sprite` | string | Lowercase filename (without `.png`). |
| `description` | string | Art prompt for sprite generation. |

### Stat Balance Guidelines

Aim for a total stat sum (HP + ATK + DEF + SPD) between 40 and 55.

| Archetype | HP | ATK | DEF | SPD | Example |
|-----------|---:|----:|----:|----:|---------|
| Glass cannon | low | high | low | high | ForkBomb (22/10/2/9) |
| Tank | high | low | high | low | InfiniteLoop (45/4/5/1) |
| Balanced | mid | mid | mid | mid | GitBlame (31/6/6/5) |
| Speedster | low | mid | low | max | 404NotFound (24/5/5/10) |

### Type Guide

| Type | Theme |
|------|-------|
| Frontend | Browser and UI bugs (CSS issues, 404s, DOM problems) |
| Backend | Server-side bugs (null pointers, memory leaks, race conditions) |
| DevOps | Infrastructure bugs (pipeline failures, container issues, git problems) |
| Testing | Test-related bugs (flaky tests, assertion errors) |
| Architecture | Design pattern bugs (monoliths, spaghetti code) |
| Security | Security vulnerabilities (SQL injection, XSS) |
| AI | AI/ML bugs (hallucinations, prompt issues) |

---

## Add a New Move

1. Open `ecosystem/data/moves.json`
2. Add an entry:

```json
{ "id": "yourmove", "name": "YourMove", "power": 8, "type": "frontend" }
```

### Move Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Lowercase, no spaces. Used as the internal identifier. |
| `name` | string | Display name shown in battle. |
| `power` | number | Base damage. Range: 4-14. |
| `type` | string | One of the 7 types. Determines effectiveness. |

### Power Guidelines

| Range | Category | Example |
|-------|----------|---------|
| 4-6 | Weak (reliable) | NullCheck (4), MockOverride (6) |
| 7-9 | Standard | Refactor (8), CacheInvalidation (9) |
| 10-12 | Strong | SegFault (10), SQLInjection (11) |
| 13-14 | High-risk | BufferOverrun (13), Compile (14) |

---

## Add a Sprite

Sprites are 64x64 PNG images with transparent backgrounds.

1. Create a 64x64 pixel art sprite
2. Save as `game/sprites/<name>.png` (lowercase, matching the `sprite` field in monsters.json)
3. The game will automatically load it

If no sprite exists, the game falls back to a colored rectangle -- so sprites are optional.

See `game/sprites/SPRITE_GUIDE.md` for art style guidelines and color palettes.

---

## Report a Bug

Use the [Bug Report](../../issues/new?template=bug-report.yml) issue template, or open a plain issue with:

- What happened
- What you expected
- Browser and OS

---

## Development

### Project Structure

```
core/                # CLI companion & shared logic (Node.js)
game/                # Browser game (client-side)
├── game.js          # Entry point, game loop
├── engine/          # Core framework (state, input, rendering)
├── battle/          # Battle engine + damage formula
├── world/           # Map, player, encounters
├── evolution/       # Dev-activity evolution system
├── audio/           # Synthesized sounds
├── sync/            # Save/load + CLI sync
└── sprites/         # Sprite images + procedural tiles
ecosystem/           # Game content & metagame
└── data/            # All game content (JSON + JS modules)
```

### How It Works

- All game content is loaded from JSON at startup
- Modules receive data via setter functions (e.g., `setMonstersData()`)
- The game is a state machine: EXPLORE → BATTLE_TRANSITION → BATTLE → EXPLORE
- See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical breakdown

### Code Style

- Vanilla ES6 modules (no framework, no build tools)
- No external dependencies
- Prefer simple, readable code over abstractions

---

## Pull Request Process

1. Fork the repo and create your branch from `main`
2. Make your changes
3. Test locally (`python3 -m http.server`)
4. Open a PR with a clear description

For BugMon/move additions, the CI will automatically validate your JSON.

---

## BugMon Name Ideas

Need inspiration? BugMon names should be programming concepts that developers will recognize:

- Bug types: SegFault, MemoryLeak, BufferOverflow
- Patterns: Singleton, Observer, FactoryMethod
- Tools: Webpack, Docker, Kubernetes
- Concepts: TechnicalDebt, ScopeCreep, YakShaving
- Culture: RubberDuck, ItWorksOnMyMachine, HotDeploy

The best names are ones that make developers laugh and nod.
