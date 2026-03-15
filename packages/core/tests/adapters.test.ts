import { describe, it, expect } from 'vitest';
import {
  createAdapterRegistry,
  createDryRunAdapter,
  createDryRunRegistry,
} from '../src/adapters.js';
import { DECISION } from '../src/actions.js';

function makeAction(cls: string, type: string, id = 'act-1') {
  return { id, class: cls, type, target: '/tmp/test', metadata: {} };
}

function makeDecisionRecord(actionId: string, decision = DECISION.ALLOW) {
  return { actionId, decision, reason: 'test', timestamp: Date.now() };
}

describe('createAdapterRegistry', () => {
  it('registers and executes an adapter handler', async () => {
    const registry = createAdapterRegistry();
    registry.register('file', () => ({ written: true }));

    const action = makeAction('file', 'file.write');
    const dr = makeDecisionRecord('act-1');
    const result = await registry.execute(action as never, dr as never);

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ written: true });
  });

  it('rejects non-function handler', () => {
    const registry = createAdapterRegistry();
    expect(() => registry.register('file', 'not-a-function' as never)).toThrow(
      'Adapter handler must be a function'
    );
  });

  it('returns error for unauthorized action', async () => {
    const registry = createAdapterRegistry();
    registry.register('file', () => ({}));

    const action = makeAction('file', 'file.write');
    const dr = makeDecisionRecord('act-1', DECISION.DENY);
    const result = await registry.execute(action as never, dr as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not authorized');
  });

  it('returns error for mismatched action id', async () => {
    const registry = createAdapterRegistry();
    registry.register('file', () => ({}));

    const action = makeAction('file', 'file.write', 'act-1');
    const dr = makeDecisionRecord('act-999');
    const result = await registry.execute(action as never, dr as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not match');
  });

  it('returns error for unregistered action class', async () => {
    const registry = createAdapterRegistry();
    const action = makeAction('unknown', 'unknown.do');
    const dr = makeDecisionRecord('act-1');
    const result = await registry.execute(action as never, dr as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No adapter registered');
  });

  it('catches adapter errors', async () => {
    const registry = createAdapterRegistry();
    registry.register('file', () => {
      throw new Error('disk full');
    });

    const action = makeAction('file', 'file.write');
    const dr = makeDecisionRecord('act-1');
    const result = await registry.execute(action as never, dr as never);

    expect(result.success).toBe(false);
    expect(result.error).toBe('disk full');
  });

  it('has() checks registration', () => {
    const registry = createAdapterRegistry();
    expect(registry.has('file')).toBe(false);
    registry.register('file', () => ({}));
    expect(registry.has('file')).toBe(true);
  });

  it('listRegistered() returns registered classes', () => {
    const registry = createAdapterRegistry();
    registry.register('file', () => ({}));
    registry.register('git', () => ({}));
    expect(registry.listRegistered()).toEqual(['file', 'git']);
  });
});

describe('createDryRunAdapter', () => {
  it('logs actions without executing them', () => {
    const { adapter, getLog } = createDryRunAdapter();
    const action = makeAction('file', 'file.write');

    const result = adapter(action as never);
    expect(result).toMatchObject({ type: 'file.write', target: '/tmp/test', dryRun: true });

    const log = getLog();
    expect(log).toHaveLength(1);
  });

  it('clear() empties the log', () => {
    const { adapter, getLog, clear } = createDryRunAdapter();
    adapter(makeAction('file', 'file.write') as never);
    expect(getLog()).toHaveLength(1);

    clear();
    expect(getLog()).toHaveLength(0);
  });
});

describe('createDryRunRegistry', () => {
  it('registers dry-run adapters for all action classes', () => {
    const { registry } = createDryRunRegistry();
    const classes = ['file', 'test', 'git', 'shell', 'npm', 'http', 'deploy', 'infra'];

    for (const cls of classes) {
      expect(registry.has(cls)).toBe(true);
    }
  });

  it('logs actions through dry-run registry', async () => {
    const { registry, dryRun } = createDryRunRegistry();
    const action = makeAction('file', 'file.write');
    const dr = makeDecisionRecord('act-1');

    await registry.execute(action as never, dr as never);
    expect(dryRun.getLog()).toHaveLength(1);
  });
});
