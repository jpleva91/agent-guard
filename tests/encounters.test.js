import assert from 'node:assert';
import { test, suite } from './run.js';

// encounters.js imports sound.js which needs AudioContext
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener() {} };
}
if (typeof globalThis.AudioContext === 'undefined') {
  globalThis.AudioContext = class { constructor() { this.state = 'running'; } };
}

const { setMonstersData, checkEncounter } = await import('../game/world/encounters.js');

const MOCK_MONSTERS = [
  { id: 1, name: 'CommonBug', type: 'backend', hp: 30, attack: 8, defense: 4, speed: 6, moves: ['m1'], rarity: 'common' },
  { id: 2, name: 'UncommonBug', type: 'frontend', hp: 35, attack: 10, defense: 5, speed: 7, moves: ['m2'], rarity: 'uncommon' },
  { id: 3, name: 'RareBug', type: 'devops', hp: 40, attack: 12, defense: 6, speed: 8, moves: ['m3'], rarity: 'rare' },
  { id: 4, name: 'LegendaryBug', type: 'security', hp: 50, attack: 15, defense: 8, speed: 10, moves: ['m4'], rarity: 'legendary' },
];

suite('Wild encounters (game/world/encounters.js)', () => {
  test('checkEncounter returns null for non-grass tiles', () => {
    setMonstersData(MOCK_MONSTERS);
    // Tile 0 = ground, tile 1 = wall
    for (let i = 0; i < 50; i++) {
      assert.strictEqual(checkEncounter(0), null);
      assert.strictEqual(checkEncounter(1), null);
    }
  });

  test('checkEncounter can trigger on grass tile (tile 2)', () => {
    setMonstersData(MOCK_MONSTERS);
    let triggered = false;
    // Run enough times that 10% chance should hit at least once
    for (let i = 0; i < 200; i++) {
      const result = checkEncounter(2);
      if (result !== null) {
        triggered = true;
        break;
      }
    }
    assert.ok(triggered, 'Should trigger at least one encounter in 200 grass tile steps');
  });

  test('encountered monster has currentHP set to hp', () => {
    setMonstersData(MOCK_MONSTERS);
    let found = null;
    for (let i = 0; i < 500; i++) {
      found = checkEncounter(2);
      if (found) break;
    }
    assert.ok(found, 'Should find an encounter');
    assert.strictEqual(found.currentHP, found.hp);
  });

  test('encountered monster is from the monster data', () => {
    setMonstersData(MOCK_MONSTERS);
    let found = null;
    for (let i = 0; i < 500; i++) {
      found = checkEncounter(2);
      if (found) break;
    }
    assert.ok(found);
    const names = MOCK_MONSTERS.map(m => m.name);
    assert.ok(names.includes(found.name), `Encountered unknown monster: ${found.name}`);
  });

  test('encounter rate is approximately 10%', () => {
    setMonstersData(MOCK_MONSTERS);
    let encounters = 0;
    const trials = 5000;
    for (let i = 0; i < trials; i++) {
      if (checkEncounter(2) !== null) encounters++;
    }
    const rate = encounters / trials;
    // Allow ±4% tolerance for randomness
    assert.ok(rate > 0.06, `Encounter rate too low: ${(rate * 100).toFixed(1)}%`);
    assert.ok(rate < 0.14, `Encounter rate too high: ${(rate * 100).toFixed(1)}%`);
  });

  test('common monsters appear more frequently than legendary', () => {
    setMonstersData(MOCK_MONSTERS);
    const counts = {};
    MOCK_MONSTERS.forEach(m => { counts[m.name] = 0; });
    for (let i = 0; i < 10000; i++) {
      const result = checkEncounter(2);
      if (result) counts[result.name]++;
    }
    assert.ok(counts['CommonBug'] > counts['LegendaryBug'],
      `Common (${counts['CommonBug']}) should appear more than Legendary (${counts['LegendaryBug']})`);
    assert.ok(counts['CommonBug'] > counts['RareBug'],
      `Common (${counts['CommonBug']}) should appear more than Rare (${counts['RareBug']})`);
  });

  test('checkEncounter returns null for negative tile values', () => {
    setMonstersData(MOCK_MONSTERS);
    assert.strictEqual(checkEncounter(-1), null);
    assert.strictEqual(checkEncounter(-100), null);
  });

  test('checkEncounter returns null for high tile values (not grass)', () => {
    setMonstersData(MOCK_MONSTERS);
    for (let i = 0; i < 50; i++) {
      assert.strictEqual(checkEncounter(3), null);
      assert.strictEqual(checkEncounter(99), null);
    }
  });

  test('encountered monster is a copy not a reference to source data', () => {
    setMonstersData(MOCK_MONSTERS);
    let found = null;
    for (let i = 0; i < 500; i++) {
      found = checkEncounter(2);
      if (found) break;
    }
    assert.ok(found);
    found.name = 'MUTATED';
    // Original data should not be affected
    assert.notStrictEqual(MOCK_MONSTERS[0].name, 'MUTATED');
  });

  test('all monster rarities can appear in encounters', () => {
    setMonstersData(MOCK_MONSTERS);
    const seen = new Set();
    for (let i = 0; i < 50000; i++) {
      const result = checkEncounter(2);
      if (result) seen.add(result.rarity);
      if (seen.size === 4) break;
    }
    assert.ok(seen.has('common'), 'common should appear');
    assert.ok(seen.has('uncommon'), 'uncommon should appear');
    assert.ok(seen.has('rare'), 'rare should appear');
    assert.ok(seen.has('legendary'), 'legendary should appear');
  });
});
