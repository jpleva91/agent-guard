// Headless battle engine for simulation
// Now delegates to domain/battle.js — single source of truth for battle logic.

import { calcDamage, simulateBattle } from '../dist/domain/battle.js';

/**
 * Backward-compatible damage calculation for headless simulation.
 * Wraps domain/battle.js calcDamage with seeded RNG adapter.
 */
export function calcDamageHeadless(attacker, move, defender, typeChart, rng) {
  const result = calcDamage(attacker, move, defender, typeChart, { random: () => rng.random() });
  return { damage: result.damage, effectiveness: result.effectiveness };
}

/**
 * Run a battle between two BugMon with strategy-based move selection.
 * Delegates to domain/battle.js simulateBattle with strategies.
 */
export function runBattle(monA, monB, movesData, typeChart, strategyA, strategyB, rng) {
  return simulateBattle(monA, monB, movesData, { effectiveness: typeChart }, 100, {
    strategyA,
    strategyB,
    rng,
  });
}
