/**
 * BuildWatcher — Detects build and compilation failures.
 *
 * Uses chokidar to watch build output directories for error logs,
 * parses TypeScript/esbuild error formats, and emits BugDetected events.
 */

import { watch, type FSWatcher } from 'chokidar';
import { readFile } from 'node:fs/promises';
import type { EventBus } from '../core/event-bus.js';
import type { BugEvent, EventMap, Severity, Watcher } from '../core/types.js';

/** Build error patterns: [regex, errorType, severity] */
const BUILD_PATTERNS: [RegExp, string, Severity][] = [
  [/error TS(\d+):\s*(.+)/i, 'TypeScriptError', 4],
  [/ERROR:\s*(.+)/i, 'BuildError', 3],
  [/Could not resolve/i, 'ModuleResolution', 3],
  [/Module not found/i, 'ModuleNotFound', 3],
  [/SyntaxError/i, 'SyntaxError', 4],
  [/Type .+ is not assignable/i, 'TypeMismatch', 3],
  [/Property .+ does not exist/i, 'MissingProperty', 2],
  [/Cannot find module/i, 'ModuleNotFound', 3],
];

export interface BuildWatcherOptions {
  readonly buildDir: string;
  readonly pattern?: string;
}

let idCounter = 0;

export class BuildWatcher implements Watcher {
  private readonly eventBus: EventBus<EventMap>;
  private readonly options: BuildWatcherOptions;
  private watcher: FSWatcher | null = null;

  constructor(eventBus: EventBus<EventMap>, options: BuildWatcherOptions) {
    this.eventBus = eventBus;
    this.options = options;
  }

  start(): void {
    const globPattern = this.options.pattern ?? '**/*.{log,err,stderr}';

    this.watcher = watch(globPattern, {
      cwd: this.options.buildDir,
      ignoreInitial: true,
    });

    this.watcher.on('change', (filePath) => {
      void this.processFile(filePath);
    });

    this.watcher.on('add', (filePath) => {
      void this.processFile(filePath);
    });
  }

  stop(): void {
    void this.watcher?.close();
    this.watcher = null;
  }

  private async processFile(filePath: string): Promise<void> {
    try {
      const fullPath = `${this.options.buildDir}/${filePath}`;
      const content = await readFile(fullPath, 'utf-8');

      for (const line of content.split('\n')) {
        for (const [pattern, type, severity] of BUILD_PATTERNS) {
          if (pattern.test(line)) {
            const bug: BugEvent = {
              id: `build-${++idCounter}-${Date.now()}`,
              type,
              source: 'build',
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
      // File read failed — skip
    }
  }
}
