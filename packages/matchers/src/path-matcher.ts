import picomatch from 'picomatch';
import type { MatchResult } from './types.js';
import { RC_FILE_CREDENTIAL } from './reason-codes.js';

// ─── Input type ──────────────────────────────────────────────────────────────

export interface PathPatternInput {
  /** Picomatch glob pattern for file matching. */
  glob: string;
  /** Stable identifier for this pattern (e.g. "env-file", "ssh-key"). */
  id: string;
  /** Human-readable description of what this pattern detects. */
  description: string;
  /** Numeric severity (higher = more severe). Defaults to 5. */
  severity?: number;
}

// ─── Internal compiled entry ─────────────────────────────────────────────────

interface CompiledPattern {
  isMatch: (input: string) => boolean;
  id: string;
  description: string;
  severity: number;
  code: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize a file path for consistent matching:
 * - Convert Windows backslashes to forward slashes
 * - Strip leading `./`
 */
function normalizePath(filePath: string): string {
  let p = filePath.replace(/\\/g, '/');
  if (p.startsWith('./')) p = p.slice(2);
  return p;
}

// ─── PathMatcher ─────────────────────────────────────────────────────────────

/**
 * Picomatch-based file path matcher.
 *
 * Replaces ad-hoc `.startsWith()`/`.endsWith()`/`.includes()` chains
 * in invariant definitions with compiled glob patterns that are both
 * faster and more expressive.
 */
export class PathMatcher {
  private readonly patterns: CompiledPattern[];

  private constructor(patterns: CompiledPattern[]) {
    this.patterns = patterns;
  }

  /**
   * Compile an array of glob patterns into a PathMatcher.
   *
   * Each glob is compiled once at construction time via picomatch.
   * Subsequent `match` / `matchAny` / `matchAll` calls are pure
   * function invocations with no re-compilation.
   */
  static create(patterns: PathPatternInput[]): PathMatcher {
    const compiled: CompiledPattern[] = patterns.map((p, index) => ({
      isMatch: picomatch(p.glob, { dot: true }),
      id: p.id,
      description: p.description,
      severity: p.severity ?? 5,
      code: RC_FILE_CREDENTIAL + index,
    }));

    return new PathMatcher(compiled);
  }

  /**
   * Return the first matching pattern as a MatchResult, or `null`
   * if no pattern matches the given file path.
   *
   * Backslashes are normalized to forward slashes before matching.
   */
  match(filePath: string): MatchResult | null {
    const normalized = normalizePath(filePath);

    for (const p of this.patterns) {
      if (p.isMatch(normalized)) {
        return {
          matched: true,
          code: p.code,
          matchType: 'GLOB',
          patternId: p.id,
          description: p.description,
          severity: p.severity,
        };
      }
    }

    return null;
  }

  /** Convenience: returns `true` if any pattern matches. */
  matchAny(filePath: string): boolean {
    return this.match(filePath) !== null;
  }

  /**
   * Return all matching patterns as an array of MatchResult objects.
   *
   * Useful when a single file path matches multiple sensitivity
   * categories (e.g. a `.env.key` file matches both env and key globs).
   */
  matchAll(filePath: string): MatchResult[] {
    const normalized = normalizePath(filePath);
    const results: MatchResult[] = [];

    for (const p of this.patterns) {
      if (p.isMatch(normalized)) {
        results.push({
          matched: true,
          code: p.code,
          matchType: 'GLOB',
          patternId: p.id,
          description: p.description,
          severity: p.severity,
        });
      }
    }

    return results;
  }
}
