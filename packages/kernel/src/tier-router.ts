// Tiered evaluation pipeline — adaptive governance depth.
// Classifies actions into fast/standard/deep tiers based on risk profile.
// Provides a fast-path cache for known-safe action signatures.
// Pure domain logic. No I/O, no Node.js-specific APIs.

import { BLAST_RADIUS_SENSITIVE_PATTERNS, BLAST_RADIUS_CONFIG_PATTERNS } from '@red-codes/core';
import type { EscalationLevel } from './monitor.js';
import { ESCALATION } from './monitor.js';

/** Evaluation depth tier */
export type EvaluationTier = 'fast' | 'standard' | 'deep';

/** Result of tier classification */
export interface TierClassification {
  tier: EvaluationTier;
  reason: string;
}

/** Cached allow decision for fast-path tier */
export interface CachedDecision {
  allowed: true;
  reason: string;
  cachedAt: number;
  hitCount: number;
}

/** Per-tier timing metrics */
export interface TierMetrics {
  fast: TierTimings;
  standard: TierTimings;
  deep: TierTimings;
}

export interface TierTimings {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

/** Configuration for the tier router */
export interface TierRouterConfig {
  /** Action types that always use the fast path (default: ['file.read']) */
  fastPathActions?: string[];
  /** Action types that always use deep analysis */
  deepPathActions?: string[];
  /** Path patterns that force deep analysis (appended to built-in sensitive patterns) */
  deepPathPatterns?: string[];
  /** Maximum cache size (default: 1000) */
  maxCacheSize?: number;
  /** Cache TTL in milliseconds (default: 300000 = 5 minutes) */
  cacheTtlMs?: number;
  /** Injectable clock for testing (default: Date.now) */
  now?: () => number;
}

const DEFAULT_FAST_PATH_ACTIONS = ['file.read'];
const DEFAULT_DEEP_PATH_ACTIONS = [
  'git.push',
  'git.reset',
  'git.merge',
  'git.branch.delete',
  'infra.apply',
  'infra.destroy',
  'deploy.trigger',
  'npm.publish',
];

const DEFAULT_MAX_CACHE_SIZE = 1000;
const DEFAULT_CACHE_TTL_MS = 300_000; // 5 minutes

/** Normalize a target path into a cacheable pattern (strip numeric/hash suffixes) */
function normalizeTargetPattern(target: string): string {
  if (!target) return '';
  // Replace specific filenames with directory patterns for broader cache hits
  // e.g., "src/utils/foo.ts" → "src/utils/*.ts"
  const lastSlash = target.lastIndexOf('/');
  if (lastSlash >= 0) {
    const dir = target.slice(0, lastSlash + 1);
    const ext = target.includes('.') ? target.slice(target.lastIndexOf('.')) : '';
    return `${dir}*${ext}`;
  }
  return target;
}

/** Build cache key from action type and target pattern */
function cacheKey(actionType: string, target: string): string {
  return `${actionType}:${normalizeTargetPattern(target)}`;
}

/** Check if a target path matches sensitive or config patterns */
function isSensitivePath(target: string): boolean {
  if (!target) return false;
  const lower = target.toLowerCase();
  return (
    BLAST_RADIUS_SENSITIVE_PATTERNS.some((p: string) => lower.includes(p)) ||
    BLAST_RADIUS_CONFIG_PATTERNS.some((p: string) => lower.includes(p))
  );
}

export interface TierRouter {
  /** Classify an action into an evaluation tier */
  classify(
    actionType: string,
    target: string,
    escalationLevel: EscalationLevel,
    destructive: boolean
  ): TierClassification;

  /** Get a cached allow decision for an action (fast-path only) */
  getCached(actionType: string, target: string): CachedDecision | null;

  /** Cache an allow decision for an action (only 'allow' results are cached) */
  setCached(actionType: string, target: string): void;

  /** Invalidate the entire cache (e.g., policy or invariant change) */
  invalidateCache(): void;

  /** Record an evaluation timing for a tier */
  recordTiming(tier: EvaluationTier, durationMs: number): void;

  /** Get current metrics */
  getMetrics(): TierMetrics;

