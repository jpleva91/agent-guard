// Error parser — re-exports from core/error-parser.js
// This module provides the parsing stage of the ingestion pipeline.
//
// Note: The actual implementation lives in core/error-parser.js (JavaScript).
// When core/ is fully migrated to TypeScript, this will import from the TS version.
// For now, we provide a typed interface.

import type { ParsedError } from '../../core/types.js';

// Type declarations for the JS module exports
// These will be replaced with direct imports when core/ is migrated

/** Parse raw text for errors. Returns structured error objects. */
export type ParseErrorsFn = (text: string) => ParsedError[];

/** Parse a stack trace string. Returns structured frame data. */
export type ParseStackTraceFn = (stack: string) => Array<{
  file: string;
  line: number;
  column?: number;
  func?: string;
}>;

/** Get the first user frame from a stack trace (skip node_modules). */
export type GetUserFrameFn = (
  stack: string,
) => { file: string; line: number; column?: number; func?: string } | null;
