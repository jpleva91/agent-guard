import assert from 'node:assert';
import { test, suite } from './run.js';
import { parseStackTrace, getUserFrame, extractLocation } from '../dist/core/stacktrace-parser.js';

suite('Stacktrace Parser (core/stacktrace-parser.js)', () => {
  test('parses standard Node.js stack frame with function name', () => {
    const lines = ['    at myFunction (/app/src/index.js:42:15)'];
    const frames = parseStackTrace(lines);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].file, '/app/src/index.js');
    assert.strictEqual(frames[0].line, 42);
    assert.strictEqual(frames[0].column, 15);
    assert.strictEqual(frames[0].fn, 'myFunction');
  });

  test('parses anonymous function stack frame', () => {
    const lines = ['    at /app/src/handler.js:10:3'];
    const frames = parseStackTrace(lines);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].file, '/app/src/handler.js');
    assert.strictEqual(frames[0].line, 10);
    assert.strictEqual(frames[0].fn, null);
  });

  test('parses Object.<anonymous> format', () => {
    const lines = ['    at Object.<anonymous> (/app/test.js:5:12)'];
    const frames = parseStackTrace(lines);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].file, '/app/test.js');
    assert.strictEqual(frames[0].line, 5);
    assert.strictEqual(frames[0].fn, 'Object.<anonymous>');
  });

  test('filters out node: internal frames', () => {
    const lines = [
      '    at myFunc (/app/src/index.js:42:15)',
      '    at Module._compile (node:internal/modules/cjs/loader:1234:14)',
      '    at node:internal/main/run_main_module:28:49',
    ];
    const frames = parseStackTrace(lines);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].fn, 'myFunc');
  });

  test('filters out node_modules frames', () => {
    const lines = [
      '    at userCode (/app/src/app.js:10:5)',
      '    at libFunc (/app/node_modules/express/lib/router.js:100:10)',
    ];
    const frames = parseStackTrace(lines);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].fn, 'userCode');
  });

  test('parses TSC error format', () => {
    const lines = ['src/index.ts(42,15): error TS2345: Argument of type...'];
    const frames = parseStackTrace(lines);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].file, 'src/index.ts');
    assert.strictEqual(frames[0].line, 42);
    assert.strictEqual(frames[0].column, 15);
    assert.strictEqual(frames[0].fn, null);
  });

  test('handles empty lines', () => {
    const frames = parseStackTrace([]);
    assert.strictEqual(frames.length, 0);
  });

  test('handles non-stack-trace lines', () => {
    const lines = ['some random output', 'not a stack trace'];
    const frames = parseStackTrace(lines);
    assert.strictEqual(frames.length, 0);
  });

  test('getUserFrame returns first non-internal frame', () => {
    const frames = [
      { file: '/app/src/index.js', line: 42, column: 15, fn: 'myFunc' },
      { file: '/app/src/utils.js', line: 10, column: 3, fn: 'helper' },
    ];
    const frame = getUserFrame(frames);
    assert.strictEqual(frame.fn, 'myFunc');
  });

  test('getUserFrame returns null for empty array', () => {
    const frame = getUserFrame([]);
    assert.strictEqual(frame, null);
  });

  test('extractLocation parses file:line:col format', () => {
    const result = extractLocation('/app/src/index.js:42:15');
    assert.strictEqual(result.file, '/app/src/index.js');
    assert.strictEqual(result.line, 42);
    assert.strictEqual(result.column, 15);
  });

  test('extractLocation parses file:line without column', () => {
    const result = extractLocation('/app/src/index.js:42');
    assert.strictEqual(result.file, '/app/src/index.js');
    assert.strictEqual(result.line, 42);
    assert.strictEqual(result.column, null);
  });

  test('extractLocation returns null for node_modules paths', () => {
    const result = extractLocation('node_modules/express/index.js:10:5');
    assert.strictEqual(result, null);
  });

  test('extractLocation returns null for non-location strings', () => {
    const result = extractLocation('just some text');
    assert.strictEqual(result, null);
  });

  // --- Multi-language stack frames ---

  test('parses Python stack frame', () => {
    const lines = ['  File "/app/main.py", line 42, in <module>'];
    const frames = parseStackTrace(lines);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].file, '/app/main.py');
    assert.strictEqual(frames[0].line, 42);
    assert.strictEqual(frames[0].column, null);
  });

  test('parses Go stack frame', () => {
    const lines = ['\t/app/main.go:42'];
    const frames = parseStackTrace(lines);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].file, '/app/main.go');
    assert.strictEqual(frames[0].line, 42);
  });

  test('parses Rust source location', () => {
    const lines = ['  --> src/main.rs:42:15'];
    const frames = parseStackTrace(lines);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].file, 'src/main.rs');
    assert.strictEqual(frames[0].line, 42);
    assert.strictEqual(frames[0].column, 15);
  });

  test('parses Java stack frame', () => {
    const lines = ['\tat com.example.App.main(App.java:42)'];
    const frames = parseStackTrace(lines);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].file, 'App.java');
    assert.strictEqual(frames[0].line, 42);
  });
});
