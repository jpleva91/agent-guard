import assert from 'node:assert';
import { test, suite } from './run.js';
import {
  createAction,
  validateAction,
  validateActionType,
  resetActionCounter,
  getActionClass,
  listActionTypes,
  ACTION_CLASS,
  ACTION_TYPES,
  DECISION,
} from '../dist/core/actions.js';

suite('Domain Actions — Canonical Action Schema', () => {
  // --- Action Types ---

  test('ACTION_CLASS defines all expected classes', () => {
    assert.strictEqual(ACTION_CLASS.FILE, 'file');
    assert.strictEqual(ACTION_CLASS.TEST, 'test');
    assert.strictEqual(ACTION_CLASS.GIT, 'git');
    assert.strictEqual(ACTION_CLASS.SHELL, 'shell');
    assert.strictEqual(ACTION_CLASS.NPM, 'npm');
    assert.strictEqual(ACTION_CLASS.HTTP, 'http');
    assert.strictEqual(ACTION_CLASS.DEPLOY, 'deploy');
    assert.strictEqual(ACTION_CLASS.INFRA, 'infra');
  });

  test('ACTION_TYPES includes file operations', () => {
    assert.ok(ACTION_TYPES['file.read']);
    assert.ok(ACTION_TYPES['file.write']);
    assert.ok(ACTION_TYPES['file.delete']);
    assert.ok(ACTION_TYPES['file.move']);
    assert.strictEqual(ACTION_TYPES['file.write'].class, ACTION_CLASS.FILE);
  });

  test('ACTION_TYPES includes git operations', () => {
    assert.ok(ACTION_TYPES['git.diff']);
    assert.ok(ACTION_TYPES['git.commit']);
    assert.ok(ACTION_TYPES['git.push']);
    assert.ok(ACTION_TYPES['git.reset']);
    assert.strictEqual(ACTION_TYPES['git.push'].class, ACTION_CLASS.GIT);
  });

  test('DECISION defines allow, deny, escalate', () => {
    assert.strictEqual(DECISION.ALLOW, 'allow');
    assert.strictEqual(DECISION.DENY, 'deny');
    assert.strictEqual(DECISION.ESCALATE, 'escalate');
  });

  // --- validateActionType ---

  test('validateActionType accepts known types', () => {
    const result = validateActionType('file.write');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('validateActionType rejects unknown types', () => {
    const result = validateActionType('file.explode');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].includes('Unknown action type'));
  });

  test('validateActionType rejects empty string', () => {
    const result = validateActionType('');
    assert.strictEqual(result.valid, false);
  });

  test('validateActionType rejects non-string', () => {
    const result = validateActionType(42);
    assert.strictEqual(result.valid, false);
  });

  // --- validateAction ---

  test('validateAction accepts valid action object', () => {
    const result = validateAction({
      type: 'file.write',
      target: 'src/main.js',
      justification: 'Fix bug',
    });
    assert.strictEqual(result.valid, true);
  });

  test('validateAction rejects missing type', () => {
    const result = validateAction({ target: 'src/main.js', justification: 'Fix' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('type')));
  });

  test('validateAction rejects missing target', () => {
    const result = validateAction({ type: 'file.write', justification: 'Fix' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('target')));
  });

  test('validateAction rejects missing justification', () => {
    const result = validateAction({ type: 'file.write', target: 'src/main.js' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('justification')));
  });

  test('validateAction rejects null input', () => {
    const result = validateAction(null);
    assert.strictEqual(result.valid, false);
  });

  // --- createAction ---

  test('createAction returns canonical action with id, class, timestamp, fingerprint', () => {
    resetActionCounter();
    const action = createAction('file.write', 'src/auth/session.js', 'Fix token refresh');
    assert.strictEqual(action.type, 'file.write');
    assert.strictEqual(action.target, 'src/auth/session.js');
    assert.strictEqual(action.justification, 'Fix token refresh');
    assert.strictEqual(action.class, ACTION_CLASS.FILE);
    assert.ok(action.id.startsWith('act_'));
    assert.strictEqual(typeof action.timestamp, 'number');
    assert.strictEqual(typeof action.fingerprint, 'string');
  });

  test('createAction generates unique IDs', () => {
    const a1 = createAction('file.read', 'a.js', 'Read');
    const a2 = createAction('file.read', 'b.js', 'Read');
    assert.notStrictEqual(a1.id, a2.id);
  });

  test('createAction generates stable fingerprints for same inputs', () => {
    resetActionCounter();
    const a1 = createAction('file.write', 'x.js', 'Test');
    resetActionCounter();
    const a2 = createAction('file.write', 'x.js', 'Test');
    assert.strictEqual(a1.fingerprint, a2.fingerprint);
  });

  test('createAction includes metadata', () => {
    const action = createAction('npm.script.run', 'test', 'Run tests', {
      args: ['--coverage'],
    });
    assert.deepStrictEqual(action.args, ['--coverage']);
  });

  test('createAction throws on unknown type', () => {
    assert.throws(
      () => createAction('file.explode', 'x.js', 'Boom'),
      (err) => err.message.includes('Unknown action type')
    );
  });

  test('createAction throws on missing justification', () => {
    assert.throws(
      () => createAction('file.write', 'x.js', ''),
      (err) => err.message.includes('justification')
    );
  });

  // --- getActionClass ---

  test('getActionClass returns correct class', () => {
    assert.strictEqual(getActionClass('file.write'), 'file');
    assert.strictEqual(getActionClass('git.push'), 'git');
    assert.strictEqual(getActionClass('npm.install'), 'npm');
  });

  test('getActionClass returns null for unknown type', () => {
    assert.strictEqual(getActionClass('unknown.type'), null);
  });

  // --- listActionTypes ---

  test('listActionTypes returns all known types', () => {
    const types = listActionTypes();
    assert.ok(types.includes('file.write'));
    assert.ok(types.includes('git.push'));
    assert.ok(types.includes('deploy.trigger'));
    assert.ok(types.length > 10);
  });

  // --- resetActionCounter ---

  test('resetActionCounter resets the ID counter', () => {
    resetActionCounter();
    const a1 = createAction('file.read', 'a.js', 'Read');
    const counter1 = a1.id.split('_')[2];
    resetActionCounter();
    const a2 = createAction('file.read', 'b.js', 'Read');
    const counter2 = a2.id.split('_')[2];
    assert.strictEqual(counter1, counter2);
  });
});
