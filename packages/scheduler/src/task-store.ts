// In-memory task store — swap for SQLite/Postgres later
import type { Task, CreateTaskInput, TaskState, TaskAttempt, WorkerClass } from './types.js';
import { VALID_TRANSITIONS } from './types.js';

let nextId = 1;
const generateId = (): string => `task-${nextId++}`;

export class TaskStore {
  private tasks = new Map<string, Task>();
  private attempts = new Map<string, TaskAttempt[]>();
  private dedupeIndex = new Map<string, string>(); // dedupeKey → taskId

  create(input: CreateTaskInput): Task {
    const dedupeKey =
      input.dedupeKey ?? `${input.repo}:${input.type}:${input.scope.issueRef ?? input.scope.goal}`;

    // Check dedupe — reject if active task with same key exists
    const existingId = this.dedupeIndex.get(dedupeKey);
    if (existingId) {
      const existing = this.tasks.get(existingId);
      if (existing && !isTerminal(existing.state)) {
        throw new DedupeError(dedupeKey, existingId);
      }
      // Terminal — allow re-creation, remove old index
      this.dedupeIndex.delete(dedupeKey);
    }

    const task: Task = {
      id: generateId(),
      type: input.type,
      priority: input.priority,
      workerClass: input.workerClass,
      repo: input.repo,
      scope: input.scope,
      state: 'queued',
      dedupeKey,
      riskLevel: input.riskLevel ?? 'low',
      costEstimate: input.costEstimate ?? 0,
      maxAttempts: input.maxAttempts ?? 3,
      attemptCount: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      createdAt: Date.now(),
      scheduledAt: input.scheduledAt ?? Date.now(),
      startedAt: null,
      finishedAt: null,
      resultSummary: null,
      artifactRefs: [],
      cooldownUntil: null,
    };

    this.tasks.set(task.id, task);
    this.dedupeIndex.set(dedupeKey, task.id);
    return task;
  }

  get(id: string): Task | null {
    return this.tasks.get(id) ?? null;
  }

  transition(
    id: string,
    newState: TaskState,
    patch?: Partial<
      Pick<
        Task,
        | 'leaseOwner'
        | 'leaseExpiresAt'
        | 'startedAt'
        | 'finishedAt'
        | 'resultSummary'
        | 'attemptCount'
        | 'cooldownUntil'
      >
    >
  ): Task {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);

    const allowed = VALID_TRANSITIONS[task.state];
    if (!allowed.includes(newState)) {
      throw new InvalidTransitionError(task.state, newState);
    }

    const updated: Task = { ...task, state: newState, ...patch };
    this.tasks.set(id, updated);

    // Clean dedupe index on terminal states
    if (isTerminal(newState)) {
      this.dedupeIndex.delete(task.dedupeKey);
    }

    return updated;
  }

  /** Get tasks ready for dispatch, ordered by priority then age */
  queued(workerClass?: WorkerClass): readonly Task[] {
    const now = Date.now();
    return [...this.tasks.values()]
      .filter(
        (t) =>
          t.state === 'queued' &&
          t.scheduledAt <= now &&
          (!workerClass || t.workerClass === workerClass)
      )
      .sort((a, b) => {
        const pa = priorityOrder(a.priority);
        const pb = priorityOrder(b.priority);
        if (pa !== pb) return pa - pb;
        return a.createdAt - b.createdAt;
      });
  }

  /** Count active (leased + running) tasks per class */
  activeCount(workerClass: WorkerClass): number {
    return [...this.tasks.values()].filter(
      (t) => t.workerClass === workerClass && (t.state === 'leased' || t.state === 'running')
    ).length;
  }

  /** Get all tasks in a given state */
  byState(state: TaskState): readonly Task[] {
    return [...this.tasks.values()].filter((t) => t.state === state);
  }

  /** Record an attempt */
  recordAttempt(attempt: TaskAttempt): void {
    const list = this.attempts.get(attempt.taskId) ?? [];
    list.push(attempt);
    this.attempts.set(attempt.taskId, list);
  }

  /** Get attempts for a task */
  getAttempts(taskId: string): readonly TaskAttempt[] {
    return this.attempts.get(taskId) ?? [];
  }

  /** Get all tasks (for metrics) */
  all(): readonly Task[] {
    return [...this.tasks.values()];
  }

  /** Reset ID counter (for testing) */
  static resetIds(): void {
    nextId = 1;
  }
}

function priorityOrder(p: Task['priority']): number {
  switch (p) {
    case 'P0':
      return 0;
    case 'P1':
      return 1;
    case 'P2':
      return 2;
    case 'P3':
      return 3;
  }
}

function isTerminal(state: TaskState): boolean {
  return state === 'succeeded' || state === 'failed_terminal' || state === 'canceled';
}

export class DedupeError extends Error {
  constructor(
    public readonly dedupeKey: string,
    public readonly existingTaskId: string
  ) {
    super(`Duplicate task: key=${dedupeKey} exists as ${existingTaskId}`);
    this.name = 'DedupeError';
  }
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: TaskState,
    public readonly to: TaskState
  ) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}
