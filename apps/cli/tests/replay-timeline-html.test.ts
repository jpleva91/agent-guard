import { describe, it, expect } from 'vitest';
import { generateTimelineHtml } from '../src/replay-timeline-html.js';
import type { ReplaySession, ReplayAction } from '@red-codes/kernel';
import type { DomainEvent } from '@red-codes/core';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeEvent(kind: string, overrides: Record<string, unknown> = {}): DomainEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    timestamp: 1700000000000,
    fingerprint: 'test',
    ...overrides,
  } as DomainEvent;
}

function makeAction(overrides: Partial<ReplayAction> = {}): ReplayAction {
  const requestedEvent = makeEvent('ActionRequested', { timestamp: 1700000000000 });
  return {
    index: 0,
    requestedEvent,
    decisionEvent: makeEvent('ActionAllowed', { timestamp: 1700000000100 }),
    executionEvent: makeEvent('ActionExecuted', { timestamp: 1700000000200 }),
    simulationEvent: null,
    decisionRecordEvent: null,
    escalationEvent: null,
    governanceEvents: [],
    allowed: true,
    executed: true,
    succeeded: true,
    actionType: 'file.write',
    target: 'src/test.ts',
    ...overrides,
  } as ReplayAction;
}

function makeSession(overrides: Partial<ReplaySession> = {}): ReplaySession {
  const actions = overrides.actions ?? [makeAction()];
  return {
    runId: 'test_run_001',
    events: [
      makeEvent('ActionRequested', { timestamp: 1700000000000 }),
      makeEvent('ActionAllowed', { timestamp: 1700000000100 }),
      makeEvent('ActionExecuted', { timestamp: 1700000000200 }),
    ],
    actions,
    summary: {
      totalActions: actions.length,
      allowed: actions.filter((a) => a.allowed).length,
      denied: actions.filter((a) => !a.allowed).length,
      executed: actions.filter((a) => a.executed).length,
      failed: actions.filter((a) => a.executed && !a.succeeded).length,
      violations: 0,
      escalations: 0,
      simulationsRun: 0,
      durationMs: 5000,
      actionTypes: { 'file.write': 1 },
      denialReasons: [],
      ...overrides.summary,
    },
    startEvent: null,
    endEvent: null,
    ...overrides,
  } as ReplaySession;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateTimelineHtml', () => {
  it('generates valid HTML with required structure', () => {
    const session = makeSession();
    const html = generateTimelineHtml(session, session.events);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('AgentGuard Timeline Viewer');
    expect(html).toContain('test_run_001');
  });

  it('includes summary cards with correct counts', () => {
    const session = makeSession({
      summary: {
        totalActions: 5,
        allowed: 3,
        denied: 2,
        executed: 3,
        failed: 0,
        violations: 1,
        escalations: 0,
        simulationsRun: 1,
        durationMs: 12000,
        actionTypes: { 'file.write': 3, 'git.push': 2 },
        denialReasons: ['policy: no-push'],
      },
    } as Partial<ReplaySession>);
    const html = generateTimelineHtml(session, session.events);

    expect(html).toContain('>5<'); // totalActions
    expect(html).toContain('>3<'); // allowed
    expect(html).toContain('>2<'); // denied
  });

  it('renders action entries in the timeline', () => {
    const action = makeAction({
      actionType: 'git.push',
      target: 'origin/main',
    });
    const session = makeSession({ actions: [action] });
    const html = generateTimelineHtml(session, session.events);

    expect(html).toContain('git.push');
    expect(html).toContain('origin/main');
    expect(html).toContain('ALLOWED');
  });

  it('renders denied actions with correct badge', () => {
    const action = makeAction({
      allowed: false,
      executed: false,
      succeeded: false,
      actionType: 'git.push',
      target: 'origin/main',
      decisionEvent: makeEvent('ActionDenied', {
        timestamp: 1700000000100,
        reason: 'Protected branch',
      }),
      executionEvent: null,
    });
    const session = makeSession({
      actions: [action],
      summary: { denied: 1, allowed: 0 },
    } as Partial<ReplaySession>);
    const html = generateTimelineHtml(session, session.events);

    expect(html).toContain('DENIED');
    expect(html).toContain('action-denied');
    expect(html).toContain('Protected branch');
  });

  it('renders governance violation events', () => {
    const govEvent = makeEvent('InvariantViolation', {
      timestamp: 1700000000150,
      invariant: 'no-force-push',
    });
    const action = makeAction({
      governanceEvents: [govEvent],
      actionType: 'git.push',
    });
    const session = makeSession({ actions: [action] });
    const html = generateTimelineHtml(session, session.events);

    expect(html).toContain('InvariantViolation');
    expect(html).toContain('no-force-push');
    expect(html).toContain('violation');
  });

  it('renders simulation badge when present', () => {
    const simEvent = makeEvent('SimulationCompleted', {
      timestamp: 1700000000150,
      riskLevel: 'high',
      blastRadius: 42,
    });
    const action = makeAction({ simulationEvent: simEvent });
    const session = makeSession({ actions: [action] });
    const html = generateTimelineHtml(session, session.events);

    expect(html).toContain('risk=high');
    expect(html).toContain('blast=42');
  });

  it('includes filter checkboxes for action types', () => {
    const actions = [
      makeAction({ index: 0, actionType: 'file.write', target: 'a.ts' }),
      makeAction({ index: 1, actionType: 'git.push', target: 'origin/main' }),
    ];
    const session = makeSession({ actions });
    const html = generateTimelineHtml(session, session.events);

    expect(html).toContain('data-action-type="file.write"');
    expect(html).toContain('data-action-type="git.push"');
  });

  it('includes scrubber with correct range', () => {
    const actions = [makeAction({ index: 0 }), makeAction({ index: 1 }), makeAction({ index: 2 })];
    const session = makeSession({ actions });
    const html = generateTimelineHtml(session, session.events);

    expect(html).toContain('max="2"');
    expect(html).toContain('3 / 3 actions');
  });

  it('includes JavaScript for toggle, filter, and scrub', () => {
    const session = makeSession();
    const html = generateTimelineHtml(session, session.events);

    expect(html).toContain('function toggleDetail');
    expect(html).toContain('function applyFilters');
    expect(html).toContain('function scrubTo');
  });

  it('respects deniedOnly option', () => {
    const allowed = makeAction({ index: 0, allowed: true, actionType: 'file.read' });
    const denied = makeAction({
      index: 1,
      allowed: false,
      executed: false,
      succeeded: false,
      actionType: 'git.push',
      decisionEvent: makeEvent('ActionDenied'),
      executionEvent: null,
    });
    const session = makeSession({ actions: [allowed, denied] });
    const html = generateTimelineHtml(session, session.events, { deniedOnly: true });

    expect(html).toContain('git.push');
    expect(html).not.toContain('data-kind="file.read"');
  });

  it('escapes HTML in target paths', () => {
    const action = makeAction({
      target: '<script>alert("xss")</script>',
    });
    const session = makeSession({ actions: [action] });
    const html = generateTimelineHtml(session, session.events);

    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('handles empty session gracefully', () => {
    const session = makeSession({
      actions: [],
      events: [],
      summary: {
        totalActions: 0,
        allowed: 0,
        denied: 0,
        executed: 0,
        failed: 0,
        violations: 0,
        escalations: 0,
        simulationsRun: 0,
        durationMs: 0,
        actionTypes: {},
        denialReasons: [],
      },
    } as Partial<ReplaySession>);
    const html = generateTimelineHtml(session, []);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('>0<'); // zero actions
  });

  it('renders lifecycle steps for each action', () => {
    const session = makeSession();
    const html = generateTimelineHtml(session, session.events);

    expect(html).toContain('PROPOSE');
    expect(html).toContain('EVALUATE');
    expect(html).toContain('EXECUTE');
    expect(html).toContain('EMIT');
    expect(html).toContain('→');
  });

  it('renders event distribution bars', () => {
    const events = [
      makeEvent('ActionRequested', { timestamp: 1700000000000 }),
      makeEvent('ActionAllowed', { timestamp: 1700000000100 }),
      makeEvent('ActionExecuted', { timestamp: 1700000000200 }),
      makeEvent('ActionRequested', { timestamp: 1700000000300 }),
      makeEvent('ActionDenied', { timestamp: 1700000000400 }),
    ];
    const session = makeSession({ events });
    const html = generateTimelineHtml(session, events);

    expect(html).toContain('Event Distribution');
    expect(html).toContain('ActionRequested');
    expect(html).toContain('bar-fill');
  });
});
