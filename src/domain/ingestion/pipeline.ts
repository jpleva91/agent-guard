// Ingestion pipeline orchestrator: parse → fingerprint → classify → event
// No DOM, no Node.js APIs — pure functions.

import type { DomainEvent, ParsedError } from '../../core/types.js';
import { createEvent, ERROR_OBSERVED } from '../events.js';
import { assertShape } from '../shapes.js';
import { fingerprint, deduplicateErrors } from './fingerprint.js';
import { classify } from './classifier.js';

/**
 * Ingest raw text through the full pipeline.
 * Returns an array of ERROR_OBSERVED domain events.
 *
 * Note: parseErrors is injected because the actual parser lives in core/
 * (which depends on Node.js for the full 40+ pattern implementation).
 * In the TS version, callers must provide the parse function.
 */
export function ingest(
  rawText: string,
  parseErrors: (text: string) => ParsedError[],
): DomainEvent[] {
  // Stage 1: Parse
  const parsed = parseErrors(rawText);
  if (parsed.length === 0) return [];

  // Stage 2: Fingerprint + deduplicate
  const fingerprintedErrors = parsed.map((err) => ({
    ...err,
    fingerprint: fingerprint(err),
  }));
  const deduped = deduplicateErrors(fingerprintedErrors);

  // Stage 3: Classify + create events
  const events: DomainEvent[] = [];
  for (const error of deduped) {
    assertShape('ParsedError', error);
    const bugEvent = classify(error);
    assertShape('BugEvent', bugEvent);

    events.push(
      createEvent(ERROR_OBSERVED, {
        message: error.message,
        errorType: error.type,
        file: error.file,
        line: error.line,
        fingerprint: error.fingerprint,
        bugEvent,
      }),
    );
  }

  return events;
}

export { fingerprint, deduplicateErrors, classify };
