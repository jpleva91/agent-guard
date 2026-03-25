// Dispatcher — budget-aware task dispatch with concurrency control
import type { Task, WorkerClass, ConcurrencyBudget } from './types.js';
import { TaskStore } from './task-store.js';
import { LeaseManager } from './lease-manager.js';

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export interface DispatcherConfig {
  readonly budgets: Record<WorkerClass, number>;
  readonly cooldownMs?: number;
  readonly leaseTimeMs?: number;
}

export interface DispatchResult {
  readonly task: Task;
  readonly leaseGranted: boolean;
}

export class Dispatcher {
  private readonly cooldownMs: number;
  private readonly leaseTimeMs: number;

  constructor(
    private readonly store: TaskStore,
    private readonly leases: LeaseManager,
    private readonly config: DispatcherConfig
  ) {
    this.cooldownMs = config.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.leaseTimeMs = config.leaseTimeMs ?? 10 * 60 * 1000;
  }

  /** Dispatch next task for a worker class. Returns null if nothing available or budget exhausted. */
  next(workerClass: WorkerClass, workerId: string): DispatchResult | null {
    // Check budget
    const budget = this.config.budgets[workerClass] ?? 0;
    const active = this.store.activeCount(workerClass);
    if (active >= budget) return null;

    // Get queued tasks for this class
    const candidates = this.store.queued(workerClass);
    if (candidates.length === 0) return null;

    // Try to lease the first available
    for (const candidate of candidates) {
      const lease = this.leases.acquire('task', candidate.id, workerId, this.leaseTimeMs);
      if (!lease) continue;

      // Transition to leased
      const updated = this.store.transition(candidate.id, 'leased', {
        leaseOwner: workerId,
        leaseExpiresAt: lease.expiresAt,
      });

      return { task: updated, leaseGranted: true };
    }

    return null;
  }

  /** Mark a task as started (leased → running). */
  start(taskId: string, workerId: string): Task {
    const task = this.store.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.leaseOwner !== workerId)
      throw new Error(`Worker ${workerId} does not hold lease on ${taskId}`);

    return this.store.transition(taskId, 'running', {
      startedAt: Date.now(),
      attemptCount: task.attemptCount + 1,
    });
  }

  /** Complete a task successfully. */
  complete(taskId: string, workerId: string, summary: string): Task {
    const task = this.store.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    this.leases.release('task', taskId, workerId);

    return this.store.transition(taskId, 'succeeded', {
      finishedAt: Date.now(),
      resultSummary: summary,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
  }

  /** Fail a task with retry logic. */
  fail(taskId: string, workerId: string, reason: string, retryable: boolean): Task {
    const task = this.store.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    this.leases.release('task', taskId, workerId);

    if (!retryable) {
      return this.store.transition(taskId, 'failed_terminal', {
        finishedAt: Date.now(),
        resultSummary: reason,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
    }

    // Retryable — check if we've exceeded max attempts
    const newAttempts = task.attemptCount;
    if (newAttempts >= task.maxAttempts) {
      this.store.transition(taskId, 'failed_terminal', {
        finishedAt: Date.now(),
        resultSummary: `Max attempts (${task.maxAttempts}) exceeded: ${reason}`,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      // Move to dead letter
      return this.store.transition(taskId, 'dead_letter');
    }

    // Move to cooldown
    return this.store.transition(taskId, 'failed_retryable', {
      finishedAt: Date.now(),
      resultSummary: reason,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
  }

  /** Move failed_retryable tasks past cooldown back to queued. */
  processCooldowns(): number {
    const retryable = this.store.byState('failed_retryable');
    let promoted = 0;
    const now = Date.now();

    for (const task of retryable) {
      const cooldownEnd = (task.finishedAt ?? 0) + this.cooldownMs;
      if (now >= cooldownEnd) {
        this.store.transition(task.id, 'cooldown', {
          cooldownUntil: cooldownEnd,
        });
        this.store.transition(task.id, 'queued', {
          leaseOwner: null,
          leaseExpiresAt: null,
          finishedAt: null,
          resultSummary: null,
        });
        promoted++;
      }
    }

    return promoted;
  }

  /** Get concurrency budget status. */
  budgets(): readonly ConcurrencyBudget[] {
    const classes: WorkerClass[] = ['planner', 'coder', 'validator', 'qa', 'ops', 'governance'];
    return classes.map((wc) => ({
      workerClass: wc,
      maxConcurrent: this.config.budgets[wc] ?? 0,
      currentActive: this.store.activeCount(wc),
    }));
  }
}
