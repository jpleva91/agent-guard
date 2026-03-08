import assert from 'node:assert';
import { test, suite } from './run.js';
import { validateBugDexEntry, VALID_TYPES, VALID_RARITIES, BUGDEX_SCHEMA } from '../dist/ecosystem/bugdex-spec.js';

const VALID_ENTRY = {
  id: 'test-bug',
  name: 'TestBug',
  errorType: 'TypeError',
  type: 'backend',
  rarity: 'common',
  hp: 30,
  attack: 8,
  defense: 4,
  speed: 6,
  moves: ['segfault'],
  description: 'A test bug for unit tests',
  color: '#ff0000',
};

suite('BugDex spec validation (ecosystem/bugdex-spec.js)', () => {
  test('accepts a valid entry', () => {
    const result = validateBugDexEntry(VALID_ENTRY);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('rejects missing name', () => {
    const entry = { ...VALID_ENTRY, name: undefined };
    const result = validateBugDexEntry(entry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  test('rejects missing id', () => {
    const entry = { ...VALID_ENTRY, id: undefined };
    const result = validateBugDexEntry(entry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('id')));
  });

  test('rejects empty string for required fields', () => {
    const entry = { ...VALID_ENTRY, description: '' };
    const result = validateBugDexEntry(entry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('description')));
  });

  test('rejects invalid type', () => {
    const entry = { ...VALID_ENTRY, type: 'magic' };
    const result = validateBugDexEntry(entry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Invalid type')));
  });

  test('rejects invalid rarity', () => {
    const entry = { ...VALID_ENTRY, rarity: 'mythical' };
    const result = validateBugDexEntry(entry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Invalid rarity')));
  });

  test('rejects hp out of range', () => {
    const tooLow = { ...VALID_ENTRY, hp: 5 };
    assert.strictEqual(validateBugDexEntry(tooLow).valid, false);

    const tooHigh = { ...VALID_ENTRY, hp: 200 };
    assert.strictEqual(validateBugDexEntry(tooHigh).valid, false);
  });

  test('rejects attack out of range', () => {
    const tooLow = { ...VALID_ENTRY, attack: 0 };
    assert.strictEqual(validateBugDexEntry(tooLow).valid, false);

    const tooHigh = { ...VALID_ENTRY, attack: 25 };
    assert.strictEqual(validateBugDexEntry(tooHigh).valid, false);
  });

  test('rejects speed out of range', () => {
    const tooHigh = { ...VALID_ENTRY, speed: 20 };
    assert.strictEqual(validateBugDexEntry(tooHigh).valid, false);
  });

  test('rejects non-number stats', () => {
    const entry = { ...VALID_ENTRY, hp: 'thirty' };
    const result = validateBugDexEntry(entry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('hp must be a number')));
  });

  test('rejects empty moves array', () => {
    const entry = { ...VALID_ENTRY, moves: [] };
    const result = validateBugDexEntry(entry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('moves')));
  });

  test('rejects more than 4 moves', () => {
    const entry = { ...VALID_ENTRY, moves: ['a', 'b', 'c', 'd', 'e'] };
    const result = validateBugDexEntry(entry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('4')));
  });

  test('rejects invalid color format', () => {
    const entry = { ...VALID_ENTRY, color: 'red' };
    const result = validateBugDexEntry(entry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Invalid color')));
  });

  test('accepts valid hex colors', () => {
    const entry = { ...VALID_ENTRY, color: '#abCDef' };
    assert.strictEqual(validateBugDexEntry(entry).valid, true);
  });

  test('accepts numeric id', () => {
    const entry = { ...VALID_ENTRY, id: 42 };
    assert.strictEqual(validateBugDexEntry(entry).valid, true);
  });

  test('VALID_TYPES has all 7 types', () => {
    assert.strictEqual(VALID_TYPES.length, 7);
    assert.ok(VALID_TYPES.includes('frontend'));
    assert.ok(VALID_TYPES.includes('backend'));
    assert.ok(VALID_TYPES.includes('ai'));
  });

  test('VALID_RARITIES has all 5 rarities', () => {
    assert.strictEqual(VALID_RARITIES.length, 5);
    assert.ok(VALID_RARITIES.includes('evolved'));
  });

  test('BUGDEX_SCHEMA has all required fields', () => {
    const required = BUGDEX_SCHEMA.required;
    assert.ok(required.includes('name'));
    assert.ok(required.includes('hp'));
    assert.ok(required.includes('moves'));
    assert.ok(required.includes('type'));
  });
});
