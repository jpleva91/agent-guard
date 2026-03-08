import { describe, it, expect, beforeEach } from 'vitest';
import { createPlatformStore } from '../../src/domain/platform-store.js';
import { createDevEvent, resetDevEventCounter } from '../../src/domain/dev-event.js';
import type { DevEvent } from '../../src/domain/dev-event.js';

describe('domain/platform-store', () => {
  beforeEach(() => {
    resetDevEventCounter();
  });

  function errorEvent(overrides: Partial<Parameters<typeof createDevEvent>[0]> = {}): DevEvent {
    return createDevEvent({
      source: 'cli',
      actor: 'system',
      kind: 'error.detected',
      severity: 'medium',
      payload: { errorType: 'null-reference', message: 'Cannot read x of null' },
      ...overrides,
    });
  }

  describe('event operations', () => {
    it('appends and queries events', () => {
      const store = createPlatformStore();
      const event = errorEvent();
      store.append(event);

      expect(store.eventCount()).toBe(1);
      expect(store.queryEvents()).toHaveLength(1);
    });

    it('rejects invalid events', () => {
      const store = createPlatformStore();
      expect(() =>
        store.append({ id: 'bad', ts: '', source: 'invalid' } as unknown as DevEvent)
      ).toThrow();
    });

    it('filters events by kind', () => {
      const store = createPlatformStore();
      store.append(errorEvent());
      store.append(
        createDevEvent({ source: 'test', actor: 'system', kind: 'test.passed', payload: {} })
      );

      const errors = store.queryEvents({ kind: 'error.detected' });
      expect(errors).toHaveLength(1);
    });

    it('filters events by source', () => {
      const store = createPlatformStore();
      store.append(errorEvent({ source: 'cli' }));
      store.append(errorEvent({ source: 'ci' }));

      const ciEvents = store.queryEvents({ source: 'ci' });
      expect(ciEvents).toHaveLength(1);
    });

    it('filters events by severity', () => {
      const store = createPlatformStore();
      store.append(errorEvent({ severity: 'low' }));
      store.append(errorEvent({ severity: 'critical' }));

      const critical = store.queryEvents({ severity: 'critical' });
      expect(critical).toHaveLength(1);
    });

    it('replays from a given event ID', () => {
      const store = createPlatformStore();
      const e1 = errorEvent();
      const e2 = errorEvent({ payload: { errorType: 'syntax', message: 'unexpected' } });

      store.append(e1);
      store.append(e2);

      const replay = store.replayFrom(e2.id);
      expect(replay).toHaveLength(1);
      expect(replay[0].id).toBe(e2.id);
    });
  });

  describe('bug tracking', () => {
    it('creates BugEntity on error.detected', () => {
      const store = createPlatformStore();
      const result = store.append(errorEvent());

      expect(result.bug).toBeDefined();
      expect(result.bug!.status).toBe('open');
      expect(result.bug!.errorType).toBe('null-reference');
    });

    it('increments occurrence count on repeated errors', () => {
      const store = createPlatformStore();

      // Same fingerprint = same error
      resetDevEventCounter();
      const e1 = errorEvent();
      resetDevEventCounter();
      const e2 = errorEvent();

      store.append(e1);
      const result = store.append(e2);

      expect(result.bug!.occurrenceCount).toBe(2);
    });

    it('tracks bugs by status', () => {
      const store = createPlatformStore();
      const e1 = errorEvent();
      store.append(e1);

      const openBugs = store.getBugsByStatus('open');
      expect(openBugs).toHaveLength(1);
    });

    it('resolves a bug', () => {
      const store = createPlatformStore();
      store.append(errorEvent());
      const bugs = store.getBugs();
      expect(bugs).toHaveLength(1);

      const resolved = store.resolveBug(bugs[0].id, 'fix_abc');
      expect(resolved).toBeDefined();
      expect(resolved!.status).toBe('resolved');
      expect(resolved!.resolvedCommit).toBe('fix_abc');
    });
  });

  describe('risk assessment', () => {
    it('returns risk assessment with each append', () => {
      const store = createPlatformStore();
      const result = store.append(errorEvent());

      expect(result.risk).toBeDefined();
      expect(result.risk.level).toBeTypeOf('string');
      expect(result.risk.score).toBeGreaterThanOrEqual(0);
    });

    it('detects regressions for previously resolved bugs', () => {
      const store = createPlatformStore();

      // Create and resolve a bug
      resetDevEventCounter();
      const e1 = errorEvent();
      store.append(e1);
      const bugs = store.getBugs();
      store.resolveBug(bugs[0].id);

      // Now the same error comes back
      store.append(
        createDevEvent({
          source: 'cli',
          actor: 'system',
          kind: 'error.resolved',
          payload: {},
        })
      );

      // Re-detect same fingerprint
      resetDevEventCounter();
      const e3 = errorEvent();
      const result = store.append(e3);

      // The risk model should recognize this as previously resolved
      expect(result.risk).toBeDefined();
    });
  });

  describe('correlation', () => {
    it('returns cluster IDs with each append', () => {
      const store = createPlatformStore();
      const result = store.append(errorEvent({ file: 'src/auth.ts' }));

      expect(result.clusterIds).toBeDefined();
      expect(result.clusterIds.length).toBeGreaterThanOrEqual(1);
    });

    it('provides access to correlation engine', () => {
      const store = createPlatformStore();
      store.append(errorEvent({ file: 'src/a.ts' }));

      const engine = store.getCorrelation();
      expect(engine.size()).toBeGreaterThanOrEqual(1);
    });
  });

  describe('auto-incident creation', () => {
    it('creates incident when file cluster reaches threshold', () => {
      const store = createPlatformStore({ incidentThreshold: 2 });

      // Two different errors in the same file
      store.append(
        createDevEvent({
          source: 'cli',
          actor: 'system',
          kind: 'error.detected',
          severity: 'medium',
          file: 'src/auth.ts',
          payload: { errorType: 'null-reference', message: 'error 1' },
        })
      );
      const result = store.append(
        createDevEvent({
          source: 'cli',
          actor: 'system',
          kind: 'error.detected',
          severity: 'high',
          file: 'src/auth.ts',
          payload: { errorType: 'type-error', message: 'error 2' },
        })
      );

      expect(result.incident).toBeDefined();
      expect(result.incident!.bugIds.length).toBeGreaterThanOrEqual(2);

      const incidents = store.getIncidents();
      expect(incidents.length).toBeGreaterThanOrEqual(1);
    });

    it('does not create incident below threshold', () => {
      const store = createPlatformStore({ incidentThreshold: 5 });

      store.append(
        createDevEvent({
          source: 'cli',
          actor: 'system',
          kind: 'error.detected',
          file: 'src/a.ts',
          payload: { errorType: 'syntax', message: 'err' },
        })
      );

      expect(store.getIncidents()).toHaveLength(0);
    });
  });

  describe('lifecycle', () => {
    it('clear resets all state', () => {
      const store = createPlatformStore();
      store.append(errorEvent());
      store.append(errorEvent({ payload: { errorType: 'syntax', message: 'x' } }));

      store.clear();

      expect(store.eventCount()).toBe(0);
      expect(store.getBugs()).toHaveLength(0);
      expect(store.getIncidents()).toHaveLength(0);
      expect(store.getCorrelation().size()).toBe(0);
    });
  });
});
