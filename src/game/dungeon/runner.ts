// Auto-dungeon runner — the character runs automatically through procedural floors.
// Minor enemies auto-resolve inline. Bosses pause for player input.
// Treasure auto-collects. The game plays itself while you code.

import { Dungeon, Timing } from '../theme.js';
import { generateFloor } from './dungeon.js';
import type { DungeonFloor, DungeonRoom, EnemyData } from './dungeon.js';
import {
  addGold,
  addBoost,
  getBoosts,
  recordFloor,
  recordRunEnd,
  recordDefeat,
  resetRunBoosts,
  spendGold,
} from './loot.js';
import { playAttack, playFaint, playMenuNav, playMenuConfirm, playBattleVictory } from '../audio/sound.js';

// ── Runner state ─────────────────────────────────────────────────────────

export type RunnerPhase =
  | 'running'
  | 'encounter' // quick auto-battle animation
  | 'collecting' // treasure pickup animation
  | 'boss' // manual boss fight (simple)
  | 'floor_clear' // transitioning to next floor
  | 'run_over'; // player died, show stats

export interface FloatingText {
  text: string;
  x: number;
  y: number;
  color: string;
  elapsed: number;
}

export interface RunnerState {
  phase: RunnerPhase;
  floor: DungeonFloor;
  distance: number; // world X position of character
  playerHP: number;
  playerMaxHP: number;
  playerATK: number;
  playerDEF: number;
  floorNum: number;
  gold: number; // gold earned this run
  defeated: number;
  treasures: number;

  // Current room tracking
  currentRoomIdx: number;

  // Animation state
  encounterTimer: number;
  encounterEnemy: EnemyData | null;
  encounterEnemyHP: number;
  collectTimer: number;
  floorTimer: number;

  // Boss fight state
  bossMenuIdx: number;
  bossMessage: string;
  bossMessageTimer: number;

  // Visual effects
  floatingTexts: FloatingText[];
  eventLog: Array<{ text: string; elapsed: number }>;
}

interface MonsterLike {
  id: number;
  name: string;
  type: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  color?: string;
  rarity?: string;
}

let monsters: MonsterLike[] = [];

export function setRunnerMonsters(data: MonsterLike[]): void {
  monsters = data;
}

// ── Create a new run ─────────────────────────────────────────────────────

export function createRun(leadMon: MonsterLike): RunnerState {
  resetRunBoosts();
  const floor = generateFloor(1, monsters);
  return {
    phase: 'running',
    floor,
    distance: 0,
    playerHP: leadMon.hp,
    playerMaxHP: leadMon.hp,
    playerATK: leadMon.attack,
    playerDEF: leadMon.defense,
    floorNum: 1,
    gold: 0,
    defeated: 0,
    treasures: 0,
    currentRoomIdx: 0,
    encounterTimer: 0,
    encounterEnemy: null,
    encounterEnemyHP: 0,
    collectTimer: 0,
    floorTimer: 0,
    bossMenuIdx: 0,
    bossMessage: '',
    bossMessageTimer: 0,
    floatingTexts: [],
    eventLog: [],
  };
}

// ── Update (called every frame) ──────────────────────────────────────────

export function updateRunner(
  state: RunnerState,
  dt: number,
  inputUp: boolean,
  inputDown: boolean,
  inputConfirm: boolean
): RunnerState {
  // Update floating texts
  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    state.floatingTexts[i].elapsed += dt;
    if (state.floatingTexts[i].elapsed > Timing.lootFloat) {
      state.floatingTexts.splice(i, 1);
    }
  }

  // Update event log
  for (let i = state.eventLog.length - 1; i >= 0; i--) {
    state.eventLog[i].elapsed += dt;
    if (state.eventLog[i].elapsed > 4000) {
      state.eventLog.splice(i, 1);
    }
  }

  switch (state.phase) {
    case 'running':
      return updateRunning(state, dt);
    case 'encounter':
      return updateEncounter(state, dt);
    case 'collecting':
      return updateCollecting(state, dt);
    case 'boss':
      return updateBoss(state, dt, inputUp, inputDown, inputConfirm);
    case 'floor_clear':
      return updateFloorClear(state, dt);
    case 'run_over':
      if (inputConfirm) {
        recordRunEnd();
        return { ...state, phase: 'run_over' }; // signal to game.ts to return to title
      }
      return state;
    default:
      return state;
  }
}

// ── Running ──────────────────────────────────────────────────────────────

