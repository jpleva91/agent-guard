// Boss battle — interactive battle against a boss encounter

import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadBugDex, saveBugDex } from '../../ecosystem/storage.js';
import { RESET, BOLD, DIM, color as c } from '../colors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const XP_BOSS_DEFEAT = 200;

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

interface BossLike {
  id: string;
  name: string;
  type: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  moves?: string[];
  description?: string;
  defeatCondition?: string;
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
  rarity?: string;
  currentHP?: number;
}

interface BossResult {
  defeated: boolean;
  fled: boolean;
  playerFainted: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function interactiveBossBattle(boss: BossLike): Promise<BossResult> {
  loadGameData();

  const party = getParty();
  const playerMon = { ...party[0], currentHP: party[0].currentHP ?? party[0].hp };
  const enemy = { ...boss, currentHP: boss.hp };

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const ask = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  const b = (text: string) => `${BOLD}${text}${RESET}`;

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
  const enemyMoves = (enemy.moves || [])
    .map((id) => movesData!.find((m) => m.id === id))
    .filter(Boolean) as MoveData[];
  const effectiveEnemyMoves =
    enemyMoves.length > 0
      ? enemyMoves
      : [{ id: 'boss-strike', name: 'Boss Strike', power: 12, type: enemy.type }];

  const effectiveness = typeData!.effectiveness;
  const result: BossResult = { defeated: false, fled: false, playerFainted: false };

  process.stderr.write('\n');
  process.stderr.write(c('  ╔══════════════════════════════════════════════╗\n', 'red'));
  process.stderr.write(
    c('  ║', 'red') + b(c(`  BOSS BATTLE! ${enemy.name}`, 'red')) + '\n',
  );
  process.stderr.write(c('  ╚══════════════════════════════════════════════╝\n', 'red'));

  if (enemy.description) {
    process.stderr.write(`  ${DIM}${enemy.description}${RESET}\n`);
  }

  while (true) {
    process.stderr.write('\n');
    process.stderr.write(
      `  ${b(c(enemy.name, 'red'))} ${c(`[${enemy.type}]`, 'gray')}  ${hpBar(enemy.currentHP, enemy.hp)}\n`,
    );
    process.stderr.write(
      `  ${b(playerMon.name)} ${c(`[${playerMon.type}]`, 'gray')}  ${hpBar(playerMon.currentHP, playerMon.hp)}\n`,
    );
    process.stderr.write('\n');

    process.stderr.write(`  ${b('What will you do?')}\n`);
    process.stderr.write(`  ${c('[1]', 'yellow')} Fight   ${c('[2]', 'yellow')} Run\n`);
    process.stderr.write('\n');

    const action = await ask('  > ');
    const choice = action.trim();

    if (choice === '2' || choice.toLowerCase() === 'run') {
      process.stderr.write(`\n  ${DIM}Got away safely!${RESET}\n`);
      process.stderr.write(`  ${DIM}The ${enemy.name} still lurks...${RESET}\n\n`);
      result.fled = true;
      break;
    }

    if (choice === '1' || choice.toLowerCase() === 'fight') {
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
      const enemyMove =
        effectiveEnemyMoves[Math.floor(Math.random() * effectiveEnemyMoves.length)];

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
          process.stderr.write(`  ${b(c(enemy.name, 'red'))} used ${c(turn.move.name, 'white')}! `);
          process.stderr.write(`${c(`-${damage}`, 'red')}${effText}\n`);
        }

        await sleep(300);

        if (enemy.currentHP <= 0) {
          process.stderr.write(`\n  ${c(enemy.name + ' was defeated!', 'yellow')}\n`);
          process.stderr.write(`  ${b(c(`BOSS DEFEATED! +${XP_BOSS_DEFEAT} XP`, 'green'))}\n`);

          const dex = loadBugDex() as Record<string, unknown>;
          const stats = dex.stats as Record<string, number>;
          stats.xp = (stats.xp || 0) + XP_BOSS_DEFEAT;
          stats.level = calculateLevel(stats.xp);
          stats.bossesDefeated = (stats.bossesDefeated || 0) + 1;
          saveBugDex(dex as Parameters<typeof saveBugDex>[0]);

          if (enemy.defeatCondition) {
            process.stderr.write(
              `\n  ${c('To truly defeat this boss:', 'cyan')} ${enemy.defeatCondition}\n`,
            );
          }
          process.stderr.write('\n');

          result.defeated = true;
          break;
        }
        if (playerMon.currentHP <= 0) {
          process.stderr.write(`\n  ${c(playerMon.name + ' fainted!', 'red')}\n`);
          process.stderr.write(`  ${DIM}The ${enemy.name} remains...${RESET}\n`);
          if (enemy.defeatCondition) {
            process.stderr.write(`  ${c('Hint:', 'cyan')} ${enemy.defeatCondition}\n`);
          }
          process.stderr.write('\n');
          result.playerFainted = true;
          break;
        }
      }

      if (enemy.currentHP <= 0 || playerMon.currentHP <= 0) break;
    } else {
      process.stderr.write(`  ${DIM}Pick 1 or 2.${RESET}\n`);
    }
  }

  savePartyHP(playerMon);
  rl.close();
  return result;
}

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

function savePartyHP(playerMon: { currentHP: number }): void {
  const dex = loadBugDex() as Record<string, unknown>;
  const party = dex.party as MonsterLike[] | undefined;
  if (!party || party.length === 0) return;
  party[0].currentHP = playerMon.currentHP;
  saveBugDex(dex as Parameters<typeof saveBugDex>[0]);
}

function calculateLevel(xp: number): number {
  let level = 1;
  while ((((level + 1) * level) / 2) * 100 <= xp) {
    level++;
  }
  return level;
}
