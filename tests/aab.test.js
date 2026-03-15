import assert from 'node:assert';
import { test, suite } from './run.js';
import { resetEventCounter } from '../dist/events/schema.js';
import {
  normalizeIntent,
  authorize,
  detectGitAction,
  isDestructiveCommand,
} from '../dist/kernel/aab.js';

suite('AgentGuard — Action Authorization Boundary', () => {
  test('normalizeIntent maps Write tool to file.write', () => {
    const intent = normalizeIntent({ tool: 'Write', file: 'src/index.js' });
    assert.strictEqual(intent.action, 'file.write');
    assert.strictEqual(intent.target, 'src/index.js');
  });

  test('normalizeIntent maps Edit tool to file.write', () => {
    const intent = normalizeIntent({ tool: 'Edit', file: 'src/foo.js' });
    assert.strictEqual(intent.action, 'file.write');
  });

  test('normalizeIntent maps Bash tool to shell.exec', () => {
    const intent = normalizeIntent({ tool: 'Bash', command: 'echo hello' });
    assert.strictEqual(intent.action, 'shell.exec');
  });

  test('normalizeIntent detects git push from Bash command', () => {
    const intent = normalizeIntent({ tool: 'Bash', command: 'git push origin main' });
    assert.strictEqual(intent.action, 'git.push');
    assert.strictEqual(intent.target, 'main');
  });

  test('normalizeIntent detects git force-push', () => {
    const intent = normalizeIntent({ tool: 'Bash', command: 'git push --force origin dev' });
    assert.strictEqual(intent.action, 'git.force-push');
  });

  test('normalizeIntent detects git force-push -f', () => {
    const intent = normalizeIntent({ tool: 'Bash', command: 'git push -f origin dev' });
    assert.strictEqual(intent.action, 'git.force-push');
  });

  test('normalizeIntent handles null/undefined input', () => {
    const intent = normalizeIntent(null);
    assert.strictEqual(intent.action, 'unknown');
  });

  test('detectGitAction identifies git operations', () => {
    assert.strictEqual(detectGitAction('git push origin main'), 'git.push');
    assert.strictEqual(detectGitAction('git push --force origin main'), 'git.force-push');
    assert.strictEqual(detectGitAction('git branch -D feat'), 'git.branch.delete');
    assert.strictEqual(detectGitAction('git merge dev'), 'git.merge');
    assert.strictEqual(detectGitAction('git commit -m "fix"'), 'git.commit');
    assert.strictEqual(detectGitAction('echo hello'), null);
    assert.strictEqual(detectGitAction(null), null);
  });

  test('isDestructiveCommand detects dangerous patterns', () => {
    assert.ok(isDestructiveCommand('rm -rf /'));
    assert.ok(isDestructiveCommand('rm -r src/'));
    assert.ok(isDestructiveCommand('sudo rm file'));
    assert.ok(isDestructiveCommand('chmod 777 /etc'));
    assert.ok(isDestructiveCommand('DROP DATABASE prod'));
    assert.ok(!isDestructiveCommand('echo hello'));
    assert.ok(!isDestructiveCommand('npm test'));
    assert.ok(!isDestructiveCommand(null));
  });

  test('normalizeIntent marks destructive commands', () => {
    const intent = normalizeIntent({ tool: 'Bash', command: 'rm -rf src/' });
    assert.strictEqual(intent.destructive, true);
  });

  test('authorize denies file write with no policies (default deny)', () => {
    resetEventCounter();
    const { result } = authorize({ tool: 'Write', file: 'src/index.js' }, []);
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('default deny'));
  });

  test('authorize allows file write with no policies (fail-open)', () => {
    resetEventCounter();
    const { result, events } = authorize({ tool: 'Write', file: 'src/index.js' }, [], {
      defaultDeny: false,
    });
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(events.length, 0);
  });

  test('authorize denies when policy denies', () => {
    resetEventCounter();
    const policies = [
      {
        id: 'p1',
        name: 'No Writes',
        severity: 3,
        rules: [{ action: 'file.write', effect: 'deny', reason: 'No writes allowed' }],
      },
    ];
    const { result, events } = authorize({ tool: 'Write', file: 'src/index.js' }, policies);
    assert.strictEqual(result.allowed, false);
    assert.ok(events.length > 0);
    assert.strictEqual(events[0].kind, 'PolicyDenied');
  });

  test('authorize blocks destructive commands regardless of policy', () => {
    resetEventCounter();
    const { result, events } = authorize({ tool: 'Bash', command: 'rm -rf /' }, []);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.severity, 5);
    assert.ok(events.length > 0);
    assert.strictEqual(events[0].kind, 'UnauthorizedAction');
  });

  test('authorize generates BLAST_RADIUS_EXCEEDED when over limit', () => {
    resetEventCounter();
    const policies = [
      {
        id: 'p1',
        name: 'Limit',
        severity: 3,
        rules: [
          {
            action: 'file.write',
            effect: 'allow',
            conditions: { limit: 5 },
          },
        ],
      },
    ];
    const { events } = authorize(
      { tool: 'Write', file: 'src/index.js', filesAffected: 10 },
      policies
    );
    assert.ok(events.some((e) => e.kind === 'BlastRadiusExceeded'));
  });
});
