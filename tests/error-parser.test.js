import assert from 'node:assert';
import { test, suite } from './run.js';
import { parseErrors } from '../dist/core/error-parser.js';

suite('Error Parser (core/error-parser.js)', () => {
  test('parses TypeError null reference', () => {
    const result = parseErrors("TypeError: Cannot read properties of null (reading 'foo')");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'null-reference');
  });

  test('parses SyntaxError', () => {
    const result = parseErrors('SyntaxError: Unexpected token }');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'syntax');
  });

  test('parses RangeError stack overflow', () => {
    const result = parseErrors('RangeError: Maximum call stack size exceeded');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'stack-overflow');
  });

  test('parses ReferenceError', () => {
    const result = parseErrors('ReferenceError: foo is not defined');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'undefined-reference');
  });

  test('parses network errors (ECONNREFUSED)', () => {
    const result = parseErrors('Error: connect ECONNREFUSED 127.0.0.1:3000');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'network');
  });

  test('parses module not found', () => {
    const result = parseErrors("Error: Cannot find module 'express'");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'import');
  });

  test('parses file not found (ENOENT)', () => {
    const result = parseErrors("Error: ENOENT: no such file or directory, open '/tmp/missing.txt'");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'file-not-found');
  });

  test('parses memory leak', () => {
    const result = parseErrors('FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'memory-leak');
  });

  test('handles empty input', () => {
    const result = parseErrors('');
    assert.strictEqual(result.length, 0);
  });

  test('handles whitespace-only input', () => {
    const result = parseErrors('   \n  \n   ');
    assert.strictEqual(result.length, 0);
  });

  test('collects stack trace lines with the error', () => {
    const input = `TypeError: Cannot read properties of null (reading 'name')
    at Object.<anonymous> (/app/index.js:42:15)
    at Module._compile (node:internal/modules/cjs/loader:1234:14)`;
    const result = parseErrors(input);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].rawLines.length >= 2, 'should collect stack trace lines');
  });

  test('deduplicates identical errors, keeps one with more context', () => {
    const input = `TypeError: Cannot read properties of null (reading 'x')
TypeError: Cannot read properties of null (reading 'x')
    at foo (/app/bar.js:10:5)
    at baz (/app/qux.js:20:3)`;
    const result = parseErrors(input);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].rawLines.length >= 2, 'should keep the one with more context');
  });

  test('parses multiple different errors', () => {
    const input = `TypeError: foo is not a function
SyntaxError: Unexpected end of input`;
    const result = parseErrors(input);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].type, 'type-mismatch');
    assert.strictEqual(result[1].type, 'syntax');
  });

  test('extracts message from error line', () => {
    const result = parseErrors("TypeError: Cannot read properties of null (reading 'bar')");
    assert.ok(result[0].message.length > 0, 'message should not be empty');
  });

  test('parses assertion errors', () => {
    const result = parseErrors('AssertionError: expected true to equal false');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'assertion');
  });

  test('parses permission errors (EACCES)', () => {
    const result = parseErrors("Error: EACCES: permission denied, open '/etc/passwd'");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'permission');
  });

  // --- Dev tool output formats ---

  test('parses ESLint error output', () => {
    const result = parseErrors('src/app.js:10:5: error Unexpected var, use let or const instead (no-var)');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'lint-error');
  });

  test('parses ESLint warning output', () => {
    const result = parseErrors('src/utils.js:25:1: warning Unexpected console statement (no-console)');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'lint-warning');
  });

  test('parses vitest/jest FAIL line', () => {
    const result = parseErrors('FAIL src/app.test.js');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'test-failure');
  });

  test('parses jest summary with failures', () => {
    const result = parseErrors('Tests: 3 failed, 12 passed, 15 total');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'test-failure');
  });

  test('parses TypeScript compiler error', () => {
    const result = parseErrors("error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'type-error');
  });

  test('parses TypeScript file-level error', () => {
    const result = parseErrors('src/index.tsx(42,15): error TS2322: Type mismatch');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'type-error');
  });

  // --- Python errors ---

  test('parses Python NameError', () => {
    const result = parseErrors("NameError: name 'foo' is not defined");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'undefined-reference');
  });

  test('parses Python AttributeError', () => {
    const result = parseErrors("AttributeError: 'NoneType' object has no attribute 'bar'");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'null-reference');
  });

  test('parses Python ImportError', () => {
    const result = parseErrors("ImportError: No module named 'flask'");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'import');
  });

  test('parses Python ModuleNotFoundError', () => {
    const result = parseErrors("ModuleNotFoundError: No module named 'requests'");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'import');
  });

  test('parses Python KeyError', () => {
    const result = parseErrors("KeyError: 'missing_key'");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'key-error');
  });

  test('parses Python IndexError', () => {
    const result = parseErrors('IndexError: list index out of range');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'range-error');
  });

  test('parses Python ValueError', () => {
    const result = parseErrors("ValueError: invalid literal for int() with base 10: 'abc'");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'type-mismatch');
  });

  test('parses Python ZeroDivisionError', () => {
    const result = parseErrors('ZeroDivisionError: division by zero');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'range-error');
  });

  test('parses Python RecursionError', () => {
    const result = parseErrors('RecursionError: maximum recursion depth exceeded');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'stack-overflow');
  });

  test('merges Python traceback with following error', () => {
    const input = `Traceback (most recent call last):
  File "app.py", line 10, in <module>
    result = data['key']
KeyError: 'key'`;
    const result = parseErrors(input);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'key-error');
    assert.ok(result[0].rawLines.length >= 3, 'should include traceback lines');
  });

  // --- Go errors ---

  test('parses Go panic with runtime error', () => {
    const result = parseErrors('panic: runtime error: index out of range [5] with length 3');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'null-reference');
  });

  test('parses Go general panic', () => {
    const result = parseErrors('panic: something went wrong');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'stack-overflow');
  });

  test('parses Go concurrent map write', () => {
    const result = parseErrors('fatal error: concurrent map writes');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'concurrency');
  });

  test('parses Go compile error', () => {
    const result = parseErrors('./main.go:10:5: undefined: foo');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'syntax');
  });

  // --- Rust errors ---

  test('parses Rust compiler error', () => {
    const result = parseErrors('error[E0308]: mismatched types');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'type-error');
  });

  test('parses Rust compiler warning', () => {
    const result = parseErrors('warning[unused_variables]: unused variable `x`');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'lint-warning');
  });

  test('parses Rust panic', () => {
    const result = parseErrors("thread 'main' panicked at 'index out of bounds'");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'stack-overflow');
  });

  test('parses Rust borrow of moved value', () => {
    const result = parseErrors('borrow of moved value: `x`');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'type-error');
  });

  // --- Java / Kotlin errors ---

  test('parses Java NullPointerException', () => {
    const result = parseErrors('Exception in thread "main" java.lang.NullPointerException');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'null-reference');
  });

  test('parses Java ClassNotFoundException', () => {
    const result = parseErrors('java.lang.ClassNotFoundException: com.example.MyClass');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'import');
  });

  test('parses Java StackOverflowError', () => {
    const result = parseErrors('java.lang.StackOverflowError');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'stack-overflow');
  });

  test('parses Java ConcurrentModificationException', () => {
    const result = parseErrors('java.util.ConcurrentModificationException');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'concurrency');
  });

  test('parses Java OutOfMemoryError', () => {
    const result = parseErrors('java.lang.OutOfMemoryError: Java heap space');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'memory-leak');
  });
});
