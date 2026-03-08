// Terminal renderer — ANSI-colored output for BugMon encounters
// Zero dependencies: raw ANSI escape codes

import { TYPE_COLORS, color, bold, dim, padVis } from './colors.js';

// ── ASCII art per type ──

const TYPE_ART: Record<string, string[]> = {
  frontend: [' ┌─────┐ ', ' │ </> │ ', ' │ ┌─┐ │ ', ' │ └─┘ │ ', ' └─────┘ '],
  backend: [' ┌─[==]─┐', ' │ ░░░░ │', ' │ ▓▓▓▓ │', ' │ ░░░░ │', ' └──────┘'],
  devops: [' *─────* ', ' │ >>> │ ', ' │ === │ ', ' │ <<< │ ', ' *─────* '],
  testing: [' ╭──v──╮ ', ' │ x v │ ', ' │ v x │ ', ' │ x v │ ', ' ╰──x──╯ '],
  architecture: [' ╔═╦═╦═╗ ', ' ║ ║ ║ ║ ', ' ╠═╬═╬═╣ ', ' ║ ║ ║ ║ ', ' ╚═╩═╩═╝ '],
  security: [' ┌──*──┐ ', ' │ /|\\ │ ', ' │/ | \\│ ', ' │\\ | /│ ', ' └──*──┘ '],
  ai: [' ╭─────╮ ', ' │ 0 1 │ ', ' │ 1 0 │ ', ' │ 0 1 │ ', ' ╰─────╯ '],
};

// ── Interfaces ──

interface MonsterLike {
  name: string;
  type: string;
  hp: number;
  attack?: number;
  speed?: number;
  fixTip?: string;
  currentHP?: number;
  color?: string;
  id?: number | string;
}

interface ErrorLike {
  message: string;
}

interface LocationInfo {
  file: string;
  line?: number | null;
  column?: number | null;
}

interface BossLike extends MonsterLike {
  description?: string;
  defeatCondition?: string;
  ascii?: string[];
}

interface StatsLike {
  level?: number;
  xp?: number;
  totalEncounters?: number;
  totalResolved?: number;
}

interface RunSummaryLike {
  duration: number;
  totalEncounters: number;
  totalResolved: number;
  unresolvedCount: number;
  bossesDefeated: number;
  maxCombo: number;
  totalXP: number;
  totalBonusXP: number;
  score: number;
  uniqueMonsters: number;
}

// ── Renderers ──

export function renderEncounter(
  monster: MonsterLike,
  error: ErrorLike,
  location: LocationInfo | null,
  _confidence: number | null,
): void {
  const typeColor = TYPE_COLORS[monster.type] || 'white';
  const art = TYPE_ART[monster.type] || TYPE_ART.frontend;
  const W = 48;

  const border = color('║', typeColor);
  const hr = '═'.repeat(W);

  const row = (content: string) => `${border}${padVis(content, W)}${border}`;
  const empty = () => row('');

  const lines: string[] = [];
  lines.push('');
  lines.push(color(`╔${hr}╗`, typeColor));
  lines.push(row(bold(`  Wild ${monster.name} appeared!`)));
  lines.push(empty());

  for (const artLine of art) {
    lines.push(row(`  ${artLine}`));
  }
  lines.push(empty());

  const hpBar = renderHPBar(monster.hp, monster.hp, 10);
  lines.push(
    row(`  Type: ${color(monster.type.toUpperCase(), typeColor)}    HP: ${hpBar} ${monster.hp}`),
  );
  lines.push(empty());

  const msgLines = wordWrap(error.message, W - 4);
  for (const ml of msgLines) {
    lines.push(row(`  ${color(ml, 'red')}`));
  }
  lines.push(empty());

  if (location) {
    const loc = `  >> ${location.file}:${location.line}${location.column ? ':' + location.column : ''}`;
    lines.push(row(color(loc, 'cyan')));
    lines.push(empty());
  }

  if (monster.fixTip) {
    const tipLines = wordWrap(monster.fixTip, W - 10);
    lines.push(row(color(`  Tip: ${tipLines[0]}`, 'green')));
    for (let i = 1; i < tipLines.length; i++) {
      lines.push(row(color(`       ${tipLines[i]}`, 'green')));
    }
  }

  lines.push(color(`╚${hr}╝`, typeColor));
  lines.push('');

  process.stderr.write(lines.join('\n') + '\n');
}

