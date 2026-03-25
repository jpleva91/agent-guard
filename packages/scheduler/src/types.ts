// Task scheduler types — JP's task fabric primitives

/** Task priority lanes */
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

/** Worker class for routing and concurrency budgets */
export type WorkerClass = 'planner' | 'coder' | 'validator' | 'qa' | 'ops' | 'governance';

/** Task lifecycle states */
export type TaskState =
  | 'queued'
  | 'leased'
  | 'running'
  | 'succeeded'
  | 'failed_retryable'
  | 'failed_terminal'
  | 'cooldown'
  | 'dead_letter'
  | 'canceled'
  | 'blocked_human';

/** Risk classification */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** A task in the scheduler */
export interface Task {
  readonly id: string;
  readonly type: string;
  readonly priority: TaskPriority;
  readonly workerClass: WorkerClass;
  readonly repo: string;
  readonly scope: TaskScope;
  readonly state: TaskState;
  readonly dedupeKey: string;
  readonly riskLevel: RiskLevel;
  readonly costEstimate: number;
  readonly maxAttempts: number;
  readonly attemptCount: number;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: number | null;
  readonly createdAt: number;
  readonly scheduledAt: number;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly resultSummary: string | null;
  readonly artifactRefs: readonly string[];
  readonly cooldownUntil: number | null;
}

/** Scoped context for a task */
export interface TaskScope {
  readonly branch?: string;
  readonly worktree?: string;
  readonly files?: readonly string[];
  readonly issueRef?: string;
  readonly prRef?: string;
  readonly goal: string;
  readonly acceptanceCriteria?: readonly string[];
  readonly constraints?: readonly string[];
  readonly escalationRules?: readonly string[];
}

/** Mutable fields for task creation */
export interface CreateTaskInput {
  readonly type: string;
  readonly priority: TaskPriority;
  readonly workerClass: WorkerClass;
  readonly repo: string;
  readonly scope: TaskScope;
  readonly riskLevel?: RiskLevel;
  readonly costEstimate?: number;
  readonly maxAttempts?: number;
  readonly scheduledAt?: number;
  readonly dedupeKey?: string;
}

/** Lease on a resource */
export interface Lease {
  readonly resourceType: 'task' | 'repo' | 'worktree' | 'branch';
  readonly resourceKey: string;
  readonly owner: string;
  readonly acquiredAt: number;
  readonly expiresAt: number;
}

/** Concurrency budget per worker class */
export interface ConcurrencyBudget {
  readonly workerClass: WorkerClass;
  readonly maxConcurrent: number;
  readonly currentActive: number;
}

/** Task attempt record */
export interface TaskAttempt {
  readonly id: string;
  readonly taskId: string;
  readonly workerId: string;
  readonly workerClass: WorkerClass;
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly outcome: 'running' | 'succeeded' | 'failed_retryable' | 'failed_terminal';
  readonly failureReason: string | null;
  readonly tokenInput: number;
  readonly tokenOutput: number;
  readonly estimatedCost: number;
}

/** Queue metrics snapshot */
export interface QueueMetrics {
  readonly depth: Record<WorkerClass, number>;
  readonly activeByClass: Record<WorkerClass, number>;
  readonly waitTimeP50Ms: number;
  readonly waitTimeP95Ms: number;
  readonly retryRate: number;
  readonly deadLetterCount: number;
}

/** Valid state transitions */
export const VALID_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  queued: ['leased', 'canceled'],
  leased: ['running', 'queued', 'canceled'],
  running: ['succeeded', 'failed_retryable', 'failed_terminal', 'canceled'],
  succeeded: [],
  failed_retryable: ['cooldown', 'queued', 'dead_letter'],
  failed_terminal: ['dead_letter'],
  cooldown: ['queued', 'dead_letter', 'canceled'],
  dead_letter: ['queued', 'blocked_human'],
  canceled: [],
  blocked_human: ['queued', 'canceled'],
};
