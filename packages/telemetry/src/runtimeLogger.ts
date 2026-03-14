// Runtime telemetry logger — persists flattened governance events to
// logs/runtime-events.jsonl for downstream agents and monitors.
// Implements DecisionSink so it plugs directly into the kernel pipeline.

import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GovernanceDecisionRecord, DecisionSink } from '@red-codes/core';
import type { TelemetryEvent, TelemetryLoggerOptions, TelemetrySink } from './types.js';

const DEFAULT_LOG_DIR = 'logs';
const DEFAULT_LOG_FILE = 'runtime-events.jsonl';

/** Map a GovernanceDecisionRecord to a flattened TelemetryEvent. */
export function buildTelemetryEvent(record: GovernanceDecisionRecord): TelemetryEvent {
  return {
    timestamp: new Date(record.timestamp).toISOString(),
    agent: record.action.agent,
    run_id: record.runId,
    syscall: record.action.type,
    target: record.action.target,
    capability: record.policy.matchedPolicyId ?? 'default-allow',
    policy_result: record.outcome,
    invariant_result: record.invariants.allHold ? 'pass' : 'fail',
  };
}

/** Create a TelemetrySink that appends JSON lines to a single shared log file. */
export function createTelemetryLogger(options?: TelemetryLoggerOptions): TelemetrySink {
  const logDir = options?.logDir ?? DEFAULT_LOG_DIR;
  const logFile = options?.logFile ?? DEFAULT_LOG_FILE;
  const filePath = join(logDir, logFile);

  let initialized = false;

  function ensureDir(): void {
    if (initialized) return;
    try {
      mkdirSync(logDir, { recursive: true });
      initialized = true;
    } catch {
      // Directory may already exist
      initialized = true;
    }
  }

  return {
    write(event: TelemetryEvent): void {
      ensureDir();
      const line = JSON.stringify(event) + '\n';

      try {
        appendFileSync(filePath, line, 'utf8');
      } catch {
        // Swallow write errors — don't crash the kernel
      }
    },

    flush(): void {
      // No buffering — writes are immediate for durability
    },
  };
}

/** Create a DecisionSink adapter that converts decision records to telemetry events. */
export function createTelemetryDecisionSink(options?: TelemetryLoggerOptions): DecisionSink {
  const logger = createTelemetryLogger(options);

  return {
    write(record: GovernanceDecisionRecord): void {
      const event = buildTelemetryEvent(record);
      logger.write(event);
    },

    flush(): void {
      logger.flush?.();
    },
  };
}
