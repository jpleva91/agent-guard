// Queue factory — tries SQLite first, falls back to JSONL.

import type { TelemetryQueue } from './types.js';
import { createJsonlQueue } from './queue-jsonl.js';

/** Create a telemetry queue. Prefers SQLite; falls back to JSONL. */
export async function createQueue(path?: string): Promise<TelemetryQueue> {
  try {
    const { createSqliteQueue } = await import('./queue-sqlite.js');
    return await createSqliteQueue(path);
  } catch {
    return createJsonlQueue(path);
  }
}
