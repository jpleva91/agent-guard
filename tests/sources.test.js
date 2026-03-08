import assert from 'node:assert';
import { test, suite } from './run.js';
import { createWatchSource } from '../core/sources/watch-source.js';
import { createScanSource } from '../core/sources/scan-source.js';
import { createClaudeHookSource } from '../core/sources/claude-hook-source.js';

suite('Source Adapters (core/sources/)', () => {
  test('createWatchSource returns correct shape', () => {
    const src = createWatchSource({ command: 'echo', args: ['hello'] });
    assert.strictEqual(src.name, 'watch');
    assert.strictEqual(typeof src.start, 'function');
    assert.strictEqual(typeof src.stop, 'function');
    assert.ok(src.meta);
    assert.strictEqual(typeof src.meta.description, 'string');
  });

  test('createScanSource returns correct shape', () => {
    const src = createScanSource({ target: '.' });
    assert.strictEqual(src.name, 'scan');
    assert.strictEqual(typeof src.start, 'function');
    assert.strictEqual(typeof src.stop, 'function');
    assert.ok(src.meta);
    assert.strictEqual(typeof src.meta.description, 'string');
  });

  test('createClaudeHookSource returns correct shape', () => {
    const src = createClaudeHookSource();
    assert.strictEqual(src.name, 'claude-hook');
    assert.strictEqual(typeof src.start, 'function');
    assert.strictEqual(typeof src.stop, 'function');
    assert.ok(src.meta);
    assert.strictEqual(typeof src.meta.description, 'string');
  });

  test('watch source stop is safe before start', () => {
    const src = createWatchSource({ command: 'echo' });
    // Should not throw
    src.stop();
  });

  test('scan source stop is safe before start', () => {
    const src = createScanSource();
    // Should not throw
    src.stop();
  });

  test('claude-hook source stop is safe before start', () => {
    const src = createClaudeHookSource();
    // Should not throw
    src.stop();
  });

  test('watch source start with no command is safe', () => {
    const src = createWatchSource({});
    // Should not throw — no-op when no command
    src.start(() => {});
  });
});
