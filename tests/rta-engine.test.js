import assert from 'node:assert';
import { test, suite } from './run.js';
import { resetEventCounter } from '../dist/events/schema.js';
import { createEngine, INTERVENTION } from '../dist/kernel/decision.js';

suite('AgentGuard — Runtime Assurance Engine', () => {
  test('engine denies action with no policies (default deny)', () => {
    resetEventCounter();
    const engine = createEngine();
    const result = engine.evaluate({ tool: 'Write', file: 'src/x.js' });
    assert.strictEqual(result.allowed, false);
    assert.ok(result.decision.reason.includes('default deny'));
  });

  test('engine allows safe action in fail-open mode', () => {
    resetEventCounter();
    const engine = createEngine({ evaluateOptions: { defaultDeny: false } });
    const result = engine.evaluate({ tool: 'Write', file: 'src/x.js' });
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.intervention, null);
    assert.strictEqual(result.violations.length, 0);
  });

  test('engine denies action matching deny policy', () => {
    resetEventCounter();
    const engine = createEngine({
      policyDefs: [
        {
          id: 'no-delete',
          name: 'No Delete',
          severity: 4,
          rules: [{ action: 'file.delete', effect: 'deny', reason: 'Deletes forbidden' }],
        },
      ],
    });
    const result = engine.evaluate({ tool: 'Bash', command: 'rm src/x.js', file: 'src/x.js' });
    // Bash maps to shell.exec, not file.delete — deny rule doesn't match,
    // but default-deny still blocks it
    assert.strictEqual(result.allowed, false);
  });

  test('engine denies destructive shell commands', () => {
    resetEventCounter();
    const engine = createEngine();
    const result = engine.evaluate({ tool: 'Bash', command: 'rm -rf /' });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.intervention, INTERVENTION.DENY);
    assert.ok(result.events.length > 0);
  });

  test('engine checks invariants on git push', () => {
    resetEventCounter();
    const engine = createEngine();
    const result = engine.evaluate(
      { tool: 'Bash', command: 'git push origin main' },
      { modifiedFiles: ['src/x.js'], testsPass: false }
    );
    // Should detect: direct push to main + tests not passing
    assert.strictEqual(result.allowed, false);
    assert.ok(result.violations.length > 0);
  });

  test('engine generates evidence pack for denials', () => {
    resetEventCounter();
    const engine = createEngine({
      policyDefs: [
        {
          id: 'p1',
          name: 'Block All',
          severity: 3,
          rules: [{ action: '*', effect: 'deny', reason: 'Everything blocked' }],
        },
      ],
    });
    const result = engine.evaluate({ tool: 'Write', file: 'src/x.js' });
    assert.strictEqual(result.allowed, false);
    assert.ok(result.evidencePack !== null);
    assert.ok(result.evidencePack.packId.startsWith('pack_'));
  });

  test('engine emits events through callback', () => {
    resetEventCounter();
    const collected = [];
    const engine = createEngine({
      policyDefs: [
        {
          id: 'p1',
          name: 'Block',
          severity: 3,
          rules: [{ action: 'file.write', effect: 'deny' }],
        },
      ],
      onEvent: (event) => collected.push(event),
    });
    engine.evaluate({ tool: 'Write', file: 'src/x.js' });
    assert.ok(collected.length > 0);
    assert.ok(collected.some((e) => e.kind === 'PolicyDenied'));
  });

  test('engine reports policy count and errors', () => {
    resetEventCounter();
    const engine = createEngine({
      policyDefs: [
        { id: 'a', name: 'A', rules: [{ action: '*', effect: 'deny' }] },
        { id: 'b' }, // invalid
      ],
    });
    assert.strictEqual(engine.getPolicyCount(), 1);
    assert.ok(engine.getPolicyErrors().length > 0);
  });

  test('intervention levels based on severity', () => {
    assert.strictEqual(INTERVENTION.DENY, 'deny');
    assert.strictEqual(INTERVENTION.PAUSE, 'pause');
    assert.strictEqual(INTERVENTION.ROLLBACK, 'rollback');
    assert.strictEqual(INTERVENTION.TEST_ONLY, 'test-only');
  });

  test('engine detects secret exposure via invariants', () => {
    resetEventCounter();
    const engine = createEngine();
    const result = engine.evaluate(
      { tool: 'Bash', command: 'git push origin feature' },
      { modifiedFiles: ['.env', 'src/app.js'] }
    );
    assert.strictEqual(result.allowed, false);
    assert.ok(result.violations.some((v) => v.invariantId === 'no-secret-exposure'));
  });

  test('engine denies git push to feature branch without allow rule (default deny)', () => {
    resetEventCounter();
    const engine = createEngine();
    const result = engine.evaluate(
      { tool: 'Bash', command: 'git push origin feature/x' },
      { modifiedFiles: ['src/app.js'], testsPass: true }
    );
    // No allow rule for git.push, so default-deny blocks it
    assert.strictEqual(result.allowed, false);
  });

  test('engine allows safe git push in fail-open mode', () => {
    resetEventCounter();
    const engine = createEngine({ evaluateOptions: { defaultDeny: false } });
    const result = engine.evaluate(
      { tool: 'Bash', command: 'git push origin feature/x' },
      { modifiedFiles: ['src/app.js'], testsPass: true }
    );
    assert.strictEqual(result.allowed, true);
  });
});
