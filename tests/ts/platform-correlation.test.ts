import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCorrelationEngine,
  extractCorrelationKeys,
  correlateByFile,
  correlateByErrorType,
  correlateByBranch,
} from '../../src/domain/correlation.js';
import { createDevEvent, resetDevEventCounter } from '../../src/domain/dev-event.js';
import type { BugEntity } from '../../src/domain/entities.js';

describe('domain/correlation', () => {
  beforeEach(() => {
    resetDevEventCounter();
  });

  describe('extractCorrelationKeys', () => {
    it('extracts fingerprint key', () => {
      const event = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: {},
      });

      const keys = extractCorrelationKeys(event);
      expect(keys.find((k) => k.dimension === 'fingerprint')).toBeDefined();
    });

    it('extracts all available dimensions', () => {
      const event = createDevEvent({
        source: 'ci',
        actor: 'system',
        kind: 'error.detected',
        repo: 'org/repo',
        branch: 'main',
        commit: 'abc123',
        file: 'src/index.ts',
        agentRunId: 'run_1',
        ciJobId: 'job_1',
        payload: { errorType: 'null-reference' },
      });

      const keys = extractCorrelationKeys(event);
      const dimensions = keys.map((k) => k.dimension);

      expect(dimensions).toContain('fingerprint');
      expect(dimensions).toContain('commit');
      expect(dimensions).toContain('branch');
      expect(dimensions).toContain('file');
      expect(dimensions).toContain('agentRun');
      expect(dimensions).toContain('ciJob');
      expect(dimensions).toContain('repo');
      expect(dimensions).toContain('errorType');
    });

    it('omits absent dimensions', () => {
      const event = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'session.started',
        payload: {},
      });

      const keys = extractCorrelationKeys(event);
      const dimensions = keys.map((k) => k.dimension);

      expect(dimensions).not.toContain('commit');
      expect(dimensions).not.toContain('branch');
      expect(dimensions).not.toContain('ciJob');
    });
  });

  describe('CorrelationEngine', () => {
    it('creates clusters for new events', () => {
      const engine = createCorrelationEngine();
      const event = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        file: 'src/foo.ts',
        payload: {},
      });

      const clusterIds = engine.ingest(event);
      expect(clusterIds).toHaveLength(1);
      expect(engine.size()).toBe(1);

      const cluster = engine.getCluster(clusterIds[0]);
      expect(cluster).toBeDefined();
      expect(cluster!.eventIds).toContain(event.id);
      expect(cluster!.size).toBe(1);
    });

    it('groups events with same fingerprint into same cluster', () => {
      const engine = createCorrelationEngine({ primaryDimensions: ['fingerprint'] });

      // Two events with same fingerprint (same source + kind + payload)
      resetDevEventCounter();
      const e1 = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: { message: 'same error' },
      });
      resetDevEventCounter();
      const e2 = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: { message: 'same error' },
      });

      engine.ingest(e1);
      const ids2 = engine.ingest(e2);

      expect(engine.size()).toBe(1);
      const cluster = engine.getCluster(ids2[0]);
      expect(cluster!.size).toBe(2);
    });

    it('creates separate clusters for different fingerprints', () => {
      const engine = createCorrelationEngine({ primaryDimensions: ['fingerprint'] });

      const e1 = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: { message: 'error A' },
      });
      const e2 = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: { message: 'error B' },
      });

      engine.ingest(e1);
      engine.ingest(e2);

      expect(engine.size()).toBe(2);
    });

    it('finds clusters by dimension', () => {
      const engine = createCorrelationEngine({ primaryDimensions: ['file'] });

      const e1 = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        file: 'src/auth.ts',
        payload: {},
      });

      engine.ingest(e1);
      const found = engine.findByDimension('file', 'src/auth.ts');
      expect(found).toHaveLength(1);
    });

    it('merges two clusters', () => {
      const engine = createCorrelationEngine({ primaryDimensions: ['fingerprint'] });

      const e1 = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: { message: 'A' },
      });
      const e2 = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: { message: 'B' },
      });

      const ids1 = engine.ingest(e1);
      const ids2 = engine.ingest(e2);

      expect(engine.size()).toBe(2);

      const merged = engine.merge(ids1[0], ids2[0]);
      expect(merged).toBeDefined();
      expect(merged!.size).toBe(2);
      expect(engine.size()).toBe(1);
    });

    it('clear resets all state', () => {
      const engine = createCorrelationEngine();
      engine.ingest(
        createDevEvent({ source: 'cli', actor: 'system', kind: 'error.detected', payload: {} })
      );
      expect(engine.size()).toBe(1);

      engine.clear();
      expect(engine.size()).toBe(0);
      expect(engine.getClusters()).toHaveLength(0);
    });
  });

  describe('Bug correlation helpers', () => {
    function makeBug(overrides: Partial<BugEntity> = {}): BugEntity {
      return {
        id: `bug_${Math.random().toString(36).slice(2)}`,
        fingerprint: 'fp',
        errorType: 'null-reference',
        message: 'test',
        severity: 'medium',
        status: 'open',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        occurrenceCount: 1,
        eventIds: [],
        ...overrides,
      };
    }

    it('correlates by file', () => {
      const bugs = [
        makeBug({ file: 'src/a.ts' }),
        makeBug({ file: 'src/a.ts' }),
        makeBug({ file: 'src/b.ts' }),
        makeBug({}), // no file
      ];

      const groups = correlateByFile(bugs);
      expect(groups.get('src/a.ts')).toHaveLength(2);
      expect(groups.get('src/b.ts')).toHaveLength(1);
      expect(groups.size).toBe(2);
    });

    it('correlates by error type', () => {
      const bugs = [
        makeBug({ errorType: 'syntax' }),
        makeBug({ errorType: 'syntax' }),
        makeBug({ errorType: 'type-error' }),
      ];

      const groups = correlateByErrorType(bugs);
      expect(groups.get('syntax')).toHaveLength(2);
      expect(groups.get('type-error')).toHaveLength(1);
    });

    it('correlates by branch', () => {
      const bugs = [
        makeBug({ branch: 'feature-x' }),
        makeBug({ branch: 'feature-x' }),
        makeBug({ branch: 'main' }),
      ];

      const groups = correlateByBranch(bugs);
      expect(groups.get('feature-x')).toHaveLength(2);
    });
  });
});
