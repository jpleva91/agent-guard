// Analytics type definitions for cross-session violation pattern detection.
// Pure data types — no runtime dependencies.

import type { EventKind } from '@red-codes/core';

/** A violation event extracted from a governance session */
export interface ViolationRecord {
  readonly sessionId: string;
  readonly eventId: string;
  readonly kind: EventKind;
  readonly timestamp: number;
  readonly actionType?: string;
  readonly target?: string;
  readonly reason?: string;
  readonly invariantId?: string;
  readonly metadata?: Record<string, unknown>;
}

/** A cluster of related violations grouped by shared attributes */
export interface ViolationCluster {
  readonly id: string;
  readonly label: string;
  readonly groupBy: ClusterDimension;
  readonly key: string;
  readonly violations: readonly ViolationRecord[];
  readonly count: number;
  readonly firstSeen: number;
  readonly lastSeen: number;
  readonly sessionCount: number;
  readonly inferredCause?: string;
}

/** Dimension used to cluster violations */
export type ClusterDimension =
  | 'actionType'
  | 'target'
  | 'invariant'
  | 'kind'
  | 'reason'
  | 'category'
  | 'errorPattern';

/** Trend direction for a violation pattern */
export type TrendDirection = 'increasing' | 'decreasing' | 'stable' | 'new' | 'resolved';

/** Trend analysis for a violation pattern */
export interface ViolationTrend {
  readonly key: string;
  readonly dimension: ClusterDimension;
  readonly direction: TrendDirection;
  readonly recentCount: number;
  readonly previousCount: number;
  readonly changePercent: number;
}

/** Time bucket for trend computation */
export interface TimeBucket {
  readonly start: number;
  readonly end: number;
  readonly count: number;
}

/** Full analytics report for cross-session violation analysis */
export interface AnalyticsReport {
  readonly generatedAt: number;
  readonly sessionsAnalyzed: number;
  readonly totalViolations: number;
  readonly violationsByKind: Record<string, number>;
  readonly clusters: readonly ViolationCluster[];
  readonly trends: readonly ViolationTrend[];
  readonly topInferredCauses: readonly { cause: string; count: number }[];
  readonly runRiskScores: readonly RunRiskScore[];
  readonly failureAnalysis?: FailureAnalysis;
}

/** Category of a failure event for grouping in failure analysis */
export type FailureCategory = 'denial' | 'violation' | 'execution' | 'escalation' | 'pipeline';

/** A top failure pattern with category context */
export interface FailurePattern {
  readonly pattern: string;
  readonly count: number;
  readonly category: FailureCategory;
}

/** Cross-session failure analysis (superset of violations — includes execution errors,
 *  escalations, and pipeline failures) */
export interface FailureAnalysis {
  readonly totalFailures: number;
  readonly failuresByKind: Record<string, number>;
  readonly failuresByCategory: Partial<Record<FailureCategory, number>>;
  readonly clusters: readonly ViolationCluster[];
  readonly trends: readonly ViolationTrend[];
  readonly rateTrends: readonly FailureRateTrend[];
  readonly topPatterns: readonly FailurePattern[];
}

/** A factor contributing to a session's aggregate risk score */
export interface RiskFactor {
  readonly dimension: 'violations' | 'escalation' | 'blastRadius' | 'operations';
  readonly rawValue: number;
  readonly normalizedScore: number;
  readonly weight: number;
  readonly details: string;
}

/** Risk level derived from the aggregate risk score */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Aggregate risk score for a single governance session */
export interface RunRiskScore {
  readonly sessionId: string;
  readonly score: number;
  readonly riskLevel: RiskLevel;
  readonly factors: readonly RiskFactor[];
  readonly totalActions: number;
  readonly totalDenials: number;
  readonly totalViolations: number;
  readonly peakEscalation: number;
}

/** Failure rate trend — tracks how the ratio of failures to total actions changes over time */
export interface FailureRateTrend {
  readonly key: string;
  readonly dimension: ClusterDimension;
  readonly recentRate: number;
  readonly previousRate: number;
  readonly recentFailures: number;
  readonly recentTotal: number;
  readonly previousFailures: number;
  readonly previousTotal: number;
  readonly direction: TrendDirection;
  readonly changePercent: number;
}

/** Options for the analytics engine */
export interface AnalyticsOptions {
  readonly baseDir?: string;
  readonly minClusterSize?: number;
  readonly trendWindowMs?: number;
}
