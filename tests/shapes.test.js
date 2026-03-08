import assert from 'node:assert';
import { test, suite } from './run.js';
import { SHAPES, validateShape, assertShape } from '../domain/shapes.js';

suite('Domain Shapes — Shape Validation', () => {
  // --- SHAPES registry ---

  test('SHAPES contains expected shape definitions', () => {
    const expected = [
      'ParsedError', 'BugEvent', 'DamageResult', 'MoveResult',
      'BattleState', 'EvolutionResult', 'EvolutionProgress', 'EncounterResult',
    ];
    for (const name of expected) {
      assert.ok(SHAPES[name], `Missing shape: ${name}`);
      assert.ok(SHAPES[name].required, `${name} missing required fields`);
      assert.ok(SHAPES[name].optional !== undefined, `${name} missing optional fields`);
    }
  });

  // --- validateShape: ParsedError ---

  test('validateShape accepts valid ParsedError', () => {
    const result = validateShape('ParsedError', {
      type: 'null-reference',
      message: 'Cannot read property x of null',
      rawLines: ['TypeError: Cannot read property x of null'],
    });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('validateShape rejects ParsedError with missing required fields', () => {
    const result = validateShape('ParsedError', { type: 'syntax' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('message')));
    assert.ok(result.errors.some(e => e.includes('rawLines')));
  });

  test('validateShape rejects ParsedError with wrong types', () => {
    const result = validateShape('ParsedError', {
      type: 123,
      message: 'ok',
      rawLines: 'not-an-array',
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('type') && e.includes('string')));
    assert.ok(result.errors.some(e => e.includes('rawLines') && e.includes('array')));
  });

  test('validateShape accepts ParsedError with optional fields', () => {
    const result = validateShape('ParsedError', {
      type: 'syntax',
      message: 'Unexpected token',
      rawLines: ['SyntaxError: Unexpected token'],
      fingerprint: 'abc123',
      file: 'main.js',
      line: 42,
    });
    assert.strictEqual(result.valid, true);
  });

  test('validateShape rejects ParsedError with wrong optional field type', () => {
    const result = validateShape('ParsedError', {
      type: 'syntax',
      message: 'Unexpected token',
      rawLines: ['SyntaxError'],
      line: 'not-a-number',
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('line') && e.includes('number')));
  });

  // --- validateShape: BugEvent ---

  test('validateShape accepts valid BugEvent', () => {
    const result = validateShape('BugEvent', {
      severity: 3,
      type: 'null-reference',
      message: 'null pointer',
    });
    assert.strictEqual(result.valid, true);
  });

  test('validateShape rejects BugEvent with missing severity', () => {
    const result = validateShape('BugEvent', {
      type: 'syntax',
      message: 'bad syntax',
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('severity')));
  });

  // --- validateShape: DamageResult ---

  test('validateShape accepts valid DamageResult', () => {
    const result = validateShape('DamageResult', {
      damage: 10,
      effectiveness: 1.5,
      critical: false,
    });
    assert.strictEqual(result.valid, true);
  });

  // --- validateShape: edge cases ---

  test('validateShape returns error for unknown shape name', () => {
    const result = validateShape('NonExistent', {});
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].includes('Unknown shape'));
  });

  test('validateShape returns error for null input', () => {
    const result = validateShape('ParsedError', null);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].includes('non-null object'));
  });

  test('validateShape returns error for non-object input', () => {
    const result = validateShape('ParsedError', 'string');
    assert.strictEqual(result.valid, false);
  });

  // --- assertShape ---

  test('assertShape does not throw for valid shape', () => {
    assert.doesNotThrow(() => {
      assertShape('BugEvent', {
        severity: 2,
        type: 'syntax',
        message: 'error',
      });
    });
  });

  test('assertShape throws for invalid shape', () => {
    assert.throws(
      () => assertShape('BugEvent', { type: 'syntax' }),
      (err) => err.message.includes('Shape assertion failed') && err.message.includes('severity'),
    );
  });

  test('assertShape throws for unknown shape', () => {
    assert.throws(
      () => assertShape('FakeShape', {}),
      (err) => err.message.includes('Unknown shape'),
    );
  });
});
