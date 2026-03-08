import assert from 'node:assert';
import { test, suite } from './run.js';
import { fingerprint, deduplicateErrors } from '../domain/ingestion/fingerprint.js';

suite('Fingerprint (domain/ingestion/fingerprint.js)', () => {
  test('same input produces same fingerprint', () => {
    const error = { type: 'null-reference', message: 'Cannot read property x', file: 'app.js', line: 42 };
    const fp1 = fingerprint(error);
    const fp2 = fingerprint(error);
    assert.strictEqual(fp1, fp2);
  });

  test('different error types produce different fingerprints', () => {
    const a = { type: 'null-reference', message: 'error', file: 'a.js', line: 1 };
    const b = { type: 'syntax', message: 'error', file: 'a.js', line: 1 };
    assert.notStrictEqual(fingerprint(a), fingerprint(b));
  });

  test('different messages produce different fingerprints', () => {
    const a = { type: 'null-reference', message: 'Cannot read x', file: 'a.js', line: 1 };
    const b = { type: 'null-reference', message: 'Cannot read y', file: 'a.js', line: 1 };
    assert.notStrictEqual(fingerprint(a), fingerprint(b));
  });

  test('handles missing file and line fields', () => {
    const error = { type: 'syntax', message: 'Unexpected token' };
    const fp = fingerprint(error);
    assert.ok(typeof fp === 'string');
    assert.ok(fp.length > 0);
  });

  test('fingerprint is a string', () => {
    const fp = fingerprint({ type: 'test', message: 'msg' });
    assert.strictEqual(typeof fp, 'string');
  });

  // deduplicateErrors tests
  test('deduplicateErrors removes duplicates', () => {
    const errors = [
      { type: 'null-reference', message: 'error', rawLines: ['line1'] },
      { type: 'null-reference', message: 'error', rawLines: ['line1'] },
    ];
    const result = deduplicateErrors(errors);
    assert.strictEqual(result.length, 1);
  });

  test('deduplicateErrors keeps richer version (more rawLines)', () => {
    const errors = [
      { type: 'null-reference', message: 'err', rawLines: ['line1'] },
      { type: 'null-reference', message: 'err', rawLines: ['line1', 'line2', 'line3'] },
    ];
    const result = deduplicateErrors(errors);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].rawLines.length, 3);
  });

  test('deduplicateErrors handles empty array', () => {
    const result = deduplicateErrors([]);
    assert.deepStrictEqual(result, []);
  });

  test('deduplicateErrors preserves distinct errors', () => {
    const errors = [
      { type: 'null-reference', message: 'err1', rawLines: ['a'] },
      { type: 'syntax', message: 'err2', rawLines: ['b'] },
    ];
    const result = deduplicateErrors(errors);
    assert.strictEqual(result.length, 2);
  });

  test('deduplicateErrors adds fingerprint field to results', () => {
    const errors = [
      { type: 'null-reference', message: 'err', rawLines: ['a'] },
    ];
    const result = deduplicateErrors(errors);
    assert.ok(result[0].fingerprint, 'should have fingerprint field');
    assert.strictEqual(typeof result[0].fingerprint, 'string');
  });
});
