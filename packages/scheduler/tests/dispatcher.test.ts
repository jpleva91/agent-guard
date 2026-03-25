import { describe, it, expect, beforeEach } from 'vitest';
import { Dispatcher } from '../src/dispatcher.js';
import { TaskStore } from '../src/task-store.js';
import { LeaseManager } from '../src/lease-manager.js';
import type { CreateTaskInput, DispatcherConfig } from '../src/index.js';

const config: DispatcherConfig = {
  budgets: {
    planner: 3,
    coder: 4,
    validator: 2,
    qa: 2,
    ops: 1,
    governance: 1,
  },
  cooldownMs: 100, // short for tests
  leaseTimeMs: 60000,
};

const makeInput = (overrides?: Partial<CreateTaskInput>): CreateTaskInput => ({
  type: 'implement',
  priority: 'P1',
  workerClass: 'coder',
  repo: 'agent-guard',
  scope: { goal: 'Do stuff' },
  ...overrides,
});

describe('Dispatcher', () => {
  let store: TaskStore;
  let leases: LeaseManager;
  let dispatcher: Dispatcher;

  beforeEach(() => {
    store = new TaskStore();
    leases = new LeaseManager();
    dispatcher = new Dispatcher(store, leases, config);
    TaskStore.resetIds();
  });

  it('dispatches highest priority task first', () => {
    store.create(makeInput({ priority: 'P2', scope: { goal: 'low' } }));
    store.create(makeInput({ priority: 'P0', scope: { goal: 'critical' } }));
    store.create(makeInput({ priority: 'P1', scope: { goal: 'normal' } }));

    const result = dispatcher.next('coder', 'worker-1');
    expect(result).not.toBeNull();
    expect(result!.task.priority).toBe('P0');
    expect(result!.task.state).toBe('leased');
    expect(result!.leaseGranted).toBe(true);
  });

  it('respects concurrency budget', () => {
    // Create more tasks than the budget allows
    for (let i = 0; i < 6; i++) {
      store.create(makeInput({ scope: { goal: `task-${i}` } }));
    }

    // Dispatch up to budget (4 coders)
    const results = [];
    for (let i = 0; i < 6; i++) {
      const r = dispatcher.next('coder', `worker-${i}`);
      if (r) results.push(r);
    }

    expect(results).toHaveLength(4); // budget is 4
  });

  it('starts a leased task', () => {
    store.create(makeInput());
    const dispatched = dispatcher.next('coder', 'worker-1')!;

    const started = dispatcher.start(dispatched.task.id, 'worker-1');
    expect(started.state).toBe('running');
    expect(started.startedAt).not.toBeNull();
    expect(started.attemptCount).toBe(1);
  });

  it('completes a task', () => {
    store.create(makeInput());
    const dispatched = dispatcher.next('coder', 'worker-1')!;
    dispatcher.start(dispatched.task.id, 'worker-1');

    const completed = dispatcher.complete(dispatched.task.id, 'worker-1', 'PR #123 created');
    expect(completed.state).toBe('succeeded');
    expect(completed.resultSummary).toBe('PR #123 created');

    // Lease should be released
    expect(leases.isLeased('task', dispatched.task.id)).toBe(false);
  });

  it('fails a task with retry', () => {
    store.create(makeInput({ maxAttempts: 3 }));
    const dispatched = dispatcher.next('coder', 'worker-1')!;
    dispatcher.start(dispatched.task.id, 'worker-1');

    const failed = dispatcher.fail(dispatched.task.id, 'worker-1', 'Tests failed', true);
    expect(failed.state).toBe('failed_retryable');
  });

  it('moves to dead letter after max attempts', () => {
    const task = store.create(makeInput({ maxAttempts: 1 }));

    // First attempt
    const d1 = dispatcher.next('coder', 'worker-1')!;
    dispatcher.start(d1.task.id, 'worker-1');
    const failed = dispatcher.fail(d1.task.id, 'worker-1', 'Crash', true);
    expect(failed.state).toBe('dead_letter');
  });

  it('fails terminally for non-retryable errors', () => {
    store.create(makeInput());
    const dispatched = dispatcher.next('coder', 'worker-1')!;
    dispatcher.start(dispatched.task.id, 'worker-1');

    const failed = dispatcher.fail(dispatched.task.id, 'worker-1', 'Auth denied', false);
    expect(failed.state).toBe('failed_terminal');
  });

  it('reports budget status', () => {
    store.create(makeInput());
    dispatcher.next('coder', 'worker-1');

    const budgets = dispatcher.budgets();
    const coderBudget = budgets.find((b) => b.workerClass === 'coder')!;
    expect(coderBudget.maxConcurrent).toBe(4);
    expect(coderBudget.currentActive).toBe(1);
  });

  it('returns null when no work available', () => {
    const result = dispatcher.next('coder', 'worker-1');
    expect(result).toBeNull();
  });
});