  /** Get cache stats */
  getCacheStats(): { size: number; hits: number; misses: number };
}

export function createTierRouter(config: TierRouterConfig = {}): TierRouter {
  const fastPathActions = new Set(config.fastPathActions ?? DEFAULT_FAST_PATH_ACTIONS);
  const deepPathActions = new Set(config.deepPathActions ?? DEFAULT_DEEP_PATH_ACTIONS);
  const deepPathPatterns = config.deepPathPatterns ?? [];
  const maxCacheSize = config.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;
  const cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const clock = config.now ?? Date.now;

  // LRU-ish cache: Map maintains insertion order, we evict oldest on overflow
  const cache = new Map<string, CachedDecision>();
  let cacheHits = 0;
  let cacheMisses = 0;

  const metrics: TierMetrics = {
    fast: { count: 0, totalMs: 0, minMs: Infinity, maxMs: 0 },
    standard: { count: 0, totalMs: 0, minMs: Infinity, maxMs: 0 },
    deep: { count: 0, totalMs: 0, minMs: Infinity, maxMs: 0 },
  };

  function matchesDeepPattern(target: string): boolean {
    if (!target) return false;
    const lower = target.toLowerCase();
    return deepPathPatterns.some((p) => lower.includes(p.toLowerCase()));
  }

  return {
    classify(actionType, target, escalationLevel, destructive) {
      // Rule 1: LOCKDOWN → everything is denied by the monitor anyway, deep analysis
      if (escalationLevel === ESCALATION.LOCKDOWN) {
        return { tier: 'deep', reason: 'Governance LOCKDOWN — deep analysis required' };
      }

      // Rule 2: HIGH escalation → force deep for all actions
      if (escalationLevel === ESCALATION.HIGH) {
        return { tier: 'deep', reason: 'HIGH escalation — deep analysis required' };
      }

      // Rule 3: Destructive actions always get deep analysis
      if (destructive) {
        return { tier: 'deep', reason: 'Destructive action detected' };
      }

      // Rule 4: Explicitly configured deep-path actions
      if (deepPathActions.has(actionType)) {
        return { tier: 'deep', reason: `Action type '${actionType}' requires deep analysis` };
      }

      // Rule 5: Sensitive or config paths → deep
      if (isSensitivePath(target)) {
        return { tier: 'deep', reason: 'Sensitive or config path detected' };
      }

      // Rule 6: Custom deep path patterns
      if (matchesDeepPattern(target)) {
        return { tier: 'deep', reason: 'Path matches deep analysis pattern' };
      }

      // Rule 7: ELEVATED escalation → standard (no fast-path)
      if (escalationLevel === ESCALATION.ELEVATED) {
        return { tier: 'standard', reason: 'ELEVATED escalation — standard analysis' };
      }

      // Rule 8: Fast-path eligible actions at NORMAL escalation
      if (fastPathActions.has(actionType)) {
        return { tier: 'fast', reason: `Action type '${actionType}' eligible for fast-path` };
      }

      // Default: standard evaluation
      return { tier: 'standard', reason: 'Standard evaluation' };
    },

    getCached(actionType, target) {
      const key = cacheKey(actionType, target);
      const entry = cache.get(key);

      if (!entry) {
        cacheMisses++;
        return null;
      }

      // Check TTL
      if (clock() - entry.cachedAt > cacheTtlMs) {
        cache.delete(key);
        cacheMisses++;
        return null;
      }

      // Move to end for LRU behavior
      cache.delete(key);
      entry.hitCount++;
      cache.set(key, entry);
      cacheHits++;
      return entry;
    },

    setCached(actionType, target) {
      const key = cacheKey(actionType, target);

      // Evict oldest if at capacity
      if (cache.size >= maxCacheSize && !cache.has(key)) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
          cache.delete(oldest);
        }
      }

      cache.set(key, {
        allowed: true,
        reason: 'Cached fast-path allow',
        cachedAt: clock(),
        hitCount: 0,
      });
    },

    invalidateCache() {
      cache.clear();
    },

    recordTiming(tier, durationMs) {
      const t = metrics[tier];
      t.count++;
      t.totalMs += durationMs;
      if (durationMs < t.minMs) t.minMs = durationMs;
      if (durationMs > t.maxMs) t.maxMs = durationMs;
    },

    getMetrics() {
      return {
        fast: { ...metrics.fast },
        standard: { ...metrics.standard },
        deep: { ...metrics.deep },
      };
    },

    getCacheStats() {
      return { size: cache.size, hits: cacheHits, misses: cacheMisses };
    },
  };
}
