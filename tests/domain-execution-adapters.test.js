import assert from 'node:assert';
import { test, suite } from './run.js';
import {
  createAdapterRegistry,
  createDryRunAdapter,
  createDryRunRegistry,
} from '../domain/execution/adapters.js';
import { createAction, resetActionCounter, DECISION } from '../domain/actions.js';

suite('Domain Execution Adapters', () => {
  // --- Adapter Registry ---

  test('createAdapterRegistry returns frozen registry', () => {
    const registry = createAdapterRegistry();
    assert.ok(Object.isFrozen(registry));
    assert.strictEqual(typeof registry.register, 'function');
    assert.strictEqual(typeof registry.execute, 'function');
    assert.strictEqual(typeof registry.has, 'function');
    assert.strictEqual(typeof registry.listRegistered, 'function');
  });

  test('register and has work correctly', () => {
    const registry = createAdapterRegistry();
    assert.strictEqual(registry.has('file'), false);
    registry.register('file', () => {});
    assert.strictEqual(registry.has('file'), true);
  });

  test('register throws on non-function handler', () => {
    const registry = createAdapterRegistry();
    assert.throws(
      () => registry.register('file', 'not a function'),
      (err) => err.message.includes('must be a function'),
    );
  });

  test('listRegistered returns registered classes', () => {
    const registry = createAdapterRegistry();
    registry.register('file', () => {});
    registry.register('git', () => {});
    const list = registry.listRegistered();
    assert.ok(list.includes('file'));
    assert.ok(list.includes('git'));
  });

  // --- execute ---

  test('execute refuses unauthorized action', async () => {
    const registry = createAdapterRegistry();
    registry.register('file', () => ({ done: true }));

    resetActionCounter();
    const action = createAction('file.write', 'x.js', 'Write');
    const deniedRecord = {
      actionId: action.id,
      decision: DECISION.DENY,
    };

    const result = await registry.execute(action, deniedRecord);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('not authorized'));
  });

  test('execute refuses mismatched action ID', async () => {
    const registry = createAdapterRegistry();
    registry.register('file', () => ({ done: true }));

    resetActionCounter();
    const action = createAction('file.write', 'x.js', 'Write');
    const record = {
      actionId: 'wrong_id',
      decision: DECISION.ALLOW,
    };

    const result = await registry.execute(action, record);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('does not match'));
  });

  test('execute succeeds with authorized action and matching adapter', async () => {
    const registry = createAdapterRegistry();
    registry.register('file', (action) => ({ written: action.target }));

    resetActionCounter();
    const action = createAction('file.write', 'x.js', 'Write');
    const record = {
      actionId: action.id,
      decision: DECISION.ALLOW,
    };

    const result = await registry.execute(action, record);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result.written, 'x.js');
  });

  test('execute returns error when no adapter registered', async () => {
    const registry = createAdapterRegistry();

    resetActionCounter();
    const action = createAction('file.write', 'x.js', 'Write');
    const record = {
      actionId: action.id,
      decision: DECISION.ALLOW,
    };

    const result = await registry.execute(action, record);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('No adapter'));
  });

  test('execute catches adapter errors', async () => {
    const registry = createAdapterRegistry();
    registry.register('file', () => {
      throw new Error('Disk full');
    });

    resetActionCounter();
    const action = createAction('file.write', 'x.js', 'Write');
    const record = {
      actionId: action.id,
      decision: DECISION.ALLOW,
    };

    const result = await registry.execute(action, record);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Disk full'));
  });

  // --- Dry-Run Adapter ---

  test('createDryRunAdapter records actions', () => {
    const { adapter, getLog, clear } = createDryRunAdapter();
    adapter({ type: 'file.write', target: 'a.js', timestamp: 1 });
    adapter({ type: 'file.read', target: 'b.js', timestamp: 2 });
    const log = getLog();
    assert.strictEqual(log.length, 2);
    assert.strictEqual(log[0].type, 'file.write');
    assert.strictEqual(log[0].dryRun, true);
    assert.strictEqual(log[1].type, 'file.read');

    clear();
    assert.strictEqual(getLog().length, 0);
  });

  test('getLog returns a copy', () => {
    const { adapter, getLog } = createDryRunAdapter();
    adapter({ type: 'file.read', target: 'a.js', timestamp: 1 });
    const log1 = getLog();
    const log2 = getLog();
    assert.notStrictEqual(log1, log2);
    assert.deepStrictEqual(log1, log2);
  });

  // --- Dry-Run Registry ---

  test('createDryRunRegistry pre-registers all action classes', () => {
    const { registry } = createDryRunRegistry();
    assert.strictEqual(registry.has('file'), true);
    assert.strictEqual(registry.has('test'), true);
    assert.strictEqual(registry.has('git'), true);
    assert.strictEqual(registry.has('shell'), true);
    assert.strictEqual(registry.has('npm'), true);
    assert.strictEqual(registry.has('http'), true);
    assert.strictEqual(registry.has('deploy'), true);
    assert.strictEqual(registry.has('infra'), true);
  });

  test('full pipeline: authorize → execute with dry-run registry', async () => {
    const { registry, dryRun } = createDryRunRegistry();

    resetActionCounter();
    const action = createAction('file.write', 'src/main.js', 'Fix bug');
    const record = {
      actionId: action.id,
      decision: DECISION.ALLOW,
    };

    const result = await registry.execute(action, record);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result.dryRun, true);

    const log = dryRun.getLog();
    assert.strictEqual(log.length, 1);
    assert.strictEqual(log[0].target, 'src/main.js');
  });
});
