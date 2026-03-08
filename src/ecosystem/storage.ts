// BugDex — persistence layer for encountered/defeated bugs
// Stores data in ~/.bugmon/bugdex.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const BUGMON_DIR = join(homedir(), '.bugmon');
const BUGDEX_PATH = join(BUGMON_DIR, 'bugdex.json');

const XP_ENCOUNTER = 10;
const XP_NEW_DISCOVERY = 100;
const XP_RESOLVED = 50;

interface Encounter {
  monsterId: number;
  monsterName: string;
  error: string;
  file: string | null;
  line: number | null;
  timestamp: string;
  resolved: boolean;
}

export interface BugDexStats {
  totalEncounters: number;
  totalResolved: number;
  xp: number;
  level: number;
  [key: string]: unknown;
}

export interface BugDexData {
  encounters: Encounter[];
  stats: BugDexStats;
  seen: Record<number, number>;
  party?: unknown[];
  combo?: unknown;
  storage?: unknown;
  [key: string]: unknown;
}

function ensureDir(): void {
  if (!existsSync(BUGMON_DIR)) {
    mkdirSync(BUGMON_DIR, { recursive: true });
  }
}

function createEmpty(): BugDexData {
  return {
    encounters: [],
    stats: { totalEncounters: 0, totalResolved: 0, xp: 0, level: 1 },
    seen: {},
  };
}

export function loadBugDex(): BugDexData {
  ensureDir();
  if (!existsSync(BUGDEX_PATH)) return createEmpty();
  try {
    return JSON.parse(readFileSync(BUGDEX_PATH, 'utf8')) as BugDexData;
  } catch {
    return createEmpty();
  }
}

export function saveBugDex(data: BugDexData): void {
  ensureDir();
  writeFileSync(BUGDEX_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export function recordEncounter(
  monster: { id: number; name: string },
  errorMessage: string,
  file: string | null,
  line: number | null,
): { xpGained: number; isNew: boolean; data: BugDexData } {
  const data = loadBugDex();
  const isNew = !data.seen[monster.id];

  data.encounters.push({
    monsterId: monster.id,
    monsterName: monster.name,
    error: errorMessage.slice(0, 200),
    file: file || null,
    line: line || null,
    timestamp: new Date().toISOString(),
    resolved: false,
  });

  if (data.encounters.length > 500) {
    data.encounters = data.encounters.slice(-500);
  }

  data.seen[monster.id] = (data.seen[monster.id] || 0) + 1;

  let xpGained = XP_ENCOUNTER;
  if (isNew) xpGained += XP_NEW_DISCOVERY;

  data.stats.totalEncounters++;
  data.stats.xp += xpGained;
  data.stats.level = calculateLevel(data.stats.xp);

  saveBugDex(data);

  return { xpGained, isNew, data };
}

export function resolveEncounter(errorMessage: string): number {
  const data = loadBugDex();
  const prefix = errorMessage.slice(0, 200);

  for (let i = data.encounters.length - 1; i >= 0; i--) {
    if (!data.encounters[i].resolved && data.encounters[i].error === prefix) {
      data.encounters[i].resolved = true;
      data.stats.totalResolved++;
      data.stats.xp += XP_RESOLVED;
      data.stats.level = calculateLevel(data.stats.xp);
      saveBugDex(data);
      return XP_RESOLVED;
    }
  }

  return 0;
}

export function resolveLastUnresolved(): number {
  const data = loadBugDex();

  for (let i = data.encounters.length - 1; i >= 0; i--) {
    if (!data.encounters[i].resolved) {
      data.encounters[i].resolved = true;
      data.stats.totalResolved++;
      data.stats.xp += XP_RESOLVED;
      data.stats.level = calculateLevel(data.stats.xp);
      saveBugDex(data);
      return XP_RESOLVED;
    }
  }

  return 0;
}

export function resolveAllUnresolved(): { count: number; xpGained: number } {
  const data = loadBugDex();
  let count = 0;
  let xpGained = 0;

  for (let i = data.encounters.length - 1; i >= 0; i--) {
    if (!data.encounters[i].resolved) {
      data.encounters[i].resolved = true;
      count++;
      xpGained += XP_RESOLVED;
      data.stats.totalResolved++;
    }
  }

  if (count > 0) {
    data.stats.xp += xpGained;
    data.stats.level = calculateLevel(data.stats.xp);
    saveBugDex(data);
  }

  return { count, xpGained };
}

function calculateLevel(xp: number): number {
  let level = 1;
  while ((((level + 1) * level) / 2) * 100 <= xp) {
    level++;
  }
  return level;
}
