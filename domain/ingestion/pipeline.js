// Ingestion pipeline — orchestrates: parse → fingerprint → classify → species map
// Each stage is independently testable and replaceable.

import { parseErrors } from './parser.js';
import { parseStackTrace, getUserFrame } from './parser.js';
import { fingerprint, deduplicateErrors } from './fingerprint.js';
import { classify } from './classifier.js';
import { ERROR_OBSERVED, BUG_CLASSIFIED, createEvent } from '../events.js';
import { assertShape } from '../shapes.js';

/**
 * Process raw stderr/stdout text through the full ingestion pipeline.
 * Returns an array of domain events (ErrorObserved + BugClassified).
 *
 * @param {string} rawText - Raw stderr/stdout output
 * @returns {Array<{ kind: string, timestamp: number, data: object }>}
 */
export function ingest(rawText) {
  const events = [];

  // Stage 1: Parse raw text into structured errors
  const parsed = parseErrors(rawText);
  if (parsed.length === 0) return events;

  // Assert parsed errors conform to ParsedError shape
  for (const p of parsed) assertShape('ParsedError', p);

  // Stage 2: Deduplicate via fingerprinting
  const unique = deduplicateErrors(parsed);

  // Stage 3: Classify each error into a BugEvent
  for (const error of unique) {
    // Extract source location from stack trace if available
    const stack = parseStackTrace(error.rawLines.join('\n'));
    const frame = getUserFrame(stack);

    const bugEvent = classify(error, {
      file: frame?.file || null,
      line: frame?.line || null,
    });
    assertShape('BugEvent', bugEvent);

    events.push(createEvent(ERROR_OBSERVED, {
      source: 'unknown',
      errorType: error.type,
      message: error.message,
      file: bugEvent.file,
      line: bugEvent.line,
      severity: bugEvent.severity,
      fingerprint: error.fingerprint || fingerprint(error),
      bugEvent,
    }));
  }

  return events;
}

// Re-export stages for direct use
export { parseErrors } from './parser.js';
export { fingerprint, deduplicateErrors } from './fingerprint.js';
export { classify } from './classifier.js';
