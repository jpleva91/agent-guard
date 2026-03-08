/**
 * Monster entity factory.
 *
 * Creates monster instances from bug events. Maps bug severity
 * and source to monster stats and type.
 */

import type { BugEvent, Monster, MonsterType, Severity } from '../../core/types.js';

/** Stat templates indexed by severity */
const SEVERITY_TEMPLATES: Record<Severity, { hp: number; attack: number; defense: number; speed: number }> = {
  1: { hp: 20, attack: 5, defense: 3, speed: 4 },
  2: { hp: 30, attack: 8, defense: 5, speed: 5 },
  3: { hp: 45, attack: 12, defense: 8, speed: 7 },
  4: { hp: 60, attack: 16, defense: 11, speed: 9 },
  5: { hp: 80, attack: 20, defense: 14, speed: 11 },
};

/** Maps bug source to monster element type */
const SOURCE_TYPE_MAP: Record<string, MonsterType> = {
  console: 'backend',
  test: 'testing',
  build: 'devops',
};

/** Name map for common error types */
const TYPE_NAMES: Record<string, string> = {
  TypeError: 'NullPointer',
  ReferenceError: 'GhostRef',
  SyntaxError: 'ParseWraith',
  RangeError: 'BoundBreaker',
  TestFailure: 'FlakyTest',
  TestTimeout: 'InfiniteLoop',
  TypeScriptError: 'TypePhantom',
  BuildError: 'BuildBreaker',
  ModuleNotFound: 'LostImport',
  NullAccess: 'NullPointer',
  StackOverflow: 'StackCrusher',
  UnhandledRejection: 'BrokenPromise',
};

let idCounter = 0;

/** Create a monster from a bug event. */
export function createMonsterFromBug(bug: BugEvent): Monster {
  const stats = SEVERITY_TEMPLATES[bug.severity];
  const monsterType = SOURCE_TYPE_MAP[bug.source] ?? 'backend';
  const name = TYPE_NAMES[bug.type] ?? `Bug#${bug.type}`;

  return {
    id: ++idCounter,
    name,
    type: monsterType,
    hp: stats.hp,
    maxHp: stats.hp,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    moves: ['tackle', 'glitch'],
  };
}
