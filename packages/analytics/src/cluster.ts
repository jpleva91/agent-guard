// Violation clustering — groups related violations by shared attributes
// and infers likely root causes for recurring patterns.

import { simpleHash } from '@red-codes/core';
import type {
  ViolationRecord,
  ViolationCluster,
  ClusterDimension,
  FailureCategory,
} from './types.js';
import { categorizeFailure } from './aggregator.js';

const DEFAULT_MIN_CLUSTER_SIZE = 2;

/** Extract the grouping key for a violation along a given dimension */
function extractKey(violation: ViolationRecord, dimension: ClusterDimension): string | null {
  switch (dimension) {
    case 'actionType':
      return violation.actionType ?? null;
    case 'target':
      return violation.target ?? null;
    case 'invariant':
      return violation.invariantId ?? null;
    case 'kind':
      return violation.kind;
    case 'reason':
      return violation.reason ?? null;
    case 'category':
      return categorizeFailure(violation.kind);
    case 'errorPattern':
      return normalizeErrorPattern(violation.reason ?? null);
    default:
      return null;
  }
}

/**
 * Normalize an error message into a pattern by stripping variable parts.
 * Replaces file paths, numbers, and UUIDs with placeholders so similar errors cluster together.
 */
export function normalizeErrorPattern(message: string | null): string | null {
  if (!message) return null;

  let pattern = message;

  // Replace file paths (Unix and Windows) with <path>
  pattern = pattern.replace(/(?:\/[\w./-]+|[A-Z]:\\[\w.\\-]+)/g, '<path>');

  // Replace UUIDs with <uuid>
  pattern = pattern.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '<uuid>'
  );

  // Replace hex hashes (7+ chars) with <hash>
  pattern = pattern.replace(/\b[0-9a-f]{7,40}\b/gi, '<hash>');

  // Replace numbers with <N> (digits that may be adjacent to units like ms, KB, etc.)
  pattern = pattern.replace(/\d+/g, '<N>');

  // Collapse whitespace
  pattern = pattern.replace(/\s+/g, ' ').trim();

  // Truncate to prevent very long patterns
  if (pattern.length > 120) {
    pattern = pattern.slice(0, 117) + '...';
  }

  return pattern;
}

/** Generate a human-readable label for a cluster */
function clusterLabel(dimension: ClusterDimension, key: string): string {
  switch (dimension) {
    case 'actionType':
      return `Action: ${key}`;
    case 'target':
      return `Target: ${key}`;
    case 'invariant':
      return `Invariant: ${key}`;
    case 'kind':
      return `Event: ${key}`;
    case 'reason':
      return `Reason: ${key}`;
    case 'category':
      return `Category: ${key}`;
    case 'errorPattern':
      return `Error: ${key}`;
    default:
      return key;
  }
}

