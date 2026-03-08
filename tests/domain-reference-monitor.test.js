import assert from 'node:assert';
import { test, suite } from './run.js';
import { createMonitor, MONITOR_EVENTS } from '../domain/reference-monitor.js';
import { DECISION, resetActionCounter } from '../domain/actions.js';
import { EventBus } from '../domain/event-bus.js';

suite('Domain Reference Monitor — Agent Action Boundary', () => {
  // --- Construction ---

  test('createMonitor creates a frozen monitor instance', () => {
    const monitor = createMonitor({ capabilities: ['file.read:*'] });
    assert.ok(Object.isFrozen(monitor));
    assert.strictEqual(typeof monitor.authorize, 'function');
    assert.strictEqual(typeof monitor.authorizeBatch, 'function');
    assert.strictEqual(typeof monitor.getTrail, 'function');
    assert.strictEqual(typeof monitor.getPolicyHash, 'function');
    assert.strictEqual(typeof monitor.getStats, 'function');
  });

  test('createMonitor throws on invalid policy', () => {
    assert.throws(
      () => createMonitor(null),
      (err) => err.message.includes('Invalid policy'),
    );
  });

  test('createMonitor throws on missing capabilities', () => {
    assert.throws(
      () => createMonitor({}),
      (err) => err.message.includes('capabilities'),
    );
  });

  // --- authorize: allow ---

  test('authorize allows action with matching capability', () => {
    resetActionCounter();
    const monitor = createMonitor({ capabilities: ['file.write:src/**'] });
    const result = monitor.authorize('file.write', 'src/main.js', 'Fix bug');
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.decision, DECISION.ALLOW);
    assert.ok(result.action.id.startsWith('act_'));
    assert.ok(result.decisionRecord.decisionId.startsWith('dec_'));
  });

  // --- authorize: deny ---

  test('authorize denies action without capability', () => {
    const monitor = createMonitor({ capabilities: ['file.read:*'] });
    const result = monitor.authorize('file.write', 'src/main.js', 'Edit file');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.decision, DECISION.DENY);
  });

  test('authorize denies explicitly denied action', () => {
    const monitor = createMonitor({
      capabilities: ['file.*:*'],
      deny: ['file.delete:*'],
    });
    const result = monitor.authorize('file.delete', 'config.json', 'Clean up');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.decision, DECISION.DENY);
    assert.ok(result.reason.includes('Explicitly denied'));
  });

  // --- authorize: escalate ---

  test('authorize escalates on protected path', () => {
    const monitor = createMonitor({
      capabilities: ['file.write:*'],
      protectedPaths: ['.env', 'secrets/**'],
    });
    const result = monitor.authorize('file.write', '.env', 'Update config');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.decision, DECISION.ESCALATE);
  });

  test('authorize calls onEscalate callback', () => {
    let escalated = null;
    const monitor = createMonitor(
      {
        capabilities: ['git.push:*'],
        protectedBranches: ['main'],
      },
      {
        onEscalate: (record) => {
          escalated = record;
        },
      },
    );
    monitor.authorize('git.push', 'main', 'Deploy hotfix');
    assert.ok(escalated);
    assert.strictEqual(escalated.decision, DECISION.ESCALATE);
  });

  // --- Audit trail ---

  test('authorize records decisions in audit trail', () => {
    const monitor = createMonitor({ capabilities: ['file.read:*'] });
    monitor.authorize('file.read', 'a.js', 'Read');
    monitor.authorize('file.write', 'b.js', 'Write');
    const trail = monitor.getTrail();
    assert.strictEqual(trail.length, 2);
    assert.strictEqual(trail[0].decision, DECISION.ALLOW);
    assert.strictEqual(trail[1].decision, DECISION.DENY);
  });

  test('getTrail returns a copy (immutable)', () => {
    const monitor = createMonitor({ capabilities: ['file.read:*'] });
    monitor.authorize('file.read', 'a.js', 'Read');
    const trail1 = monitor.getTrail();
    const trail2 = monitor.getTrail();
    assert.notStrictEqual(trail1, trail2);
    assert.deepStrictEqual(trail1, trail2);
  });

  test('decision records are frozen', () => {
    const monitor = createMonitor({ capabilities: ['file.read:*'] });
    const result = monitor.authorize('file.read', 'a.js', 'Read');
    assert.ok(Object.isFrozen(result.decisionRecord));
  });

  test('decision records include policy hash', () => {
    const monitor = createMonitor({ capabilities: ['file.read:*'] });
    const result = monitor.authorize('file.read', 'a.js', 'Read');
    assert.strictEqual(result.decisionRecord.policyHash, monitor.getPolicyHash());
  });

  // --- Stats ---

  test('getStats returns correct counts', () => {
    const monitor = createMonitor({
      capabilities: ['file.read:*'],
      protectedPaths: ['secret'],
    });
    monitor.authorize('file.read', 'a.js', 'Read');
    monitor.authorize('file.write', 'b.js', 'Write');
    monitor.authorize('file.read', 'secret', 'Read secret');
    const stats = monitor.getStats();
    assert.strictEqual(stats.total, 3);
    assert.strictEqual(stats.allowed, 1);
    assert.strictEqual(stats.denied, 1);
    assert.strictEqual(stats.escalated, 1);
  });

  // --- EventBus integration ---

  test('monitor emits events to provided EventBus', () => {
    const bus = new EventBus();
    const events = [];
    bus.on(MONITOR_EVENTS.ACTION_REQUESTED, (e) => events.push({ type: 'requested', ...e }));
    bus.on(MONITOR_EVENTS.ACTION_ALLOWED, (e) => events.push({ type: 'allowed', ...e }));
    bus.on(MONITOR_EVENTS.ACTION_DENIED, (e) => events.push({ type: 'denied', ...e }));

    const monitor = createMonitor({ capabilities: ['file.read:*'] }, { eventBus: bus });
    monitor.authorize('file.read', 'a.js', 'Read');
    monitor.authorize('file.write', 'b.js', 'Write');

    // Filter out PolicyLoaded event
    const actionEvents = events.filter((e) => e.type !== 'loaded');
    assert.strictEqual(actionEvents.length, 4); // 2 requested + 1 allowed + 1 denied
  });

  test('monitor emits PolicyLoaded on creation', () => {
    const bus = new EventBus();
    let loadedEvent = null;
    bus.on(MONITOR_EVENTS.POLICY_LOADED, (e) => {
      loadedEvent = e;
    });

    createMonitor({ capabilities: ['file.read:*', 'test.run:*'] }, { eventBus: bus });
    assert.ok(loadedEvent);
    assert.strictEqual(loadedEvent.capabilityCount, 2);
    assert.strictEqual(loadedEvent.denyRuleCount, 0);
  });

  // --- Policy immutability ---

  test('policy cannot be mutated after monitor creation', () => {
    const policy = { capabilities: ['file.read:*'] };
    const monitor = createMonitor(policy);

    // Mutate original policy — should not affect monitor
    policy.capabilities.push('infra.destroy:*');

    const result = monitor.authorize('infra.destroy', 'prod', 'Destroy');
    assert.strictEqual(result.allowed, false);
  });

  // --- authorizeBatch ---

  test('authorizeBatch allows when all actions pass', () => {
    const monitor = createMonitor({
      capabilities: ['file.read:*', 'file.write:src/**'],
    });
    const batch = monitor.authorizeBatch([
      { type: 'file.read', target: 'a.js', justification: 'Read' },
      { type: 'file.write', target: 'src/b.js', justification: 'Write' },
    ]);
    assert.strictEqual(batch.allowed, true);
    assert.strictEqual(batch.results.length, 2);
  });

  test('authorizeBatch fails when any action is denied', () => {
    const monitor = createMonitor({ capabilities: ['file.read:*'] });
    const batch = monitor.authorizeBatch([
      { type: 'file.read', target: 'a.js', justification: 'Read' },
      { type: 'file.write', target: 'b.js', justification: 'Write' },
    ]);
    assert.strictEqual(batch.allowed, false);
    assert.strictEqual(batch.results[0].allowed, true);
    assert.strictEqual(batch.results[1].allowed, false);
  });

  // --- MONITOR_EVENTS ---

  test('MONITOR_EVENTS defines all event types', () => {
    assert.strictEqual(MONITOR_EVENTS.ACTION_REQUESTED, 'ActionRequested');
    assert.strictEqual(MONITOR_EVENTS.ACTION_ALLOWED, 'ActionAllowed');
    assert.strictEqual(MONITOR_EVENTS.ACTION_DENIED, 'ActionDenied');
    assert.strictEqual(MONITOR_EVENTS.ACTION_ESCALATED, 'ActionEscalated');
    assert.strictEqual(MONITOR_EVENTS.POLICY_LOADED, 'PolicyLoaded');
    assert.strictEqual(MONITOR_EVENTS.POLICY_VIOLATION, 'PolicyViolation');
  });
});
