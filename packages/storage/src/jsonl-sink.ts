// JSONL event and decision sinks — append-only streaming to JSONL files.
// Provides real-time tailing via `tail -f` and serves as a fallback when SQLite
// is unavailable. Mirrors the SQLite sink pattern: swallows write errors, never
// crashes the kernel.

import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type {
  DomainEvent,
  EventSink,
  GovernanceDecisionRecord,
  DecisionSink,
} from '@red-codes/core';

/** Create an EventSink that appends events as JSONL to a file in the given directory */
export function createJsonlEventSink(
  outputDir: string,
  runId: string,
  onError?: (error: Error) => void
): EventSink {
  const filePath = join(outputDir, `${runId}.events.jsonl`);
  ensureParentDir(filePath);

  return {
    write(event: DomainEvent): void {
      try {
        appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');
      } catch (err) {
        // Never crash the kernel — report via callback if available
        onError?.(err as Error);
      }
    },

    flush(): void {
      // No buffering — appendFileSync is durable
    },
  };
}

/** Create a DecisionSink that appends decision records as JSONL to a file in the given directory */
export function createJsonlDecisionSink(
  outputDir: string,
  runId: string,
  onError?: (error: Error) => void
): DecisionSink {
  const filePath = join(outputDir, `${runId}.decisions.jsonl`);
  ensureParentDir(filePath);

  return {
    write(record: GovernanceDecisionRecord): void {
      try {
        appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
      } catch (err) {
        // Never crash the kernel — report via callback if available
        onError?.(err as Error);
      }
    },

    flush(): void {
      // No buffering — appendFileSync is durable
    },
  };
}

function ensureParentDir(filePath: string): void {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  } catch {
    // Best-effort — write() will catch the actual file error
  }
}
