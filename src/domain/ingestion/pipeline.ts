// Ingestion pipeline orchestrator: parse → fingerprint → classify → event
// No DOM, no Node.js APIs — pure functions.

import type { DomainEvent } from '../../core/types.js';
import { createEvent, ERROR_OBSERVED } from '../events.js';
import { assertShape } from '../shapes.js';
import { fingerprint, deduplicateErrors } from './fingerprint.js';
import { classify } from './classifier.js';
import { parseErrors, parseStackTrace, getUserFrame } from './parser.js';

/**
 * Ingest raw text through the full pipeline.
 * Returns an array of ERROR_OBSERVED domain events.
 */
export function ingest(rawText: string): DomainEvent[] {
  const events: DomainEvent[] = [];

  // Stage 1: Parse raw text into structured errors
  const parsed = parseErrors(rawText);
  if (parsed.length === 0) return events;

  for (const p of parsed) assertShape('ParsedError', p);

  // Stage 2: Deduplicate via fingerprinting
  const unique = deduplicateErrors(parsed);

  // Stage 3: Classify each error into a BugEvent
  for (const error of unique) {
    const rawLines = (error as unknown as { rawLines?: string[] }).rawLines ?? [];
    const stack = parseStackTrace(rawLines);
    const frame = getUserFrame(stack);

    const bugEvent = classify(error, {
      file: frame?.file || undefined,
      line: frame?.line || undefined,
    });
    assertShape('BugEvent', bugEvent);

    events.push(
      createEvent(ERROR_OBSERVED, {
        source: 'unknown',
        errorType: error.type,
        message: error.message,
        file: bugEvent.file,
        line: bugEvent.line,
        severity: bugEvent.severity,
        fingerprint: (error as { fingerprint?: string }).fingerprint || fingerprint(error),
        bugEvent,
      }),
    );
  }

  return events;
}

export { parseErrors } from './parser.js';
export { fingerprint, deduplicateErrors } from './fingerprint.js';
export { classify };
