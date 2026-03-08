import assert from 'node:assert';
import { test, suite } from './run.js';
import { parseErrors, parseStackTrace, getUserFrame } from '../domain/ingestion/parser.js';

suite('Ingestion Parser (domain/ingestion/parser.js)', () => {
  test('parseErrors extracts TypeError from raw text', () => {
    const text = "TypeError: Cannot read properties of null (reading 'x')";
    const errors = parseErrors(text);
    assert.ok(errors.length > 0, 'should parse at least one error');
    assert.ok(errors[0].type, 'should have a type');
    assert.ok(errors[0].message, 'should have a message');
  });

  test('parseErrors extracts SyntaxError', () => {
    const text = 'SyntaxError: Unexpected token }';
    const errors = parseErrors(text);
    assert.ok(errors.length > 0);
  });

  test('parseErrors returns empty array for non-error text', () => {
    const text = 'Everything is fine, no errors here.';
    const errors = parseErrors(text);
    assert.strictEqual(errors.length, 0);
  });

  test('parseErrors returns empty array for empty string', () => {
    const errors = parseErrors('');
    assert.strictEqual(errors.length, 0);
  });

  test('parseErrors handles multi-line error output', () => {
    const text = `ReferenceError: foo is not defined
    at Object.<anonymous> (app.js:10:5)
    at Module._compile (internal/modules/cjs/loader.js:999:30)`;
    const errors = parseErrors(text);
    assert.ok(errors.length > 0);
  });

  test('parseStackTrace parses V8 stack frames', () => {
    const lines = [
      '    at Object.<anonymous> (/home/user/app.js:10:5)',
      '    at Module._compile (internal/modules/cjs/loader.js:999:30)',
    ];
    const frames = parseStackTrace(lines);
    assert.ok(Array.isArray(frames));
    assert.ok(frames.length > 0, 'should parse at least one frame');
    assert.strictEqual(frames[0].file, '/home/user/app.js');
    assert.strictEqual(frames[0].line, 10);
  });

  test('parseStackTrace returns empty array for non-stack text', () => {
    const frames = parseStackTrace(['just some normal text']);
    assert.ok(Array.isArray(frames));
    assert.strictEqual(frames.length, 0);
  });

  test('getUserFrame skips node_modules and internal frames', () => {
    const frames = [
      { file: 'node_modules/express/index.js', line: 10, col: 5 },
      { file: 'internal/modules/cjs/loader.js', line: 999, col: 30 },
      { file: '/home/user/app.js', line: 42, col: 3 },
    ];
    const userFrame = getUserFrame(frames);
    assert.ok(userFrame, 'should find user frame');
    assert.strictEqual(userFrame.file, '/home/user/app.js');
    assert.strictEqual(userFrame.line, 42);
  });

  test('getUserFrame falls back to first frame when all are internal', () => {
    const frames = [
      { file: 'node_modules/lib/index.js', line: 1, col: 1 },
      { file: 'internal/modules/cjs/loader.js', line: 2, col: 2 },
    ];
    const userFrame = getUserFrame(frames);
    // getUserFrame falls back to frames[0] when no user frame found
    assert.strictEqual(userFrame.file, 'node_modules/lib/index.js');
  });

  test('getUserFrame returns null for empty array', () => {
    const userFrame = getUserFrame([]);
    assert.strictEqual(userFrame, null);
  });
});