export function renderBugDex(
  dexData: { seen?: Record<number, number> },
  allMonsters: MonsterLike[],
): void {
  const seen = dexData.seen || {};
  const total = allMonsters.length;
  const discovered = Object.keys(seen).length;

  const lines: string[] = [];
  lines.push('');
  lines.push(bold(color('  ╔══════════════════════════════════════╗', 'cyan')));
  lines.push(bold(color('  ║           B U G D E X               ║', 'cyan')));
  lines.push(bold(color('  ╚══════════════════════════════════════╝', 'cyan')));
  lines.push('');
  lines.push(
    `  Discovered: ${bold(`${discovered}/${total}`)} (${Math.round((discovered / total) * 100)}%)`,
  );
  lines.push('');

  for (const monster of allMonsters) {
    const count = (monster.id !== undefined ? seen[monster.id as number] : 0) || 0;
    const typeColor = TYPE_COLORS[monster.type] || 'white';

    if (count > 0) {
      const name = monster.name.padEnd(20);
      const type = color(monster.type.padEnd(10), typeColor);
      const encounters = dim(`x${count}`);
      lines.push(
        `  ${color('#' + String(monster.id).padStart(2, '0'), 'gray')} ${bold(name)} ${type} ${encounters}`,
      );
    } else {
      lines.push(
        `  ${color('#' + String(monster.id).padStart(2, '0'), 'gray')} ${dim('???'.padEnd(20))} ${dim('???'.padEnd(10))}`,
      );
    }
  }

  lines.push('');
  process.stdout.write(lines.join('\n') + '\n');
}

export function renderStats(stats: StatsLike): void {
  const level = stats.level || 1;
  const xp = stats.xp || 0;
  const nextLevel = getXPForLevel(level + 1);
  const xpBar = renderHPBar(xp - getXPForLevel(level), nextLevel - getXPForLevel(level), 20);

  const lines: string[] = [];
  lines.push('');
  lines.push(bold('  Bug Hunter Stats'));
  lines.push(`  Level: ${bold(String(level))}  XP: ${xp}/${nextLevel}`);
  lines.push(`  ${xpBar}`);
  lines.push(`  Encounters: ${bold(String(stats.totalEncounters || 0))}`);
  lines.push(`  Resolved:   ${bold(color(String(stats.totalResolved || 0), 'green'))}`);
  lines.push('');
  process.stdout.write(lines.join('\n') + '\n');
}

