// JSONL-backed telemetry event queue — fallback when SQLite is unavailable.

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  appendFileSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  statSync,
  mkdirSync,
} from 'node:fs';
import type { TelemetryQueue, TelemetryPayloadEvent } from './types.js';

const DEFAULT_QUEUE_PATH = join(homedir(), '.agentguard', 'telemetry-queue.jsonl');
const MAX_QUEUE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Create a JSONL-backed telemetry queue */
export function createJsonlQueue(path?: string): TelemetryQueue {
  const filePath = path ?? DEFAULT_QUEUE_PATH;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch {
    // Ignore
  }

  function readLines(): string[] {
    try {
      const content = readFileSync(filePath, 'utf8');
      return content
        .split('\n')
        .filter((l) => l.trim().length > 0);
    } catch {
      return [];
    }
  }

  function writeLines(lines: string[]): void {
    try {
      writeFileSync(filePath, lines.length > 0 ? lines.join('\n') + '\n' : '');
    } catch {
      // Ignore
    }
  }

  function getFileSize(): number {
    try {
      return statSync(filePath).size;
    } catch {
      return 0;
    }
  }

  function evictIfNeeded(): void {
    if (getFileSize() <= MAX_QUEUE_SIZE_BYTES) return;
    const lines = readLines();
    // Remove oldest 20% of lines
    const removeCount = Math.max(1, Math.floor(lines.length * 0.2));
    writeLines(lines.slice(removeCount));
  }

  return {
    enqueue(event: TelemetryPayloadEvent): void {
      try {
        evictIfNeeded();
        appendFileSync(filePath, JSON.stringify(event) + '\n');
      } catch {
        // Never crash the kernel
      }
    },

    dequeue(count: number): TelemetryPayloadEvent[] {
      try {
        const lines = readLines();
        if (lines.length === 0) return [];

        const take = Math.min(count, lines.length);
        const taken = lines.slice(0, take);
        const remaining = lines.slice(take);
        writeLines(remaining);

        return taken.map((l) => JSON.parse(l) as TelemetryPayloadEvent);
      } catch {
        return [];
      }
    },

    size(): number {
      return readLines().length;
    },

    sizeBytes(): number {
      return getFileSize();
    },

    clear(): void {
      try {
        unlinkSync(filePath);
      } catch {
        // Ignore
      }
    },

    close(): void {
      // No-op for JSONL
    },
  };
}
