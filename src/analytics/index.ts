// Analytics module re-exports

export { analyze, analyzeRisk } from './engine.js';
export { aggregateViolations, listSessionIds, loadSessionEvents } from './aggregator.js';
export { clusterViolations, clusterByDimension } from './cluster.js';
export { computeRunRiskScore, computeAllRunRiskScores } from './risk-scorer.js';
export { computeAllTrends, computeTrends } from './trends.js';
export { toMarkdown, toJson, toTerminal } from './reporter.js';
export type {
  ViolationRecord,
  ViolationCluster,
  ViolationTrend,
  AnalyticsReport,
  AnalyticsOptions,
  ClusterDimension,
  TrendDirection,
  TimeBucket,
  RiskFactor,
  RiskLevel,
  RunRiskScore,
} from './types.js';
