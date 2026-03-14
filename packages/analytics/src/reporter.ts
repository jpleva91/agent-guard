// Report generation — formats analytics results as markdown, JSON, or terminal output.

import type {
  AnalyticsReport,
  FailureAnalysis,
  RunRiskScore,
  ViolationCluster,
  ViolationTrend,
} from './types.js';

/** Format a timestamp as an ISO date string */
function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Trend direction indicator */
function trendIndicator(direction: string): string {
  switch (direction) {
    case 'increasing':
      return '\u2191'; // ↑
    case 'decreasing':
      return '\u2193'; // ↓
    case 'new':
      return '\u2605'; // ★
    case 'resolved':
      return '\u2713'; // ✓
    default:
      return '\u2192'; // →
  }
}

/** Generate a markdown report */
export function toMarkdown(report: AnalyticsReport): string {
  const lines: string[] = [];

  lines.push('# Violation Pattern Analysis');
  lines.push('');
  lines.push(`Generated: ${new Date(report.generatedAt).toISOString()}`);
  lines.push(`Sessions analyzed: ${report.sessionsAnalyzed}`);
  lines.push(`Total violations: ${report.totalViolations}`);
  lines.push('');

  // Violations by kind
  lines.push('## Violations by Kind');
  lines.push('');
  lines.push('| Kind | Count |');
  lines.push('|------|-------|');
  for (const [kind, count] of Object.entries(report.violationsByKind)) {
    lines.push(`| ${kind} | ${count} |`);
  }
  lines.push('');

  // Clusters
  if (report.clusters.length > 0) {
    lines.push('## Violation Clusters');
    lines.push('');
    for (const cluster of report.clusters.slice(0, 20)) {
      lines.push(`### ${cluster.label}`);
      lines.push('');
      lines.push(`- **Count**: ${cluster.count}`);
      lines.push(`- **Sessions**: ${cluster.sessionCount}`);
      lines.push(`- **First seen**: ${formatDate(cluster.firstSeen)}`);
      lines.push(`- **Last seen**: ${formatDate(cluster.lastSeen)}`);
      if (cluster.inferredCause) {
        lines.push(`- **Likely cause**: ${cluster.inferredCause}`);
      }
      lines.push('');
    }
  }

  // Trends
  if (report.trends.length > 0) {
    lines.push('## Trends');
    lines.push('');
    lines.push('| Pattern | Direction | Recent | Previous | Change |');
    lines.push('|---------|-----------|--------|----------|--------|');
    for (const trend of report.trends.slice(0, 20)) {
      const dir = `${trendIndicator(trend.direction)} ${trend.direction}`;
      const change =
        trend.changePercent > 0 ? `+${trend.changePercent}%` : `${trend.changePercent}%`;
      lines.push(
        `| ${trend.key} (${trend.dimension}) | ${dir} | ${trend.recentCount} | ${trend.previousCount} | ${change} |`
      );
    }
    lines.push('');
  }

  // Inferred causes
  if (report.topInferredCauses.length > 0) {
    lines.push('## Top Inferred Causes');
    lines.push('');
    for (const { cause, count } of report.topInferredCauses) {
      lines.push(`- **${count}x**: ${cause}`);
    }
    lines.push('');
  }

  // Risk scores
  if (report.runRiskScores.length > 0) {
    lines.push('## Run Risk Scores');
    lines.push('');
    lines.push('| Session | Score | Level | Actions | Denials | Violations | Escalation |');
    lines.push('|---------|-------|-------|---------|---------|------------|------------|');
    for (const rs of report.runRiskScores.slice(0, 20)) {
      const esc = ['NORMAL', 'ELEVATED', 'HIGH', 'LOCKDOWN'][rs.peakEscalation];
      lines.push(
        `| ${rs.sessionId.slice(0, 12)} | ${rs.score} | ${rs.riskLevel} | ${rs.totalActions} | ${rs.totalDenials} | ${rs.totalViolations} | ${esc} |`
      );
    }
    lines.push('');
  }

  // Failure analysis
  if (report.failureAnalysis) {
    appendFailureAnalysisMarkdown(lines, report.failureAnalysis);
  }

  return lines.join('\n');
}

