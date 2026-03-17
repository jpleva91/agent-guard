// Intent specification and drift detection.
// Compares declared intent (what an agent should do) against observed execution
// (what the agent actually did). Advisory mode — flags drift without blocking.

import type { NormalizedIntent } from '@red-codes/policy';

/**
 * Declares what an agent is allowed to do during a session.
 * Actions outside this spec are flagged as intent drift (advisory).
 */
export interface IntentSpec {
  /** Glob patterns for allowed file paths (e.g., ['src/**', 'tests/**']) */
  allowedPaths?: string[];
  /** Allowed action types (e.g., ['file.read', 'file.write', 'test.run']) */
  allowedActions?: string[];
  /** Maximum number of files that may be modified in this session */
  maxFilesModified?: number;
  /** Description of the intended task (for audit trail context) */
  description?: string;
}

/** Classification of how an action drifts from declared intent */
export type DriftType = 'action-not-allowed' | 'path-outside-scope' | 'scope-limit-exceeded';

/** Result of comparing a single action against the IntentSpec */
export interface IntentDriftResult {
  /** Whether the action aligns with the declared intent */
  aligned: boolean;
  /** Drift details (empty if aligned) */
  drifts: Array<{
    driftType: DriftType;
    reason: string;
  }>;
}

/**
 * Match a file path against a glob-like pattern.
 * Supports `*` (single segment) and `**` (any depth).
 */
function matchPattern(pattern: string, filePath: string): boolean {
  // Normalize separators
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Convert glob to regex.
  // Order: protect glob wildcards first, escape all remaining regex special chars, then
  // restore wildcards as their regex equivalents. This prevents regex injection from
  // user-supplied patterns that contain characters like (, ), [, ], +, ?, ^, $, |, \.
  const regexStr = normalizedPattern
    .replace(/\*\*/g, '\x00GLOBSTAR\x00')
    .replace(/\*/g, '\x00GLOB\x00')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\x00GLOBSTAR\x00/g, '.*')
    .replace(/\x00GLOB\x00/g, '[^/]*');

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(normalizedPath);
}

/**
 * Check whether an action aligns with the declared IntentSpec.
 * Returns drift results — does NOT block execution (advisory mode).
 */
export function checkIntentAlignment(
  intent: NormalizedIntent,
  spec: IntentSpec,
  sessionState?: { filesModified?: number }
): IntentDriftResult {
  const drifts: IntentDriftResult['drifts'] = [];

  // Check action type against allowed actions
  if (spec.allowedActions && spec.allowedActions.length > 0) {
    if (!spec.allowedActions.includes(intent.action)) {
      drifts.push({
        driftType: 'action-not-allowed',
        reason: `Action "${intent.action}" is not in allowed actions: [${spec.allowedActions.join(', ')}]`,
      });
    }
  }

  // Check target path against allowed paths
  if (spec.allowedPaths && spec.allowedPaths.length > 0 && intent.target) {
    const pathAllowed = spec.allowedPaths.some((pattern) => matchPattern(pattern, intent.target));
    if (!pathAllowed) {
      drifts.push({
        driftType: 'path-outside-scope',
        reason: `Target "${intent.target}" is outside allowed paths: [${spec.allowedPaths.join(', ')}]`,
      });
    }
  }

  // Check scope limits
  if (spec.maxFilesModified !== undefined && sessionState?.filesModified !== undefined) {
    if (sessionState.filesModified >= spec.maxFilesModified) {
      drifts.push({
        driftType: 'scope-limit-exceeded',
        reason: `Session has modified ${sessionState.filesModified} files, exceeding limit of ${spec.maxFilesModified}`,
      });
    }
  }

  return {
    aligned: drifts.length === 0,
    drifts,
  };
}
