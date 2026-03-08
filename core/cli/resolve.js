// bugmon resolve — mark bugs as fixed and earn XP
// Two modes:
//   bugmon resolve --last   Resolve the most recent unresolved encounter
//   bugmon resolve --all    Resolve all unresolved encounters
//
// Consecutive resolutions build a combo streak for bonus XP.

import { loadBugDex, saveBugDex, resolveLastUnresolved, resolveAllUnresolved } from '../../ecosystem/storage.js';
import { createComboState, recordResolution, applyComboXP, formatCombo } from '../../domain/combo.js';

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const GREEN = `${ESC}32m`;
const YELLOW = `${ESC}33m`;
const CYAN = `${ESC}36m`;
const MAGENTA = `${ESC}35m`;
const RED = `${ESC}31m`;

const COMBO_COLORS = {
  DOUBLE: CYAN,
  COMBO: YELLOW,
  'ON FIRE': RED,
  UNSTOPPABLE: MAGENTA,
};

/**
 * Load combo state from the BugDex.
 */
function loadCombo() {
  const data = loadBugDex();
  return data.combo || createComboState();
}

/**
 * Save combo state to the BugDex.
 */
function saveCombo(combo) {
  const data = loadBugDex();
  data.combo = combo;
  saveBugDex(data);
}

/**
 * Resolve encounters from the command line.
 * @param {string[]} args - CLI arguments after "resolve"
 */
export async function resolve(args) {
  if (args.includes('--all')) {
    const { count, xpGained } = resolveAllUnresolved();

    if (count === 0) {
      process.stderr.write(`\n  ${DIM}No unresolved encounters to clear.${RESET}\n\n`);
      return;
    }

    // Build combo for each resolution
    let combo = loadCombo();
    let totalBonusXP = 0;
    let lastTier = null;
    for (let i = 0; i < count; i++) {
      const { state: newState, multiplier, tier } = recordResolution(combo);
      const { state: xpState, bonusXP } = applyComboXP(newState, 50, multiplier);
      combo = xpState;
      totalBonusXP += bonusXP;
      lastTier = tier;
    }
    saveCombo(combo);

    // Apply bonus XP to BugDex
    if (totalBonusXP > 0) {
      const data = loadBugDex();
      data.stats.xp += totalBonusXP;
      data.stats.level = calculateLevel(data.stats.xp);
      saveBugDex(data);
    }

    process.stderr.write('\n');
    process.stderr.write(`  ${GREEN}${BOLD}Resolved ${count} bug${count > 1 ? 's' : ''}!${RESET}\n`);
    process.stderr.write(`  ${YELLOW}+${xpGained} XP${RESET}\n`);
    if (totalBonusXP > 0) {
      const cc = lastTier ? (COMBO_COLORS[lastTier.label] || YELLOW) : YELLOW;
      process.stderr.write(`  ${cc}+${totalBonusXP} bonus XP (combo)${RESET}\n`);
    }
    if (combo.streak >= 2 && lastTier) {
      const cc = COMBO_COLORS[lastTier.label] || YELLOW;
      process.stderr.write(`  ${cc}${BOLD}${formatCombo(combo.streak, lastTier)}${RESET}\n`);
    }
    const data = loadBugDex();
    process.stderr.write(`  ${DIM}Level ${data.stats.level} | ${data.stats.xp} total XP${RESET}\n`);
    process.stderr.write('\n');
  } else if (args.includes('--last') || args.length === 0) {
    const xp = resolveLastUnresolved();

    if (xp === 0) {
      process.stderr.write(`\n  ${DIM}No unresolved encounters to clear.${RESET}\n\n`);
      return;
    }

    // Build combo
    let combo = loadCombo();
    const { state: newState, multiplier, tier } = recordResolution(combo);
    const { state: xpState, bonusXP } = applyComboXP(newState, xp, multiplier);
    combo = xpState;
    saveCombo(combo);

    // Apply bonus XP to BugDex
    if (bonusXP > 0) {
      const data = loadBugDex();
      data.stats.xp += bonusXP;
      data.stats.level = calculateLevel(data.stats.xp);
      saveBugDex(data);
    }

    process.stderr.write('\n');
    process.stderr.write(`  ${GREEN}${BOLD}Bug resolved!${RESET}\n`);
    process.stderr.write(`  ${YELLOW}+${xp} XP${RESET}\n`);
    if (bonusXP > 0) {
      const cc = tier ? (COMBO_COLORS[tier.label] || YELLOW) : YELLOW;
      process.stderr.write(`  ${cc}+${bonusXP} bonus XP (combo)${RESET}\n`);
    }
    if (combo.streak >= 2 && tier) {
      const cc = COMBO_COLORS[tier.label] || YELLOW;
      process.stderr.write(`  ${cc}${BOLD}${formatCombo(combo.streak, tier)}${RESET}\n`);
    }
    const data = loadBugDex();
    process.stderr.write(`  ${DIM}Level ${data.stats.level} | ${data.stats.xp} total XP${RESET}\n`);
    process.stderr.write('\n');
  } else {
    process.stderr.write(`\n  ${DIM}Usage: bugmon resolve [--last | --all]${RESET}\n\n`);
  }
}

function calculateLevel(xp) {
  let level = 1;
  while (((level + 1) * level) / 2 * 100 <= xp) {
    level++;
  }
  return level;
}
