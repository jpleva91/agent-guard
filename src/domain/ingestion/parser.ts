// Error parser — re-exports from core modules
// This module provides the parsing stage of the ingestion pipeline.

export { parseErrors } from '../../core/error-parser.js';
export { parseStackTrace, getUserFrame } from '../../core/stacktrace-parser.js';
