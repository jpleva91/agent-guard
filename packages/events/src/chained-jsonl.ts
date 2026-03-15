// Hash-chained JSONL sink — tamper-resistant audit trail.
// Each record includes a chain hash that incorporates the previous record's hash,
// creating an immutable sequence. Any insertion, deletion, or modification
// of a record breaks the chain and is detectable via verification.

import { createHash } from 'node:crypto';
import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DomainEvent, EventSink } from '@red-codes/core';

const DEFAULT_BASE_DIR = '.agentguard';
const EVENTS_DIR = 'events';

/** A chained record wrapping a domain event with integrity metadata */
export interface ChainedRecord {
  /** Sequence number (0-indexed, monotonically increasing) */
  seq: number;
  /** SHA-256 hash of this record's content + previous hash */
  chainHash: string;
  /** Hash of the previous record (genesis record uses a well-known seed) */
  prevHash: string;
  /** The domain event payload */
  event: DomainEvent;
}

/** Result of verifying a chained audit trail */
export interface ChainVerificationResult {
  /** Whether the entire chain is valid */
  valid: boolean;
  /** Total number of records in the chain */
  totalRecords: number;
  /** Number of records that passed verification */
  verifiedRecords: number;
  /** Details of the first broken link, if any */
  brokenAt?: {
    seq: number;
    expectedHash: string;
    actualHash: string;
    reason: string;
  };
  /** Run ID extracted from the file name */
  runId?: string;
  /** Time span covered by the chain */
  timeRange?: {
    first: number;
    last: number;
  };
}

/** Well-known seed for the genesis record's prevHash */
const GENESIS_PREV_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Compute the chain hash for a record.
 * Hash = SHA-256(prevHash + seq + JSON(event))
 */
function computeChainHash(prevHash: string, seq: number, event: DomainEvent): string {
  const content = `${prevHash}:${seq}:${JSON.stringify(event)}`;
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export interface ChainedJsonlSinkOptions {
  baseDir?: string;
  runId: string;
  /** Optional callback invoked when a write fails. Errors are never thrown to avoid crashing the kernel. */
  onError?: (error: Error) => void;
}

export interface ChainedJsonlSink extends EventSink {
  /** Get the current chain length */
  length(): number;
  /** Get the current chain head hash */
  headHash(): string;
}

export function createChainedJsonlSink(options: ChainedJsonlSinkOptions): ChainedJsonlSink {
  const baseDir = options.baseDir || DEFAULT_BASE_DIR;
  const eventsDir = join(baseDir, EVENTS_DIR);
  const filePath = join(eventsDir, `${options.runId}.chained.jsonl`);

  let initialized = false;
  let seq = 0;
  let prevHash = GENESIS_PREV_HASH;

  function ensureDir(): void {
    if (initialized) return;
    try {
      mkdirSync(eventsDir, { recursive: true });
      initialized = true;
    } catch {
      initialized = true;
    }
  }

  return {
    write(event: DomainEvent): void {
      ensureDir();
      const chainHash = computeChainHash(prevHash, seq, event);
      const record: ChainedRecord = {
        seq,
        chainHash,
        prevHash,
        event,
      };

      const line = JSON.stringify(record) + '\n';

      try {
        appendFileSync(filePath, line, 'utf8');
        prevHash = chainHash;
        seq++;
      } catch (err) {
        options.onError?.(err as Error);
      }
    },

    flush(): void {
      // Writes are immediate for durability — nothing to flush
    },

    length(): number {
      return seq;
    },

    headHash(): string {
      return prevHash;
    },
  };
}

/**
 * Verify the integrity of a chained JSONL audit file.
 * Returns detailed verification result including the first broken link.
 */
export function verifyChainedJsonl(filePath: string): ChainVerificationResult {
  if (!existsSync(filePath)) {
    return {
      valid: false,
      totalRecords: 0,
      verifiedRecords: 0,
      brokenAt: {
        seq: 0,
        expectedHash: '',
        actualHash: '',
        reason: `File not found: ${filePath}`,
      },
    };
  }

  const content = readFileSync(filePath, 'utf8');
  const lines = content
    .trim()
    .split('\n')
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { valid: true, totalRecords: 0, verifiedRecords: 0 };
  }

  let expectedPrevHash = GENESIS_PREV_HASH;
  let firstTimestamp: number | undefined;
  let lastTimestamp: number | undefined;

  for (let i = 0; i < lines.length; i++) {
    let record: ChainedRecord;
    try {
      record = JSON.parse(lines[i]) as ChainedRecord;
    } catch {
      return {
        valid: false,
        totalRecords: lines.length,
        verifiedRecords: i,
        brokenAt: {
          seq: i,
          expectedHash: '',
          actualHash: '',
          reason: `Invalid JSON at line ${i + 1}`,
        },
      };
    }

    // Verify sequence number
    if (record.seq !== i) {
      return {
        valid: false,
        totalRecords: lines.length,
        verifiedRecords: i,
        brokenAt: {
          seq: i,
          expectedHash: `seq=${i}`,
          actualHash: `seq=${record.seq}`,
          reason: `Sequence gap: expected seq=${i}, found seq=${record.seq}`,
        },
      };
    }

    // Verify previous hash linkage
    if (record.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        totalRecords: lines.length,
        verifiedRecords: i,
        brokenAt: {
          seq: i,
          expectedHash: expectedPrevHash,
          actualHash: record.prevHash,
          reason: 'Previous hash mismatch — record may have been inserted or prior record modified',
        },
      };
    }

    // Recompute and verify the chain hash
    const recomputed = computeChainHash(record.prevHash, record.seq, record.event);
    if (record.chainHash !== recomputed) {
      return {
        valid: false,
        totalRecords: lines.length,
        verifiedRecords: i,
        brokenAt: {
          seq: i,
          expectedHash: recomputed,
          actualHash: record.chainHash,
          reason: 'Chain hash mismatch — event data may have been tampered with',
        },
      };
    }

    // Track timestamps
    if (record.event.timestamp) {
      if (firstTimestamp === undefined) firstTimestamp = record.event.timestamp;
      lastTimestamp = record.event.timestamp;
    }

    expectedPrevHash = record.chainHash;
  }

  // Extract runId from file path
  const fileName = filePath.split('/').pop() || '';
  const runId = fileName.replace('.chained.jsonl', '');

  return {
    valid: true,
    totalRecords: lines.length,
    verifiedRecords: lines.length,
    runId: runId || undefined,
    timeRange:
      firstTimestamp !== undefined && lastTimestamp !== undefined
        ? { first: firstTimestamp, last: lastTimestamp }
        : undefined,
  };
}

/**
 * Read all events from a chained JSONL file after verification.
 * Throws if the chain is broken.
 */
export function readChainedJsonl(filePath: string): DomainEvent[] {
  const verification = verifyChainedJsonl(filePath);
  if (!verification.valid) {
    const reason = verification.brokenAt?.reason || 'Unknown integrity failure';
    throw new Error(`Audit chain integrity failure: ${reason}`);
  }

  const content = readFileSync(filePath, 'utf8');
  const lines = content
    .trim()
    .split('\n')
    .filter((l) => l.length > 0);

  return lines.map((line) => {
    const record = JSON.parse(line) as ChainedRecord;
    return record.event;
  });
}

export function getChainedEventFilePath(runId: string, baseDir?: string): string {
  return join(baseDir || DEFAULT_BASE_DIR, EVENTS_DIR, `${runId}.chained.jsonl`);
}
