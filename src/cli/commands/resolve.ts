// bugmon resolve — mark bugs as fixed and earn XP

import { loadBugDex, saveBugDex, resolveLastUnresolved, resolveAllUnresolved } from '../../ecosystem/storage.js';
import { createComboState, recordResolution, applyComboXP, formatCombo } from '../../domain/combo.js';
import { RESET, BOLD, DIM, FG } from '../colors.js';
import type { ComboTier } from '../../core/types.js';

const COMBO_COLORS: Record<string, string> = {
  DOUBLE: FG.cyan,
  COMBO: FG.yellow,
  'ON FIRE': FG.red,
  UNSTOPPABLE: FG.magenta,
};

function loadCombo() {
  const data = loadBugDex() as Record<string, unknown>;
  return (data.combo as ReturnType<typeof createComboState>) || createComboState();
}

function saveCombo(combo: ReturnType<typeof createComboState>) {
  const data = loadBugDex() as Record<string, unknown>;
  data.combo = combo;
  saveBugDex(data as Parameters<typeof saveBugDex>[0]);
}

export async function resolve(args: string[]): Promise<void> {
  if (args.includes('--all')) {
    const { count, xpGained } = resolveAllUnresolved();

    if (count === 0) {
      process.stderr.write(`\n  ${DIM}No unresolved encounters to clear.${RESET}\n\n`);
      return;
    }

    let combo = loadCombo();
    let totalBonusXP = 0;
    let lastTier: ComboTier | null = null;
    for (let i = 0; i < count; i++) {
      const { state: newState, multiplier, tier } = recordResolution(combo);
      const { state: xpState, bonusXP } = applyComboXP(newState, 50, multiplier);
      combo = xpState;
      totalBonusXP += bonusXP;
      lastTier = tier;
    }
    saveCombo(combo);

    if (totalBonusXP > 0) {
      const data = loadBugDex() as Record<string, unknown>;
      const stats = data.stats as { xp: number; level: number };
      stats.xp += totalBonusXP;
      stats.level = calculateLevel(stats.xp);
      saveBugDex(data as Parameters<typeof saveBugDex>[0]);
    }

    process.stderr.write('\n');
    process.stderr.write(`  ${FG.green}${BOLD}Resolved ${count} bug${count > 1 ? 's' : ''}!${RESET}\n`);
    process.stderr.write(`  ${FG.yellow}+${xpGained} XP${RESET}\n`);
    if (totalBonusXP > 0) {
      const cc = lastTier ? (COMBO_COLORS[lastTier.label] || FG.yellow) : FG.yellow;
      process.stderr.write(`  ${cc}+${totalBonusXP} bonus XP (combo)${RESET}\n`);
    }
    if (combo.streak >= 2 && lastTier) {
      const cc = COMBO_COLORS[lastTier.label] || FG.yellow;
      process.stderr.write(`  ${cc}${BOLD}${formatCombo(combo.streak, lastTier)}${RESET}\n`);
    }
    const data = loadBugDex() as Record<string, unknown>;
    const stats = data.stats as { level: number; xp: number };
    process.stderr.write(`  ${DIM}Level ${stats.level} | ${stats.xp} total XP${RESET}\n`);
    process.stderr.write('\n');
  } else if (args.includes('--last') || args.length === 0) {
    const xp = resolveLastUnresolved();

    if (xp === 0) {
      process.stderr.write(`\n  ${DIM}No unresolved encounters to clear.${RESET}\n\n`);
      return;
    }

    let combo = loadCombo();
    const { state: newState, multiplier, tier } = recordResolution(combo);
    const { state: xpState, bonusXP } = applyComboXP(newState, xp, multiplier);
    combo = xpState;
    saveCombo(combo);

    if (bonusXP > 0) {
      const data = loadBugDex() as Record<string, unknown>;
      const stats = data.stats as { xp: number; level: number };
      stats.xp += bonusXP;
      stats.level = calculateLevel(stats.xp);
      saveBugDex(data as Parameters<typeof saveBugDex>[0]);
    }

    process.stderr.write('\n');
    process.stderr.write(`  ${FG.green}${BOLD}Bug resolved!${RESET}\n`);
    process.stderr.write(`  ${FG.yellow}+${xp} XP${RESET}\n`);
    if (bonusXP > 0) {
      const cc = tier ? (COMBO_COLORS[tier.label] || FG.yellow) : FG.yellow;
      process.stderr.write(`  ${cc}+${bonusXP} bonus XP (combo)${RESET}\n`);
    }
    if (combo.streak >= 2 && tier) {
      const cc = COMBO_COLORS[tier.label] || FG.yellow;
      process.stderr.write(`  ${cc}${BOLD}${formatCombo(combo.streak, tier)}${RESET}\n`);
    }
    const data = loadBugDex() as Record<string, unknown>;
    const stats = data.stats as { level: number; xp: number };
    process.stderr.write(`  ${DIM}Level ${stats.level} | ${stats.xp} total XP${RESET}\n`);
    process.stderr.write('\n');
  } else {
    process.stderr.write(`\n  ${DIM}Usage: bugmon resolve [--last | --all]${RESET}\n\n`);
  }
}

function calculateLevel(xp: number): number {
  let level = 1;
  while (((level + 1) * level) / 2 * 100 <= xp) {
    level++;
  }
  return level;
}
