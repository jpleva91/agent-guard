// Classifier stage — maps parsed errors to canonical BugEvents.
// Re-exports from core/bug-event.js for the ingestion pipeline.
// No DOM, no Node.js APIs — pure functions.

import type { ParsedError, ClassifiedBugEvent, Severity } from '../../core/types.js';
import { simpleHash } from '../hash.js';

// --- Severity mapping (mirrors core/bug-event.js) ---
export const SEVERITY = {
  MINOR: 1 as Severity,
  LOW: 2 as Severity,
  MEDIUM: 3 as Severity,
  HIGH: 4 as Severity,
  CRITICAL: 5 as Severity,
};

const TYPE_SEVERITY: Record<string, Severity> = {
  'null-reference': SEVERITY.MEDIUM,
  'type-mismatch': SEVERITY.LOW,
  'type-error': SEVERITY.LOW,
  syntax: SEVERITY.MEDIUM,
  'undefined-reference': SEVERITY.LOW,
  'stack-overflow': SEVERITY.HIGH,
  'range-error': SEVERITY.MEDIUM,
  network: SEVERITY.MEDIUM,
  'file-not-found': SEVERITY.LOW,
  permission: SEVERITY.MEDIUM,
  import: SEVERITY.LOW,
  'unhandled-promise': SEVERITY.MEDIUM,
  'broken-pipe': SEVERITY.HIGH,
  'memory-leak': SEVERITY.HIGH,
  regex: SEVERITY.LOW,
  assertion: SEVERITY.MEDIUM,
  deprecated: SEVERITY.MINOR,
  'merge-conflict': SEVERITY.MEDIUM,
  'security-finding': SEVERITY.HIGH,
  'ci-failure': SEVERITY.MEDIUM,
  'lint-error': SEVERITY.LOW,
  'lint-warning': SEVERITY.MINOR,
  'test-failure': SEVERITY.MEDIUM,
  'key-error': SEVERITY.LOW,
  concurrency: SEVERITY.HIGH,
  generic: SEVERITY.LOW,
};

// Session-scoped frequency counter
const frequencyMap = new Map<string, number>();

export function resetFrequencies(): void {
  frequencyMap.clear();
}

/**
 * Classify a parsed error into a BugEvent.
 */
export function classify(
  parsedError: ParsedError,
  _context?: Record<string, unknown>,
): ClassifiedBugEvent {
  const id = simpleHash(
    `${parsedError.type}:${parsedError.message}:${parsedError.file || ''}:${parsedError.line || ''}`,
  );

  const freq = (frequencyMap.get(id) || 0) + 1;
  frequencyMap.set(id, freq);

  return {
    id,
    type: parsedError.type,
    message: parsedError.message,
    file: parsedError.file,
    line: parsedError.line,
    severity: TYPE_SEVERITY[parsedError.type] ?? SEVERITY.LOW,
    frequency: freq,
  };
}
