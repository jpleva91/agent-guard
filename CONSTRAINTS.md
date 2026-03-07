# BugMon Design Constraints

Total bundle must remain under 32 KB gzipped. Target: 16 KB.

## Rules

- No runtime dependencies
- Vanilla JavaScript only
- Canvas API for rendering
- Web Audio API for sound (no audio files)
- Functions over classes
- Avoid abstractions unless reused 3+ times
- Prefer data tables over logic
- All sprites are procedurally generated or optional PNG overlays
- `core/` must not import from `game/`; `game/` must not import from `core/`
- `ecosystem/data/*.js` modules are generated artifacts — edit the `.json` source files and run `npm run sync-data`

## Byte Budget

See `size-budget.json` for per-subsystem budgets.

Every subsystem has two thresholds:
- **Target**: aspirational size, warns on overage
- **Cap**: hard ceiling, blocks merge if the overall bundle exceeds its cap

Run `npm run budget` to check compliance.