export function renderParty(party: MonsterLike[]): void {
  if (!party || party.length === 0) {
    process.stdout.write(
      '\n  No BugMon in your party yet.\n  Run "bugmon watch --cache -- <command>" to start caching!\n\n',
    );
    return;
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(bold(color('  ╔══════════════════════════════════════╗', 'yellow')));
  lines.push(bold(color('  ║           P A R T Y                 ║', 'yellow')));
  lines.push(bold(color('  ╚══════════════════════════════════════╝', 'yellow')));
  lines.push('');

  for (let i = 0; i < party.length; i++) {
    const mon = party[i];
    const typeColor = TYPE_COLORS[mon.type] || 'white';
    const hp = mon.currentHP ?? mon.hp;
    const bar = renderHPBar(hp, mon.hp, 10);
    const name = bold(mon.name.padEnd(18));
    const type = color(mon.type.padEnd(10), typeColor);
    lines.push(`  ${color(`[${i + 1}]`, 'gray')} ${name} ${type} ${bar} ${hp}/${mon.hp}`);
  }

  lines.push('');
  process.stdout.write(lines.join('\n') + '\n');
}

export function renderEncounterPrompt(monster: MonsterLike): void {
  const typeColor = TYPE_COLORS[monster.type] || 'white';
  const lines: string[] = [];
  lines.push('');
  lines.push(color('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', typeColor));
  lines.push(`  ${bold(`A wild ${color(monster.name, typeColor)} appeared!`)}`);
  lines.push(
    `  Type: ${color(monster.type.toUpperCase(), typeColor)}  HP: ${monster.hp}  ATK: ${monster.attack}  SPD: ${monster.speed}`,
  );
  lines.push(color('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', typeColor));
  lines.push('');
  process.stderr.write(lines.join('\n') + '\n');
}

export function renderBossEncounter(boss: BossLike): void {
  const W = 48;
  const border = color('║', 'red');
  const hr = '═'.repeat(W);

  const row = (content: string) => `${border}${padVis(content, W)}${border}`;
  const empty = () => row('');

  const lines: string[] = [];
  lines.push('');
  lines.push(color(`╔${hr}╗`, 'red'));
  lines.push(row(bold(color(`  ★ BOSS: ${boss.name} ★`, 'red'))));
  lines.push(empty());

  if (boss.ascii) {
    for (const artLine of boss.ascii) {
      lines.push(row(`  ${artLine}`));
    }
    lines.push(empty());
  }

  const typeColor = TYPE_COLORS[boss.type] || 'white';
  const hpBar = renderHPBar(boss.hp, boss.hp, 10);
  lines.push(
    row(`  Type: ${color(boss.type.toUpperCase(), typeColor)}    HP: ${hpBar} ${boss.hp}`),
  );
  lines.push(empty());

  if (boss.description) {
    const descLines = wordWrap(boss.description, W - 4);
    for (const dl of descLines) {
      lines.push(row(`  ${dim(dl)}`));
    }
    lines.push(empty());
  }

  if (boss.defeatCondition) {
    lines.push(row(color(`  To defeat: ${boss.defeatCondition}`, 'cyan')));
    lines.push(empty());
  }

  lines.push(color(`╚${hr}╝`, 'red'));
  lines.push('');

  process.stderr.write(lines.join('\n') + '\n');
}

export function renderCombo(
  streak: number,
  tier: { label: string; multiplier: number } | null,
  bonusXP: number,
): void {
  if (!tier) return;

  const comboColors: Record<string, string> = {
    DOUBLE: 'cyan',
    COMBO: 'yellow',
    'ON FIRE': 'red',
    UNSTOPPABLE: 'magenta',
  };
  const cc = comboColors[tier.label] || 'yellow';

  const lines: string[] = [];
  lines.push('');
  lines.push(bold(color(`  ★ ${tier.label} x${streak}! ★`, cc)));
  lines.push(color(`  ${tier.multiplier}x XP multiplier! +${bonusXP} bonus XP`, cc));
  lines.push('');
  process.stderr.write(lines.join('\n') + '\n');
}

export function renderComboBreak(brokenStreak: number): void {
  if (brokenStreak < 2) return;
  process.stderr.write(dim(`  Combo broken at x${brokenStreak}\n`));
}

export function renderRunSummary(summary: RunSummaryLike): void {
  const lines: string[] = [];
  lines.push('');
  lines.push(bold(color('  ╔══════════════════════════════════════╗', 'cyan')));
  lines.push(bold(color('  ║         R U N   C O M P L E T E     ║', 'cyan')));
  lines.push(bold(color('  ╚══════════════════════════════════════╝', 'cyan')));
  lines.push('');
  lines.push(`  Duration:    ${bold(formatDurationLocal(summary.duration))}`);
  lines.push(`  Encounters:  ${bold(String(summary.totalEncounters))}`);
  lines.push(`  Resolved:    ${bold(color(String(summary.totalResolved), 'green'))}`);
  if (summary.unresolvedCount > 0) {
    lines.push(`  Unresolved:  ${bold(color(String(summary.unresolvedCount), 'red'))}`);
  }
  if (summary.bossesDefeated > 0) {
    lines.push(`  Bosses:      ${bold(color(String(summary.bossesDefeated), 'yellow'))}`);
  }
  lines.push(`  Best Combo:  ${bold(`x${summary.maxCombo}`)}`);
  lines.push(`  Total XP:    ${bold(color(String(summary.totalXP), 'yellow'))}`);
  if (summary.totalBonusXP > 0) {
    lines.push(`  Bonus XP:    ${bold(color(`+${summary.totalBonusXP}`, 'cyan'))} (from combos)`);
  }
  lines.push(`  Score:       ${bold(String(summary.score))}`);
  if (summary.uniqueMonsters > 0) {
    lines.push(`  Unique Bugs: ${bold(String(summary.uniqueMonsters))}`);
  }
  lines.push('');
  process.stderr.write(lines.join('\n') + '\n');
}

// ── Utilities ──

function renderHPBar(current: number, max: number, width: number): string {
  const ratio = max > 0 ? current / max : 0;
  const filled = Math.round(ratio * width);
  const bar = '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, width - filled));
  return color(bar, ratio > 0.5 ? 'green' : ratio > 0.25 ? 'yellow' : 'red');
}

function wordWrap(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function formatDurationLocal(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function getXPForLevel(level: number): number {
  return level <= 1 ? 0 : ((level * (level - 1)) / 2) * 100;
}
