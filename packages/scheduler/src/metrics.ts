// Queue and execution metrics
import type { QueueMetrics, WorkerClass } from './types.js';
import type { TaskStore } from './task-store.js';

const WORKER_CLASSES: WorkerClass[] = ['planner', 'coder', 'validator', 'qa', 'ops', 'governance'];

export function computeMetrics(store: TaskStore): QueueMetrics {
  const tasks = store.all();
  const now = Date.now();

  // Depth by class
  const depth: Record<string, number> = {};
  const active: Record<string, number> = {};
  for (const wc of WORKER_CLASSES) {
    depth[wc] = 0;
    active[wc] = 0;
  }

  const waitTimes: number[] = [];

  for (const t of tasks) {
    if (t.state === 'queued') {
      depth[t.workerClass] = (depth[t.workerClass] ?? 0) + 1;
      waitTimes.push(now - t.createdAt);
    }
    if (t.state === 'leased' || t.state === 'running') {
      active[t.workerClass] = (active[t.workerClass] ?? 0) + 1;
    }
  }

  // Wait time percentiles
  waitTimes.sort((a, b) => a - b);
  const p50 = percentile(waitTimes, 0.5);
  const p95 = percentile(waitTimes, 0.95);

  // Retry rate
  const finishedTasks = tasks.filter(
    (t) => t.state === 'succeeded' || t.state === 'failed_terminal' || t.state === 'dead_letter',
  );
  const totalAttempts = finishedTasks.reduce((sum, t) => sum + t.attemptCount, 0);
  const retryRate = finishedTasks.length > 0 ? (totalAttempts - finishedTasks.length) / finishedTasks.length : 0;

  const deadLetterCount = tasks.filter((t) => t.state === 'dead_letter').length;

  return {
    depth: depth as Record<WorkerClass, number>,
    activeByClass: active as Record<WorkerClass, number>,
    waitTimeP50Ms: p50,
    waitTimeP95Ms: p95,
    retryRate,
    deadLetterCount,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
