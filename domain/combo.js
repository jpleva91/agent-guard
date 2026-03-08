// Pure combo/streak system for BugMon
// Tracks consecutive bug resolutions without failures.
// No DOM, no Node.js APIs — pure functions with state passed in.

/**
 * XP multiplier tiers based on combo count.
 * Combo 1 = no bonus, 2 = 1.5x, 3-4 = 2x, 5-9 = 3x, 10+ = 5x
 */
const COMBO_TIERS = [
  { min: 10, multiplier: 5.0, label: 'UNSTOPPABLE' },
  { min: 5, multiplier: 3.0, label: 'ON FIRE' },
  { min: 3, multiplier: 2.0, label: 'COMBO' },
  { min: 2, multiplier: 1.5, label: 'DOUBLE' },
];

/**
 * Create a fresh combo state.
 * @returns {{ streak: number, maxStreak: number, totalBonusXP: number }}
 */
export function createComboState() {
  return {
    streak: 0,
    maxStreak: 0,
    totalBonusXP: 0,
  };
}

/**
 * Record a successful bug resolution (bug fixed without new failures).
 * Increments the streak and returns updated state + XP multiplier.
 * @param {{ streak: number, maxStreak: number, totalBonusXP: number }} state
 * @returns {{ state: { streak: number, maxStreak: number, totalBonusXP: number }, multiplier: number, tier: { label: string, multiplier: number } | null }}
 */
export function recordResolution(state) {
  const newStreak = state.streak + 1;
  const newState = {
    streak: newStreak,
    maxStreak: Math.max(state.maxStreak, newStreak),
    totalBonusXP: state.totalBonusXP,
  };

  const tier = getTier(newStreak);
  const multiplier = tier ? tier.multiplier : 1.0;

  return { state: newState, multiplier, tier };
}

/**
 * Record a failure (new bug appeared, test failure, etc).
 * Resets the streak to zero.
 * @param {{ streak: number, maxStreak: number, totalBonusXP: number }} state
 * @returns {{ state: { streak: number, maxStreak: number, totalBonusXP: number }, brokeStreak: number }}
 */
export function recordFailure(state) {
  const brokeStreak = state.streak;
  const newState = {
    streak: 0,
    maxStreak: state.maxStreak,
    totalBonusXP: state.totalBonusXP,
  };
  return { state: newState, brokeStreak };
}

/**
 * Apply a combo multiplier to base XP and track bonus.
 * @param {{ streak: number, maxStreak: number, totalBonusXP: number }} state
 * @param {number} baseXP
 * @param {number} multiplier
 * @returns {{ state: { streak: number, maxStreak: number, totalBonusXP: number }, totalXP: number, bonusXP: number }}
 */
export function applyComboXP(state, baseXP, multiplier) {
  const totalXP = Math.floor(baseXP * multiplier);
  const bonusXP = totalXP - baseXP;
  const newState = {
    ...state,
    totalBonusXP: state.totalBonusXP + bonusXP,
  };
  return { state: newState, totalXP, bonusXP };
}

/**
 * Get the current combo tier for a given streak count.
 * @param {number} streak
 * @returns {{ min: number, multiplier: number, label: string } | null}
 */
export function getTier(streak) {
  for (const tier of COMBO_TIERS) {
    if (streak >= tier.min) return tier;
  }
  return null;
}

/**
 * Format a combo notification string (no ANSI — caller handles styling).
 * @param {number} streak
 * @param {{ label: string, multiplier: number } | null} tier
 * @returns {string | null} null if no combo active
 */
export function formatCombo(streak, tier) {
  if (!tier) return null;
  return `${tier.label} x${streak}! (${tier.multiplier}x XP)`;
}
