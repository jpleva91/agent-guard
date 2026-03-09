// Procedural dungeon floor generation
// Each floor = a sequence of rooms the character auto-runs through.

import { Dungeon } from '../theme.js';

export type RoomKind = 'corridor' | 'enemy' | 'treasure' | 'boss' | 'exit';

export interface EnemyData {
  id: number;
  name: string;
  type: string;
  hp: number;
  attack: number;
  defense: number;
  color: string;
  severity: number; // 1-2 minor (auto), 3+ boss
}

export interface TreasureData {
  gold: number;
  heal?: number;
  boost?: { stat: 'atk' | 'def' | 'speed'; amount: number; label: string };
}

export interface DungeonRoom {
  kind: RoomKind;
  width: number;
  startX: number;
  cleared: boolean;
  enemy?: EnemyData;
  treasure?: TreasureData;
}

export interface DungeonFloor {
  number: number;
  rooms: DungeonRoom[];
  totalWidth: number;
}

interface MonsterLike {
  id: number;
  name: string;
  type: string;
  hp: number;
  attack: number;
  defense: number;
  color?: string;
  rarity?: string;
}

// ── Seeded RNG ───────────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// ── Floor generation ─────────────────────────────────────────────────────

export function generateFloor(
  floorNum: number,
  monsters: MonsterLike[],
  seed?: number
): DungeonFloor {
  const rng = mulberry32(seed ?? floorNum * 7919 + 1337);
  const isBossFloor = floorNum % 3 === 0;

  // Scale with floor depth
  const enemyCount = Math.min(2 + Math.floor(floorNum / 2), 8);
  const treasureCount = 1 + (floorNum % 2 === 0 ? 1 : 0);

  // Build room sequence: corridor-enemy-corridor-treasure-...-boss?-exit
  const layout: RoomKind[] = [];
  layout.push('corridor'); // always start with corridor

  for (let i = 0; i < enemyCount; i++) {
    layout.push('enemy');
    if (i < enemyCount - 1 && rng() > 0.4) layout.push('corridor');
  }
  for (let i = 0; i < treasureCount; i++) {
    layout.push('corridor');
    layout.push('treasure');
  }
  if (isBossFloor) {
    layout.push('corridor');
    layout.push('boss');
  }
  layout.push('exit');

  // Shuffle middle section (keep first corridor and exit in place)
  const middle = layout.slice(1, -1);
  for (let i = middle.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [middle[i], middle[j]] = [middle[j], middle[i]];
  }
  const shuffled = ['corridor' as RoomKind, ...middle, 'exit' as RoomKind];

  // Create rooms with positions
  const rooms: DungeonRoom[] = [];
  let x = 0;

  // Separate monsters by rarity for difficulty
  const commons = monsters.filter((m) => m.rarity === 'common');
  const uncommons = monsters.filter((m) => m.rarity === 'uncommon' || m.rarity === 'rare');
  const legendaries = monsters.filter(
    (m) => m.rarity === 'legendary' || m.rarity === 'rare'
  );

  for (const kind of shuffled) {
    let width: number;
    let enemy: EnemyData | undefined;
    let treasure: TreasureData | undefined;

    switch (kind) {
      case 'corridor':
        width = randInt(Dungeon.corridorMinW, Dungeon.corridorMaxW, rng);
        break;
      case 'enemy': {
        width = Dungeon.enemyRoomW;
        const pool = rng() < 0.7 ? commons : uncommons;
        const mon = pick(pool.length > 0 ? pool : commons.length > 0 ? commons : monsters, rng);
        const hpScale = 1 + (floorNum - 1) * 0.15;
        enemy = {
          id: mon.id,
          name: mon.name,
          type: mon.type,
          hp: Math.ceil(mon.hp * hpScale),
          attack: Math.ceil(mon.attack * (1 + (floorNum - 1) * 0.1)),
          defense: mon.defense,
          color: mon.color || '#888',
          severity: mon.rarity === 'common' ? 1 : 2,
        };
        break;
      }
      case 'treasure': {
        width = Dungeon.treasureRoomW;
        const baseGold = 10 + floorNum * 5;
        treasure = { gold: randInt(baseGold, baseGold + 15, rng) };
        if (rng() < 0.4) treasure.heal = randInt(5, 15, rng);
        if (rng() < 0.2) {
          const stats = ['atk', 'def', 'speed'] as const;
          const stat = pick([...stats], rng);
          treasure.boost = { stat, amount: randInt(1, 3, rng), label: `+${stat.toUpperCase()}` };
        }
        break;
      }
      case 'boss': {
        width = Dungeon.bossRoomW;
        const pool = legendaries.length > 0 ? legendaries : uncommons.length > 0 ? uncommons : monsters;
        const mon = pick(pool, rng);
        const hpScale = 2 + floorNum * 0.3;
        enemy = {
          id: mon.id,
          name: mon.name,
          type: mon.type,
          hp: Math.ceil(mon.hp * hpScale),
          attack: Math.ceil(mon.attack * (1.5 + floorNum * 0.15)),
          defense: Math.ceil(mon.defense * 1.5),
          color: mon.color || '#F43F5E',
          severity: 3,
        };
        break;
      }
      case 'exit':
        width = Dungeon.exitRoomW;
        break;
      default:
        width = 200;
    }

    rooms.push({ kind, width, startX: x, cleared: false, enemy, treasure });
    x += width;
  }

  return { number: floorNum, rooms, totalWidth: x };
}
