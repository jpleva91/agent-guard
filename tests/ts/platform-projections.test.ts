import { describe, it, expect, beforeEach } from 'vitest';
import {
  projectActiveBugs,
  projectHotspots,
  projectFlakyTests,
  projectRepoHealth,
  projectAgentTrust,
  projectTimeline,
  projectIncidentSummary,
  projectFixRegressionRatio,
  projectDeveloperStreak,
} from '../../src/domain/projections.js';
import { createDevEvent, resetDevEventCounter } from '../../src/domain/dev-event.js';
import type { DevEvent, DevEventKind } from '../../src/domain/dev-event.js';
import type { BugEntity } from '../../src/domain/entities.js';
import type { IncidentEntity } from '../../src/domain/entities.js';

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
    eventIds: ['e1'],
    ...overrides,
  };
}

function makeEvent(kind: DevEventKind, payload: Record<string, unknown> = {}): DevEvent {
  return createDevEvent({
    source: 'cli',
    actor: 'system',
    kind,
    payload,
  });
}

describe('domain/projections', () => {
  beforeEach(() => {
    resetDevEventCounter();
  });

  describe('projectActiveBugs', () => {
    it('filters out resolved and suppressed bugs', () => {
      const bugs = [
        makeBug({ status: 'open' }),
        makeBug({ status: 'resolved' }),
        makeBug({ status: 'suppressed' }),
        makeBug({ status: 'in_progress' }),
      ];

      const queue = projectActiveBugs(bugs);
      expect(queue.total).toBe(2);
      expect(queue.bugs).toHaveLength(2);
    });

    it('sorts by risk score descending', () => {
      const bugs = [
        makeBug({ severity: 'low', occurrenceCount: 1 }),
        makeBug({ severity: 'critical', occurrenceCount: 10 }),
        makeBug({ severity: 'medium', occurrenceCount: 5 }),
      ];

      const queue = projectActiveBugs(bugs);
      // Critical should be first
      expect(queue.bugs[0].severity).toBe('critical');
    });

    it('counts by severity', () => {
      const bugs = [
        makeBug({ severity: 'high' }),
        makeBug({ severity: 'high' }),
        makeBug({ severity: 'low' }),
      ];

      const queue = projectActiveBugs(bugs);
      expect(queue.bySeverity.high).toBe(2);
      expect(queue.bySeverity.low).toBe(1);
    });
  });

  describe('projectHotspots', () => {
    it('groups bugs by file', () => {
      const bugs = [
        makeBug({ file: 'src/a.ts', occurrenceCount: 5 }),
        makeBug({ file: 'src/a.ts', occurrenceCount: 3 }),
        makeBug({ file: 'src/b.ts', occurrenceCount: 1 }),
      ];

      const leaderboard = projectHotspots(bugs);
      expect(leaderboard.totalFiles).toBe(2);
      expect(leaderboard.hotspots[0].file).toBe('src/a.ts');
      expect(leaderboard.hotspots[0].totalOccurrences).toBe(8);
    });

    it('excludes resolved bugs', () => {
      const bugs = [makeBug({ file: 'src/a.ts', status: 'resolved' })];

      const leaderboard = projectHotspots(bugs);
      expect(leaderboard.totalFiles).toBe(0);
    });

    it('tracks max severity per file', () => {
      const bugs = [
        makeBug({ file: 'src/a.ts', severity: 'low' }),
        makeBug({ file: 'src/a.ts', severity: 'critical' }),
      ];

      const leaderboard = projectHotspots(bugs);
      expect(leaderboard.hotspots[0].maxSeverity).toBe('critical');
    });
  });

  describe('projectFlakyTests', () => {
    it('counts flaky test events', () => {
      const events = [
        makeEvent('test.flaky', { testName: 'auth.test.ts' }),
        makeEvent('test.flaky', { testName: 'auth.test.ts' }),
        makeEvent('test.flaky', { testName: 'db.test.ts' }),
        makeEvent('test.passed', { testName: 'ok.test.ts' }),
      ];

      const index = projectFlakyTests(events);
      expect(index.total).toBe(2);
      expect(index.tests[0].testName).toBe('auth.test.ts');
      expect(index.tests[0].flakyCount).toBe(2);
    });

    it('returns empty for no flaky tests', () => {
      const events = [makeEvent('test.passed')];
      const index = projectFlakyTests(events);
      expect(index.total).toBe(0);
    });
  });

  describe('projectRepoHealth', () => {
    it('returns 100 with no bugs and no events', () => {
      const health = projectRepoHealth([], []);
      expect(health.score).toBe(100);
    });

    it('decreases with open bugs', () => {
      const bugs = Array.from({ length: 10 }, () => makeBug());
      const health = projectRepoHealth(bugs, []);
      expect(health.score).toBeLessThan(100);
    });

    it('accounts for test stability', () => {
      const events = [makeEvent('test.passed'), makeEvent('test.passed'), makeEvent('test.failed')];

      const health = projectRepoHealth([], events);
      expect(health.components.testStability).toBeLessThan(100);
    });

    it('score is between 0 and 100', () => {
      const bugs = Array.from({ length: 50 }, () => makeBug());
      const events = Array.from({ length: 20 }, () => makeEvent('test.failed'));
      const health = projectRepoHealth(bugs, events);
      expect(health.score).toBeGreaterThanOrEqual(0);
      expect(health.score).toBeLessThanOrEqual(100);
    });
  });

  describe('projectAgentTrust', () => {
    it('returns 100 with no agent events', () => {
      const trust = projectAgentTrust([]);
      expect(trust.score).toBe(100);
    });

    it('decreases with denied actions', () => {
      const events = [
        makeEvent('agent.action.requested'),
        makeEvent('agent.action.requested'),
        makeEvent('agent.action.denied'),
      ];

      const trust = projectAgentTrust(events);
      expect(trust.score).toBeLessThan(100);
      expect(trust.denied).toBe(1);
    });
  });

  describe('projectTimeline', () => {
    it('returns sorted entries with summaries', () => {
      const events = [
        makeEvent('error.detected', { message: 'null ref error' }),
        makeEvent('test.failed', { testName: 'auth.test.ts' }),
      ];

      const timeline = projectTimeline(events);
      expect(timeline).toHaveLength(2);
      expect(timeline[0].summary).toBeTruthy();
    });

    it('respects limit parameter', () => {
      const events = Array.from({ length: 100 }, () =>
        makeEvent('error.detected', { message: 'x' })
      );
      const timeline = projectTimeline(events, 5);
      expect(timeline).toHaveLength(5);
    });
  });

  describe('projectIncidentSummary', () => {
    it('summarizes open incidents', () => {
      const incidents: IncidentEntity[] = [
        {
          id: 'inc_1',
          title: 'Test incident',
          status: 'open',
          priority: 'p1',
          maxSeverity: 'high',
          bugIds: ['b1', 'b2'],
          correlationKeys: ['file:x'],
          openedAt: new Date().toISOString(),
          totalEvents: 5,
        },
        {
          id: 'inc_2',
          title: 'Resolved',
          status: 'resolved',
          priority: 'p3',
          maxSeverity: 'low',
          bugIds: ['b3'],
          correlationKeys: [],
          openedAt: new Date().toISOString(),
          totalEvents: 1,
        },
      ];

      const summary = projectIncidentSummary(incidents);
      expect(summary.openIncidents).toBe(1);
      expect(summary.totalBugs).toBe(2);
      expect(summary.highestPriority).toBe('p1');
    });
  });

  describe('projectFixRegressionRatio', () => {
    it('calculates fix to regression ratio', () => {
      const events = [
        makeEvent('error.resolved'),
        makeEvent('error.resolved'),
        makeEvent('error.resolved'),
        makeEvent('error.repeated'),
      ];

      const ratio = projectFixRegressionRatio(events);
      expect(ratio.fixes).toBe(3);
      expect(ratio.regressions).toBe(1);
      expect(ratio.ratio).toBe(3);
    });

    it('returns 1 with no events', () => {
      const ratio = projectFixRegressionRatio([]);
      expect(ratio.ratio).toBe(1);
    });
  });

  describe('projectDeveloperStreak', () => {
    it('returns zero streak with no events', () => {
      const streak = projectDeveloperStreak([]);
      expect(streak.currentStreak).toBe(0);
      expect(streak.bestStreak).toBe(0);
      expect(streak.lastActivityTs).toBeNull();
    });

    it('counts consecutive days with commits', () => {
      const today = new Date();
      const events: DevEvent[] = [];

      for (let i = 0; i < 5; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        resetDevEventCounter();
        events.push(
          createDevEvent({
            source: 'git',
            actor: 'human',
            kind: 'git.commit',
            payload: { message: `commit ${i}` },
          })
        );
        // Override the ts to simulate different days
        (events[events.length - 1] as Record<string, unknown>).ts = d.toISOString();
      }

      const streak = projectDeveloperStreak(events);
      expect(streak.bestStreak).toBeGreaterThanOrEqual(1);
    });
  });
});