function updateRunning(s: RunnerState, dt: number): RunnerState {
  const speed = Dungeon.runSpeed + getBoosts().speed * 10;
  s.distance += (speed * dt) / 1000;

  // Check what room we're in
  const room = findCurrentRoom(s);
  if (!room) return s;

  if (room !== s.floor.rooms[s.currentRoomIdx]) {
    s.currentRoomIdx = s.floor.rooms.indexOf(room);
  }

  // Handle room entry
  if (!room.cleared) {
    const roomCenter = room.startX + room.width / 2;
    if (s.distance >= roomCenter - 30) {
      if (room.kind === 'enemy' && room.enemy) {
        room.cleared = true;
        s.phase = 'encounter';
        s.encounterTimer = 0;
        s.encounterEnemy = room.enemy;
        s.encounterEnemyHP = room.enemy.hp;
        return s;
      }
      if (room.kind === 'treasure' && room.treasure) {
        room.cleared = true;
        s.phase = 'collecting';
        s.collectTimer = 0;
        // Apply treasure
        const t = room.treasure;
        s.gold += t.gold;
        addGold(t.gold);
        if (t.heal) s.playerHP = Math.min(s.playerMaxHP, s.playerHP + t.heal);
        if (t.boost) addBoost(t.boost.stat, t.boost.amount);
        s.treasures++;
        // Visual feedback
        spawnFloat(s, s.distance, Dungeon.floorY - 60, `+${t.gold}g`, '#FCD34D');
        if (t.heal) spawnFloat(s, s.distance + 20, Dungeon.floorY - 80, `+${t.heal} HP`, '#22C55E');
        if (t.boost) spawnFloat(s, s.distance + 40, Dungeon.floorY - 70, t.boost.label, '#8B5CF6');
        logEvent(s, `Chest: +${t.gold}g${t.heal ? ` +${t.heal}HP` : ''}${t.boost ? ` ${t.boost.label}` : ''}`);
        return s;
      }
      if (room.kind === 'boss' && room.enemy) {
        room.cleared = true;
        s.phase = 'boss';
        s.encounterEnemy = room.enemy;
        s.encounterEnemyHP = room.enemy.hp;
        s.bossMenuIdx = 0;
        s.bossMessage = `${room.enemy.name} blocks the path!`;
        s.bossMessageTimer = 0;
        return s;
      }
      if (room.kind === 'exit') {
        room.cleared = true;
        s.phase = 'floor_clear';
        s.floorTimer = 0;
        recordFloor(s.floorNum);
        logEvent(s, `Floor ${s.floorNum} cleared!`);
        playBattleVictory();
        return s;
      }
      room.cleared = true;
    }
  }

  return s;
}

// ── Auto-encounter (minor enemies) ───────────────────────────────────────

function updateEncounter(s: RunnerState, dt: number): RunnerState {
  s.encounterTimer += dt;

  if (s.encounterTimer < 200) return s; // wind-up

  if (s.encounterTimer < 300 && s.encounterEnemy) {
    // Player attacks
    const atk = s.playerATK + getBoosts().atk;
    const def = s.encounterEnemy.defense;
    const dmg = Math.max(1, atk - Math.floor(def / 2) + 2);
    s.encounterEnemyHP -= dmg;
    spawnFloat(s, s.distance + 80, Dungeon.floorY - 50, `-${dmg}`, '#F8FAFC');
    playAttack();
  }

  if (s.encounterTimer < 500) return s; // enemy attacks back

  if (s.encounterTimer < 600 && s.encounterEnemy) {
    // Enemy counter-attack (minor damage)
    const enemyDmg = Math.max(1, Math.ceil(s.encounterEnemy.attack * 0.3) - Math.floor((s.playerDEF + getBoosts().def) / 3));
    s.playerHP -= Math.max(1, enemyDmg);
    spawnFloat(s, s.distance, Dungeon.floorY - 40, `-${Math.max(1, enemyDmg)}`, '#EF4444');
  }

  if (s.encounterTimer >= Timing.encounter) {
    // Resolve
    if (s.encounterEnemy) {
      const goldDrop = 5 + Math.floor(s.encounterEnemy.hp * 0.3);
      s.gold += goldDrop;
      addGold(goldDrop);
      s.defeated++;
      recordDefeat();
      spawnFloat(s, s.distance + 50, Dungeon.floorY - 70, `+${goldDrop}g`, '#FCD34D');
      logEvent(s, `${s.encounterEnemy.name} defeated +${goldDrop}g`);
      playFaint();
    }
    s.encounterEnemy = null;

    // Check death
    if (s.playerHP <= 0) {
      s.phase = 'run_over';
      recordRunEnd();
      return s;
    }

    s.phase = 'running';
  }

  return s;
}

// ── Treasure collection ──────────────────────────────────────────────────

function updateCollecting(s: RunnerState, dt: number): RunnerState {
  s.collectTimer += dt;
  if (s.collectTimer >= 400) {
    s.phase = 'running';
  }
  return s;
}

// ── Boss fight (simple: FIGHT / POWER ATK / FLEE) ────────────────────────

