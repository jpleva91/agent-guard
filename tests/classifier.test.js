import assert from 'node:assert';
import { test, suite } from './run.js';
import { classify, SEVERITY, createBugEvent, ERROR_TO_MONSTER_TYPE, resetFrequencies } from '../domain/ingestion/classifier.js';

suite('Classifier (domain/ingestion/classifier.js)', () => {
  test('classify returns a BugEvent with correct type and message', () => {
    resetFrequencies();
    const parsed = { type: 'null-reference', message: 'Cannot read property x', rawLines: ['TypeError: Cannot read property x'] };
    const result = classify(parsed);
    assert.strictEqual(result.type, 'null-reference');
    assert.strictEqual(result.message, 'Cannot read property x');
  });

  test('classify passes file/line context through', () => {
    resetFrequencies();
    const parsed = { type: 'syntax', message: 'Unexpected token', rawLines: [] };
    const result = classify(parsed, { file: 'app.js', line: 42 });
    assert.strictEqual(result.file, 'app.js');
    assert.strictEqual(result.line, 42);
  });

  test('classify defaults file/line to null when no context', () => {
    resetFrequencies();
    const parsed = { type: 'syntax', message: 'error', rawLines: [] };
    const result = classify(parsed);
    assert.strictEqual(result.file, null);
    assert.strictEqual(result.line, null);
  });

  test('classify assigns severity from type', () => {
    resetFrequencies();
    const parsed = { type: 'null-reference', message: 'err', rawLines: [] };
    const result = classify(parsed);
    assert.strictEqual(result.severity, SEVERITY.MEDIUM);
  });

  test('SEVERITY constants are correct', () => {
    assert.strictEqual(SEVERITY.MINOR, 1);
    assert.strictEqual(SEVERITY.LOW, 2);
    assert.strictEqual(SEVERITY.MEDIUM, 3);
    assert.strictEqual(SEVERITY.HIGH, 4);
    assert.strictEqual(SEVERITY.CRITICAL, 5);
  });

  test('ERROR_TO_MONSTER_TYPE maps known error types', () => {
    assert.strictEqual(ERROR_TO_MONSTER_TYPE['null-reference'], 'backend');
    assert.strictEqual(ERROR_TO_MONSTER_TYPE['syntax'], 'frontend');
    assert.strictEqual(ERROR_TO_MONSTER_TYPE['merge-conflict'], 'devops');
    assert.strictEqual(ERROR_TO_MONSTER_TYPE['permission'], 'security');
  });
});
