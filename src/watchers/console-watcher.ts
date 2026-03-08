/**
 * ConsoleWatcher — Detects runtime errors from process stderr.
 *
 * Intercepts stderr output, parses error messages using regex patterns,
 * and emits BugDetected events for each recognized error.
 */

import type { EventBus } from '../core/event-bus.js';
import type { BugEvent, EventMap, Severity, Watcher } from '../core/types.js';

/** Error patterns: [regex, errorType, severity] */
const ERROR_PATTERNS: [RegExp, string, Severity][] = [
  [/TypeError:\s*(.+)/i, 'TypeError', 3],
  [/ReferenceError:\s*(.+)/i, 'ReferenceError', 3],
  [/SyntaxError:\s*(.+)/i, 'SyntaxError', 4],
  [/RangeError:\s*(.+)/i, 'RangeError', 2],
  [/Error:\s*ENOENT/i, 'FileNotFound', 2],
  [/Error:\s*EACCES/i, 'PermissionError', 3],
  [/Error:\s*ECONNREFUSED/i, 'ConnectionRefused', 3],
  [/FATAL ERROR/i, 'FatalError', 5],
  [/Segmentation fault/i, 'SegFault', 5],
  [/Out of memory/i, 'OutOfMemory', 5],
  [/Cannot read propert/i, 'NullAccess', 3],
  [/is not defined/i, 'UndefinedReference', 3],
  [/is not a function/i, 'NotAFunction', 3],
  [/Maximum call stack/i, 'StackOverflow', 4],
  [/Unhandled promise rejection/i, 'UnhandledRejection', 3],
];

let idCounter = 0;

function parseError(line: string): { type: string; message: string; severity: Severity } | null {
  for (const [pattern, type, severity] of ERROR_PATTERNS) {
    if (pattern.test(line)) {
      return { type, message: line.trim(), severity };
    }
  }
  return null;
}

function createBugEvent(parsed: { type: string; message: string; severity: Severity }): BugEvent {
  return {
    id: `console-${++idCounter}-${Date.now()}`,
    type: parsed.type,
    source: 'console',
    errorMessage: parsed.message,
    timestamp: Date.now(),
    severity: parsed.severity,
  };
}

export class ConsoleWatcher implements Watcher {
  private readonly eventBus: EventBus<EventMap>;
  private originalWrite: typeof process.stderr.write | null = null;

  constructor(eventBus: EventBus<EventMap>) {
    this.eventBus = eventBus;
  }

  start(): void {
    this.originalWrite = process.stderr.write;

    const self = this;
    process.stderr.write = function (
      this: NodeJS.WriteStream,
      chunk: string | Uint8Array,
      ...args: unknown[]
    ): boolean {
      const text = typeof chunk === 'string' ? chunk : chunk.toString();

      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        const parsed = parseError(line);
        if (parsed) {
          const bug = createBugEvent(parsed);
          self.eventBus.emit('BugDetected', { bug });
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (self.originalWrite as any).apply(process.stderr, [chunk, ...args]);
    } as typeof process.stderr.write;
  }

  stop(): void {
    if (this.originalWrite) {
      process.stderr.write = this.originalWrite as typeof process.stderr.write;
      this.originalWrite = null;
    }
  }
}
