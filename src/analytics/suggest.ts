// Policy suggestion engine — converts violation clusters and analytics data
// into actionable YAML-compatible policy rule suggestions.
//
// Analyzes cross-session violation patterns to generate context-aware policy
// rules, bridging the gap between raw analytics and manual policy authoring.

import type {
  ViolationCluster,
  ViolationRecord,
  AnalyticsReport,
  ViolationTrend,
} from './types.js';

/** A suggested policy rule derived from violation patterns */
export interface PolicySuggestion {
  readonly action: string;
  readonly effect: 'deny' | 'allow';
  readonly target?: string;
  readonly branches?: string[];
  readonly reason: string;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly evidence: SuggestionEvidence;
}

/** Evidence backing a policy suggestion */
export interface SuggestionEvidence {
  readonly violationCount: number;
  readonly sessionCount: number;
  readonly clusterDimension: string;
  readonly clusterKey: string;
  readonly trend?: string;
  readonly firstSeen: number;
  readonly lastSeen: number;
}

/** Full suggestion report */
export interface SuggestionReport {
  readonly generatedAt: number;
  readonly sessionsAnalyzed: number;
  readonly totalViolations: number;
  readonly suggestions: readonly PolicySuggestion[];
}

/** Confidence thresholds */
const HIGH_CONFIDENCE_VIOLATIONS = 10;
const MEDIUM_CONFIDENCE_VIOLATIONS = 3;
const HIGH_CONFIDENCE_SESSIONS = 3;

/**
 * Generate policy suggestions from an analytics report.
 * Analyzes violation clusters and trends to produce actionable policy rules.
 */
export function generateSuggestions(report: AnalyticsReport): SuggestionReport {
  const suggestions: PolicySuggestion[] = [];
  const seen = new Set<string>();

  for (const cluster of report.clusters) {
    const suggestion = clusterToSuggestion(cluster, report.trends);
    if (!suggestion) continue;

    // Deduplicate by action + target + effect
    const key = `${suggestion.action}:${suggestion.target ?? '*'}:${suggestion.effect}`;
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push(suggestion);
  }

  // Sort by confidence then violation count
  const sorted = [...suggestions].sort((a, b) => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    const confDiff = confOrder[a.confidence] - confOrder[b.confidence];
    if (confDiff !== 0) return confDiff;
    return b.evidence.violationCount - a.evidence.violationCount;
  });

  return {
    generatedAt: Date.now(),
    sessionsAnalyzed: report.sessionsAnalyzed,
    totalViolations: report.totalViolations,
    suggestions: sorted,
  };
}

/** Convert a violation cluster into a policy suggestion (if applicable) */
function clusterToSuggestion(
  cluster: ViolationCluster,
  trends: readonly ViolationTrend[]
): PolicySuggestion | null {
  const confidence = computeConfidence(cluster);
  const trend = findTrend(cluster, trends);
  const evidence: SuggestionEvidence = {
    violationCount: cluster.count,
    sessionCount: cluster.sessionCount,
    clusterDimension: cluster.groupBy,
    clusterKey: cluster.key,
    trend: trend?.direction,
    firstSeen: cluster.firstSeen,
    lastSeen: cluster.lastSeen,
  };

  switch (cluster.groupBy) {
    case 'actionType':
      return actionTypeSuggestion(cluster, confidence, evidence);
    case 'target':
      return targetSuggestion(cluster, confidence, evidence);
    case 'invariant':
      return invariantSuggestion(cluster, confidence, evidence);
    default:
      return null;
  }
}

/** Generate a suggestion from an action-type cluster */
function actionTypeSuggestion(
  cluster: ViolationCluster,
  confidence: PolicySuggestion['confidence'],
  evidence: SuggestionEvidence
): PolicySuggestion | null {
  const actionType = cluster.key;
  if (!actionType) return null;

  // Check if violations are all denials (suggesting the action should be blocked)
  const denialKinds = new Set(['PolicyDenied', 'ActionDenied', 'UnauthorizedAction']);
  const denialCount = cluster.violations.filter((v) => denialKinds.has(v.kind)).length;
  const denialRatio = denialCount / cluster.count;

  if (denialRatio < 0.5) return null;

  // Check for branch-specific patterns
  const branches = extractBranchPatterns(cluster.violations);

  return {
    action: actionType,
    effect: 'deny',
    branches: branches.length > 0 ? branches : undefined,
    reason: buildReason(cluster),
    confidence,
    evidence,
  };
}

