// Pure run session tracker for BugMon
// A "run" = one debugging session (one `bugmon watch` invocation).
// Tracks encounters, resolutions, combos, duration, and score.
// No DOM, no Node.js APIs — pure data transformations.
//
// TODO(roadmap): Phase 3 — Implement full run engine (session-scoped gameplay lifecycle)
// TODO(roadmap): Phase 3 — Session escalation (unresolved errors compound difficulty)
// TODO(roadmap): Phase 3 — Stability collapse detection (run death from cascading failures)
// TODO(roadmap): Phase 4 — Session metadata (run ID, RNG seed, timestamps) for replay

import type {
  ComboTier,
  RunSession,
  RunEncounter,
  RunResolution,
  RunSummary,
  RunStats,
  RunStatus,
  EncounterMode,
  Severity,
} from '../core/types.js';
import { simpleHash } from './hash.js';
import { createComboState, recordResolution, recordFailure, applyComboXP, getTier } from './combo.js';

/** Default idle/active severity threshold. Severity 1-2 auto-resolve. */
const DEFAULT_IDLE_THRESHOLD: Severity = 2;

/** Create a new run session. */
export function createRun(options: {
  playerLevel?: number;
  repo?: string;
  idleThreshold?: number;
} = {}): RunSession {
  const now = Date.now();
  return {
    runId: `run_${now}_${simpleHash(String(now + Math.random()))}`,
    startedAt: now,
    endedAt: null,
    repo: options.repo || null,
    playerLevel: options.playerLevel || 1,
    idleThreshold: options.idleThreshold ?? DEFAULT_IDLE_THRESHOLD,
    encounters: [],
    resolutions: [],
    bossesDefeated: [],
    combo: createComboState(),
    score: 0,
    totalXP: 0,
    totalBonusXP: 0,
    status: 'active',
  };
}

/** Determine if an encounter should auto-resolve (idle) or require player input (active). */
export function getEncounterMode(run: RunSession, severity: number): EncounterMode {
  return severity <= run.idleThreshold ? 'idle' : 'active';
}

/** Record an encounter in the run. */
export function addEncounter(
  run: RunSession,
  encounter: Omit<RunEncounter, 'timestamp' | 'resolved'>,
): { run: RunSession; brokeStreak: number } {
  const entry: RunEncounter = {
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

/** Record a resolution in the run. */
export function addResolution(
  run: RunSession,
  resolution: { monsterId: number; monsterName: string; baseXP: number },
): {
  run: RunSession;
  multiplier: number;
  tier: ComboTier | null;
  totalXP: number;
  bonusXP: number;
} {
  const { state: comboState, multiplier, tier } = recordResolution(run.combo);
  const { state: xpState, totalXP, bonusXP } = applyComboXP(comboState, resolution.baseXP, multiplier);

  const entry: RunResolution = {
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
  const encounters = [...run.encounters] as RunEncounter[];
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

/** Record a boss defeat in the run. */
export function addBossDefeat(
  run: RunSession,
  boss: { bossId: string; bossName: string; xp: number },
): RunSession {
  return {
    ...run,
    bossesDefeated: [
      ...run.bossesDefeated,
      {
        ...boss,
        timestamp: Date.now(),
      },
    ],
    totalXP: run.totalXP + boss.xp,
    score: run.score + boss.xp * 2,
  };
}

/** End the run and compute final stats. */
export function endRun(run: RunSession, result: RunStatus = 'completed'): RunSession {
  const now = Date.now();
  const duration = now - run.startedAt;

  const summary: RunSummary = {
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
  };

  return {
    ...run,
    endedAt: now,
    status: result,
    duration,
    summary,
  };
}

/** Get current run stats (for display during an active run). */
export function getRunStats(run: RunSession): RunStats {
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
