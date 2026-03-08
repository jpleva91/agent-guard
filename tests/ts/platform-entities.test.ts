import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBugEntity,
  recordOccurrence,
  resolveBug,
  createIncident,
  addBugToIncident,
  resolveIncident,
  resetIncidentCounter,
} from '../../src/domain/entities.js';
import type { BugEntity } from '../../src/domain/entities.js';
import { createDevEvent, resetDevEventCounter } from '../../src/domain/dev-event.js';

describe('domain/entities', () => {
  beforeEach(() => {
    resetIncidentCounter();
    resetDevEventCounter();
  });

  describe('BugEntity', () => {
    it('creates a bug with required fields', () => {
      const bug = createBugEntity({
        fingerprint: 'fp_123',
        errorType: 'null-reference',
        message: 'Cannot read property x of null',
        severity: 'high',
      });

      expect(bug.id).toMatch(/^bug_/);
      expect(bug.fingerprint).toBe('fp_123');
      expect(bug.errorType).toBe('null-reference');
      expect(bug.severity).toBe('high');
      expect(bug.status).toBe('open');
      expect(bug.occurrenceCount).toBe(1);
      expect(bug.eventIds).toHaveLength(0);
    });

    it('includes optional fields', () => {
      const bug = createBugEntity({
        fingerprint: 'fp_456',
        errorType: 'type-error',
        message: 'type error',
        severity: 'medium',
        file: 'src/index.ts',
        line: 42,
        repo: 'org/repo',
        branch: 'main',
        commit: 'abc123',
        eventId: 'dev_123_1',
      });

      expect(bug.file).toBe('src/index.ts');
      expect(bug.line).toBe(42);
      expect(bug.repo).toBe('org/repo');
      expect(bug.branch).toBe('main');
      expect(bug.firstCommit).toBe('abc123');
      expect(bug.eventIds).toEqual(['dev_123_1']);
    });

    it('records occurrences immutably', () => {
      const bug = createBugEntity({
        fingerprint: 'fp_789',
        errorType: 'syntax',
        message: 'Unexpected token',
        severity: 'medium',
      });

      const event = createDevEvent({
        source: 'cli',
        actor: 'system',
        kind: 'error.detected',
        payload: {},
      });

      const updated = recordOccurrence(bug, event);

      expect(updated.occurrenceCount).toBe(2);
      expect(updated.eventIds).toHaveLength(1);
      expect(updated.lastSeen).toBe(event.ts);
      // Original not mutated
      expect(bug.occurrenceCount).toBe(1);
    });

    it('resolves a bug', () => {
      const bug = createBugEntity({
        fingerprint: 'fp_resolve',
        errorType: 'test-failure',
        message: 'assert failed',
        severity: 'medium',
      });

      const resolved = resolveBug(bug, 'fix_commit_123');

      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedCommit).toBe('fix_commit_123');
      expect(resolved.resolvedAt).toBeDefined();
      // Original not mutated
      expect(bug.status).toBe('open');
    });
  });

  describe('IncidentEntity', () => {
    function makeBug(overrides: Partial<BugEntity> = {}): BugEntity {
      return {
        id: `bug_${Math.random().toString(36).slice(2)}`,
        fingerprint: `fp_${Math.random().toString(36).slice(2)}`,
        errorType: 'null-reference',
        message: 'test error',
        severity: 'medium',
        status: 'open',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        occurrenceCount: 1,
        eventIds: [],
        ...overrides,
      };
    }

    it('creates an incident from bugs', () => {
      const bugs = [makeBug({ severity: 'high' }), makeBug({ severity: 'medium' })];

      const incident = createIncident(bugs, ['file:src/index.ts']);

      expect(incident.id).toMatch(/^inc_/);
      expect(incident.status).toBe('open');
      expect(incident.maxSeverity).toBe('high');
      expect(incident.priority).toBe('p1');
      expect(incident.bugIds).toHaveLength(2);
      expect(incident.correlationKeys).toEqual(['file:src/index.ts']);
    });

    it('throws on empty bug array', () => {
      expect(() => createIncident([], ['file:x'])).toThrow('Cannot create incident with no bugs');
    });

    it('derives priority from max severity', () => {
      const criticalBug = makeBug({ severity: 'critical' });
      const incident = createIncident([criticalBug], ['file:auth.ts']);
      expect(incident.priority).toBe('p0');
    });

    it('adds a bug to an incident', () => {
      const bugs = [makeBug()];
      const incident = createIncident(bugs, ['file:x']);
      const newBug = makeBug({ severity: 'high', eventIds: ['e1', 'e2'] });

      const updated = addBugToIncident(incident, newBug);

      expect(updated.bugIds).toHaveLength(2);
      expect(updated.maxSeverity).toBe('high');
      expect(updated.totalEvents).toBe(2);
    });

    it('does not duplicate a bug already in the incident', () => {
      const bug = makeBug();
      const incident = createIncident([bug], ['file:x']);
      const same = addBugToIncident(incident, bug);
      expect(same.bugIds).toHaveLength(1);
    });

    it('resolves an incident', () => {
      const incident = createIncident([makeBug()], ['file:x']);
      const resolved = resolveIncident(incident, 'null check added');

      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedAt).toBeDefined();
      expect(resolved.rootCause).toBe('null check added');
    });

    it('generates descriptive titles', () => {
      // Single bug
      const single = createIncident(
        [makeBug({ errorType: 'null-reference', message: 'Cannot read x of null' })],
        []
      );
      expect(single.title).toContain('null-reference');

      // Multiple same type
      resetIncidentCounter();
      const sameType = createIncident(
        [makeBug({ errorType: 'syntax' }), makeBug({ errorType: 'syntax' })],
        []
      );
      expect(sameType.title).toContain('cluster');

      // Mixed types
      resetIncidentCounter();
      const mixed = createIncident(
        [makeBug({ errorType: 'syntax' }), makeBug({ errorType: 'type-error' })],
        []
      );
      expect(mixed.title).toContain('Mixed incident');
    });
  });
});
