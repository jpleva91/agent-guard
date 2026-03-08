// Classifier — maps parsed errors to canonical BugEvents
// Separates error classification from species mapping.
// Re-exports core logic from bug-event.js and adds the pipeline interface.

import {
  SEVERITY as _SEVERITY,
  createBugEvent as _createBugEvent,
  ERROR_TO_MONSTER_TYPE as _ERROR_TO_MONSTER_TYPE,
  resetFrequencies as _resetFrequencies
} from '../../core/bug-event.js';

export const SEVERITY = _SEVERITY;
export const createBugEvent = _createBugEvent;
export const ERROR_TO_MONSTER_TYPE = _ERROR_TO_MONSTER_TYPE;
export const resetFrequencies = _resetFrequencies;

/**
 * Classify a parsed error into a canonical BugEvent.
 * This is the pipeline stage between parsing and species mapping.
 *
 * @param {{ type: string, message: string, rawLines: string[] }} parsedError
 * @param {{ file?: string, line?: number }} context - Optional source location
 * @returns {import('../../core/bug-event.js').BugEvent}
 */
export function classify(parsedError, context = {}) {
  return _createBugEvent(
    parsedError.type,
    parsedError.message,
    context.file || null,
    context.line || null
  );
}