function updateBoss(
  s: RunnerState,
  dt: number,
  inputUp: boolean,
  inputDown: boolean,
  inputConfirm: boolean
): RunnerState {
  // Message display
  if (s.bossMessageTimer > 0) {
    s.bossMessageTimer -= dt;
    if (s.bossMessageTimer <= 0) s.bossMessage = '';
    return s;
  }

  // Menu navigation
  if (inputUp) {
    s.bossMenuIdx = Math.max(0, s.bossMenuIdx - 1);
    playMenuNav();
  }
  if (inputDown) {
    s.bossMenuIdx = Math.min(2, s.bossMenuIdx + 1);
    playMenuNav();
  }

  if (inputConfirm && s.encounterEnemy) {
    playMenuConfirm();
    const boss = s.encounterEnemy;

    if (s.bossMenuIdx === 0) {
      // FIGHT — deal normal damage, take normal damage
      const atk = s.playerATK + getBoosts().atk;
      const dmg = Math.max(1, atk - Math.floor(boss.defense / 2) + 3);
      s.encounterEnemyHP -= dmg;
      const bossDmg = Math.max(1, boss.attack - Math.floor((s.playerDEF + getBoosts().def) / 2) + 2);
      s.playerHP -= bossDmg;
      playAttack();
      spawnFloat(s, s.distance + 100, Dungeon.floorY - 60, `-${dmg}`, '#F8FAFC');
      spawnFloat(s, s.distance, Dungeon.floorY - 40, `-${bossDmg}`, '#EF4444');
      s.bossMessage = `You deal ${dmg}! ${boss.name} hits for ${bossDmg}!`;
      s.bossMessageTimer = Timing.messageDuration;
    } else if (s.bossMenuIdx === 1) {
      // POWER ATTACK — costs 15g, 2x damage, half damage taken
      if (!spendGold(15)) {
        s.bossMessage = 'Not enough gold! (need 15g)';
        s.bossMessageTimer = 1200;
        return s;
      }
      const atk = (s.playerATK + getBoosts().atk) * 2;
      const dmg = Math.max(1, atk - Math.floor(boss.defense / 2) + 5);
      s.encounterEnemyHP -= dmg;
      const bossDmg = Math.max(1, Math.ceil((boss.attack - Math.floor((s.playerDEF + getBoosts().def) / 2)) * 0.5));
      s.playerHP -= Math.max(0, bossDmg);
      playAttack();
      spawnFloat(s, s.distance + 100, Dungeon.floorY - 60, `-${dmg}!`, '#F59E0B');
      s.bossMessage = `POWER! ${dmg} damage! Take ${Math.max(0, bossDmg)} back. (-15g)`;
      s.bossMessageTimer = Timing.messageDuration;
    } else {
      // FLEE — skip boss, no rewards
      s.encounterEnemy = null;
      s.phase = 'running';
      logEvent(s, 'Fled from boss!');
      return s;
    }

    // Check boss defeated
    if (s.encounterEnemyHP <= 0) {
      const bossGold = 30 + s.floorNum * 15;
      s.gold += bossGold;
      addGold(bossGold);
      s.defeated++;
      recordDefeat();
      spawnFloat(s, s.distance + 80, Dungeon.floorY - 80, `+${bossGold}g`, '#FCD34D');
      logEvent(s, `BOSS ${boss.name} defeated! +${bossGold}g`);
      playBattleVictory();
      s.encounterEnemy = null;
      // Heal a bit after boss
      s.playerHP = Math.min(s.playerMaxHP, s.playerHP + 10);
      s.phase = 'running';
      return s;
    }

    // Check player death
    if (s.playerHP <= 0) {
      s.phase = 'run_over';
      recordRunEnd();
      return s;
    }
  }

  return s;
}

// ── Floor transition ─────────────────────────────────────────────────────

function updateFloorClear(s: RunnerState, dt: number): RunnerState {
  s.floorTimer += dt;
  if (s.floorTimer >= Timing.floorTransition) {
    s.floorNum++;
    s.floor = generateFloor(s.floorNum, monsters);
    s.distance = 0;
    s.currentRoomIdx = 0;
    // Small heal between floors
    s.playerHP = Math.min(s.playerMaxHP, s.playerHP + 5);
    s.phase = 'running';
  }
  return s;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function findCurrentRoom(s: RunnerState): DungeonRoom | null {
  for (const room of s.floor.rooms) {
    if (s.distance >= room.startX && s.distance < room.startX + room.width) {
      return room;
    }
  }
  return s.floor.rooms[s.floor.rooms.length - 1] ?? null;
}

function spawnFloat(s: RunnerState, worldX: number, worldY: number, text: string, color: string): void {
  s.floatingTexts.push({ text, x: worldX, y: worldY, color, elapsed: 0 });
}

function logEvent(s: RunnerState, text: string): void {
  s.eventLog.unshift({ text, elapsed: 0 });
  if (s.eventLog.length > 5) s.eventLog.pop();
}

export function isRunOver(s: RunnerState): boolean {
  return s.phase === 'run_over';
}
