// Error fingerprinting for deduplication.
// No DOM, no Node.js APIs — pure functions.

import type { ParsedError } from '../../core/types.js';
import { simpleHash } from '../hash.js';

/** Generate a stable fingerprint for a parsed error. */
export function fingerprint(error: ParsedError): string {
  return simpleHash(`${error.type}:${error.message}:${error.file || ''}:${error.line || ''}`);
}

/** Deduplicate errors, keeping the richest version (most rawLines). */
export function deduplicateErrors(errors: ParsedError[]): ParsedError[] {
  const seen = new Map<string, ParsedError>();
  for (const err of errors) {
    const fp = err.fingerprint || fingerprint(err);
    const existing = seen.get(fp);
    if (!existing || err.rawLines.length > existing.rawLines.length) {
      seen.set(fp, { ...err, fingerprint: fp });
    }
  }
  return [...seen.values()];
}
