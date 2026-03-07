import assert from 'node:assert';
import { test, suite } from './run.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ecosystem/bugdex.js uses module.exports (CommonJS) but package.json has "type": "module"
// so we can't import it directly. Instead, we eval it in a CJS-compatible context.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const bugdexPath = join(__dirname, '..', 'ecosystem', 'bugdex.js');
const bugdexSrc = readFileSync(bugdexPath, 'utf8');

const mod = { exports: {} };
const fn = new Function('module', 'exports', bugdexSrc);
fn(mod, mod.exports);
const { identify, getAllMonsters, BUGDEX } = mod.exports;

suite('BugDex identification (ecosystem/bugdex.js)', () => {
  test('BUGDEX is a non-empty array', () => {
    assert.ok(Array.isArray(BUGDEX));
    assert.ok(BUGDEX.length > 0);
  });

  test('every BUGDEX entry has required fields', () => {
    for (const mon of BUGDEX) {
      assert.ok(mon.id !== undefined, `entry missing id`);
      assert.ok(mon.name, `entry missing name`);
      assert.ok(mon.errorType, `entry ${mon.name} missing errorType`);
      assert.ok(Array.isArray(mon.patterns), `entry ${mon.name} missing patterns`);
      assert.ok(mon.type, `entry ${mon.name} missing type`);
      assert.ok(mon.rarity, `entry ${mon.name} missing rarity`);
      assert.ok(mon.hp > 0, `entry ${mon.name} missing hp`);
      assert.ok(Array.isArray(mon.ascii), `entry ${mon.name} missing ascii`);
    }
  });

  test('identify returns NullPointerMon for TypeError null reference', () => {
    const result = identify("TypeError: Cannot read properties of null (reading 'x')");
    assert.strictEqual(result.name, 'NullPointerMon');
  });

  test('identify returns ParseDragon for SyntaxError', () => {
    const result = identify('SyntaxError: Unexpected token }');
    assert.strictEqual(result.name, 'ParseDragon');
  });

  test('identify returns GhostVarMon for ReferenceError', () => {
    const result = identify('ReferenceError: foo is not defined');
    assert.strictEqual(result.name, 'GhostVarMon');
  });

  test('identify returns StackOverflow for maximum call stack error', () => {
    const result = identify('RangeError: Maximum call stack size exceeded');
    assert.strictEqual(result.name, 'StackOverflow');
  });

  test('identify returns UnknownBug for completely unrecognized errors', () => {
    const result = identify('xyzzy totally made up error that matches nothing');
    assert.strictEqual(result.name, 'UnknownBug');
  });

  test('identify returns a copy, not a reference', () => {
    const r1 = identify("TypeError: null");
    const r2 = identify("TypeError: null");
    assert.notStrictEqual(r1, r2);
  });

  test('identify gives higher priority to errorType in text', () => {
    const result = identify('SyntaxError: unexpected token in JSON');
    assert.ok(result.name === 'ParseDragon' || result.name === 'JSONGoblin',
      `Expected ParseDragon or JSONGoblin, got ${result.name}`);
  });

  test('getAllMonsters returns array with same length as BUGDEX', () => {
    const all = getAllMonsters();
    assert.strictEqual(all.length, BUGDEX.length);
  });

  test('getAllMonsters returns copies of entries', () => {
    const all = getAllMonsters();
    all[0].name = 'MUTATED';
    const again = getAllMonsters();
    assert.notStrictEqual(again[0].name, 'MUTATED');
  });
});
