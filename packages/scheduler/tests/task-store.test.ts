import { describe, it, expect, beforeEach } from 'vitest';
import { TaskStore, DedupeError, InvalidTransitionError } from '../src/task-store.js';
import type { CreateTaskInput } from '../src/types.js';

const makeInput = (overrides?: Partial<CreateTaskInput>): CreateTaskInput => ({
  type: 'implement',
  priority: 'P1',
  workerClass: 'coder',
  repo: 'agent-guard',
  scope: { goal: 'Fix the thing' },
  ...overrides,
});

describe('TaskStore', () => {
  let store: TaskStore;

  beforeEach(() => {
    store = new TaskStore();
    TaskStore.resetIds();
  });

  it('creates a task in queued state', () => {
    const task = store.create(makeInput());
    expect(task.id).toBe('task-1');
    expect(task.state).toBe('queued');
    expect(task.priority).toBe('P1');
    expect(task.workerClass).toBe('coder');
  });

  it('assigns auto-generated dedupe keys', () => {
    const task = store.create(makeInput());
    expect(task.dedupeKey).toBe('agent-guard:implement:Fix the thing');
  });

  it('rejects duplicate tasks with same dedupe key', () => {
    store.create(makeInput());
    expect(() => store.create(makeInput())).toThrow(DedupeError);
  });

  it('allows re-creation after terminal state', () => {
    const task = store.create(makeInput());
    store.transition(task.id, 'leased');
    store.transition(task.id, 'running');
    store.transition(task.id, 'succeeded');

    // Should not throw — original is terminal
    const task2 = store.create(makeInput());
    expect(task2.id).toBe('task-2');
  });

  it('transitions through valid states', () => {
    const task = store.create(makeInput());
    const leased = store.transition(task.id, 'leased', { leaseOwner: 'worker-1' });
    expect(leased.state).toBe('leased');
    expect(leased.leaseOwner).toBe('worker-1');

    const running = store.transition(task.id, 'running', { startedAt: Date.now() });
    expect(running.state).toBe('running');

    const done = store.transition(task.id, 'succeeded', { finishedAt: Date.now() });
    expect(done.state).toBe('succeeded');
  });

  it('rejects invalid transitions', () => {
    const task = store.create(makeInput());
    expect(() => store.transition(task.id, 'running')).toThrow(InvalidTransitionError);
    expect(() => store.transition(task.id, 'succeeded')).toThrow(InvalidTransitionError);
  });

  it('returns queued tasks sorted by priority then age', () => {
    const p2 = store.create(makeInput({ priority: 'P2', scope: { goal: 'a' } }));
    const p0 = store.create(makeInput({ priority: 'P0', scope: { goal: 'b' } }));
    const p1 = store.create(makeInput({ priority: 'P1', scope: { goal: 'c' } }));

    const queued = store.queued();
    expect(queued.map((t) => t.priority)).toEqual(['P0', 'P1', 'P2']);
  });

  it('filters queued by worker class', () => {
    store.create(makeInput({ workerClass: 'coder', scope: { goal: 'a' } }));
    store.create(makeInput({ workerClass: 'qa', scope: { goal: 'b' } }));
    store.create(makeInput({ workerClass: 'coder', scope: { goal: 'c' } }));

    const coders = store.queued('coder');
    expect(coders).toHaveLength(2);
    expect(coders.every((t) => t.workerClass === 'coder')).toBe(true);
  });

  it('counts active tasks per class', () => {
    const t1 = store.create(makeInput({ scope: { goal: 'a' } }));
    const t2 = store.create(makeInput({ scope: { goal: 'b' } }));

    store.transition(t1.id, 'leased');
    store.transition(t2.id, 'leased');
    store.transition(t2.id, 'running');

    expect(store.activeCount('coder')).toBe(2);
    expect(store.activeCount('qa')).toBe(0);
  });

  it('records and retrieves attempts', () => {
    const task = store.create(makeInput());
    store.recordAttempt({
      id: 'attempt-1',
      taskId: task.id,
      workerId: 'worker-1',
      workerClass: 'coder',
      startedAt: Date.now(),
      finishedAt: null,
      outcome: 'running',
      failureReason: null,
      tokenInput: 0,
      tokenOutput: 0,
      estimatedCost: 0,
    });

    const attempts = store.getAttempts(task.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].workerId).toBe('worker-1');
  });
});
