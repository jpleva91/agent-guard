// Pure run session tracker for BugMon
// A "run" = one debugging session (one `bugmon watch` invocation).
// Tracks encounters, resolutions, combos, duration, and score.
// No DOM, no Node.js APIs — pure data transformations.
//
// TODO(roadmap/phase-3): Add configurable idle/active threshold
// TODO(roadmap/phase-3): Add stability collapse detection (run death from cascading failures)
// TODO(roadmap/phase-3): Add run summary and scoring at session end
// TODO(roadmap/phase-3): Add governance boss encounters from AgentGuard events
// TODO(roadmap/ts-migration): Migrate to TypeScript (src/domain/)

import { simpleHash } from './hash.js';
import { createComboState, recordResolution, recordFailure, applyComboXP, getTier } from './combo.js';

/**
 * Create a new run session.
 * @param {{ playerLevel?: number, repo?: string }} options
 * @returns {object} Run session state
 */
export function createRun(options = {}) {
  const now = Date.now();
  return {
    runId: `run_${now}_${simpleHash(String(now + Math.random()))}`,
    startedAt: now,
    endedAt: null,
    repo: options.repo || null,
    playerLevel: options.playerLevel || 1,
    encounters: [],
    resolutions: [],
    bossesDefeated: [],
    combo: createComboState(),
    score: 0,
    totalXP: 0,
    totalBonusXP: 0,
    status: 'active', // active | completed | abandoned
  };
}

/**
 * Record an encounter in the run.
 * New encounters break the combo (a bug appeared = a failure).
 * @param {object} run
 * @param {{ monsterId: number, monsterName: string, error: string, file?: string, line?: number }} encounter
 * @returns {{ run: object, brokeStreak: number }}
 */
export function addEncounter(run, encounter) {
  const entry = {
    ...encounter,
    timestamp: Date.now(),
    resolved: false,
  };

  const { state: comboState, brokeStreak } = recordFailure(run.combo);

  return {
    run: {
      ...run,
      encounters: [...run.encounters, entry],
      combo: comboState,
    },
    brokeStreak,
  };
}

/**
 * Record a resolution in the run.
 * Successful resolutions build the combo streak.
 * @param {object} run
 * @param {{ monsterId: number, monsterName: string, baseXP: number }} resolution
 * @returns {{ run: object, multiplier: number, tier: object | null, totalXP: number, bonusXP: number }}
 */
export function addResolution(run, resolution) {
  const { state: comboState, multiplier, tier } = recordResolution(run.combo);
  const { state: xpState, totalXP, bonusXP } = applyComboXP(comboState, resolution.baseXP, multiplier);

  const entry = {
    monsterId: resolution.monsterId,
    monsterName: resolution.monsterName,
    baseXP: resolution.baseXP,
    totalXP,
    bonusXP,
    multiplier,
    comboStreak: xpState.streak,
    timestamp: Date.now(),
  };

  // Mark the most recent matching encounter as resolved
  const encounters = [...run.encounters];
  for (let i = encounters.length - 1; i >= 0; i--) {
    if (!encounters[i].resolved && encounters[i].monsterId === resolution.monsterId) {
      encounters[i] = { ...encounters[i], resolved: true };
      break;
    }
  }

  return {
    run: {
      ...run,
      encounters,
      resolutions: [...run.resolutions, entry],
      combo: xpState,
      totalXP: run.totalXP + totalXP,
      totalBonusXP: run.totalBonusXP + bonusXP,
      score: run.score + totalXP + (tier ? tier.min * 10 : 0),
    },
    multiplier,
    tier,
    totalXP,
    bonusXP,
  };
}

/**
 * Record a boss defeat in the run.
 * @param {object} run
 * @param {{ bossId: string, bossName: string, xp: number }} boss
 * @returns {object} Updated run
 */
export function addBossDefeat(run, boss) {
  return {
    ...run,
    bossesDefeated: [...run.bossesDefeated, {
      ...boss,
      timestamp: Date.now(),
    }],
    totalXP: run.totalXP + boss.xp,
    score: run.score + boss.xp * 2,
  };
}

/**
 * End the run and compute final stats.
 * @param {object} run
 * @param {'completed' | 'abandoned'} result
 * @returns {object} Finalized run with summary
 */
export function endRun(run, result = 'completed') {
  const now = Date.now();
  const duration = now - run.startedAt;

  return {
    ...run,
    endedAt: now,
    status: result,
    duration,
    summary: {
      duration,
      totalEncounters: run.encounters.length,
      totalResolved: run.resolutions.length,
      unresolvedCount: run.encounters.filter((e) => !e.resolved).length,
      bossesDefeated: run.bossesDefeated.length,
      maxCombo: run.combo.maxStreak,
      totalXP: run.totalXP,
      totalBonusXP: run.totalBonusXP,
      score: run.score,
      uniqueMonsters: new Set(run.encounters.map((e) => e.monsterId)).size,
    },
  };
}

/**
 * Get current run stats (for display during an active run).
 * @param {object} run
 * @returns {object}
 */
export function getRunStats(run) {
  const elapsed = Date.now() - run.startedAt;
  const tier = getTier(run.combo.streak);

  return {
    elapsed,
    encounters: run.encounters.length,
    resolved: run.resolutions.length,
    unresolved: run.encounters.filter((e) => !e.resolved).length,
    comboStreak: run.combo.streak,
    maxCombo: run.combo.maxStreak,
    comboTier: tier,
    score: run.score,
    totalXP: run.totalXP,
    bossesDefeated: run.bossesDefeated.length,
  };
}
