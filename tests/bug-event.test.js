import assert from 'node:assert';
import { test, suite } from './run.js';
import { createBugEvent, bugEventToMonster, resetFrequencies, SEVERITY } from '../dist/core/bug-event.js';

suite('Bug Event (core/bug-event.js)', () => {
  // Reset frequency tracking before tests
  resetFrequencies();

  test('SEVERITY constants are defined', () => {
    assert.strictEqual(SEVERITY.MINOR, 1);
    assert.strictEqual(SEVERITY.LOW, 2);
    assert.strictEqual(SEVERITY.MEDIUM, 3);
    assert.strictEqual(SEVERITY.HIGH, 4);
    assert.strictEqual(SEVERITY.CRITICAL, 5);
  });

  test('createBugEvent returns correct structure', () => {
    resetFrequencies();
    const event = createBugEvent('null-reference', 'Cannot read property x', '/app/index.js', 42);
    assert.strictEqual(event.type, 'null-reference');
    assert.strictEqual(event.message, 'Cannot read property x');
    assert.strictEqual(event.file, '/app/index.js');
    assert.strictEqual(event.line, 42);
    assert.ok(typeof event.id === 'string');
    assert.ok(event.id.length > 0);
  });

  test('createBugEvent auto-derives severity from type', () => {
    resetFrequencies();
    const nullRef = createBugEvent('null-reference', 'test');
    assert.strictEqual(nullRef.severity, SEVERITY.MEDIUM);

    const stackOverflow = createBugEvent('stack-overflow', 'test');
    assert.strictEqual(stackOverflow.severity, SEVERITY.HIGH);

    const deprecated = createBugEvent('deprecated', 'test');
    assert.strictEqual(deprecated.severity, SEVERITY.MINOR);

    const syntax = createBugEvent('syntax', 'test');
    assert.strictEqual(syntax.severity, SEVERITY.MEDIUM);
  });

  test('createBugEvent respects severity override', () => {
    resetFrequencies();
    const event = createBugEvent('null-reference', 'test', null, null, SEVERITY.CRITICAL);
    assert.strictEqual(event.severity, SEVERITY.CRITICAL);
  });

  test('createBugEvent defaults file and line to null', () => {
    resetFrequencies();
    const event = createBugEvent('syntax', 'unexpected token');
    assert.strictEqual(event.file, null);
    assert.strictEqual(event.line, null);
  });

  test('createBugEvent tracks frequency across repeated calls', () => {
    resetFrequencies();
    const e1 = createBugEvent('null-reference', 'same error', '/app/x.js', 10);
    assert.strictEqual(e1.frequency, 1);
    const e2 = createBugEvent('null-reference', 'same error', '/app/x.js', 10);
    assert.strictEqual(e2.frequency, 2);
    const e3 = createBugEvent('null-reference', 'same error', '/app/x.js', 10);
    assert.strictEqual(e3.frequency, 3);
  });

  test('resetFrequencies clears the counter', () => {
    createBugEvent('syntax', 'reset test');
    resetFrequencies();
    const event = createBugEvent('syntax', 'reset test');
    assert.strictEqual(event.frequency, 1);
  });

  test('createBugEvent defaults unknown type to LOW severity', () => {
    resetFrequencies();
    const event = createBugEvent('unknown-type', 'test');
    assert.strictEqual(event.severity, SEVERITY.LOW);
  });

  test('bugEventToMonster returns a monster match', () => {
    resetFrequencies();
    const monstersData = [
      { id: 1, name: 'NullPointer', type: 'backend', hp: 30, attack: 8, defense: 4, speed: 6, moves: ['segfault'] },
      { id: 10, name: 'FlakyTest', type: 'testing', hp: 28, attack: 6, defense: 5, speed: 7, moves: ['retry'] },
    ];
    const event = createBugEvent('null-reference', 'Cannot read property');
    const result = bugEventToMonster(event, monstersData);
    assert.ok(result.monster, 'should return a monster');
    assert.ok(typeof result.confidence === 'number');
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
  });

  test('bugEventToMonster applies HP bonus based on severity', () => {
    resetFrequencies();
    const monstersData = [
      { id: 1, name: 'TestMon', type: 'backend', hp: 30, attack: 8, defense: 4, speed: 6, moves: ['m1'] },
    ];
    // severity HIGH (4) => bonus = (4-1)*2 = 6
    const event = createBugEvent('stack-overflow', 'Maximum call stack size exceeded', null, null);
    const result = bugEventToMonster(event, monstersData);
    assert.strictEqual(result.monster.hp, 30 + 6);
  });

  test('bugEventToMonster falls back to FlakyTest for unknown errors', () => {
    resetFrequencies();
    const monstersData = [
      { id: 1, name: 'NullPointer', type: 'backend', hp: 30, attack: 8, defense: 4, speed: 6, moves: ['m1'] },
      { id: 10, name: 'FlakyTest', type: 'testing', hp: 28, attack: 6, defense: 5, speed: 7, moves: ['m2'] },
    ];
    const event = createBugEvent('completely-unknown-type', 'weird error');
    const result = bugEventToMonster(event, monstersData);
    assert.strictEqual(result.monster.name, 'FlakyTest');
  });

  test('bugEventToMonster uses first monster if no FlakyTest found', () => {
    resetFrequencies();
    const monstersData = [
      { id: 1, name: 'OnlyMon', type: 'backend', hp: 30, attack: 8, defense: 4, speed: 6, moves: ['m1'] },
    ];
    const event = createBugEvent('completely-unknown-type', 'weird error');
    const result = bugEventToMonster(event, monstersData);
    assert.strictEqual(result.monster.name, 'OnlyMon');
  });
});
