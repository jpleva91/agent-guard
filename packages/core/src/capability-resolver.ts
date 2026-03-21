// Capability grant resolver — finds which CapabilityGrant from a RunManifest
// authorized a given action. Used by the kernel to record authorization provenance
// in ActionAllowed and ActionExecuted events.

import type { RunManifest, CapabilityGrant } from './types.js';

/**
 * Result of resolving a capability grant for an action.
 * Includes the grant index for deterministic identification and the grant itself.
 */
export interface ResolvedCapabilityGrant {
  /** Index of the matching grant in RunManifest.grants */
  readonly grantIndex: number;
  /** The matching capability grant */
  readonly grant: CapabilityGrant;
}

/**
 * Check whether an action type matches a pattern from CapabilityGrant.actions.
 *
 * Supported patterns:
 * - `*` — matches any action type
 * - `file.*` — matches any action starting with `file.`
 * - `file.read` — exact match
 */
function actionMatchesPattern(actionType: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) {
    return actionType.startsWith(pattern.slice(0, -1));
  }
  return actionType === pattern;
}

/**
 * Check whether a target path matches a file pattern from CapabilityGrant.filePatterns.
 *
 * Supported patterns:
 * - `*`, `**`, `**​/*` — matches any path
 * - `src/**` — matches any path starting with `src/`
 * - `src/*.ts` — matches `.ts` files directly under `src/`
 * - exact match as fallback
 */
function targetMatchesFilePattern(target: string, pattern: string): boolean {
  if (pattern === '*' || pattern === '**' || pattern === '**/*') return true;
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return target === prefix || target.startsWith(prefix + '/');
  }
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    const remainder = target.slice(prefix.length + 1);
    return target.startsWith(prefix + '/') && !remainder.includes('/');
  }
  return target === pattern;
}

/**
 * Resolve which capability grant from a RunManifest authorizes a given action.
 *
 * Returns the first matching grant (grants are evaluated in declaration order,
 * so the most specific grant should appear first in the manifest). If no manifest
 * is provided or no grant matches, returns null.
 *
 * @param manifest - The RunManifest for the current session (null if none)
 * @param actionType - The canonical action type (e.g., 'file.write', 'git.push')
 * @param target - The target of the action (e.g., file path, branch name)
 */
export function resolveCapabilityGrant(
  manifest: RunManifest | null | undefined,
  actionType: string,
  target?: string
): ResolvedCapabilityGrant | null {
  if (!manifest || !manifest.grants || manifest.grants.length === 0) return null;

  for (let i = 0; i < manifest.grants.length; i++) {
    const grant = manifest.grants[i];

    // Check if the action type matches any of the grant's action patterns
    const actionMatch = grant.actions.some((pattern) => actionMatchesPattern(actionType, pattern));
    if (!actionMatch) continue;

    // If the grant has file patterns and a target is provided, check target match
    if (grant.filePatterns && grant.filePatterns.length > 0 && target !== undefined) {
      const fileMatch = grant.filePatterns.some((pattern) =>
        targetMatchesFilePattern(target, pattern)
      );
      if (!fileMatch) continue;
    }

    return { grantIndex: i, grant };
  }

  return null;
}
