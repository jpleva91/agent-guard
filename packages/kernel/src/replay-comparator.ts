// Replay Comparator — diffs two governance sessions to detect decision changes.
//
// Compares original vs replayed outcomes action-by-action, producing a structured
// report of matching decisions, divergences, and missing/extra actions.
// Use cases: policy regression testing, kernel correctness verification, audit validation.

import type { DomainEvent } from '@red-codes/core';
import type {
  ReplayAction,
  ReplaySession,
  ReplaySessionSummary,
  ReplayLoadOptions,
} from './replay-engine.js';
import { loadReplaySession, buildReplaySession } from './replay-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The result of comparing a single field between original and replayed. */
export interface FieldDifference {
  readonly field: string;
  readonly original: unknown;
  readonly replayed: unknown;
}

/** Comparison status for a single action. */
export type ComparisonStatus = 'match' | 'divergent' | 'missing' | 'extra';

/** Side-by-side comparison of a single action encounter. */
export interface ActionComparison {
  /** Position in the comparison list (0-based). */
  readonly index: number;
  /** Whether the action matched, diverged, or was only in one session. */
  readonly status: ComparisonStatus;
  /** The action from the original session (null if status is 'extra'). */
  readonly original: ReplayAction | null;
  /** The action from the replayed session (null if status is 'missing'). */
  readonly replayed: ReplayAction | null;
  /** Field-level differences (empty for 'match', 'missing', 'extra'). */
  readonly differences: readonly FieldDifference[];
}

/** Diff of session-level summary statistics. */
export interface SummaryDiff {
  readonly original: ReplaySessionSummary;
  readonly replayed: ReplaySessionSummary;
  readonly differences: readonly FieldDifference[];
}

/** Full comparison report between two governance sessions. */
export interface ComparisonReport {
  readonly originalRunId: string;
  readonly replayedRunId: string;
  /** Total number of action comparisons performed. */
  readonly totalComparisons: number;
  /** Number of actions that produced identical decisions. */
  readonly matches: number;
  /** Number of actions that produced different decisions. */
  readonly divergences: number;
  /** Number of actions present in original but absent in replayed. */
  readonly missing: number;
  /** Number of actions present in replayed but absent in original. */
  readonly extra: number;
  /** Per-action comparison details. */
  readonly comparisons: readonly ActionComparison[];
  /** Session-level summary diff. */
  readonly summaryDiff: SummaryDiff;
  /** Whether the two sessions produced identical governance decisions. */
  readonly identical: boolean;
}

// ---------------------------------------------------------------------------
// Action Comparison
// ---------------------------------------------------------------------------

/** Fields compared on each action to determine match vs divergence. */
const COMPARED_FIELDS = ['allowed', 'executed', 'succeeded', 'actionType', 'target'] as const;

/**
 * Compare two ReplayAction objects field-by-field.
 * Returns an array of field differences (empty if they match).
 */
function diffActions(original: ReplayAction, replayed: ReplayAction): FieldDifference[] {
  const differences: FieldDifference[] = [];

  for (const field of COMPARED_FIELDS) {
    const origVal = original[field];
    const replayVal = replayed[field];
    if (origVal !== replayVal) {
      differences.push({ field, original: origVal, replayed: replayVal });
    }
  }

  // Compare governance event counts
  const origGovCount = original.governanceEvents.length;
  const replayGovCount = replayed.governanceEvents.length;
  if (origGovCount !== replayGovCount) {
    differences.push({
      field: 'governanceEventCount',
      original: origGovCount,
      replayed: replayGovCount,
    });
  }

  // Compare denial reasons (from decision events)
  const origReason = original.decisionEvent?.reason ?? null;
  const replayReason = replayed.decisionEvent?.reason ?? null;
  if (origReason !== replayReason) {
    differences.push({ field: 'decisionReason', original: origReason, replayed: replayReason });
  }

  return differences;
}

// ---------------------------------------------------------------------------
// Summary Comparison
// ---------------------------------------------------------------------------

/** Summary fields to compare. */
const SUMMARY_FIELDS = [
  'totalActions',
  'allowed',
  'denied',
  'executed',
  'failed',
  'violations',
  'escalations',
  'simulationsRun',
] as const;

/**
 * Compare two session summaries field-by-field.
 */
function diffSummaries(
  original: ReplaySessionSummary,
  replayed: ReplaySessionSummary
): FieldDifference[] {
  const differences: FieldDifference[] = [];

  for (const field of SUMMARY_FIELDS) {
    const origVal = original[field];
    const replayVal = replayed[field];
    if (origVal !== replayVal) {
      differences.push({ field, original: origVal, replayed: replayVal });
    }
  }

  return differences;
}

// ---------------------------------------------------------------------------
// Core Comparator
// ---------------------------------------------------------------------------

/**
 * Compare two replay sessions action-by-action.
 *
 * Actions are matched by position (index). If one session has more actions
 * than the other, the extra actions are reported as 'missing' or 'extra'.
 */
