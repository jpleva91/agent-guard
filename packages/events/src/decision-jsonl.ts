// Decision JSONL sink — persists GovernanceDecisionRecords to
// .agentguard/decisions/<runId>.jsonl.
// Follows the same pattern as the event JSONL sink (jsonl.ts).

import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GovernanceDecisionRecord, DecisionSink } from '@red-codes/core';

const DEFAULT_BASE_DIR = '.agentguard';
const DECISIONS_DIR = 'decisions';

export interface DecisionJsonlSinkOptions {
  baseDir?: string;
  runId: string;
  /** Optional callback invoked when a write fails. Errors are never thrown to avoid crashing the kernel. */
  onError?: (error: Error) => void;
}

export function createDecisionJsonlSink(options: DecisionJsonlSinkOptions): DecisionSink {
  const baseDir = options.baseDir || DEFAULT_BASE_DIR;
  const decisionsDir = join(baseDir, DECISIONS_DIR);
  const filePath = join(decisionsDir, `${options.runId}.jsonl`);

  let initialized = false;

  function ensureDir(): void {
    if (initialized) return;
    try {
      mkdirSync(decisionsDir, { recursive: true });
      initialized = true;
    } catch {
      // Directory may already exist
      initialized = true;
    }
  }

  return {
    write(record: GovernanceDecisionRecord): void {
      ensureDir();
      const line = JSON.stringify(record) + '\n';

      try {
        appendFileSync(filePath, line, 'utf8');
      } catch (err) {
        // Never crash the kernel — report via callback if available
        options.onError?.(err as Error);
      }
    },

    flush(): void {
      // No buffering — writes are immediate for durability
    },
  };
}

export function getDecisionFilePath(runId: string, baseDir?: string): string {
  return join(baseDir || DEFAULT_BASE_DIR, DECISIONS_DIR, `${runId}.jsonl`);
}