/** Generate a suggestion from a target cluster */
function targetSuggestion(
  cluster: ViolationCluster,
  confidence: PolicySuggestion['confidence'],
  evidence: SuggestionEvidence
): PolicySuggestion | null {
  const target = cluster.key;
  if (!target) return null;

  // Determine the most common action type for this target
  const actionCounts = new Map<string, number>();
  for (const v of cluster.violations) {
    if (v.actionType) {
      actionCounts.set(v.actionType, (actionCounts.get(v.actionType) ?? 0) + 1);
    }
  }

  let topAction = 'file.write';
  let topCount = 0;
  for (const [action, count] of actionCounts) {
    if (count > topCount) {
      topAction = action;
      topCount = count;
    }
  }

  return {
    action: topAction,
    effect: 'deny',
    target: normalizeTarget(target),
    reason: `Target "${target}" caused ${cluster.count} violation(s) across ${cluster.sessionCount} session(s)`,
    confidence,
    evidence,
  };
}

/** Generate a suggestion from an invariant cluster */
function invariantSuggestion(
  cluster: ViolationCluster,
  confidence: PolicySuggestion['confidence'],
  evidence: SuggestionEvidence
): PolicySuggestion | null {
  const invariantId = cluster.key;
  if (!invariantId) return null;

  const mapping = invariantToPolicyMapping(invariantId, cluster.violations);
  if (!mapping) return null;

  return {
    ...mapping,
    confidence,
    evidence,
  };
}

/** Map an invariant ID to a suggested policy rule */
function invariantToPolicyMapping(
  invariantId: string,
  violations: readonly ViolationRecord[]
): Omit<PolicySuggestion, 'confidence' | 'evidence'> | null {
  switch (invariantId) {
    case 'secret-exposure':
      return {
        action: 'file.write',
        effect: 'deny',
        target: '.env',
        reason: 'Repeated secret exposure violations — block writes to sensitive files',
      };

    case 'protected-branches': {
      const branches = extractBranchPatterns(violations);
      return {
        action: 'git.push',
        effect: 'deny',
        branches: branches.length > 0 ? branches : ['main', 'master'],
        reason: 'Repeated protected branch violations — block direct pushes',
      };
    }

    case 'no-force-push':
      return {
        action: 'git.force-push',
        effect: 'deny',
        reason: 'Repeated force push attempts — block force pushes to prevent history rewriting',
      };

    case 'blast-radius':
      return {
        action: 'file.write',
        effect: 'deny',
        reason:
          'Repeated blast radius violations — consider adding scope restrictions or file count limits',
      };

    case 'lockfile-integrity':
      return {
        action: 'file.write',
        effect: 'deny',
        target: 'package-lock.json',
        reason: 'Repeated lockfile integrity violations — block direct lockfile modifications',
      };

    case 'no-skill-modification':
      return {
        action: 'file.write',
        effect: 'deny',
        target: '.claude/skills/',
        reason: 'Repeated skill modification attempts — protect agent skill files',
      };

    case 'no-scheduled-task-modification':
      return {
        action: 'file.write',
        effect: 'deny',
        target: '.claude/scheduled-tasks/',
        reason: 'Repeated scheduled task modification attempts — protect scheduled task files',
      };

    case 'credential-file-creation':
      return {
        action: 'file.write',
        effect: 'deny',
        target: '.npmrc',
        reason: 'Repeated credential file creation attempts — block credential file writes',
      };

    default:
      return null;
  }
}

/** Extract branch names from violation metadata */
function extractBranchPatterns(violations: readonly ViolationRecord[]): string[] {
  const branches = new Set<string>();
  for (const v of violations) {
    const branch =
      (v.metadata?.branch as string) ??
      (v.metadata?.targetBranch as string) ??
      extractBranchFromTarget(v.target);
    if (branch) branches.add(branch);
  }
  return [...branches].sort();
}

/** Try to extract a branch name from a target string */
function extractBranchFromTarget(target?: string): string | null {
  if (!target) return null;
  const match = target.match(/(?:origin\/)?(\w+)$/);
  if (match && ['main', 'master', 'develop', 'release'].includes(match[1])) {
    return match[1];
  }
  return null;
}

