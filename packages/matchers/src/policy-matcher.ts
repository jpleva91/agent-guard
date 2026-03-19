import picomatch from 'picomatch';

// ─── PolicyMatcher ──────────────────────────────────────────────────────────

/**
 * Static utility methods for policy evaluation matching.
 *
 * Replaces `array.includes()` with O(1) Set lookups and string-based scope
 * matching with picomatch globs. All methods are pure and stateless.
 */
export class PolicyMatcher {
  /** Convert an array to a Set for O(1) membership lookups. */
  static toSet(items: string[]): Set<string> {
    return new Set(items);
  }

  /**
   * Match an action string against an action pattern.
   *
   * - `*` matches everything
   * - Exact match: `pattern === action`
   * - Namespace wildcard: `git.*` matches `git.push`, `git.commit` (but not `file.write`)
   */
  static matchAction(pattern: string, action: string): boolean {
    // Wildcard matches everything
    if (pattern === '*') return true;

    // Exact match
    if (pattern === action) return true;

    // Namespace wildcard: e.g. `git.*` matches `git.push`
    if (pattern.endsWith('.*')) {
      const namespace = pattern.slice(0, -2); // strip `.*`
      return action.startsWith(namespace + '.');
    }

    return false;
  }

  /**
   * Match a target path against an array of scope patterns.
   *
   * - Empty scope = no constraint (returns true)
   * - Empty target = no match (returns false)
   * - `*` matches everything
   * - Exact match
   * - Directory prefix: `src/` matches `src/foo.ts`
   * - Glob: `**\/*.md` matches `docs/README.md` (via picomatch)
   * - Backslashes are normalized to forward slashes
   */
  static matchScope(scopePatterns: string[], target: string): boolean {
    // Empty scope = no constraint
    if (scopePatterns.length === 0) return true;

    // Empty target = no match
    if (!target) return false;

    // Normalize backslashes to forward slashes
    const normalized = target.replace(/\\/g, '/');

    for (const pattern of scopePatterns) {
      // Normalize pattern backslashes too
      const normalizedPattern = pattern.replace(/\\/g, '/');

      // Wildcard matches everything
      if (normalizedPattern === '*') return true;

      // Exact match
      if (normalizedPattern === normalized) return true;

      // Directory prefix: pattern ending with `/` matches any path under it
      if (normalizedPattern.endsWith('/') && normalized.startsWith(normalizedPattern)) {
        return true;
      }

      // Legacy suffix pattern: `*.ext` matches any depth (e.g. `*.ts` → `src/index.ts`).
      // picomatch treats `*` as single-segment, so `*.ts` would NOT match `src/index.ts`.
      // Detect simple suffix patterns (start with `*`, no `/` or `**`) and match by suffix.
      if (
        normalizedPattern.startsWith('*') &&
        !normalizedPattern.startsWith('**') &&
        !normalizedPattern.includes('/')
      ) {
        const suffix = normalizedPattern.slice(1); // strip leading `*`
        if (normalized.endsWith(suffix)) return true;
        continue; // skip picomatch for this pattern — suffix check is authoritative
      }

      // Glob matching via picomatch
      if (picomatch.isMatch(normalized, normalizedPattern, { dot: true })) {
        return true;
      }
    }

    return false;
  }
}
