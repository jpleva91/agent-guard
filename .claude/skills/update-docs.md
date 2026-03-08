# Skill: Update Documentation

Synchronize all project documentation to reflect the current state of the codebase and data files. This is the primary doc maintenance tool — run it after any code or data changes.

## Source of Truth Files

Read these files first to determine current state:
- `ecosystem/data/monsters.json` — all BugMon (count, names, types, rarity, fields)
- `ecosystem/data/moves.json` — all moves (count, names, types, power)
- `ecosystem/data/types.json` — valid types list and effectiveness chart
- `ecosystem/data/evolutions.json` — evolution chains with stages and triggers
- `ecosystem/data/map.json` — map dimensions
- `package.json` — version, scripts

Also scan these source directories for new/removed files:
- `core/cli/`, `game/engine/`, `game/battle/`, `game/world/`, `game/audio/`, `game/sprites/`, `game/evolution/`, `game/sync/`, `domain/`, `domain/ingestion/`, `simulation/`, `scripts/`, `hooks/`, `.github/`

## Documentation Files to Update

### README.md
- Update BugMon count (e.g., "31 BugMon across 7 types")
- Update move count
- Update type list if types changed
- Verify the project structure tree matches actual directories
- Ensure any referenced sprites actually exist in `sprites/`

### ARCHITECTURE.md
- Update the project structure tree to reflect actual files/directories
- Update data format examples to match current schema fields (check for fields like `errorPatterns`, `fixTip`, `rarity`, `theme`, `passive`)
- Update module descriptions if new files were added
- Verify CLI usage examples match current `package.json` scripts

### ROADMAP.md
- **BugMon Ideas Backlog table**: Any BugMon in `monsters.json` that is NOT in the backlog table should be added with status `DONE` and correct type. Do NOT remove existing IDEA entries.
- **Move Ideas Backlog table**: Any move in `moves.json` that is NOT in the backlog table should be added with status `DONE`. Do NOT remove existing IDEA entries.
- **Evolution Chains table**: Sync from `evolutions.json` — add any missing chains, update existing ones if stages changed.
- **Milestone checklists**: If a listed feature now exists in the codebase, mark it `[x]`. Do NOT change status from PLANNED to DONE unless the feature is verifiably implemented in code.

### CONTRIBUTING.md
- Update the BugMon field reference table if `monsters.json` has fields not documented
- Update stat range guidelines if the actual roster has drifted
- Update the type list
- Update move count and list of available move IDs
- Update the type effectiveness chart if `types.json` changed

### CLAUDE.md
- Update the project structure tree
- Update data format examples to match current schema
- Update counts (BugMon count, move count, type count)
- Verify the development commands section matches `package.json` scripts

## Rules

- **Preserve prose and commentary** — only update factual content (counts, tables, trees, lists, examples)
- **Do NOT invent information** — only reflect what is actually in the data files and source code
- **Do NOT change milestone status** from PLANNED to DONE unless the feature is verifiably implemented
- **Keep formatting consistent** with the existing style in each file

## After Making Changes

1. Run `node .github/scripts/validate-data.mjs` to confirm data integrity
2. Run `npm test` to confirm tests still pass
3. Present a summary of what was changed in each documentation file
