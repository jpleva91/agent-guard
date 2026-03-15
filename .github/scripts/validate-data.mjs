// Validates BugMon game data (monsters, moves, types)
// Run: node .github/scripts/validate-data.mjs

import { readFile } from 'fs/promises';

const errors = [];

function error(file, msg) {
  errors.push(`${file}: ${msg}`);
}

// Load all data files
const [monstersRaw, movesRaw, typesRaw] = await Promise.all([
  readFile('ecosystem/data/monsters.json', 'utf-8'),
  readFile('ecosystem/data/moves.json', 'utf-8'),
  readFile('ecosystem/data/types.json', 'utf-8'),
]);

let monsters, moves, types;
try {
  monsters = JSON.parse(monstersRaw);
} catch {
  error('monsters.json', 'Invalid JSON');
}
try {
  moves = JSON.parse(movesRaw);
} catch {
  error('moves.json', 'Invalid JSON');
}
try {
  types = JSON.parse(typesRaw);
} catch {
  error('types.json', 'Invalid JSON');
}

if (errors.length > 0) {
  errors.forEach((e) => console.error(`ERROR: ${e}`));
  process.exit(1);
}

const validTypes = new Set(types.types);
const moveIds = new Set(moves.map((m) => m.id));

// Validate types.json
for (const type of types.types) {
  if (!types.typeColors[type]) {
    error('types.json', `Missing color for type "${type}"`);
  }
  if (!types.effectiveness[type]) {
    error('types.json', `Missing effectiveness row for type "${type}"`);
  } else {
    for (const target of types.types) {
      const val = types.effectiveness[type][target];
      if (val === undefined) {
        error('types.json', `Missing effectiveness: ${type} vs ${target}`);
      } else if (![0.5, 1.0, 1.5].includes(val)) {
        error(
          'types.json',
          `Invalid effectiveness value ${val} for ${type} vs ${target} (must be 0.5, 1.0, or 1.5)`
        );
      }
    }
  }
}

// Validate moves.json
const moveIdSet = new Set();
for (const move of moves) {
  if (!move.id) error('moves.json', `Move missing "id"`);
  if (!move.name) error('moves.json', `Move "${move.id}" missing "name"`);
  if (typeof move.power !== 'number' || move.power < 1 || move.power > 20) {
    error('moves.json', `Move "${move.id}" power must be 1-20, got ${move.power}`);
  }
  if (!validTypes.has(move.type)) {
    error('moves.json', `Move "${move.id}" has invalid type "${move.type}"`);
  }
  if (moveIdSet.has(move.id)) {
    error('moves.json', `Duplicate move id "${move.id}"`);
  }
  moveIdSet.add(move.id);
}

// Validate monsters.json
const monsterIds = new Set();
const monsterNames = new Set();
for (const mon of monsters) {
  if (typeof mon.id !== 'number')
    error('monsters.json', `Monster "${mon.name}" missing numeric "id"`);
  if (!mon.name) error('monsters.json', `Monster id ${mon.id} missing "name"`);
  if (!validTypes.has(mon.type)) {
    error('monsters.json', `Monster "${mon.name}" has invalid type "${mon.type}"`);
  }

  // Stat ranges
  if (typeof mon.hp !== 'number' || mon.hp < 1 || mon.hp > 100) {
    error('monsters.json', `Monster "${mon.name}" hp must be 1-100, got ${mon.hp}`);
  }
  if (typeof mon.attack !== 'number' || mon.attack < 1 || mon.attack > 20) {
    error('monsters.json', `Monster "${mon.name}" attack must be 1-20, got ${mon.attack}`);
  }
  if (typeof mon.defense !== 'number' || mon.defense < 1 || mon.defense > 20) {
    error('monsters.json', `Monster "${mon.name}" defense must be 1-20, got ${mon.defense}`);
  }
  if (typeof mon.speed !== 'number' || mon.speed < 1 || mon.speed > 20) {
    error('monsters.json', `Monster "${mon.name}" speed must be 1-20, got ${mon.speed}`);
  }

  // Moves exist
  if (!Array.isArray(mon.moves) || mon.moves.length < 1) {
    error('monsters.json', `Monster "${mon.name}" must have at least 1 move`);
  } else {
    for (const moveId of mon.moves) {
      if (!moveIds.has(moveId)) {
        error('monsters.json', `Monster "${mon.name}" references unknown move "${moveId}"`);
      }
    }
  }

  // Unique id and name
  if (monsterIds.has(mon.id)) {
    error('monsters.json', `Duplicate monster id ${mon.id}`);
  }
  if (monsterNames.has(mon.name)) {
    error('monsters.json', `Duplicate monster name "${mon.name}"`);
  }
  monsterIds.add(mon.id);
  monsterNames.add(mon.name);
}

// Report results
if (errors.length > 0) {
  console.error(`\nValidation failed with ${errors.length} error(s):\n`);
  errors.forEach((e) => console.error(`  ERROR: ${e}`));
  console.error('');
  process.exit(1);
} else {
  console.log(
    `Validation passed: ${monsters.length} monsters, ${moves.length} moves, ${types.types.length} types`
  );
}
