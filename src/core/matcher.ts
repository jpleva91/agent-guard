// Monster matcher — maps parsed errors to BugMon creatures
// Uses ERROR_TO_MONSTER_TYPE from bug-event.ts as the single source of truth.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ERROR_TO_MONSTER_TYPE } from './bug-event.js';
import type { MonsterData } from './bug-event.js';
import type { ParsedError } from './error-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let monsters: MonsterData[] | null = null;

function loadMonsters(): MonsterData[] {
  if (monsters) return monsters;
  const dataPath = join(__dirname, '..', '..', 'ecosystem', 'data', 'monsters.json');
  monsters = JSON.parse(readFileSync(dataPath, 'utf8')) as MonsterData[];
  return monsters;
}

export function matchMonster(error: ParsedError): { monster: MonsterData; confidence: number } {
  const allMonsters = loadMonsters();
  const fullText = [error.message, ...error.rawLines].join(' ').toLowerCase();

  let bestMatch: MonsterData | null = null;
  let bestScore = 0;

  for (const monster of allMonsters) {
    if (!monster.errorPatterns) continue;

    let score = 0;
    for (const pattern of monster.errorPatterns) {
      if (fullText.includes(pattern.toLowerCase())) {
        score += pattern.length;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = monster;
    }
  }

  if (!bestMatch) {
    bestMatch = matchByErrorType(error.type, allMonsters);
    bestScore = 5;
  }

  if (!bestMatch) {
    bestMatch = allMonsters.find((m) => m.name === 'FlakyTest') || allMonsters[0];
    bestScore = 1;
  }

  return {
    monster: bestMatch,
    confidence: Math.min(1, bestScore / 30),
  };
}

function matchByErrorType(errorType: string, allMonsters: MonsterData[]): MonsterData | null {
  const monsterType = ERROR_TO_MONSTER_TYPE[errorType];
  if (!monsterType) return null;

  const candidates = allMonsters.filter((m) => m.type === monsterType);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function getAllMonsters(): MonsterData[] {
  return loadMonsters();
}
