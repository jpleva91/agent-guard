import assert from 'node:assert';
import { test, suite } from './run.js';
import { resetEventCounter, createEvent, POLICY_DENIED } from '../dist/events/schema.js';
import { createEvidencePack } from '../dist/kernel/evidence.js';

suite('AgentGuard — Evidence Pack', () => {
  test('creates a valid evidence pack', () => {
    resetEventCounter();
    const policyEvent = createEvent(POLICY_DENIED, {
      policy: 'p1',
      action: 'file.write',
      reason: 'Not allowed',
    });

    const intent = { action: 'file.write', target: 'src/x.js', agent: 'test-agent' };
    const decision = { allowed: false, decision: 'deny', reason: 'Not allowed', severity: 3 };

    const { pack, event } = createEvidencePack({
      intent,
      decision,
      violations: [],
      events: [policyEvent],
    });

    assert.ok(pack.packId.startsWith('pack_'));
    assert.strictEqual(pack.intent, intent);
    assert.strictEqual(pack.decision, decision);
    assert.strictEqual(pack.violations.length, 0);
    assert.strictEqual(pack.events.length, 1);
    assert.ok(pack.summary.includes('file.write'));
    assert.ok(pack.summary.includes('DENY'));
    assert.strictEqual(pack.severity, 3);

    assert.strictEqual(event.kind, 'EvidencePackGenerated');
    assert.strictEqual(event.packId, pack.packId);
  });

  test('includes violations in evidence pack', () => {
    resetEventCounter();
    const violation = {
      invariant: { id: 'no-secret', name: 'No Secrets', severity: 5 },
      result: { holds: false, expected: 'No secrets', actual: '.env found' },
    };
    const intent = { action: 'git.push', target: 'main', agent: 'agent-1' };
    const decision = { allowed: false, decision: 'deny', reason: 'Blocked', severity: 3 };

    const { pack } = createEvidencePack({
      intent,
      decision,
      violations: [violation],
      events: [],
    });

    assert.strictEqual(pack.violations.length, 1);
    assert.strictEqual(pack.violations[0].invariantId, 'no-secret');
    assert.strictEqual(pack.severity, 5); // max of decision(3) and violation(5)
    assert.ok(pack.summary.includes('No Secrets'));
  });

  test('computes max severity across events and violations', () => {
    resetEventCounter();
    const v1 = {
      invariant: { id: 'a', name: 'A', severity: 2 },
      result: { expected: '', actual: '' },
    };
    const v2 = {
      invariant: { id: 'b', name: 'B', severity: 4 },
      result: { expected: '', actual: '' },
    };
    const intent = { action: 'file.write', target: '', agent: 'x' };
    const decision = { allowed: false, decision: 'deny', reason: '', severity: 1 };

    const { pack } = createEvidencePack({ intent, decision, violations: [v1, v2], events: [] });
    assert.strictEqual(pack.severity, 4);
  });
});
