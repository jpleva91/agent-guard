/**
 * Run summary terminal renderer.
 *
 * Takes a completed RunSession and returns a styled terminal string
 * showing the dungeon run report card.
 */

import type { RunSession, RunStats } from '../../core/types.js';
import { bold, color, dim } from '../colors.js';

/** Format milliseconds into a human-readable duration. */
function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m${remSecs.toString().padStart(2, '0')}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h${remMins.toString().padStart(2, '0')}m`;
}

/** Render a one-line status bar for an active run. */
export function renderStatusLine(stats: RunStats): string {
  const elapsed = formatDuration(stats.elapsed);
  const combo = stats.comboTier
    ? `${stats.comboTier.label} x${stats.comboStreak}`
    : `x${stats.comboStreak}`;
  const parts = [
    dim('[Run]'),
    color(elapsed, 'cyan'),
    `${stats.encounters} encounters`,
    stats.unresolved > 0 ? color(`${stats.unresolved} active`, 'red') : color('0 active', 'green'),
    `combo ${combo}`,
    `score: ${bold(String(stats.score))}`,
  ];
  return parts.join(dim(' | '));
}

/** Render the full run summary report card. */
export function renderRunSummary(run: RunSession): string {
  const summary = run.summary;
  if (!summary) return dim('No summary available — run not ended.');

  const duration = formatDuration(summary.duration);
  const resolved = summary.totalResolved;
  const total = summary.totalEncounters;
  const resolveRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  const lines: string[] = [
    '',
    bold(color('═══ DUNGEON RUN COMPLETE ═══', 'yellow')),
    '',
    `  ${dim('Duration:')}     ${color(duration, 'cyan')}`,
    `  ${dim('Encounters:')}   ${total} total, ${color(String(resolved), 'green')} resolved, ${summary.unresolvedCount > 0 ? color(String(summary.unresolvedCount), 'red') : '0'} unresolved`,
    `  ${dim('Resolve Rate:')} ${resolveRate >= 80 ? color(`${resolveRate}%`, 'green') : resolveRate >= 50 ? color(`${resolveRate}%`, 'yellow') : color(`${resolveRate}%`, 'red')}`,
    `  ${dim('Bosses:')}       ${summary.bossesDefeated > 0 ? color(String(summary.bossesDefeated), 'magenta') : '0'} defeated`,
    `  ${dim('Max Combo:')}    ${summary.maxCombo > 0 ? color(`x${summary.maxCombo}`, 'cyan') : 'x0'}`,
    `  ${dim('Unique Bugs:')}  ${summary.uniqueMonsters}`,
    '',
    `  ${bold('Score:')}        ${bold(color(String(summary.score), 'yellow'))}`,
    `  ${bold('XP Earned:')}    ${color(String(summary.totalXP), 'green')}${summary.totalBonusXP > 0 ? dim(` (+${summary.totalBonusXP} combo bonus)`) : ''}`,
    '',
    bold(color('═══════════════════════════', 'yellow')),
    '',
  ];

  return lines.join('\n');
}
