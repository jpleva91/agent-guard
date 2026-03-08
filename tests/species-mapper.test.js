import assert from 'node:assert';
import { test, suite } from './run.js';
import { bugEventToMonster, matchMonster, getAllMonsters } from '../domain/ingestion/species-mapper.js';

suite('Species Mapper (domain/ingestion/species-mapper.js)', () => {
  test('bugEventToMonster is a function', () => {
    assert.strictEqual(typeof bugEventToMonster, 'function');
  });

  test('matchMonster is a function', () => {
    assert.strictEqual(typeof matchMonster, 'function');
  });

  test('getAllMonsters is a function and returns monsters', () => {
    assert.strictEqual(typeof getAllMonsters, 'function');
    const monsters = getAllMonsters();
    assert.ok(Array.isArray(monsters));
    assert.ok(monsters.length > 0);
  });

  test('bugEventToMonster returns monster and confidence for null-reference', () => {
    const monsters = getAllMonsters();
    const bugEvent = {
      id: 'test',
      type: 'null-reference',
      message: "Cannot read properties of null (reading 'x')",
      file: null,
      line: null,
      severity: 3,
      frequency: 1,
    };
    const result = bugEventToMonster(bugEvent, monsters);
    assert.ok(result.monster, 'should return a monster');
    assert.ok(typeof result.confidence === 'number');
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
  });

  test('bugEventToMonster falls back for unknown type', () => {
    const monsters = getAllMonsters();
    const bugEvent = {
      id: 'test',
      type: 'totally-unknown',
      message: 'zzzzz',
      file: null,
      line: null,
      severity: 2,
      frequency: 1,
    };
    const result = bugEventToMonster(bugEvent, monsters);
    assert.ok(result.monster, 'should always return a monster');
  });
});
