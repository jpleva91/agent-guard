// Loot & reward system — gold persists across runs, boosts are per-run

const STORAGE_KEY = 'bugmon_loot';

export interface RunBoosts {
  atk: number;
  def: number;
  speed: number;
}

export interface LootState {
  gold: number;
  totalGold: number; // lifetime earned
  highFloor: number;
  totalRuns: number;
  totalDefeated: number;
}

let state: LootState = { gold: 0, totalGold: 0, highFloor: 0, totalRuns: 0, totalDefeated: 0 };
let boosts: RunBoosts = { atk: 0, def: 0, speed: 0 };

export function loadLoot(): LootState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return state;
}

function saveLoot(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function getLoot(): LootState {
  return state;
}

export function getBoosts(): RunBoosts {
  return boosts;
}

export function addGold(amount: number): void {
  state.gold += amount;
  state.totalGold += amount;
  saveLoot();
}

export function spendGold(amount: number): boolean {
  if (state.gold < amount) return false;
  state.gold -= amount;
  saveLoot();
  return true;
}

export function addBoost(stat: 'atk' | 'def' | 'speed', amount: number): void {
  boosts[stat] += amount;
}

export function recordFloor(floor: number): void {
  if (floor > state.highFloor) state.highFloor = floor;
  saveLoot();
}

export function recordRunEnd(): void {
  state.totalRuns++;
  saveLoot();
}

export function recordDefeat(): void {
  state.totalDefeated++;
}

export function resetRunBoosts(): void {
  boosts = { atk: 0, def: 0, speed: 0 };
}
