// Analytics module re-exports

export { analyze, analyzeRisk } from './engine.js';
export {
  aggregateViolations,
  aggregateFailures,
  categorizeFailure,
  listSessionIds,
  loadSessionEvents,
} from './aggregator.js';
export {
  clusterViolations,
  clusterByDimension,
  clusterFailures,
  normalizeErrorPattern,
} from './cluster.js';
export { computeRunRiskScore, computeAllRunRiskScores } from './risk-scorer.js';
export { computeAllTrends, computeTrends, computeFailureRateTrends } from './trends.js';
export { toMarkdown, toJson, toTerminal } from './reporter.js';
export {
  generateSuggestions,
  toYaml as toYamlSuggestions,
  toJsonSuggestions,
  toTerminalSuggestions,
  toMarkdownSuggestions,
} from './suggest.js';
export type { PolicySuggestion, SuggestionEvidence, SuggestionReport } from './suggest.js';
export type {
  ViolationRecord,
  ViolationCluster,
  ViolationTrend,
  FailureRateTrend,
  AnalyticsReport,
  AnalyticsOptions,
  ClusterDimension,
  TrendDirection,
  TimeBucket,
  RiskFactor,
  RiskLevel,
  RunRiskScore,
  FailureCategory,
  FailurePattern,
  FailureAnalysis,
} from './types.js';