export function compareReplaySessions(
  original: ReplaySession,
  replayed: ReplaySession
): ComparisonReport {
  const origActions = original.actions;
  const replayActions = replayed.actions;
  const maxLen = Math.max(origActions.length, replayActions.length);

  const comparisons: ActionComparison[] = [];
  let matches = 0;
  let divergences = 0;
  let missing = 0;
  let extra = 0;

  for (let i = 0; i < maxLen; i++) {
    const origAction = i < origActions.length ? origActions[i] : null;
    const replayAction = i < replayActions.length ? replayActions[i] : null;

    if (origAction && replayAction) {
      const differences = diffActions(origAction, replayAction);
      if (differences.length === 0) {
        comparisons.push({
          index: i,
          status: 'match',
          original: origAction,
          replayed: replayAction,
          differences,
        });
        matches++;
      } else {
        comparisons.push({
          index: i,
          status: 'divergent',
          original: origAction,
          replayed: replayAction,
          differences,
        });
        divergences++;
      }
    } else if (origAction && !replayAction) {
      comparisons.push({
        index: i,
        status: 'missing',
        original: origAction,
        replayed: null,
        differences: [],
      });
      missing++;
    } else if (!origAction && replayAction) {
      comparisons.push({
        index: i,
        status: 'extra',
        original: null,
        replayed: replayAction,
        differences: [],
      });
      extra++;
    }
  }

  const summaryDiff: SummaryDiff = {
    original: original.summary,
    replayed: replayed.summary,
    differences: diffSummaries(original.summary, replayed.summary),
  };

  return {
    originalRunId: original.runId,
    replayedRunId: replayed.runId,
    totalComparisons: comparisons.length,
    matches,
    divergences,
    missing,
    extra,
    comparisons,
    summaryDiff,
    identical: divergences === 0 && missing === 0 && extra === 0,
  };
}

// ---------------------------------------------------------------------------
// Convenience API
// ---------------------------------------------------------------------------

/**
 * Compare two sessions by run ID, loading from JSONL files.
 * Returns null if either session cannot be loaded.
 */
export function compareRunIds(
  originalRunId: string,
  replayedRunId: string,
  options: ReplayLoadOptions = {}
): ComparisonReport | null {
  const original = loadReplaySession(originalRunId, options);
  const replayed = loadReplaySession(replayedRunId, options);

  if (!original || !replayed) return null;

  return compareReplaySessions(original, replayed);
}

/**
 * Compare an original session against an in-memory event array.
 * Useful for re-evaluating a recorded session with a modified policy.
 */
export function compareSessionWithEvents(
  original: ReplaySession,
  replayedEvents: DomainEvent[],
  replayedRunId?: string
): ComparisonReport {
  const replayed = buildReplaySession(replayedRunId || `${original.runId}-replay`, replayedEvents);
  return compareReplaySessions(original, replayed);
}

// ---------------------------------------------------------------------------
// Report Formatting
// ---------------------------------------------------------------------------

/**
 * Format a comparison report as a human-readable string.
 */
export function formatComparisonReport(report: ComparisonReport): string {
  const lines: string[] = [];

  lines.push('Replay Comparison Report');
  lines.push('========================');
  lines.push(`Original: ${report.originalRunId}`);
  lines.push(`Replayed: ${report.replayedRunId}`);
  lines.push('');

  // Overall result
  if (report.identical) {
    lines.push('Result: IDENTICAL — all governance decisions match.');
  } else {
    lines.push('Result: DIVERGENT — governance decisions differ.');
  }
  lines.push('');

  // Stats
  lines.push('Summary:');
  lines.push(`  Total comparisons: ${report.totalComparisons}`);
  lines.push(`  Matches:           ${report.matches}`);
  lines.push(`  Divergences:       ${report.divergences}`);
  lines.push(`  Missing (original only): ${report.missing}`);
  lines.push(`  Extra (replayed only):   ${report.extra}`);
  lines.push('');

  // Divergent actions
  const divergent = report.comparisons.filter((c) => c.status === 'divergent');
  if (divergent.length > 0) {
    lines.push('Divergent Actions:');
    lines.push('------------------');
    for (const comp of divergent) {
      const actionType = comp.original?.actionType || comp.replayed?.actionType || 'unknown';
      const target = comp.original?.target || comp.replayed?.target || '';
      lines.push(`  [${comp.index}] ${actionType} → ${target}`);
      for (const diff of comp.differences) {
        lines.push(`    ${diff.field}: ${String(diff.original)} → ${String(diff.replayed)}`);
      }
    }
    lines.push('');
  }

  // Missing actions
  const missingActions = report.comparisons.filter((c) => c.status === 'missing');
  if (missingActions.length > 0) {
    lines.push('Missing Actions (in original, not in replayed):');
    lines.push('-----------------------------------------------');
    for (const comp of missingActions) {
      lines.push(`  [${comp.index}] ${comp.original!.actionType} → ${comp.original!.target}`);
    }
    lines.push('');
  }

  // Extra actions
  const extraActions = report.comparisons.filter((c) => c.status === 'extra');
  if (extraActions.length > 0) {
    lines.push('Extra Actions (in replayed, not in original):');
    lines.push('---------------------------------------------');
    for (const comp of extraActions) {
      lines.push(`  [${comp.index}] ${comp.replayed!.actionType} → ${comp.replayed!.target}`);
    }
    lines.push('');
  }

  // Summary-level diffs
  if (report.summaryDiff.differences.length > 0) {
    lines.push('Summary Differences:');
    lines.push('--------------------');
    for (const diff of report.summaryDiff.differences) {
      lines.push(`  ${diff.field}: ${String(diff.original)} → ${String(diff.replayed)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
