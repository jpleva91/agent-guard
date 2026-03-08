// Interactive battle/cache system for the CLI

import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadBugDex, saveBugDex } from '../../ecosystem/storage.js';
import { RESET, DIM, color as c, bold as b } from '../colors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface MoveData {
  id: string;
  name: string;
  power: number;
  type: string;
}

interface TypeData {
  effectiveness: Record<string, Record<string, number>>;
}

let movesData: MoveData[] | null = null;
let typeData: TypeData | null = null;

function loadGameData(): void {
  if (movesData) return;
  const dataDir = join(__dirname, '..', '..', '..', 'ecosystem', 'data');
  movesData = JSON.parse(readFileSync(join(dataDir, 'moves.json'), 'utf8')) as MoveData[];
  typeData = JSON.parse(readFileSync(join(dataDir, 'types.json'), 'utf8')) as TypeData;
}

interface MonsterLike {
  id: number;
  name: string;
  type: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  moves: string[];
  color?: string;
  sprite?: string;
  rarity?: string;
  currentHP?: number;
}

interface ErrorInfo {
  message: string;
  file?: string;
  line?: number;
}

interface CacheResult {
  cached: boolean;
  fled: boolean;
  playerFainted: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function interactiveCache(
  wildMonster: MonsterLike,
  errorInfo: ErrorInfo,
): Promise<CacheResult> {
  loadGameData();

  const party = getParty();
  const playerMon = { ...party[0], currentHP: party[0].currentHP ?? party[0].hp };
  const enemy = { ...wildMonster, currentHP: wildMonster.hp };

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const ask = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  const hpBar = (current: number, max: number): string => {
    const ratio = max > 0 ? current / max : 0;
    const width = 12;
    const filled = Math.round(ratio * width);
    const bar = '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, width - filled));
    const barColor = ratio > 0.5 ? 'green' : ratio > 0.25 ? 'yellow' : 'red';
    return c(bar, barColor) + ` ${current}/${max}`;
  };

  const playerMoves = playerMon.moves
    .map((id) => movesData!.find((m) => m.id === id))
    .filter(Boolean) as MoveData[];
  const enemyMoves = enemy.moves
    .map((id) => movesData!.find((m) => m.id === id))
    .filter(Boolean) as MoveData[];

  const effectiveness = typeData!.effectiveness;
  const result: CacheResult = { cached: false, fled: false, playerFainted: false };

  process.stderr.write('\n');
  process.stderr.write(c('  ╔══════════════════════════════════════════════╗\n', 'yellow'));
  process.stderr.write(
    c('  ║', 'yellow') +
      b(`  BATTLE! ${playerMon.name} vs Wild ${enemy.name}`) +
      '\n',
  );
  process.stderr.write(c('  ╚══════════════════════════════════════════════╝\n', 'yellow'));

  if (errorInfo?.message) {
    process.stderr.write(`  ${DIM}Bug: ${errorInfo.message.slice(0, 60)}${RESET}\n`);
    if (errorInfo.file) {
      process.stderr.write(
        `  ${c('>>', 'cyan')} ${c(errorInfo.file + (errorInfo.line ? ':' + errorInfo.line : ''), 'cyan')}\n`,
      );
    }
  }

  while (true) {
    process.stderr.write('\n');
    process.stderr.write(
      `  ${b(enemy.name)} ${c(`[${enemy.type}]`, 'gray')}  ${hpBar(enemy.currentHP, enemy.hp)}\n`,
    );
    process.stderr.write(
      `  ${b(playerMon.name)} ${c(`[${playerMon.type}]`, 'gray')}  ${hpBar(playerMon.currentHP, playerMon.hp)}\n`,
    );
    process.stderr.write('\n');

    process.stderr.write(`  ${b('What will you do?')}\n`);
    process.stderr.write(
      `  ${c('[1]', 'yellow')} Fight   ${c('[2]', 'yellow')} Cache   ${c('[3]', 'yellow')} Run\n`,
    );
    process.stderr.write('\n');

    const action = await ask('  > ');
    const choice = action.trim();

    if (choice === '3' || choice.toLowerCase() === 'run') {
      process.stderr.write(`\n  ${DIM}Got away safely!${RESET}\n\n`);
      result.fled = true;
      break;
    }

    if (choice === '2' || choice.toLowerCase() === 'cache') {
      const hpRatio = enemy.currentHP / enemy.hp;
      const cacheRate = (1 - hpRatio) * 0.5 + 0.1;
      const roll = Math.random();

      if (roll < cacheRate) {
        const shakes = 3;
        for (let i = 0; i < shakes; i++) {
          process.stderr.write(`  ${c('...', 'yellow')}`);
          await sleep(400);
        }
        process.stderr.write('\n');
        process.stderr.write(
          `\n  ${c('★', 'yellow')} ${b(`Cached! ${enemy.name} stored successfully!`)} ${c('★', 'yellow')}\n`,
        );
        addToParty(enemy);
        result.cached = true;
        break;
      } else {
        const shakes = Math.floor(Math.random() * 3);
        for (let i = 0; i < shakes; i++) {
          process.stderr.write(`  ${c('...', 'yellow')}`);
          await sleep(300);
        }
        process.stderr.write('\n');
        process.stderr.write(`  ${c('Cache miss! It evicted itself!', 'red')}\n`);
      }
    } else if (choice === '1' || choice.toLowerCase() === 'fight') {
      process.stderr.write('\n');
      playerMoves.forEach((move, i) => {
        const eff = effectiveness?.[move.type]?.[enemy.type] ?? 1;
        let effLabel = '';
        if (eff > 1) effLabel = c(' (super effective)', 'green');
        else if (eff < 1) effLabel = c(' (not effective)', 'red');
        process.stderr.write(
          `  ${c(`[${i + 1}]`, 'yellow')} ${move.name} ${c(`[${move.type}]`, 'gray')} PWR:${move.power}${effLabel}\n`,
        );
      });
      process.stderr.write(`  ${c('[0]', 'yellow')} Back\n`);
      process.stderr.write('\n');

      const moveChoice = await ask('  > ');
      const moveIdx = parseInt(moveChoice.trim(), 10) - 1;

      if (moveIdx < 0 || moveIdx >= playerMoves.length) continue;

      const playerMove = playerMoves[moveIdx];
      const enemyMove = enemyMoves[Math.floor(Math.random() * enemyMoves.length)];

      const playerFirst = playerMon.speed >= enemy.speed;
      const turnOrder = playerFirst
        ? [
            { side: 'player' as const, move: playerMove },
            { side: 'enemy' as const, move: enemyMove },
          ]
        : [
            { side: 'enemy' as const, move: enemyMove },
            { side: 'player' as const, move: playerMove },
          ];

      process.stderr.write('\n');

      for (const turn of turnOrder) {
        const atk = turn.side === 'player' ? playerMon : enemy;
        const def = turn.side === 'player' ? enemy : playerMon;

        if (atk.currentHP <= 0) continue;

        const { damage, effText } = calcDamage(atk, turn.move, def, effectiveness);

        if (turn.side === 'player') {
          enemy.currentHP = Math.max(0, enemy.currentHP - damage);
          process.stderr.write(`  ${b(playerMon.name)} used ${c(turn.move.name, 'white')}! `);
          process.stderr.write(`${c(`-${damage}`, 'red')}${effText}\n`);
        } else {
          playerMon.currentHP = Math.max(0, playerMon.currentHP - damage);
          process.stderr.write(`  ${b(enemy.name)} used ${c(turn.move.name, 'white')}! `);
          process.stderr.write(`${c(`-${damage}`, 'red')}${effText}\n`);
        }

        await sleep(300);

        if (enemy.currentHP <= 0) {
          process.stderr.write(`\n  ${c(enemy.name + ' fainted!', 'yellow')}\n`);
          process.stderr.write(`  ${b('You won the battle!')}\n\n`);
          break;
        }
        if (playerMon.currentHP <= 0) {
          process.stderr.write(`\n  ${c(playerMon.name + ' fainted!', 'red')}\n`);
          process.stderr.write(`  ${DIM}The wild ${enemy.name} got away...${RESET}\n\n`);
          result.playerFainted = true;
          break;
        }
      }

      if (enemy.currentHP <= 0 || playerMon.currentHP <= 0) break;
    } else {
      process.stderr.write(`  ${DIM}Pick 1, 2, or 3.${RESET}\n`);
    }
  }

  savePartyHP(playerMon);
  rl.close();
  return result;
}

export { interactiveCache as interactiveCatch };

interface Combatant {
  attack: number;
  defense: number;
  type: string;
  currentHP: number;
}

function calcDamage(
  attacker: Combatant,
  move: MoveData,
  defender: Combatant,
  typeChart: Record<string, Record<string, number>>,
): { damage: number; effText: string } {
  const power = move.power || 5;
  const attack = attacker.attack || 5;
  const defense = defender.defense || 3;
  const randomBonus = Math.floor(Math.random() * 3) + 1;
  const mult = typeChart?.[move.type]?.[defender.type] ?? 1;
  const crit = Math.random() < 1 / 16 ? 1.5 : 1;

  const damage = Math.max(
    1,
    Math.floor((power + attack - Math.floor(defense / 2) + randomBonus) * mult * crit),
  );

  let effText = '';
  if (mult > 1) effText = ' \x1b[32m(super effective!)\x1b[0m';
  else if (mult < 1) effText = ' \x1b[31m(not very effective)\x1b[0m';
  if (crit > 1) effText += ' \x1b[33m(CRITICAL!)\x1b[0m';

  return { damage, effText };
}

function getParty(): MonsterLike[] {
  const dex = loadBugDex() as Record<string, unknown>;
  const party = dex.party as MonsterLike[] | undefined;
  if (party && party.length > 0) return party;

  const dataDir = join(__dirname, '..', '..', '..', 'ecosystem', 'data');
  const monsters = JSON.parse(
    readFileSync(join(dataDir, 'monsters.json'), 'utf8'),
  ) as MonsterLike[];

  const starters = monsters.filter((m) => m.rarity === 'common');
  const starter = starters[Math.floor(Math.random() * starters.length)];
  const newParty = [{ ...starter, currentHP: starter.hp }];

  dex.party = newParty;
  saveBugDex(dex as Parameters<typeof saveBugDex>[0]);
  return newParty;
}

function addToParty(monster: MonsterLike): void {
  const dex = loadBugDex() as Record<string, unknown>;
  if (!dex.party) dex.party = [];
  const party = dex.party as MonsterLike[];

  const entry = {
    id: monster.id,
    name: monster.name,
    type: monster.type,
    hp: monster.hp,
    currentHP: monster.hp,
    attack: monster.attack,
    defense: monster.defense,
    speed: monster.speed,
    moves: monster.moves,
    color: monster.color,
    sprite: monster.sprite,
    rarity: monster.rarity,
  };

  if (party.length < 6) {
    party.push(entry);
  } else {
    process.stderr.write(`  \x1b[2mParty full! ${monster.name} was sent to storage.\x1b[0m\n`);
    if (!dex.storage) dex.storage = [];
    (dex.storage as MonsterLike[]).push(entry);
  }

  const stats = dex.stats as Record<string, number>;
  if (!stats.totalCached) stats.totalCached = 0;
  stats.totalCached++;

  saveBugDex(dex as Parameters<typeof saveBugDex>[0]);
}

function savePartyHP(playerMon: { currentHP: number }): void {
  const dex = loadBugDex() as Record<string, unknown>;
  const party = dex.party as MonsterLike[] | undefined;
  if (!party || party.length === 0) return;
  party[0].currentHP = playerMon.currentHP;
  saveBugDex(dex as Parameters<typeof saveBugDex>[0]);
}
