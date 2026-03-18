import { describe, it, expect, beforeEach } from 'vitest';
import { createTierRouter, ESCALATION } from '@red-codes/kernel';
import type { TierRouter, EvaluationTier } from '@red-codes/kernel';

describe('tier-router', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createTierRouter();
  });

  describe('classify', () => {
    it('classifies file.read as fast tier at NORMAL escalation', () => {
      const result = router.classify('file.read', 'src/index.ts', ESCALATION.NORMAL, false);
      expect(result.tier).toBe('fast');
    });

    it('classifies file.write as standard tier at NORMAL escalation', () => {
      const result = router.classify('file.write', 'src/index.ts', ESCALATION.NORMAL, false);
      expect(result.tier).toBe('standard');
    });

    it('classifies git.push as deep tier', () => {
      const result = router.classify('git.push', 'main', ESCALATION.NORMAL, false);
      expect(result.tier).toBe('deep');
    });

    it('classifies git.reset as deep tier', () => {
      const result = router.classify('git.reset', '', ESCALATION.NORMAL, false);
      expect(result.tier).toBe('deep');
    });

    it('classifies deploy.trigger as deep tier', () => {
      const result = router.classify('deploy.trigger', 'prod', ESCALATION.NORMAL, false);
      expect(result.tier).toBe('deep');
    });

    it('classifies npm.publish as deep tier', () => {
      const result = router.classify('npm.publish', 'my-package', ESCALATION.NORMAL, false);
      expect(result.tier).toBe('deep');
    });

    it('classifies destructive actions as deep tier', () => {
      const result = router.classify('shell.exec', 'rm -rf /tmp', ESCALATION.NORMAL, true);
      expect(result.tier).toBe('deep');
      expect(result.reason).toContain('Destructive');
    });

    it('classifies sensitive paths as deep tier', () => {
      const result = router.classify('file.write', '.env.production', ESCALATION.NORMAL, false);
      expect(result.tier).toBe('deep');
      expect(result.reason).toContain('Sensitive');
    });

    it('classifies config paths as deep tier', () => {
      const result = router.classify('file.write', 'package.json', ESCALATION.NORMAL, false);
      expect(result.tier).toBe('deep');
      expect(result.reason).toContain('Sensitive');
    });

    // Escalation level tests
    it('forces standard tier for fast-path actions at ELEVATED escalation', () => {
      const result = router.classify('file.read', 'src/index.ts', ESCALATION.ELEVATED, false);
      expect(result.tier).toBe('standard');
    });

    it('forces deep tier at HIGH escalation', () => {
      const result = router.classify('file.write', 'src/index.ts', ESCALATION.HIGH, false);
      expect(result.tier).toBe('deep');
    });

    it('forces deep tier at LOCKDOWN', () => {
      const result = router.classify('file.read', 'src/index.ts', ESCALATION.LOCKDOWN, false);
      expect(result.tier).toBe('deep');
    });

    // Custom configuration
    it('respects custom fastPathActions', () => {
      const custom = createTierRouter({ fastPathActions: ['shell.exec'] });
      const result = custom.classify('shell.exec', 'echo hello', ESCALATION.NORMAL, false);
      expect(result.tier).toBe('fast');
    });

    it('respects custom deepPathActions', () => {
      const custom = createTierRouter({ deepPathActions: ['file.write'] });
      const result = custom.classify('file.write', 'src/index.ts', ESCALATION.NORMAL, false);
      expect(result.tier).toBe('deep');
    });

    it('respects custom deepPathPatterns', () => {
      const custom = createTierRouter({ deepPathPatterns: ['migrations/'] });
      const result = custom.classify(
        'file.write',
        'db/migrations/001.sql',
        ESCALATION.NORMAL,
        false
      );
      expect(result.tier).toBe('deep');
    });
  });

  describe('fast-path cache', () => {
    it('returns null for uncached actions', () => {
      expect(router.getCached('file.read', 'src/index.ts')).toBeNull();
    });

    it('caches and retrieves allow decisions', () => {
      router.setCached('file.read', 'src/index.ts');
      const cached = router.getCached('file.read', 'src/index.ts');
      expect(cached).not.toBeNull();
      expect(cached!.allowed).toBe(true);
    });

    it('normalizes target patterns for broader cache hits', () => {
      // Setting cache for one file in a directory should hit for another file
      // with the same extension in the same directory
      router.setCached('file.read', 'src/utils/foo.ts');
      const cached = router.getCached('file.read', 'src/utils/bar.ts');
      expect(cached).not.toBeNull();
    });

    it('increments hit count on cache hits', () => {
      router.setCached('file.read', 'src/index.ts');
      router.getCached('file.read', 'src/index.ts');
      const second = router.getCached('file.read', 'src/index.ts');
      expect(second!.hitCount).toBe(2);
    });

    it('invalidates entire cache', () => {
      router.setCached('file.read', 'src/index.ts');
      router.invalidateCache();
      expect(router.getCached('file.read', 'src/index.ts')).toBeNull();
    });

    it('expires entries after TTL', () => {
      let now = 1000;
      const ttlRouter = createTierRouter({
        cacheTtlMs: 5000,
        now: () => now,
      });

      ttlRouter.setCached('file.read', 'src/index.ts');
      expect(ttlRouter.getCached('file.read', 'src/index.ts')).not.toBeNull();

      now = 7000; // 6 seconds later, past TTL
      expect(ttlRouter.getCached('file.read', 'src/index.ts')).toBeNull();
    });

    it('evicts oldest entries when cache is full', () => {
      const smallRouter = createTierRouter({ maxCacheSize: 2 });

      // Use different directories so normalized patterns are distinct cache keys
      smallRouter.setCached('file.read', 'src/utils/a.ts');
      smallRouter.setCached('file.read', 'src/models/b.ts');
      smallRouter.setCached('file.read', 'src/services/c.ts');

      // First entry should be evicted, keeping only 2
      const stats = smallRouter.getCacheStats();
      expect(stats.size).toBe(2);
    });

    it('tracks cache hit and miss stats', () => {
      router.getCached('file.read', 'src/missing.ts'); // miss
      router.setCached('file.read', 'src/hit.ts');
      router.getCached('file.read', 'src/hit.ts'); // hit

      const stats = router.getCacheStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(1);
    });
  });

  describe('metrics', () => {
    it('starts with zero counts', () => {
      const metrics = router.getMetrics();
      expect(metrics.fast.count).toBe(0);
      expect(metrics.standard.count).toBe(0);
      expect(metrics.deep.count).toBe(0);
    });

    it('records timing for each tier', () => {
      router.recordTiming('fast', 0.5);
      router.recordTiming('standard', 1.2);
      router.recordTiming('deep', 25.0);

      const metrics = router.getMetrics();
      expect(metrics.fast.count).toBe(1);
      expect(metrics.fast.totalMs).toBe(0.5);
      expect(metrics.fast.minMs).toBe(0.5);
      expect(metrics.fast.maxMs).toBe(0.5);

      expect(metrics.standard.count).toBe(1);
      expect(metrics.standard.totalMs).toBe(1.2);

      expect(metrics.deep.count).toBe(1);
      expect(metrics.deep.totalMs).toBe(25.0);
    });

    it('tracks min/max across multiple recordings', () => {
      router.recordTiming('standard', 1.0);
      router.recordTiming('standard', 0.5);
      router.recordTiming('standard', 2.0);

      const metrics = router.getMetrics();
      expect(metrics.standard.count).toBe(3);
      expect(metrics.standard.totalMs).toBe(3.5);
      expect(metrics.standard.minMs).toBe(0.5);
      expect(metrics.standard.maxMs).toBe(2.0);
    });
  });

  describe('tier priority', () => {
    it('destructive overrides fast-path action type', () => {
      const custom = createTierRouter({ fastPathActions: ['shell.exec'] });
      const result = custom.classify('shell.exec', 'rm -rf /', ESCALATION.NORMAL, true);
      expect(result.tier).toBe('deep');
    });

    it('HIGH escalation overrides fast-path action type', () => {
      const result = router.classify('file.read', 'src/safe.ts', ESCALATION.HIGH, false);
      expect(result.tier).toBe('deep');
    });

    it('LOCKDOWN overrides everything', () => {
      const result = router.classify('file.read', 'src/safe.ts', ESCALATION.LOCKDOWN, false);
      expect(result.tier).toBe('deep');
    });

    it('sensitive path overrides fast-path action type', () => {
      const result = router.classify('file.read', '.env', ESCALATION.NORMAL, false);
      expect(result.tier).toBe('deep');
    });
  });
});
