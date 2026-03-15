import assert from 'node:assert';
import { test, suite } from './run.js';
import { resetEventCounter } from '../dist/events/schema.js';
import { createMonitor, ESCALATION } from '../dist/kernel/monitor.js';

suite('AgentGuard — Runtime Monitor', () => {
  test('monitor denies actions with no policies (default deny)', () => {
    resetEventCounter();
    const monitor = createMonitor();
    const result = monitor.process({ tool: 'Write', file: 'src/x.js' });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.monitor.totalEvaluations, 1);
  });

  test('monitor allows actions in fail-open mode', () => {
    resetEventCounter();
    const monitor = createMonitor({ evaluateOptions: { defaultDeny: false } });
    const result = monitor.process({ tool: 'Write', file: 'src/x.js' });
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.monitor.escalationLevel, ESCALATION.NORMAL);
    assert.strictEqual(result.monitor.totalEvaluations, 1);
  });

  test('monitor tracks denials', () => {
    resetEventCounter();
    const monitor = createMonitor({
      policyDefs: [
        {
          id: 'p1',
          name: 'Block Writes',
          severity: 3,
          rules: [{ action: 'file.write', effect: 'deny' }],
        },
      ],
    });
    monitor.process({ tool: 'Write', file: 'a.js' });
    monitor.process({ tool: 'Write', file: 'b.js' });

    const status = monitor.getStatus();
    assert.strictEqual(status.totalDenials, 2);
    assert.strictEqual(status.totalEvaluations, 2);
  });

  test('monitor escalates after threshold denials', () => {
    resetEventCounter();
    const monitor = createMonitor({
      policyDefs: [
        {
          id: 'p1',
          name: 'Block',
          severity: 3,
          rules: [{ action: 'file.write', effect: 'deny' }],
        },
      ],
      denialThreshold: 3,
    });

    // Process enough denials to escalate
    for (let i = 0; i < 3; i++) {
      monitor.process({ tool: 'Write', file: `f${i}.js` });
    }

    const status = monitor.getStatus();
    assert.strictEqual(status.escalationLevel, ESCALATION.HIGH);
  });

  test('monitor enters lockdown after double threshold', () => {
    resetEventCounter();
    const monitor = createMonitor({
      policyDefs: [
        {
          id: 'p1',
          name: 'Block',
          severity: 3,
          rules: [{ action: 'file.write', effect: 'deny' }],
        },
      ],
      denialThreshold: 2,
    });

    // 4 denials = 2x threshold = lockdown
    for (let i = 0; i < 4; i++) {
      monitor.process({ tool: 'Write', file: `f${i}.js` });
    }

    assert.strictEqual(monitor.getStatus().escalationLevel, ESCALATION.LOCKDOWN);

    // Lockdown blocks everything
    const result = monitor.process({ tool: 'Read', file: 'safe.js' });
    assert.strictEqual(result.allowed, false);
    assert.ok(result.decision.reason.includes('LOCKDOWN'));
  });

  test('monitor reset clears escalation', () => {
    resetEventCounter();
    const monitor = createMonitor({
      policyDefs: [
        {
          id: 'p1',
          name: 'Block',
          severity: 3,
          rules: [{ action: 'file.write', effect: 'deny' }],
        },
      ],
      denialThreshold: 1,
    });

    monitor.process({ tool: 'Write', file: 'x.js' });
    assert.ok(monitor.getStatus().escalationLevel >= ESCALATION.ELEVATED);

    monitor.resetEscalation();
    assert.strictEqual(monitor.getStatus().escalationLevel, ESCALATION.NORMAL);
    assert.strictEqual(monitor.getStatus().totalDenials, 0);
  });

  test('monitor event bus emits governance events', () => {
    resetEventCounter();
    const collected = [];
    const monitor = createMonitor({
      policyDefs: [
        {
          id: 'p1',
          name: 'Block',
          severity: 3,
          rules: [{ action: 'file.write', effect: 'deny' }],
        },
      ],
    });

    monitor.bus.on('PolicyDenied', (event) => collected.push(event));
    monitor.process({ tool: 'Write', file: 'x.js' });
    assert.ok(collected.length > 0);
  });

  test('monitor stores events in event store', () => {
    resetEventCounter();
    const monitor = createMonitor({
      policyDefs: [
        {
          id: 'p1',
          name: 'Block',
          severity: 3,
          rules: [{ action: 'file.write', effect: 'deny' }],
        },
      ],
    });

    monitor.process({ tool: 'Write', file: 'x.js' });
    assert.ok(monitor.store.count() > 0);
  });

  test('getStatus reports comprehensive state', () => {
    resetEventCounter();
    const monitor = createMonitor();
    const status = monitor.getStatus();

    assert.strictEqual(typeof status.escalationLevel, 'number');
    assert.strictEqual(typeof status.totalEvaluations, 'number');
    assert.strictEqual(typeof status.totalDenials, 'number');
    assert.strictEqual(typeof status.totalViolations, 'number');
    assert.strictEqual(typeof status.eventCount, 'number');
    assert.strictEqual(typeof status.uptime, 'number');
    assert.strictEqual(typeof status.policyCount, 'number');
    assert.strictEqual(typeof status.invariantCount, 'number');
    assert.ok(Array.isArray(status.policyErrors));
    assert.ok(Array.isArray(status.recentDenials));
  });

  test('ESCALATION constants are defined', () => {
    assert.strictEqual(ESCALATION.NORMAL, 0);
    assert.strictEqual(ESCALATION.ELEVATED, 1);
    assert.strictEqual(ESCALATION.HIGH, 2);
    assert.strictEqual(ESCALATION.LOCKDOWN, 3);
  });
});
