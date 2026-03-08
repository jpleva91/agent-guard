// Pure encounter logic — no DOM, no audio
// Returns encounter data; callers handle audio/UI.
//
// TODO(roadmap): Phase 3 — Idle mode: auto-resolve minor enemies (severity 1-2) in background
// TODO(roadmap): Phase 3 — Active mode: interrupt for bosses and elites (severity 3+)
// TODO(roadmap): Phase 3 — Configurable idle/active threshold
// TODO(roadmap): Phase 3 — Encounter difficulty scaling based on session context
// TODO(roadmap): Phase 5 — Difficulty scaling based on developer level
// TODO(roadmap): Phase 5 — Idle combat effectiveness scaling with level

import type { Bugmon, Rarity, EncounterContext } from '../core/types.js';

const RARITY_WEIGHTS: Record<string, number> = {
  common: 10,
  uncommon: 5,
  rare: 2,
  legendary: 1,
};

export { RARITY_WEIGHTS };

/**
 * Check if an encounter should trigger on this tile.
 */
export function shouldEncounter(tile: number, rand: () => number = Math.random): boolean {
  if (tile !== 2) return false;
  return rand() <= 0.1;
}

/**
 * Pick a weighted random monster from the roster.
 */
export function pickWeightedRandom(
  monsters: readonly Bugmon[],
  rand: () => number = Math.random,
): Bugmon {
  let totalWeight = 0;
  for (const mon of monsters) {
    totalWeight += RARITY_WEIGHTS[mon.rarity as Rarity] || RARITY_WEIGHTS.common;
  }

  let roll = rand() * totalWeight;
  for (const mon of monsters) {
    roll -= RARITY_WEIGHTS[mon.rarity as Rarity] || RARITY_WEIGHTS.common;
    if (roll <= 0) return mon;
  }

  return monsters[monsters.length - 1];
}

/**
 * Scale a monster's stats based on session context.
 */
export function scaleEncounter(monster: Bugmon, context: EncounterContext = {}): Bugmon {
  const playerLevel = context.playerLevel || 1;
  const encounterCount = context.encounterCount || 0;

  // Level scaling: +10% HP per player level above 1
  const levelScale = 1 + (playerLevel - 1) * 0.1;
  // Session scaling: +2% HP per 5 encounters (caps at +20%)
  const sessionScale = 1 + Math.min(Math.floor(encounterCount / 5) * 0.02, 0.2);

  const scale = levelScale * sessionScale;

  return {
    ...monster,
    hp: Math.floor(monster.hp * scale),
    currentHP: Math.floor((monster.currentHP || monster.hp) * scale),
  };
}

/**
 * Generate a wild encounter.
 */
export function checkEncounter(
  tile: number,
  monsters: readonly Bugmon[],
  rand: () => number = Math.random,
  context?: EncounterContext,
): Bugmon | null {
  if (!shouldEncounter(tile, rand)) return null;

  const template = pickWeightedRandom(monsters, rand);
  const instance: Bugmon = { ...template, currentHP: template.hp };
  return context ? scaleEncounter(instance, context) : instance;
}