/** Append failure analysis section to markdown lines */
function appendFailureAnalysisMarkdown(lines: string[], fa: FailureAnalysis): void {
  lines.push('## Failure Analysis');
  lines.push('');
  lines.push(`Total failures: ${fa.totalFailures}`);
  lines.push('');

  if (Object.keys(fa.failuresByCategory).length > 0) {
    lines.push('### Failures by Category');
    lines.push('');
    lines.push('| Category | Count |');
    lines.push('|----------|-------|');
    for (const [category, count] of Object.entries(fa.failuresByCategory)) {
      lines.push(`| ${category} | ${count} |`);
    }
    lines.push('');
  }

  if (fa.topPatterns.length > 0) {
    lines.push('### Top Failure Patterns');
    lines.push('');
    lines.push('| Pattern | Category | Count |');
    lines.push('|---------|----------|-------|');
    for (const { pattern, category, count } of fa.topPatterns.slice(0, 20)) {
      lines.push(`| ${pattern} | ${category} | ${count} |`);
    }
    lines.push('');
  }

  if (fa.trends.length > 0) {
    lines.push('### Failure Trends');
    lines.push('');
    lines.push('| Pattern | Direction | Recent | Previous | Change |');
    lines.push('|---------|-----------|--------|----------|--------|');
    for (const trend of fa.trends.slice(0, 20)) {
      const dir = `${trendIndicator(trend.direction)} ${trend.direction}`;
      const change =
        trend.changePercent > 0 ? `+${trend.changePercent}%` : `${trend.changePercent}%`;
      lines.push(
        `| ${trend.key} (${trend.dimension}) | ${dir} | ${trend.recentCount} | ${trend.previousCount} | ${change} |`
      );
    }
    lines.push('');
  }

  if (fa.rateTrends.length > 0) {
    lines.push('### Failure Rate Trends');
    lines.push('');
    lines.push('| Action | Direction | Recent Rate | Previous Rate | Change |');
    lines.push('|--------|-----------|-------------|---------------|--------|');
    for (const rt of fa.rateTrends.slice(0, 20)) {
      const dir = `${trendIndicator(rt.direction)} ${rt.direction}`;
      const change = rt.changePercent > 0 ? `+${rt.changePercent}%` : `${rt.changePercent}%`;
      const recentPct = `${(rt.recentRate * 100).toFixed(1)}% (${rt.recentFailures}/${rt.recentTotal})`;
      const prevPct = `${(rt.previousRate * 100).toFixed(1)}% (${rt.previousFailures}/${rt.previousTotal})`;
      lines.push(`| ${rt.key} | ${dir} | ${recentPct} | ${prevPct} | ${change} |`);
    }
    lines.push('');
  }
}

/** Generate a JSON report */
export function toJson(report: AnalyticsReport): string {
  return JSON.stringify(report, null, 2);
}

/** Format a cluster for terminal display */
function formatClusterForTerminal(cluster: ViolationCluster, index: number): string {
  const lines: string[] = [];
  const num = `${index + 1}.`.padStart(4);
  lines.push(
    `  ${num} ${cluster.label} (${cluster.count} violations, ${cluster.sessionCount} session(s))`
  );
  lines.push(
    `       First: ${formatDate(cluster.firstSeen)}  Last: ${formatDate(cluster.lastSeen)}`
  );
  if (cluster.inferredCause) {
    lines.push(`       Cause: ${cluster.inferredCause}`);
  }
  return lines.join('\n');
}

/** Format a trend for terminal display */
function formatTrendForTerminal(trend: ViolationTrend): string {
  const dir = trendIndicator(trend.direction);
  const change = trend.changePercent > 0 ? `+${trend.changePercent}%` : `${trend.changePercent}%`;
  return `  ${dir} ${trend.key} (${trend.dimension}): ${trend.recentCount} recent / ${trend.previousCount} previous (${change})`;
}

/** Risk level indicator */
function riskLevelIndicator(level: string): string {
  switch (level) {
    case 'critical':
      return '\u2718'; // ✘
    case 'high':
      return '\u26A0'; // ⚠
    case 'medium':
      return '\u25CF'; // ●
    default:
      return '\u2714'; // ✔
  }
}

/** Format a risk score for terminal display */
function formatRiskScoreForTerminal(rs: RunRiskScore): string {
  const indicator = riskLevelIndicator(rs.riskLevel);
  const esc = ['NORMAL', 'ELEVATED', 'HIGH', 'LOCKDOWN'][rs.peakEscalation];
  return `    ${indicator} ${rs.sessionId.slice(0, 12)}  score: ${rs.score}  level: ${rs.riskLevel}  escalation: ${esc}  (${rs.totalActions} actions, ${rs.totalDenials} denials)`;
}

