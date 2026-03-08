// Pure run history aggregation for BugMon
// Takes an array of completed run summaries and computes cross-session stats.
// No DOM, no Node.js APIs — pure functions.
//
// TODO(roadmap): Phase 3 — Run statistics (encounters, defeats, score, duration)
// TODO(roadmap): Phase 5 — Lifetime statistics aggregation
// TODO(roadmap): Phase 5 — Session leaderboard (best scores, fastest boss defeats)

import type { RunHistory, RunSummaryEntry, AllTimeStats, RunSession } from '../core/types.js';

/** Create an empty history state. */
export function createHistory(): RunHistory {
  return {
    runs: [],
    allTime: {
      totalRuns: 0,
      totalEncounters: 0,
      totalResolved: 0,
      totalBossesDefeated: 0,
      totalXP: 0,
      totalBonusXP: 0,
      bestScore: 0,
      bestCombo: 0,
      totalDuration: 0,
      uniqueMonsters: new Set<number>(),
    },
  };
}

/** Add a completed run to the history. */
export function addRun(history: RunHistory, run: RunSession): RunHistory {
  if (!run.summary) return history;

  const summary: RunSummaryEntry = {
    runId: run.runId,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    status: run.status,
    repo: run.repo,
    playerLevel: run.playerLevel,
    ...run.summary,
  };

  const runs = [...history.runs, summary] as RunSummaryEntry[];

  // Keep only last 100 runs
  if (runs.length > 100) {
    runs.splice(0, runs.length - 100);
  }

  const monsterIds = new Set(history.allTime.uniqueMonsters);
  for (const e of run.encounters || []) {
    monsterIds.add(e.monsterId);
  }

  const allTime: AllTimeStats = {
    totalRuns: history.allTime.totalRuns + 1,
    totalEncounters: history.allTime.totalEncounters + run.summary.totalEncounters,
    totalResolved: history.allTime.totalResolved + run.summary.totalResolved,
    totalBossesDefeated: history.allTime.totalBossesDefeated + run.summary.bossesDefeated,
    totalXP: history.allTime.totalXP + run.summary.totalXP,
    totalBonusXP: history.allTime.totalBonusXP + run.summary.totalBonusXP,
    bestScore: Math.max(history.allTime.bestScore, run.summary.score),
    bestCombo: Math.max(history.allTime.bestCombo, run.summary.maxCombo),
    totalDuration: history.allTime.totalDuration + run.summary.duration,
    uniqueMonsters: monsterIds,
  };

  return { runs, allTime };
}

/** Serialize history for storage (Sets become arrays). */
export function serializeHistory(history: RunHistory): {
  runs: readonly RunSummaryEntry[];
  allTime: Omit<AllTimeStats, 'uniqueMonsters'> & { uniqueMonsters: number[] };
} {
  return {
    runs: history.runs,
    allTime: {
      ...history.allTime,
      uniqueMonsters: [...history.allTime.uniqueMonsters],
    },
  };
}

/** Deserialize history from storage (arrays become Sets). */
export function deserializeHistory(data: {
  runs?: RunSummaryEntry[];
  allTime?: Omit<AllTimeStats, 'uniqueMonsters'> & { uniqueMonsters?: number[] };
} | null): RunHistory {
  if (!data || !data.allTime) return createHistory();
  return {
    runs: data.runs || [],
    allTime: {
      ...data.allTime,
      uniqueMonsters: new Set(data.allTime.uniqueMonsters || []),
    },
  };
}

/** Get recent run summaries for display. */
export function getRecentRuns(history: RunHistory, count = 10): RunSummaryEntry[] {
  return [...history.runs].slice(-count).reverse();
}

/** Compute per-monster stats from history. */
export function getMonsterStats(
  _runs: readonly RunSummaryEntry[],
): Map<number, { encounters: number; resolved: number }> {
  const stats = new Map<number, { encounters: number; resolved: number }>();
  // This operates on run-level data; for per-monster detail,
  // the caller should aggregate from the full run objects.
  return stats;
}

/** Format duration in human-readable form. */
export function formatDuration(ms: number): string {
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
