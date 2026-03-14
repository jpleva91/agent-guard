// JSONL event sink — persists events to .agentguard/events/<runId>.jsonl.
// Node.js module. Creates directories as needed.

import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DomainEvent, EventSink } from '@red-codes/core';

const DEFAULT_BASE_DIR = '.agentguard';
const EVENTS_DIR = 'events';

export interface JsonlSinkOptions {
  baseDir?: string;
  runId: string;
  /** Optional callback invoked when a write fails. Errors are never thrown to avoid crashing the kernel. */
  onError?: (error: Error) => void;
}

export function createJsonlSink(options: JsonlSinkOptions): EventSink {
  const baseDir = options.baseDir || DEFAULT_BASE_DIR;
  const eventsDir = join(baseDir, EVENTS_DIR);
  const filePath = join(eventsDir, `${options.runId}.jsonl`);

  let initialized = false;
  const buffer: string[] = [];

  function ensureDir(): void {
    if (initialized) return;
    try {
      mkdirSync(eventsDir, { recursive: true });
      initialized = true;
    } catch {
      // Directory may already exist
      initialized = true;
    }
  }

  return {
    write(event: DomainEvent): void {
      ensureDir();
      const line = JSON.stringify(event) + '\n';
      buffer.push(line);

      // Write immediately for durability
      try {
        appendFileSync(filePath, line, 'utf8');
      } catch (err) {
        // Never crash the kernel — report via callback if available
        options.onError?.(err as Error);
      }
    },

    flush(): void {
      buffer.length = 0;
    },
  };
}

export function getEventFilePath(runId: string, baseDir?: string): string {
  return join(baseDir || DEFAULT_BASE_DIR, EVENTS_DIR, `${runId}.jsonl`);
}
