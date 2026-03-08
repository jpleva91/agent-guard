import assert from 'node:assert';
import { test, suite } from './run.js';

const { identify, getAllMonsters, BUGDEX } = await import('../dist/ecosystem/bugdex.js');

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

  // --- Rarity distribution ---

  test('BUGDEX contains all four rarities', () => {
    const rarities = new Set(BUGDEX.map(m => m.rarity));
    assert.ok(rarities.has('common'), 'missing common rarity');
    assert.ok(rarities.has('uncommon'), 'missing uncommon rarity');
    assert.ok(rarities.has('rare'), 'missing rare rarity');
    assert.ok(rarities.has('legendary'), 'missing legendary rarity');
  });

  test('common monsters outnumber legendary', () => {
    const common = BUGDEX.filter(m => m.rarity === 'common');
    const legendary = BUGDEX.filter(m => m.rarity === 'legendary');
    assert.ok(common.length > legendary.length,
      `common (${common.length}) should outnumber legendary (${legendary.length})`);
  });

  // --- Pattern matching scoring ---

  test('identify scores multi-pattern matches higher', () => {
    // AsyncPhantom has patterns: unhandled.*promise, rejection, await, async, .then
    const result = identify('UnhandledPromiseRejection: unhandled promise rejection from async await');
    assert.strictEqual(result.name, 'AsyncPhantom');
  });

  test('identify: JSON parse error matches JSONGoblin (json-specific patterns)', () => {
    const result = identify('SyntaxError: Unexpected token in JSON at position 0 from JSON.parse');
    assert.strictEqual(result.name, 'JSONGoblin');
  });

  test('identify: module not found matches ImportWraith', () => {
    const result = identify("Error: Cannot find module 'express'");
    assert.strictEqual(result.name, 'ImportWraith');
  });

  test('identify: memory leak error matches LeakHydra', () => {
    const result = identify('Error: memory leak detected in buffer pool, EMFILE too many open files');
    assert.strictEqual(result.name, 'LeakHydra');
  });

  test('identify: segfault matches Heisenbug', () => {
    const result = identify('Segmentation fault (core dump)');
    assert.strictEqual(result.name, 'Heisenbug');
  });

  test('identify: permission denied matches ForkBomb', () => {
    const result = identify('Error: spawn EACCES - permission denied for child process');
    assert.strictEqual(result.name, 'ForkBomb');
  });

  test('identify: index out of range matches IndexOutOfBounds', () => {
    const result = identify('RangeError: Invalid array index out of range');
    assert.strictEqual(result.name, 'IndexOutOfBounds');
  });

  test('identify: infinite loop / timeout matches InfiniteLoop', () => {
    const result = identify('Error: Script timed out after 30000ms (infinite loop detected)');
    assert.strictEqual(result.name, 'InfiniteLoop');
  });

  // --- Unique IDs ---

  test('all BUGDEX entries have unique IDs', () => {
    const ids = BUGDEX.map(m => m.id);
    const unique = new Set(ids);
    assert.strictEqual(ids.length, unique.size, 'BUGDEX IDs should be unique');
  });

  test('all BUGDEX entries have unique names', () => {
    const names = BUGDEX.map(m => m.name);
    const unique = new Set(names);
    assert.strictEqual(names.length, unique.size, 'BUGDEX names should be unique');
  });

  // --- HP and XP scaling ---

  test('legendary monsters have higher HP than common', () => {
    const commonHP = BUGDEX.filter(m => m.rarity === 'common').map(m => m.hp);
    const legendaryHP = BUGDEX.filter(m => m.rarity === 'legendary').map(m => m.hp);
    const avgCommon = commonHP.reduce((a, b) => a + b, 0) / commonHP.length;
    const avgLegendary = legendaryHP.reduce((a, b) => a + b, 0) / legendaryHP.length;
    assert.ok(avgLegendary > avgCommon,
      `legendary avg HP (${avgLegendary}) should be > common avg HP (${avgCommon})`);
  });

  test('legendary monsters have higher XP reward', () => {
    const commonXP = BUGDEX.filter(m => m.rarity === 'common').map(m => m.xp);
    const legendaryXP = BUGDEX.filter(m => m.rarity === 'legendary').map(m => m.xp);
    const avgCommon = commonXP.reduce((a, b) => a + b, 0) / commonXP.length;
    const avgLegendary = legendaryXP.reduce((a, b) => a + b, 0) / legendaryXP.length;
    assert.ok(avgLegendary > avgCommon,
      `legendary avg XP (${avgLegendary}) should be > common avg XP (${avgCommon})`);
  });

  // --- ASCII art validation ---

  test('all BUGDEX entries have 8-line ASCII art', () => {
    for (const mon of BUGDEX) {
      assert.strictEqual(mon.ascii.length, 8,
        `${mon.name} should have 8 lines of ASCII art, got ${mon.ascii.length}`);
    }
  });

  // --- UnknownBug fallback ---

  test('UnknownBug fallback has ID 0', () => {
    const result = identify('totally unknown gibberish');
    assert.strictEqual(result.id, 0);
  });

  test('UnknownBug has valid structure', () => {
    const result = identify('totally unknown gibberish');
    assert.ok(result.name);
    assert.ok(result.type);
    assert.ok(result.rarity);
    assert.ok(result.hp > 0);
    assert.ok(Array.isArray(result.ascii));
  });
});
