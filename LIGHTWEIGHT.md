# The Lightweight Manifesto

**How small can a game be?**

BugMon is a complete monster-taming RPG — 30 creatures, 69 moves, 7 types, evolution chains, turn-based battles, tile-based exploration, synthesized audio, mobile touch controls — and the whole thing fits in a single HTML file.

No npm. No webpack. No React. No Babel. No transpiler. No bundler. No framework. No polyfills. No node_modules.

Just vanilla JavaScript and vibes.

## The Numbers

### Dev Mode (modular source)

| Category | Files | Size |
|----------|------:|-----:|
| JavaScript (game logic + engine) | ~68 | ~229 KB |
| HTML + inline CSS | 1 | 8 KB |
| JSON data (monsters, moves, types, map, evolutions) | 5 | 43 KB |
| PNG sprites (pixel art) | 8 | 6 KB |
| **Total deployable** | **~83** | **~292 KB** |

### Single-File Build (`dist/bugmon.html`)

| Metric | Size |
|--------|-----:|
| Raw (with sprites, base64) | 43 KB |
| **Gzipped (with sprites)** | **~19 KB** |
| Raw (no sprites) | 35 KB |
| **Gzipped (no sprites, deployed)** | **~12 KB** |
| HTTP requests | **1** |

Build it yourself: `node scripts/build.js`

## Fun Comparisons

| What | Size |
|------|-----:|
| **BugMon (gzipped, with sprites)** | **~19 KB** |
| React 18 production (minified) | ~142 KB |
| jQuery 3.7 (minified) | ~87 KB |
| Vue 3 (minified) | ~33 KB |
| Tailwind CSS (full, uncompressed) | ~3,500 KB |
| Average favicon.ico | ~15 KB |
| Average website hero image | ~200-500 KB |
| `create-react-app` node_modules | ~300,000 KB |

BugMon has 30 monsters, 69 moves, 7 types, evolution chains, procedural terrain, synthesized audio, a full battle system, and mobile controls. Still smaller than jQuery.

`node_modules` for dev tooling: esbuild + terser only. Zero runtime dependencies.

## What Makes This Possible

### Procedural Tile Generation (238 lines)
Instead of a spritesheet or tile atlas, all terrain is drawn at runtime using Canvas 2D. A seeded PRNG (Mulberry32) ensures deterministic noise — no flicker between frames. Ground tiles have pebble details, walls have per-brick variation with mortar and highlights, and grass has animated swaying blades. All from math, not pixels.

### Synthesized Audio (185 lines)
Every sound effect is generated using the Web Audio API — oscillators, frequency sweeps, and white noise bursts. Menu clicks are square wave pops. Battle attacks combine noise with sawtooth sweeps. The victory jingle is a synthesized arpeggio. Zero audio files loaded.

### Canvas 2D Rendering (178 lines)
No DOM manipulation. No virtual DOM diffing. No React reconciler. One `<canvas>` element, one `getContext('2d')`, and `requestAnimationFrame`. The entire UI — map, player, battle screen, HP bars, menus, type badges — is drawn directly to pixels.

### Native ES6 Modules
`<script type="module">` — that's it. The browser handles dependency resolution. No bundler needed in development. Each file is a clean, isolated module with explicit imports/exports.

### Data-Driven Architecture
All game content lives in JSON files. The engine reads data, never hardcodes it. Adding a monster means editing one JSON file — zero code changes. For production, the data is inlined into JS modules (saving 5 HTTP requests) via `node scripts/sync-data.js`.

### Graceful Sprite Fallbacks
PNGs are optional. If a sprite fails to load, the renderer draws colored shapes with directional indicators. The player becomes a blue square with a pointing triangle. Monsters become colored rectangles. The game is fully playable without a single image file.

## Network Requests

| Mode | Requests |
|------|:--------:|
| Dev (ES modules, JSON fetches, PNGs) | ~54 |
| Dev (inlined data, PNGs) | ~49 |
| **Single-file build** | **1** |

## The Zero-Dependency Philosophy

Dependencies are a tradeoff. For BugMon, the tradeoff was never worth it:

- **Rendering?** Canvas 2D is built into every browser. It draws pixels. That's all we need.
- **Sound?** The Web Audio API synthesizes everything. No codec negotiation, no file loading.
- **State management?** A `let currentState` and a getter/setter. 14 lines. Works perfectly at this scale.
- **Build tools?** esbuild + terser for production builds. Two dev dependencies. Run them if you want. Don't if you don't.
- **Module system?** The browser has had native ES modules since 2017. No polyfill needed.

Every line of code serves the game. Nothing serves a framework.

## Build It Yourself

```bash
# Development — just serve static files
python3 -m http.server

# Regenerate JS data modules from JSON
node scripts/sync-data.js

# Build single-file distribution
node scripts/build.js

# Build without sprites (smallest possible)
node scripts/build.js --no-sprites
```

## The Challenge

Can we make it smaller? Ideas for the ambitious:

- **Procedural monster sprites** — Replace PNGs with canvas-drawn creatures based on type/color. ~30 lines per type pattern could eliminate all sprite files.
- **Shorter variable names** — Terser already handles minification, but more aggressive property mangling could help further.
- **Map compression** — Run-length encoding on the tile grid. The current 15x10 grid is tiny, but larger maps would benefit.
- **Binary data format** — Pack monster stats into a binary buffer instead of JSON. Probably overkill, but fun.
- **WASM** — Rewrite the engine in C and compile to ~5KB of WASM. Absolute overkill. Would be hilarious.

The floor is probably around **4-5 KB gzipped** if you go full code golf. PRs welcome.
