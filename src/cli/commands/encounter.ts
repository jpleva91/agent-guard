// Terminal UI for BugMon encounters.
// Zero dependencies — uses raw ANSI escape codes.

import { RESET, BOLD, DIM, FG } from '../colors.js';

const TYPE_COLORS: Record<string, string> = {
  memory: FG.green,
  logic: FG.yellow,
  runtime: FG.red,
  syntax: FG.magenta,
  frontend: FG.blue,
  backend: FG.cyan,
  devops: FG.yellow,
  testing: FG.yellow,
};

const RARITY_STYLE: Record<string, { color: string; label: string }> = {
  common: { color: FG.white, label: '' },
  uncommon: { color: FG.cyan, label: '' },
  rare: { color: FG.yellow, label: `${BOLD}${FG.yellow}★ RARE ★${RESET}` },
  legendary: { color: FG.magenta, label: `${BOLD}\x1b[45m${FG.white} ⚡ LEGENDARY ⚡ ${RESET}` },
};

function box(lines: string[], width = 40): string {
  const top = `╔${'═'.repeat(width)}╗`;
  const bot = `╚${'═'.repeat(width)}╝`;
  const padded = lines.map((l) => {
    const stripped = l.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = width - stripped.length;
    return `║${l}${' '.repeat(Math.max(0, pad))}║`;
  });
  return [top, ...padded, bot].join('\n');
}

function hpBar(hp: number, maxHp: number, width = 20): string {
  const ratio = hp / maxHp;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  let barColor = FG.green;
  if (ratio <= 0.25) barColor = FG.red;
  else if (ratio <= 0.5) barColor = FG.yellow;
  return `${barColor}${'█'.repeat(filled)}${DIM}${'░'.repeat(empty)}${RESET} ${hp}/${maxHp}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface MonsterLike {
  name: string;
  type: string;
  hp: number;
  xp?: number;
  rarity?: string;
  errorType?: string;
  ascii?: string[];
  id?: number;
}

interface ErrorInfo {
  message: string;
  file?: string;
  line?: number;
  stack?: string;
}

export async function showEncounter(monster: MonsterLike, errorInfo: ErrorInfo): Promise<void> {
  const typeColor = TYPE_COLORS[monster.type] || FG.white;
  const rarity = RARITY_STYLE[monster.rarity || 'common'] || RARITY_STYLE.common;

  console.log();

  if (rarity.label) {
    console.log(`  ${rarity.label}`);
    console.log();
  }

  const title = `${BOLD}      BUGMON ENCOUNTER${RESET}`;
  console.log(box(['', title, ''], 40));

  console.log();

  if (monster.ascii) {
    for (const line of monster.ascii) {
      console.log(`  ${typeColor}${line}${RESET}`);
    }
  }

  console.log();
  console.log(`  ${BOLD}A wild ${rarity.color}${monster.name}${RESET}${BOLD} appeared!${RESET}`);
  console.log();
  console.log(`  ${DIM}Type:${RESET}   ${typeColor}${monster.type}${RESET}`);
  console.log(`  ${DIM}Error:${RESET}  ${monster.errorType}`);
  console.log(`  ${DIM}HP:${RESET}     ${hpBar(monster.hp, monster.hp)}`);

  if (errorInfo.file) {
    console.log();
    console.log(`  ${DIM}File:${RESET}   ${FG.white}${errorInfo.file}${RESET}`);
  }
  if (errorInfo.line) {
    console.log(`  ${DIM}Line:${RESET}   ${FG.white}${errorInfo.line}${RESET}`);
  }

  console.log();
  console.log(`  ${DIM}─────────────────────────────────${RESET}`);
  console.log();

  console.log(`  ${FG.red}${errorInfo.message}${RESET}`);

  if (errorInfo.stack) {
    const stackLines = errorInfo.stack.split('\n').slice(0, 4);
    for (const line of stackLines) {
      console.log(`  ${DIM}${line.trim()}${RESET}`);
    }
  }

  console.log();

  await battleSequence(monster);
}

async function battleSequence(monster: MonsterLike): Promise<void> {
  const frames = ['⚔️  Debugging...', '⚔️  Debugging..', '⚔️  Debugging.'];
  for (const frame of frames) {
    process.stdout.write(`\r  ${frame}`);
    await sleep(400);
  }
  process.stdout.write('\r' + ' '.repeat(40) + '\r');

  const steps = 5;
  for (let i = steps; i >= 0; i--) {
    const currentHp = Math.round((i / steps) * monster.hp);
    process.stdout.write(`\r  ${DIM}HP:${RESET} ${hpBar(currentHp, monster.hp)}`);
    await sleep(200);
  }

  console.log();
  console.log();
  console.log(`  ${FG.green}${BOLD}⚔️  ${monster.name} defeated!${RESET}`);
  console.log(`  ${FG.yellow}+${monster.xp} XP${RESET}`);
  console.log();
}

export function showBugDex(monsters: MonsterLike[]): void {
  console.log();
  console.log(box(['', `${BOLD}         B U G D E X${RESET}`, ''], 44));
  console.log();

  for (const mon of monsters) {
    const typeColor = TYPE_COLORS[mon.type] || FG.white;
    const rarityTag =
      mon.rarity === 'common' || !mon.rarity
        ? ''
        : mon.rarity === 'uncommon'
          ? ` ${FG.cyan}[uncommon]${RESET}`
          : mon.rarity === 'rare'
            ? ` ${FG.yellow}[★ rare]${RESET}`
            : ` ${FG.magenta}[⚡ legendary]${RESET}`;

    const rarity = RARITY_STYLE[mon.rarity || 'common'] || RARITY_STYLE.common;

    console.log(
      `  ${BOLD}#${String(mon.id).padStart(2, '0')}${RESET} ${rarity.color}${mon.name}${RESET}${rarityTag}`,
    );
    console.log(
      `      ${DIM}Type:${RESET} ${typeColor}${mon.type}${RESET}  ${DIM}HP:${RESET} ${mon.hp}  ${DIM}XP:${RESET} ${mon.xp}  ${DIM}Maps to:${RESET} ${mon.errorType}`,
    );
    console.log();
  }
}

export function showHelp(): void {
  console.log();
  console.log(
    `  ${BOLD}BugMon${RESET} ${DIM}— Pokemon-style encounters for runtime errors.${RESET}`,
  );
  console.log();
  console.log(`  ${BOLD}Usage:${RESET}`);
  console.log(
    `    ${FG.green}bugmon${RESET} ${FG.white}<script.js>${RESET}         Run a file, catch bugs as monsters`,
  );
  console.log(
    `    ${FG.green}bugmon${RESET} ${FG.white}--bugdex${RESET}            Show all known BugMon`,
  );
  console.log(`    ${FG.green}bugmon${RESET} ${FG.white}--help${RESET}              Show this help`);
  console.log();
  console.log(`  ${BOLD}Examples:${RESET}`);
  console.log(`    ${DIM}$${RESET} bugmon server.js`);
  console.log(`    ${DIM}$${RESET} bugmon test.js`);
  console.log(`    ${DIM}$${RESET} npx bugmon broken-code.js`);
  console.log();
  console.log(`  ${DIM}Errors become monsters. Fix the bug to defeat them.${RESET}`);
  console.log();
}