/** Generate terminal output (no ANSI codes for portability) */
export function toTerminal(report: AnalyticsReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('  Violation Pattern Analysis');
  lines.push(`  ${'─'.repeat(50)}`);
  lines.push(`  Sessions: ${report.sessionsAnalyzed}  Violations: ${report.totalViolations}`);
  lines.push('');

  // By kind
  if (Object.keys(report.violationsByKind).length > 0) {
    lines.push('  Violations by Kind');
    for (const [kind, count] of Object.entries(report.violationsByKind)) {
      lines.push(`    ${kind}: ${count}`);
    }
    lines.push('');
  }

  // Clusters
  if (report.clusters.length > 0) {
    lines.push(`  Clusters (${report.clusters.length} found)`);
    lines.push(`  ${'─'.repeat(50)}`);
    for (let i = 0; i < Math.min(report.clusters.length, 10); i++) {
      lines.push(formatClusterForTerminal(report.clusters[i], i));
    }
    if (report.clusters.length > 10) {
      lines.push(`  ... and ${report.clusters.length - 10} more`);
    }
    lines.push('');
  }

  // Trends
  if (report.trends.length > 0) {
    lines.push('  Trends');
    lines.push(`  ${'─'.repeat(50)}`);
    for (const trend of report.trends.slice(0, 10)) {
      lines.push(formatTrendForTerminal(trend));
    }
    lines.push('');
  }

  // Inferred causes
  if (report.topInferredCauses.length > 0) {
    lines.push('  Top Inferred Causes');
    lines.push(`  ${'─'.repeat(50)}`);
    for (const { cause, count } of report.topInferredCauses.slice(0, 5)) {
      lines.push(`    [${count}x] ${cause}`);
    }
    lines.push('');
  }

  // Risk scores
  if (report.runRiskScores.length > 0) {
    lines.push('  Run Risk Scores');
    lines.push(`  ${'─'.repeat(50)}`);
    for (const rs of report.runRiskScores.slice(0, 10)) {
      lines.push(formatRiskScoreForTerminal(rs));
    }
    if (report.runRiskScores.length > 10) {
      lines.push(`  ... and ${report.runRiskScores.length - 10} more`);
    }
    lines.push('');
  }

  // Failure analysis
  if (report.failureAnalysis) {
    appendFailureAnalysisTerminal(lines, report.failureAnalysis);
  }

  return lines.join('\n');
}

/** Append failure analysis section to terminal lines */
function appendFailureAnalysisTerminal(lines: string[], fa: FailureAnalysis): void {
  lines.push(`  Failure Analysis (${fa.totalFailures} total)`);
  lines.push(`  ${'─'.repeat(50)}`);

  if (Object.keys(fa.failuresByCategory).length > 0) {
    for (const [category, count] of Object.entries(fa.failuresByCategory)) {
      lines.push(`    ${category}: ${count}`);
    }
    lines.push('');
  }

  if (fa.topPatterns.length > 0) {
    lines.push('  Top Failure Patterns');
    for (const { pattern, count, category } of fa.topPatterns.slice(0, 10)) {
      lines.push(`    [${count}x] ${pattern} (${category})`);
    }
    lines.push('');
  }

  if (fa.trends.length > 0) {
    lines.push('  Failure Trends');
    for (const trend of fa.trends.slice(0, 10)) {
      const dir = trendIndicator(trend.direction);
      const change =
        trend.changePercent > 0 ? `+${trend.changePercent}%` : `${trend.changePercent}%`;
      lines.push(
        `  ${dir} ${trend.key} (${trend.dimension}): ${trend.recentCount} recent / ${trend.previousCount} previous (${change})`
      );
    }
    lines.push('');
  }

  if (fa.rateTrends.length > 0) {
    lines.push('  Failure Rate Trends');
    for (const rt of fa.rateTrends.slice(0, 10)) {
      const dir = trendIndicator(rt.direction);
      const change = rt.changePercent > 0 ? `+${rt.changePercent}%` : `${rt.changePercent}%`;
      const recentPct = `${(rt.recentRate * 100).toFixed(1)}%`;
      const prevPct = `${(rt.previousRate * 100).toFixed(1)}%`;
      lines.push(`  ${dir} ${rt.key}: ${recentPct} recent / ${prevPct} previous (${change})`);
    }
    lines.push('');
  }
}
