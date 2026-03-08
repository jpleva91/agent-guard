/**
 * TestWatcher — Detects test failures by watching test output directories.
 *
 * Uses chokidar to watch for changes in test result files, parses
 * common test runner output formats, and emits BugDetected events.
 */

import { watch, type FSWatcher } from 'chokidar';
import { readFile } from 'node:fs/promises';
import type { EventBus } from '../core/event-bus.js';
import type { BugEvent, EventMap, Severity, Watcher } from '../core/types.js';

/** Test failure patterns: [regex, errorType, severity] */
const FAILURE_PATTERNS: [RegExp, string, Severity][] = [
  [/FAIL\s+(.+)/i, 'TestFailure', 3],
  [/AssertionError:\s*(.+)/i, 'AssertionError', 3],
  [/Expected .+ to (equal|be|match)/i, 'AssertionMismatch', 2],
  [/Timeout\s*-?\s*Async/i, 'TestTimeout', 3],
  [/Error:\s*(.+)/i, 'TestError', 2],
];

export interface TestWatcherOptions {
  readonly testDir: string;
  readonly pattern?: string;
}

let idCounter = 0;

export class TestWatcher implements Watcher {
  private readonly eventBus: EventBus<EventMap>;
  private readonly options: TestWatcherOptions;
  private watcher: FSWatcher | null = null;

  constructor(eventBus: EventBus<EventMap>, options: TestWatcherOptions) {
    this.eventBus = eventBus;
    this.options = options;
  }

  start(): void {
    const globPattern = this.options.pattern ?? '**/*.{test,spec}.{ts,js,tsx,jsx}';

    this.watcher = watch(globPattern, {
      cwd: this.options.testDir,
      ignoreInitial: true,
    });

    this.watcher.on('change', (filePath) => {
      void this.processFile(filePath);
    });
  }

  stop(): void {
    void this.watcher?.close();
    this.watcher = null;
  }

  private async processFile(filePath: string): Promise<void> {
    try {
      const fullPath = `${this.options.testDir}/${filePath}`;
      const content = await readFile(fullPath, 'utf-8');

      for (const line of content.split('\n')) {
        for (const [pattern, type, severity] of FAILURE_PATTERNS) {
          if (pattern.test(line)) {
            const bug: BugEvent = {
              id: `test-${++idCounter}-${Date.now()}`,
              type,
              source: 'test',
              errorMessage: line.trim(),
              timestamp: Date.now(),
              severity,
              file: filePath,
            };
            this.eventBus.emit('BugDetected', { bug });
            break;
          }
        }
      }
    } catch {
      // File read failed — not a bug we need to track
    }
  }
}
