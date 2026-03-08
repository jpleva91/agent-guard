import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/core/event-bus.js';
import { ConsoleWatcher } from '../../src/watchers/console-watcher.js';
import type { BugEvent, EventMap } from '../../src/core/types.js';

describe('ConsoleWatcher', () => {
  let eventBus: EventBus<EventMap>;
  let watcher: ConsoleWatcher;

  beforeEach(() => {
    eventBus = new EventBus<EventMap>();
    watcher = new ConsoleWatcher(eventBus);
  });

  afterEach(() => {
    watcher.stop();
  });

  it('should detect TypeError from stderr', () => {
    const bugs: BugEvent[] = [];
    eventBus.on('BugDetected', ({ bug }) => bugs.push(bug));

    watcher.start();
    process.stderr.write("TypeError: Cannot read properties of undefined (reading 'foo')\n");
    watcher.stop();

    expect(bugs).toHaveLength(1);
    expect(bugs[0].type).toBe('TypeError');
    expect(bugs[0].source).toBe('console');
    expect(bugs[0].severity).toBe(3);
  });

  it('should detect ReferenceError from stderr', () => {
    const bugs: BugEvent[] = [];
    eventBus.on('BugDetected', ({ bug }) => bugs.push(bug));

    watcher.start();
    process.stderr.write('ReferenceError: x is not defined\n');
    watcher.stop();

    expect(bugs).toHaveLength(1);
    expect(bugs[0].type).toBe('ReferenceError');
  });

  it('should detect SyntaxError from stderr', () => {
    const bugs: BugEvent[] = [];
    eventBus.on('BugDetected', ({ bug }) => bugs.push(bug));

    watcher.start();
    process.stderr.write('SyntaxError: Unexpected token\n');
    watcher.stop();

    expect(bugs).toHaveLength(1);
    expect(bugs[0].type).toBe('SyntaxError');
    expect(bugs[0].severity).toBe(4);
  });

  it('should detect fatal errors', () => {
    const bugs: BugEvent[] = [];
    eventBus.on('BugDetected', ({ bug }) => bugs.push(bug));

    watcher.start();
    process.stderr.write('FATAL ERROR: out of memory\n');
    watcher.stop();

    expect(bugs).toHaveLength(1);
    expect(bugs[0].severity).toBe(5);
  });

  it('should ignore non-error output', () => {
    const bugs: BugEvent[] = [];
    eventBus.on('BugDetected', ({ bug }) => bugs.push(bug));

    watcher.start();
    process.stderr.write('Warning: some deprecation notice\n');
    watcher.stop();

    expect(bugs).toHaveLength(0);
  });

  it('should restore stderr on stop', () => {
    const originalWrite = process.stderr.write;
    watcher.start();
    expect(process.stderr.write).not.toBe(originalWrite);

    watcher.stop();
    expect(process.stderr.write).toBe(originalWrite);
  });
});
