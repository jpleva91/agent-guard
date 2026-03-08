// Pure run history aggregation for BugMon
// Takes an array of completed run summaries and computes cross-session stats.
// No DOM, no Node.js APIs — pure functions.

/**
 * Create an empty history state.
 * @returns {object}
 */
export function createHistory() {
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
      uniqueMonsters: new Set(),
    },
  };
}

/**
 * Add a completed run to the history.
 * @param {object} history
 * @param {object} run - A finalized run (from endRun())
 * @returns {object} Updated history
 */
export function addRun(history, run) {
  if (!run.summary) return history;

  const summary = {
    runId: run.runId,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    duration: run.duration,
    status: run.status,
    repo: run.repo,
    playerLevel: run.playerLevel,
    ...run.summary,
  };

  const runs = [...history.runs, summary];

  // Keep only last 100 runs
  if (runs.length > 100) {
    runs.splice(0, runs.length - 100);
  }

  const monsterIds = new Set(history.allTime.uniqueMonsters);
  for (const e of run.encounters || []) {
    monsterIds.add(e.monsterId);
  }

  const allTime = {
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

/**
 * Serialize history for storage (Sets become arrays).
 * @param {object} history
 * @returns {object}
 */
export function serializeHistory(history) {
  return {
    runs: history.runs,
    allTime: {
      ...history.allTime,
      uniqueMonsters: [...history.allTime.uniqueMonsters],
    },
  };
}

/**
 * Deserialize history from storage (arrays become Sets).
 * @param {object} data
 * @returns {object}
 */
export function deserializeHistory(data) {
  if (!data || !data.allTime) return createHistory();
  return {
    runs: data.runs || [],
    allTime: {
      ...data.allTime,
      uniqueMonsters: new Set(data.allTime.uniqueMonsters || []),
    },
  };
}

/**
 * Get recent run summaries for display.
 * @param {object} history
 * @param {number} count
 * @returns {object[]}
 */
export function getRecentRuns(history, count = 10) {
  return history.runs.slice(-count).reverse();
}

/**
 * Compute per-monster stats from history.
 * @param {object[]} runs - Array of run summaries (from history.runs)
 * @returns {Map<number, { encounters: number, resolved: number }>}
 */
export function getMonsterStats(runs) {
  const stats = new Map();
  // This operates on run-level data; for per-monster detail,
  // the caller should aggregate from the full run objects.
  return stats;
}

/**
 * Format duration in human-readable form.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
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