/** Infer a likely root cause for a cluster based on its characteristics */
function inferCause(
  dimension: ClusterDimension,
  key: string,
  violations: readonly ViolationRecord[]
): string | undefined {
  const sessionCount = new Set(violations.map((v) => v.sessionId)).size;
  const kinds = new Set(violations.map((v) => v.kind));

  if (dimension === 'invariant') {
    if (key === 'secret-exposure') {
      return 'Sensitive files are being targeted — review .gitignore and policy scope rules';
    }
    if (key === 'protected-branches') {
      return 'Agent frequently attempts direct pushes to protected branches';
    }
    if (key === 'blast-radius') {
      return 'Actions affect too many files — consider scoping agent actions or raising the threshold';
    }
    if (key === 'test-before-push') {
      return 'Pushes attempted before tests pass — enforce test-first workflow';
    }
    if (key === 'no-force-push') {
      return 'Force push attempts detected — agent may need git workflow guidance';
    }
    if (key === 'lockfile-integrity') {
      return 'Lockfile modifications outside npm install — check for manual edits';
    }
    return `Invariant "${key}" violated ${violations.length} times across ${sessionCount} session(s)`;
  }

  if (dimension === 'actionType') {
    if (kinds.has('PolicyDenied')) {
      return `Action "${key}" is repeatedly denied by policy — consider updating policy or agent instructions`;
    }
    return `Action "${key}" triggers violations frequently — review authorization rules`;
  }

  if (dimension === 'target') {
    if (sessionCount > 1) {
      return `File "${key}" is a repeated violation target across ${sessionCount} sessions`;
    }
    return `File "${key}" triggered ${violations.length} violations in a single session`;
  }

  if (dimension === 'kind' && key === 'ActionDenied') {
    const reasons = [...new Set(violations.map((v) => v.reason).filter(Boolean))];
    if (reasons.length === 1) {
      return `All denials share the same reason: ${reasons[0]}`;
    }
  }

  if (dimension === 'category') {
    const categoryLabels: Record<FailureCategory, string> = {
      denial: 'Policy or authorization denials — review policy rules and agent permissions',
      violation: 'Invariant violations — review invariant definitions and agent behavior',
      execution: 'Execution failures — check command reliability and error handling',
      escalation: 'Escalation events — agent actions repeatedly trigger elevated governance',
      pipeline: 'Pipeline failures — review stage definitions and dependencies',
    };
    return categoryLabels[key as FailureCategory] ?? undefined;
  }

  if (dimension === 'errorPattern') {
    return `Recurring error pattern across ${sessionCount} session(s): ${key}`;
  }

  return undefined;
}

/** Cluster violations along a single dimension */
export function clusterByDimension(
  violations: readonly ViolationRecord[],
  dimension: ClusterDimension,
  minSize = DEFAULT_MIN_CLUSTER_SIZE
): ViolationCluster[] {
  const groups = new Map<string, ViolationRecord[]>();

  for (const v of violations) {
    const key = extractKey(v, dimension);
    if (key === null) continue;

    const group = groups.get(key);
    if (group) {
      group.push(v);
    } else {
      groups.set(key, [v]);
    }
  }

  const clusters: ViolationCluster[] = [];

  for (const [key, group] of groups) {
    if (group.length < minSize) continue;

    const timestamps = group.map((v) => v.timestamp);
    const sessionIds = new Set(group.map((v) => v.sessionId));

    clusters.push({
      id: simpleHash(`${dimension}:${key}`),
      label: clusterLabel(dimension, key),
      groupBy: dimension,
      key,
      violations: group,
      count: group.length,
      firstSeen: Math.min(...timestamps),
      lastSeen: Math.max(...timestamps),
      sessionCount: sessionIds.size,
      inferredCause: inferCause(dimension, key, group),
    });
  }

  return clusters.sort((a, b) => b.count - a.count);
}

/** Cluster violations across all dimensions and return deduplicated results */
export function clusterViolations(
  violations: readonly ViolationRecord[],
  minSize = DEFAULT_MIN_CLUSTER_SIZE
): ViolationCluster[] {
  const dimensions: ClusterDimension[] = ['invariant', 'actionType', 'target', 'kind', 'reason'];
  const allClusters: ViolationCluster[] = [];

  for (const dim of dimensions) {
    allClusters.push(...clusterByDimension(violations, dim, minSize));
  }

  return allClusters.sort((a, b) => b.count - a.count);
}

/**
 * Cluster failures using failure-specific dimensions (category + error pattern)
 * in addition to the standard dimensions. This provides richer grouping for
 * execution errors, escalations, and pipeline failures.
 */
export function clusterFailures(
  failures: readonly ViolationRecord[],
  minSize = DEFAULT_MIN_CLUSTER_SIZE
): ViolationCluster[] {
  const dimensions: ClusterDimension[] = [
    'category',
    'errorPattern',
    'actionType',
    'target',
    'kind',
    'reason',
  ];
  const allClusters: ViolationCluster[] = [];

  for (const dim of dimensions) {
    allClusters.push(...clusterByDimension(failures, dim, minSize));
  }

  return allClusters.sort((a, b) => b.count - a.count);
}
