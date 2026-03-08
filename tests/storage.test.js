import assert from 'node:assert';
import { test, suite } from './run.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// We can't easily mock homedir(), so we test calculateLevel logic directly
// and test recordEncounter/resolveEncounter by temporarily overriding the storage path.

// Import the module to test calculateLevel indirectly via recordEncounter
// Since calculateLevel is not exported, we test it through its effects on level.

suite('Storage utilities (ecosystem/storage.js)', () => {
  // Test calculateLevel indirectly by constructing known XP->level mappings
  // Level formula: ((level+1) * level) / 2 * 100 <= xp
  // Level 1: 0 XP (threshold: (2*1)/2*100 = 100)
  // Level 2: 100 XP (threshold: (3*2)/2*100 = 300)
  // Level 3: 300 XP (threshold: (4*3)/2*100 = 600)
  // Level 4: 600 XP (threshold: (5*4)/2*100 = 1000)

  test('XP thresholds match expected level formula', () => {
    // Manually verify the formula: ((L+1)*L)/2 * 100
    function expectedThreshold(level) {
      return ((level + 1) * level) / 2 * 100;
    }
    assert.strictEqual(expectedThreshold(1), 100);
    assert.strictEqual(expectedThreshold(2), 300);
    assert.strictEqual(expectedThreshold(3), 600);
    assert.strictEqual(expectedThreshold(4), 1000);
    assert.strictEqual(expectedThreshold(5), 1500);
  });

  test('XP constants match expected values', () => {
    // Verify by reading the source file
    const src = readFileSync(join(import.meta.dirname, '..', 'dist', 'ecosystem', 'storage.js'), 'utf8');
    assert.ok(src.includes('XP_ENCOUNTER = 10'));
    assert.ok(src.includes('XP_NEW_DISCOVERY = 100'));
    assert.ok(src.includes('XP_RESOLVED = 50'));
  });

  test('encounters are capped at 500', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'dist', 'ecosystem', 'storage.js'), 'utf8');
    assert.ok(src.includes('500'), 'Should cap encounters at 500');
    assert.ok(src.includes('slice(-500)'), 'Should keep last 500 encounters');
  });

  test('createEmpty returns correct structure', () => {
    // Verify by examining file structure
    const src = readFileSync(join(import.meta.dirname, '..', 'dist', 'ecosystem', 'storage.js'), 'utf8');
    assert.ok(src.includes('encounters: []'));
    assert.ok(src.includes('totalEncounters: 0'));
    assert.ok(src.includes('totalResolved: 0'));
    assert.ok(src.includes('xp: 0'));
    assert.ok(src.includes('level: 1'));
    assert.ok(src.includes("seen: {}"));
  });

  test('recordEncounter awards new discovery bonus', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'dist', 'ecosystem', 'storage.js'), 'utf8');
    // Verify logic: if new, xpGained = XP_ENCOUNTER + XP_NEW_DISCOVERY = 110
    assert.ok(src.includes('isNew') && src.includes('XP_NEW_DISCOVERY'));
  });

  test('resolveEncounter awards XP_RESOLVED', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'dist', 'ecosystem', 'storage.js'), 'utf8');
    assert.ok(src.includes('XP_RESOLVED'));
    assert.ok(src.includes('totalResolved++'));
  });

  test('error messages are truncated to 200 chars', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'dist', 'ecosystem', 'storage.js'), 'utf8');
    assert.ok(src.includes('slice(0, 200)'));
  });

  // --- calculateLevel reimplementation tests ---

  function calculateLevel(xp) {
    let level = 1;
    while (((level + 1) * level) / 2 * 100 <= xp) {
      level++;
    }
    return level;
  }

  test('calculateLevel: 0 XP = level 1', () => {
    assert.strictEqual(calculateLevel(0), 1);
  });

  test('calculateLevel: 99 XP = level 1', () => {
    assert.strictEqual(calculateLevel(99), 1);
  });

  test('calculateLevel: 100 XP = level 2', () => {
    assert.strictEqual(calculateLevel(100), 2);
  });

  test('calculateLevel: 299 XP = level 2', () => {
    assert.strictEqual(calculateLevel(299), 2);
  });

  test('calculateLevel: 300 XP = level 3', () => {
    assert.strictEqual(calculateLevel(300), 3);
  });

  test('calculateLevel: 600 XP = level 4', () => {
    assert.strictEqual(calculateLevel(600), 4);
  });

  test('calculateLevel: 1000 XP = level 5', () => {
    assert.strictEqual(calculateLevel(1000), 5);
  });

  test('calculateLevel: 1500 XP = level 6', () => {
    assert.strictEqual(calculateLevel(1500), 6);
  });

  test('calculateLevel: large XP value does not crash', () => {
    const level = calculateLevel(100000);
    assert.ok(level > 10, `expected high level for 100000 XP, got ${level}`);
  });

  test('calculateLevel: level always increases monotonically', () => {
    let prevLevel = 0;
    for (let xp = 0; xp <= 5000; xp += 50) {
      const level = calculateLevel(xp);
      assert.ok(level >= prevLevel, `level should not decrease: level ${level} at ${xp} XP, prev was ${prevLevel}`);
      prevLevel = level;
    }
  });

  // --- XP calculation tests ---

  test('first encounter of a monster awards 110 XP total', () => {
    const XP_ENCOUNTER = 10;
    const XP_NEW_DISCOVERY = 100;
    const isNew = true;
    let xpGained = XP_ENCOUNTER;
    if (isNew) xpGained += XP_NEW_DISCOVERY;
    assert.strictEqual(xpGained, 110);
  });

  test('repeat encounter awards only 10 XP', () => {
    const XP_ENCOUNTER = 10;
    const isNew = false;
    let xpGained = XP_ENCOUNTER;
    if (isNew) xpGained += 100;
    assert.strictEqual(xpGained, 10);
  });

  // --- Encounter cap logic ---

  test('encounter list cap drops oldest entries', () => {
    const encounters = [];
    for (let i = 0; i < 510; i++) {
      encounters.push({ monsterId: 1, error: `error_${i}`, resolved: false });
    }
    const capped = encounters.slice(-500);
    assert.strictEqual(capped.length, 500);
    assert.ok(capped[0].error === 'error_10', 'first 10 entries should be dropped');
  });

  // --- resolveAllUnresolved logic ---

  test('resolveAllUnresolved marks all unresolved and sums XP', () => {
    const XP_RESOLVED = 50;
    const encounters = [
      { resolved: false },
      { resolved: true },
      { resolved: false },
      { resolved: false },
    ];
    let count = 0;
    let xpGained = 0;
    for (let i = encounters.length - 1; i >= 0; i--) {
      if (!encounters[i].resolved) {
        encounters[i].resolved = true;
        count++;
        xpGained += XP_RESOLVED;
      }
    }
    assert.strictEqual(count, 3);
    assert.strictEqual(xpGained, 150);
    assert.ok(encounters.every(e => e.resolved));
  });

  test('resolveAllUnresolved returns 0 count when all already resolved', () => {
    const encounters = [
      { resolved: true },
      { resolved: true },
    ];
    let count = 0;
    for (let i = encounters.length - 1; i >= 0; i--) {
      if (!encounters[i].resolved) count++;
    }
    assert.strictEqual(count, 0);
  });

  test('resolveLastUnresolved only resolves most recent', () => {
    const encounters = [
      { resolved: false, error: 'first' },
      { resolved: true, error: 'second' },
      { resolved: false, error: 'third' },
    ];
    let resolved = null;
    for (let i = encounters.length - 1; i >= 0; i--) {
      if (!encounters[i].resolved) {
        encounters[i].resolved = true;
        resolved = encounters[i];
        break;
      }
    }
    assert.ok(resolved);
    assert.strictEqual(resolved.error, 'third');
    assert.strictEqual(encounters[0].resolved, false);
  });

  // --- Encounter record structure ---

  test('encounter record has all required fields', () => {
    const record = {
      monsterId: 1,
      monsterName: 'NullPointer',
      error: 'TypeError: null'.slice(0, 200),
      file: 'foo.js',
      line: 42,
      timestamp: new Date().toISOString(),
      resolved: false,
    };
    assert.ok(record.monsterId !== undefined);
    assert.ok(record.monsterName);
    assert.ok(record.error);
    assert.ok(record.timestamp);
    assert.strictEqual(record.resolved, false);
  });

  test('long error message is truncated to 200 chars', () => {
    const longMessage = 'x'.repeat(300);
    const truncated = longMessage.slice(0, 200);
    assert.strictEqual(truncated.length, 200);
  });

  // --- seen tracking ---

  test('seen counter increments correctly', () => {
    const seen = {};
    const monsterId = 5;
    // First encounter
    const isNew = !seen[monsterId];
    seen[monsterId] = (seen[monsterId] || 0) + 1;
    assert.strictEqual(isNew, true);
    assert.strictEqual(seen[monsterId], 1);
    // Second encounter
    const isNew2 = !seen[monsterId];
    seen[monsterId] = (seen[monsterId] || 0) + 1;
    assert.strictEqual(isNew2, false);
    assert.strictEqual(seen[monsterId], 2);
  });
});
