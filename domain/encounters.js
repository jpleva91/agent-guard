// Pure encounter logic — no DOM, no audio
// Returns encounter data; callers handle audio/UI.
//
// TODO(roadmap/phase-3): Add idle/active encounter mode (severity 1-2 auto-resolve, 3+ require input)
// TODO(roadmap/phase-3): Add encounter difficulty scaling based on session context
// TODO(roadmap/phase-3): Add session escalation (unresolved errors compound difficulty)
// TODO(roadmap/ts-migration): Migrate to TypeScript (src/domain/)

const RARITY_WEIGHTS = {
  common: 10,
  uncommon: 5,
  rare: 2,
  legendary: 1
};

export { RARITY_WEIGHTS };

/**
 * Check if an encounter should trigger on this tile.
 * @param {number} tile - Tile type (2 = tall grass)
 * @param {() => number} [rand] - RNG function (defaults to Math.random)
 * @returns {boolean}
 */
export function shouldEncounter(tile, rand = Math.random) {
  if (tile !== 2) return false;
  return rand() <= 0.10;
}

/**
 * Pick a weighted random monster from the roster.
 * @param {object[]} monsters - Array of monster definitions
 * @param {() => number} [rand] - RNG function (defaults to Math.random)
 * @returns {object} Monster template
 */
export function pickWeightedRandom(monsters, rand = Math.random) {
  let totalWeight = 0;
  for (const mon of monsters) {
    totalWeight += RARITY_WEIGHTS[mon.rarity] || RARITY_WEIGHTS.common;
  }

  let roll = rand() * totalWeight;
  for (const mon of monsters) {
    roll -= RARITY_WEIGHTS[mon.rarity] || RARITY_WEIGHTS.common;
    if (roll <= 0) return mon;
  }

  return monsters[monsters.length - 1];
}

/**
 * Generate a wild encounter.
 * @param {number} tile - Current tile type
 * @param {object[]} monsters - Available monster roster
 * @param {() => number} [rand] - RNG function
 * @returns {object|null} Wild monster instance or null
 */
export function checkEncounter(tile, monsters, rand = Math.random) {
  if (!shouldEncounter(tile, rand)) return null;

  const template = pickWeightedRandom(monsters, rand);
  return { ...template, currentHP: template.hp };
}
