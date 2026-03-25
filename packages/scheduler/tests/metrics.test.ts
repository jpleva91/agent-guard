import { describe, it, expect, beforeEach } from 'vitest';
import { computeMetrics } from '../src/metrics.js';
import { TaskStore } from '../src/task-store.js';
import type { CreateTaskInput } from '../src/types.js';

const makeInput = (overrides?: Partial<CreateTaskInput>): CreateTaskInput => ({
  type: 'implement',
  priority: 'P1',
  workerClass: 'coder',
  repo: 'agent-guard',
  scope: { goal: 'test' },
  ...overrides,
});

describe('computeMetrics', () => {
  let store: TaskStore;

  beforeEach(() => {
    store = new TaskStore();
    TaskStore.resetIds();
  });

  it('reports queue depth by class', () => {
    store.create(makeInput({ workerClass: 'coder', scope: { goal: 'a' } }));
    store.create(makeInput({ workerClass: 'coder', scope: { goal: 'b' } }));
    store.create(makeInput({ workerClass: 'qa', scope: { goal: 'c' } }));

    const metrics = computeMetrics(store);
    expect(metrics.depth.coder).toBe(2);
    expect(metrics.depth.qa).toBe(1);
    expect(metrics.depth.planner).toBe(0);
  });

  it('reports active count by class', () => {
    const t1 = store.create(makeInput({ scope: { goal: 'a' } }));
    store.create(makeInput({ scope: { goal: 'b' } }));

    store.transition(t1.id, 'leased');
    store.transition(t1.id, 'running');

    const metrics = computeMetrics(store);
    expect(metrics.activeByClass.coder).toBe(1);
    expect(metrics.depth.coder).toBe(1);
  });

  it('reports zero dead letters when clean', () => {
    store.create(makeInput());
    const metrics = computeMetrics(store);
    expect(metrics.deadLetterCount).toBe(0);
  });

  it('computes retry rate', () => {
    // Task with 2 attempts that succeeded
    const t1 = store.create(makeInput({ scope: { goal: 'a' } }));
    store.transition(t1.id, 'leased');
    store.transition(t1.id, 'running', { attemptCount: 2 });
    store.transition(t1.id, 'succeeded');

    // Task with 1 attempt that succeeded
    const t2 = store.create(makeInput({ scope: { goal: 'b' } }));
    store.transition(t2.id, 'leased');
    store.transition(t2.id, 'running', { attemptCount: 1 });
    store.transition(t2.id, 'succeeded');

    const metrics = computeMetrics(store);
    // Total attempts: 3, total tasks: 2, retries: 1, rate: 0.5
    expect(metrics.retryRate).toBe(0.5);
  });

  it('handles empty store', () => {
    const metrics = computeMetrics(store);
    expect(metrics.waitTimeP50Ms).toBe(0);
    expect(metrics.waitTimeP95Ms).toBe(0);
    expect(metrics.retryRate).toBe(0);
    expect(metrics.deadLetterCount).toBe(0);
  });
});
