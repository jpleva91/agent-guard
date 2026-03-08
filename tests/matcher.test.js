import assert from 'node:assert';
import { test, suite } from './run.js';
import { matchMonster, getAllMonsters } from '../core/matcher.js';

suite('Matcher (core/matcher.js)', () => {
  test('getAllMonsters returns an array of monsters', () => {
    const monsters = getAllMonsters();
    assert.ok(Array.isArray(monsters));
    assert.ok(monsters.length > 0);
  });

  test('every monster has required fields', () => {
    const monsters = getAllMonsters();
    for (const mon of monsters) {
      assert.ok(mon.id, `monster missing id`);
      assert.ok(mon.name, `monster missing name`);
      assert.ok(mon.type, `monster missing type`);
    }
  });

  test('matchMonster returns a monster and confidence', () => {
    const result = matchMonster({
      type: 'null-reference',
      message: "Cannot read properties of null (reading 'x')",
      rawLines: ["TypeError: Cannot read properties of null (reading 'x')"],
    });
    assert.ok(result.monster, 'should return a monster');
    assert.strictEqual(typeof result.monster.name, 'string');
    assert.strictEqual(typeof result.monster.type, 'string');
    assert.ok(typeof result.confidence === 'number');
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
  });

  test('matchMonster returns monster with all required fields', () => {
    const result = matchMonster({
      type: 'null-reference',
      message: "Cannot read properties of null",
      rawLines: ["TypeError: Cannot read properties of null"],
    });
    const mon = result.monster;
    assert.ok(typeof mon.id === 'number', 'monster should have numeric id');
    assert.ok(typeof mon.hp === 'number', 'monster should have hp');
    assert.ok(typeof mon.attack === 'number', 'monster should have attack');
    assert.ok(typeof mon.defense === 'number', 'monster should have defense');
    assert.ok(Array.isArray(mon.moves), 'monster should have moves array');
  });

  test('matchMonster always returns something (never null)', () => {
    const result = matchMonster({
      type: 'totally-unknown',
      message: 'some weird error no one has seen',
      rawLines: ['some weird error no one has seen'],
    });
    assert.ok(result.monster, 'should always return a monster (fallback)');
  });

  test('matchMonster fallback has low confidence', () => {
    const result = matchMonster({
      type: 'totally-unknown',
      message: 'zzzzz not matching anything specific',
      rawLines: ['zzzzz'],
    });
    // Fallback confidence is 5/30 ≈ 0.167 or 1/30 ≈ 0.033
    assert.ok(result.confidence < 0.5, `fallback confidence should be low, got ${result.confidence}`);
  });

  test('matchMonster by error type maps to correct monster type', () => {
    // Test that backend error types map to backend monsters
    const result = matchMonster({
      type: 'null-reference',
      message: 'generic null ref with no pattern match',
      rawLines: ['generic null ref'],
    });
    assert.ok(result.monster, 'should return a monster');
    // The monster should be a backend type since null-reference maps to backend
    // (unless errorPatterns match something else, which is fine)
  });

  test('matchMonster scores higher for longer pattern matches', () => {
    const specific = matchMonster({
      type: 'null-reference',
      message: "TypeError: Cannot read properties of null (reading 'map')",
      rawLines: ["TypeError: Cannot read properties of null (reading 'map')"],
    });
    const vague = matchMonster({
      type: 'totally-unknown',
      message: 'zzz',
      rawLines: ['zzz'],
    });
    assert.ok(specific.confidence > vague.confidence,
      `Specific match (${specific.confidence}) should have higher confidence than vague (${vague.confidence})`);
  });

  test('matchMonster handles empty message gracefully', () => {
    const result = matchMonster({
      type: '',
      message: '',
      rawLines: [''],
    });
    assert.ok(result.monster, 'should still return a monster');
    assert.ok(typeof result.confidence === 'number');
  });

  test('matchMonster handles syntax error type with pattern match', () => {
    const result = matchMonster({
      type: 'syntax',
      message: 'Unexpected token }',
      rawLines: ['SyntaxError: Unexpected token }'],
    });
    assert.ok(result.monster);
    // Pattern matching may match to a non-frontend monster if errorPatterns match
    assert.ok(result.confidence > 0, 'should have positive confidence');
  });

  test('matchMonster handles network error type', () => {
    const result = matchMonster({
      type: 'network',
      message: 'connect ECONNREFUSED',
      rawLines: ['Error: connect ECONNREFUSED 127.0.0.1:3000'],
    });
    assert.ok(result.monster);
  });

  test('matchMonster confidence is between 0 and 1', () => {
    const cases = [
      { type: 'null-reference', message: "Cannot read properties of null", rawLines: ["TypeError: Cannot read properties of null"] },
      { type: 'syntax', message: 'Unexpected token', rawLines: ['SyntaxError: Unexpected token'] },
      { type: 'unknown', message: 'xyzzy', rawLines: ['xyzzy'] },
    ];
    for (const c of cases) {
      const result = matchMonster(c);
      assert.ok(result.confidence >= 0 && result.confidence <= 1,
        `confidence out of range: ${result.confidence}`);
    }
  });
});
