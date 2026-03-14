// Analytics engine — orchestrates aggregation, clustering, trend analysis,
// and report generation for cross-session violation pattern detection.

import {
  aggregateViolations,
  aggregateFailures,
  categorizeFailure,
  listSessionIds,
  loadSessionEvents,
} from './aggregator.js';
import { clusterViolations, clusterFailures } from './cluster.js';
import { computeAllRunRiskScores } from './risk-scorer.js';
import { computeAllTrends, computeFailureRateTrends } from './trends.js';
import type { DomainEvent } from '@red-codes/core';
import type {
  AnalyticsReport,
  AnalyticsOptions,
  FailureAnalysis,
  FailureCategory,
  FailurePattern,
  RunRiskScore,
} from './types.js';

const DEFAULT_MIN_CLUSTER_SIZE = 2;
const DEFAULT_TREND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Run the full analytics pipeline and produce a report */
export function analyze(options: AnalyticsOptions = {}): AnalyticsReport {
  const baseDir = options.baseDir ?? '.agentguard';
  const minClusterSize = options.minClusterSize ?? DEFAULT_MIN_CLUSTER_SIZE;
  const trendWindowMs = options.trendWindowMs ?? DEFAULT_TREND_WINDOW_MS;

  // 1. Aggregate violations from all sessions
  const { violations, sessionCount } = aggregateViolations(baseDir);

  // 2. Count by kind
  const violationsByKind: Record<string, number> = {};
  for (const v of violations) {
    violationsByKind[v.kind] = (violationsByKind[v.kind] ?? 0) + 1;
  }

  // 3. Cluster violations
  const clusters = clusterViolations(violations, minClusterSize);

  // 4. Compute trends
  const trends = computeAllTrends(violations, trendWindowMs);

  // 5. Collect inferred causes
  const causeCounts = new Map<string, number>();
  for (const cluster of clusters) {
    if (cluster.inferredCause) {
      causeCounts.set(cluster.inferredCause, (causeCounts.get(cluster.inferredCause) ?? 0) + 1);
    }
  }

  const topInferredCauses = [...causeCounts.entries()]
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count);

  // 6. Compute per-run risk scores
  const sessionIds = listSessionIds(baseDir);
  const sessionEventsMap = new Map<string, DomainEvent[]>();
  for (const sid of sessionIds) {
    sessionEventsMap.set(sid, loadSessionEvents(sid, baseDir));
  }
  const runRiskScores = computeAllRunRiskScores(sessionEventsMap);

  // 7. Failure analysis (superset of violations — includes execution errors, escalations, etc.)
  const failureAnalysis = buildFailureAnalysis(baseDir, minClusterSize, trendWindowMs);

  return {
    generatedAt: Date.now(),
    sessionsAnalyzed: sessionCount,
    totalViolations: violations.length,
    violationsByKind,
    clusters,
    trends,
    topInferredCauses,
    runRiskScores,
    failureAnalysis,
  };
}

/** Run failure analysis across all sessions */
function buildFailureAnalysis(
  baseDir: string,
  minClusterSize: number,
  trendWindowMs: number
): FailureAnalysis {
  const { failures, allEvents } = aggregateFailures(baseDir);

  // Count by kind
  const failuresByKind: Record<string, number> = {};
  for (const f of failures) {
    failuresByKind[f.kind] = (failuresByKind[f.kind] ?? 0) + 1;
  }

  // Count by category
  const failuresByCategory: Partial<Record<FailureCategory, number>> = {};
  for (const f of failures) {
    const cat = categorizeFailure(f.kind);
    failuresByCategory[cat] = (failuresByCategory[cat] ?? 0) + 1;
  }

  // Cluster failures using failure-specific dimensions (category, errorPattern, etc.)
  const failureClusters = clusterFailures(failures, minClusterSize);

  // Compute raw failure count trends
  const failureTrends = computeAllTrends(failures, trendWindowMs);

  // Compute failure rate trends (failures / total actions ratio over time)
  const rateTrends = computeFailureRateTrends(failures, allEvents, trendWindowMs);

  // Extract top patterns with categories
  const patternMap = new Map<string, { count: number; category: FailureCategory }>();
  for (const f of failures) {
    const pattern = f.actionType ? `${f.kind}:${f.actionType}` : f.kind;
    const existing = patternMap.get(pattern);
    if (existing) {
      existing.count += 1;
    } else {
      patternMap.set(pattern, { count: 1, category: categorizeFailure(f.kind) });
    }
  }

  const topPatterns: FailurePattern[] = [...patternMap.entries()]
    .map(([pattern, { count, category }]) => ({ pattern, count, category }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    totalFailures: failures.length,
    failuresByKind,
    failuresByCategory,
    clusters: failureClusters,
    trends: failureTrends,
    rateTrends,
    topPatterns,
  };
}

/** Compute risk scores for sessions without full analytics */
export function analyzeRisk(options: AnalyticsOptions = {}): RunRiskScore[] {
  const baseDir = options.baseDir ?? '.agentguard';
  const sessionIds = listSessionIds(baseDir);
  const sessionEventsMap = new Map<string, ReturnType<typeof loadSessionEvents>>();
  for (const sid of sessionIds) {
    sessionEventsMap.set(sid, loadSessionEvents(sid, baseDir));
  }
  return computeAllRunRiskScores(sessionEventsMap);
}
