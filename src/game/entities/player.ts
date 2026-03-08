/**
 * Player entity factory.
 *
 * Creates and manages the player character with default stats.
 * Level-up logic grants stat increases per level.
 */

import type { Player } from '../../core/types.js';

const BASE_STATS = {
  hp: 50,
  attack: 10,
  defense: 8,
  speed: 7,
} as const;

/** Create a new player with default stats. */
export function createPlayer(): Player {
  return {
    hp: BASE_STATS.hp,
    maxHp: BASE_STATS.hp,
    attack: BASE_STATS.attack,
    defense: BASE_STATS.defense,
    speed: BASE_STATS.speed,
    level: 1,
    xp: 0,
  };
}

/** XP required to reach the next level. */
export function xpForLevel(level: number): number {
  return level * 25;
}

/** Apply XP gain and level up if threshold is met. Returns updated player (new object). */
export function applyXp(player: Player, xp: number): Player {
  const newXp = player.xp + xp;
  const threshold = xpForLevel(player.level);

  if (newXp >= threshold) {
    return {
      ...player,
      hp: player.maxHp + 5,
      maxHp: player.maxHp + 5,
      attack: player.attack + 2,
      defense: player.defense + 1,
      speed: player.speed + 1,
      level: player.level + 1,
      xp: newXp - threshold,
    };
  }

  return { ...player, xp: newXp };
}
