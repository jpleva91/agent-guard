// Trend identification — detects increasing/decreasing violation patterns
// by comparing recent vs previous time windows.

import type { DomainEvent } from '@red-codes/core';
import type {
  ViolationRecord,
  ViolationTrend,
  FailureRateTrend,
  ClusterDimension,
  TrendDirection,
} from './types.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_MS = 7 * ONE_DAY_MS; // 7-day windows

/** Split violations into two time windows: recent and previous */
function splitByWindow(
  violations: readonly ViolationRecord[],
  windowMs: number
): { recent: ViolationRecord[]; previous: ViolationRecord[] } {
  if (violations.length === 0) return { recent: [], previous: [] };

  const now = Math.max(...violations.map((v) => v.timestamp));
  const recentStart = now - windowMs;
  const previousStart = recentStart - windowMs;

  const recent = violations.filter((v) => v.timestamp >= recentStart);
  const previous = violations.filter(
    (v) => v.timestamp >= previousStart && v.timestamp < recentStart
  );

  return { recent, previous };
}

/** Count violations by a dimension key */
function countByKey(
  violations: readonly ViolationRecord[],
  dimension: ClusterDimension
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const v of violations) {
    let key: string | undefined;
    switch (dimension) {
      case 'actionType':
        key = v.actionType;
        break;
      case 'target':
        key = v.target;
        break;
      case 'invariant':
        key = v.invariantId;
        break;
      case 'kind':
        key = v.kind;
        break;
      case 'reason':
        key = v.reason;
        break;
      case 'category':
      case 'errorPattern':
        // These dimensions are handled by cluster.ts, not used in raw trend counting
        key = undefined;
        break;
    }

    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

/** Determine trend direction from counts */
function determineTrend(recentCount: number, previousCount: number): TrendDirection {
  if (previousCount === 0 && recentCount > 0) return 'new';
  if (recentCount === 0 && previousCount > 0) return 'resolved';
  if (previousCount === 0 && recentCount === 0) return 'stable';

  const changePercent = ((recentCount - previousCount) / previousCount) * 100;

  if (changePercent > 20) return 'increasing';
  if (changePercent < -20) return 'decreasing';
  return 'stable';
}

/** Compute trends for a single dimension */
export function computeTrends(
  violations: readonly ViolationRecord[],
  dimension: ClusterDimension,
  windowMs = DEFAULT_WINDOW_MS
): ViolationTrend[] {
  const { recent, previous } = splitByWindow(violations, windowMs);
  const recentCounts = countByKey(recent, dimension);
  const previousCounts = countByKey(previous, dimension);

  const allKeys = new Set([...recentCounts.keys(), ...previousCounts.keys()]);
  const trends: ViolationTrend[] = [];

  for (const key of allKeys) {
    const recentCount = recentCounts.get(key) ?? 0;
    const previousCount = previousCounts.get(key) ?? 0;
    const direction = determineTrend(recentCount, previousCount);

    if (direction === 'stable' && recentCount === 0) continue;

    const changePercent =
      previousCount === 0
        ? recentCount > 0
          ? 100
          : 0
        : Math.round(((recentCount - previousCount) / previousCount) * 100);

    trends.push({
      key,
      dimension,
      direction,
      recentCount,
      previousCount,
      changePercent,
    });
  }

  return trends.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

/** Compute trends across all dimensions */
export function computeAllTrends(
  violations: readonly ViolationRecord[],
  windowMs = DEFAULT_WINDOW_MS
): ViolationTrend[] {
  const dimensions: ClusterDimension[] = ['invariant', 'actionType', 'kind'];
  const allTrends: ViolationTrend[] = [];

  for (const dim of dimensions) {
    allTrends.push(...computeTrends(violations, dim, windowMs));
  }

  return allTrends.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

/**
 * Compute failure rate trends — compares the ratio of failures to total actions
 * between recent and previous time windows. This detects whether a particular
 * action type is becoming MORE failure-prone, not just whether raw counts are changing.
 */
export function computeFailureRateTrends(
  failures: readonly ViolationRecord[],
  allEvents: readonly DomainEvent[],
  windowMs = DEFAULT_WINDOW_MS
): FailureRateTrend[] {
  if (failures.length === 0 || allEvents.length === 0) return [];

  const now = Math.max(...allEvents.map((e) => e.timestamp));
  const recentStart = now - windowMs;
  const previousStart = recentStart - windowMs;

  // Split all events into windows for total counts
  const recentEvents = allEvents.filter((e) => e.timestamp >= recentStart);
  const previousEvents = allEvents.filter(
    (e) => e.timestamp >= previousStart && e.timestamp < recentStart
  );

  // Split failures into windows
  const recentFailures = failures.filter((f) => f.timestamp >= recentStart);
  const previousFailures = failures.filter(
    (f) => f.timestamp >= previousStart && f.timestamp < recentStart
  );

  // Count failures by actionType in each window
  const recentFailureCounts = countByKey(recentFailures, 'actionType');
  const previousFailureCounts = countByKey(previousFailures, 'actionType');

  // Count total events by actionType in each window
  const recentTotalCounts = countEventsByActionType(recentEvents);
  const previousTotalCounts = countEventsByActionType(previousEvents);

  const allKeys = new Set([...recentFailureCounts.keys(), ...previousFailureCounts.keys()]);
  const trends: FailureRateTrend[] = [];

  for (const key of allKeys) {
    const rf = recentFailureCounts.get(key) ?? 0;
    const rt = recentTotalCounts.get(key) ?? 0;
    const pf = previousFailureCounts.get(key) ?? 0;
    const pt = previousTotalCounts.get(key) ?? 0;

    const recentRate = rt > 0 ? rf / rt : 0;
    const previousRate = pt > 0 ? pf / pt : 0;

    const direction = determineRateTrend(recentRate, previousRate, rf, pf);

    if (direction === 'stable' && rf === 0) continue;

    const changePercent =
      previousRate === 0
        ? recentRate > 0
          ? 100
          : 0
        : Math.round(((recentRate - previousRate) / previousRate) * 100);

    trends.push({
      key,
      dimension: 'actionType',
      recentRate: Math.round(recentRate * 1000) / 1000,
      previousRate: Math.round(previousRate * 1000) / 1000,
      recentFailures: rf,
      recentTotal: rt,
      previousFailures: pf,
      previousTotal: pt,
      direction,
      changePercent,
    });
  }

  return trends.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

/** Count events by actionType from raw domain events */
function countEventsByActionType(events: readonly DomainEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) {
    const rec = e as unknown as Record<string, unknown>;
    const actionType = (rec.actionType as string | undefined) ?? (rec.action as string | undefined);
    if (actionType) {
      counts.set(actionType, (counts.get(actionType) ?? 0) + 1);
    }
  }
  return counts;
}

/** Determine trend direction from failure rates */
function determineRateTrend(
  recentRate: number,
  previousRate: number,
  recentCount: number,
  previousCount: number
): TrendDirection {
  if (previousCount === 0 && recentCount > 0) return 'new';
  if (recentCount === 0 && previousCount > 0) return 'resolved';
  if (previousCount === 0 && recentCount === 0) return 'stable';

  const rateChange =
    previousRate === 0
      ? recentRate > 0
        ? 100
        : 0
      : ((recentRate - previousRate) / previousRate) * 100;

  if (rateChange > 20) return 'increasing';
  if (rateChange < -20) return 'decreasing';
  return 'stable';
}