/** Normalize a target path for policy rules */
function normalizeTarget(target: string): string {
  // Strip leading ./ or absolute paths to just the relative portion
  let normalized = target.replace(/^\.\//, '');

  // If it looks like a full path, try to extract the filename/directory
  if (normalized.includes('/') || normalized.includes('\\')) {
    const parts = normalized.split(/[/\\]/);
    // Use last meaningful segment
    const meaningful = parts.filter((p) => p && p !== '.' && p !== '..');
    if (meaningful.length > 0) {
      normalized = meaningful.join('/');
    }
  }

  return normalized;
}

/** Compute confidence level based on violation count and session spread */
function computeConfidence(cluster: ViolationCluster): PolicySuggestion['confidence'] {
  if (
    cluster.count >= HIGH_CONFIDENCE_VIOLATIONS &&
    cluster.sessionCount >= HIGH_CONFIDENCE_SESSIONS
  ) {
    return 'high';
  }
  if (cluster.count >= MEDIUM_CONFIDENCE_VIOLATIONS) {
    return 'medium';
  }
  return 'low';
}

/** Find a matching trend for a cluster */
function findTrend(
  cluster: ViolationCluster,
  trends: readonly ViolationTrend[]
): ViolationTrend | undefined {
  return trends.find((t) => t.dimension === cluster.groupBy && t.key === cluster.key);
}

/** Build a human-readable reason from a cluster */
function buildReason(cluster: ViolationCluster): string {
  const base = cluster.inferredCause ?? `${cluster.label} — ${cluster.count} violations detected`;
  if (cluster.sessionCount > 1) {
    return `${base} (across ${cluster.sessionCount} sessions)`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

/** Format suggestions as YAML policy rules */
export function toYaml(report: SuggestionReport): string {
  if (report.suggestions.length === 0) {
    return '# No policy suggestions — no recurring violation patterns detected.\n';
  }

  const lines: string[] = [
    '# Suggested policy rules based on violation pattern analysis',
    `# Generated: ${new Date(report.generatedAt).toISOString()}`,
    `# Sessions analyzed: ${report.sessionsAnalyzed}`,
    `# Total violations: ${report.totalViolations}`,
    '',
    'rules:',
  ];

  for (const s of report.suggestions) {
    lines.push(
      `  # [${s.confidence} confidence] ${s.evidence.violationCount} violations across ${s.evidence.sessionCount} session(s)`
    );
    if (s.evidence.trend) {
      lines.push(`  # Trend: ${s.evidence.trend}`);
    }
    lines.push(`  - action: ${s.action}`);
    lines.push(`    effect: ${s.effect}`);
    if (s.target) {
      lines.push(`    target: "${s.target}"`);
    }
    if (s.branches && s.branches.length > 0) {
      lines.push(`    branches: [${s.branches.join(', ')}]`);
    }
    lines.push(`    reason: ${s.reason}`);
    lines.push('');
  }

  return lines.join('\n');
}

/** Format suggestions as JSON */
export function toJsonSuggestions(report: SuggestionReport): string {
  return JSON.stringify(report, null, 2);
}

/** Format suggestions as terminal output */
export function toTerminalSuggestions(report: SuggestionReport): string {
  if (report.suggestions.length === 0) {
    return '\n  No policy suggestions — no recurring violation patterns detected.\n\n';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('  \x1b[1mPolicy Suggestions\x1b[0m');
  lines.push(
    `  \x1b[2mBased on ${report.totalViolations} violations across ${report.sessionsAnalyzed} sessions\x1b[0m`
  );
  lines.push('');

  for (let i = 0; i < report.suggestions.length; i++) {
    const s = report.suggestions[i];
    const confColor = s.confidence === 'high' ? '31' : s.confidence === 'medium' ? '33' : '2';
    const confLabel = `\x1b[${confColor}m${s.confidence.toUpperCase()}\x1b[0m`;
    const trendLabel = s.evidence.trend ? ` \x1b[2m(${s.evidence.trend})\x1b[0m` : '';

    lines.push(`  \x1b[1m${i + 1}.\x1b[0m ${s.action} → ${s.effect} [${confLabel}]${trendLabel}`);
    if (s.target) {
      lines.push(`     Target: ${s.target}`);
    }
    if (s.branches) {
      lines.push(`     Branches: ${s.branches.join(', ')}`);
    }
    lines.push(`     Reason: ${s.reason}`);
    lines.push(
      `     Evidence: ${s.evidence.violationCount} violations, ${s.evidence.sessionCount} sessions`
    );
    lines.push('');
  }

  return lines.join('\n');
}

/** Format suggestions as markdown */
export function toMarkdownSuggestions(report: SuggestionReport): string {
  if (report.suggestions.length === 0) {
    return '## Policy Suggestions\n\nNo recurring violation patterns detected.\n';
  }

  const lines: string[] = [
    '## Policy Suggestions',
    '',
    `Based on **${report.totalViolations}** violations across **${report.sessionsAnalyzed}** sessions.`,
    '',
    '| # | Action | Effect | Target | Confidence | Violations | Sessions |',
    '|---|--------|--------|--------|------------|------------|----------|',
  ];

  for (let i = 0; i < report.suggestions.length; i++) {
    const s = report.suggestions[i];
    const target = s.target ?? '—';
    lines.push(
      `| ${i + 1} | \`${s.action}\` | ${s.effect} | ${target} | ${s.confidence} | ${s.evidence.violationCount} | ${s.evidence.sessionCount} |`
    );
  }

  lines.push('');
  lines.push('### Suggested YAML Rules');
  lines.push('');
  lines.push('```yaml');
  lines.push('rules:');

  for (const s of report.suggestions) {
    lines.push(`  - action: ${s.action}`);
    lines.push(`    effect: ${s.effect}`);
    if (s.target) {
      lines.push(`    target: "${s.target}"`);
    }
    if (s.branches && s.branches.length > 0) {
      lines.push(`    branches: [${s.branches.join(', ')}]`);
    }
    lines.push(`    reason: ${s.reason}`);
  }

  lines.push('```');
  lines.push('');

  return lines.join('\n');
}
