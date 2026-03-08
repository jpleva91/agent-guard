import assert from 'node:assert';
import { test, suite } from './run.js';
import {
  shouldEncounter, pickWeightedRandom, checkEncounter, scaleEncounter, RARITY_WEIGHTS
} from '../dist/domain/encounters.js';

suite('Domain Encounters (domain/encounters.js)', () => {
  const monsters = [
    { id: 1, name: 'Common', rarity: 'common', hp: 20 },
    { id: 2, name: 'Uncommon', rarity: 'uncommon', hp: 25 },
    { id: 3, name: 'Legendary', rarity: 'legendary', hp: 40 },
  ];

  // --- RARITY_WEIGHTS ---
  test('RARITY_WEIGHTS has expected values', () => {
    assert.strictEqual(RARITY_WEIGHTS.common, 10);
    assert.strictEqual(RARITY_WEIGHTS.uncommon, 5);
    assert.strictEqual(RARITY_WEIGHTS.legendary, 1);
  });

  // --- shouldEncounter ---
  test('shouldEncounter only triggers on tile 2 (grass)', () => {
    assert.strictEqual(shouldEncounter(0, () => 0), false);  // ground
    assert.strictEqual(shouldEncounter(1, () => 0), false);  // wall
    assert.strictEqual(shouldEncounter(2, () => 0), true);   // grass with low roll
  });

  test('shouldEncounter triggers at 10% rate', () => {
    assert.strictEqual(shouldEncounter(2, () => 0.10), true);   // exactly 10%
    assert.strictEqual(shouldEncounter(2, () => 0.11), false);  // just over 10%
    assert.strictEqual(shouldEncounter(2, () => 0.0), true);    // 0%
  });

  // --- pickWeightedRandom ---
  test('pickWeightedRandom returns a monster', () => {
    const result = pickWeightedRandom(monsters, () => 0.5);
    assert.ok(result);
    assert.ok(result.name);
  });

  test('pickWeightedRandom with single monster always returns it', () => {
    const single = [monsters[0]];
    assert.strictEqual(pickWeightedRandom(single, () => 0).name, 'Common');
    assert.strictEqual(pickWeightedRandom(single, () => 0.99).name, 'Common');
  });

  test('pickWeightedRandom with lowest roll returns first common monster', () => {
    const result = pickWeightedRandom(monsters, () => 0);
    assert.strictEqual(result.name, 'Common');
  });

  test('pickWeightedRandom favors common monsters', () => {
    // Total weight: 10 + 5 + 1 = 16
    // Common occupies 0-10/16 = 0-0.625 of roll space
    // With roll at 0.3 (i.e., 0.3 * 16 = 4.8), still within common range
    const result = pickWeightedRandom(monsters, () => 0.3);
    assert.strictEqual(result.name, 'Common');
  });

  test('pickWeightedRandom handles unknown rarity (defaults to common weight)', () => {
    const unknownRarity = [{ id: 99, name: 'Mystery', rarity: 'mythic', hp: 50 }];
    const result = pickWeightedRandom(unknownRarity, () => 0.5);
    assert.strictEqual(result.name, 'Mystery');
  });

  // --- checkEncounter ---
  test('checkEncounter returns null on non-grass tiles', () => {
    assert.strictEqual(checkEncounter(0, monsters, () => 0), null);
    assert.strictEqual(checkEncounter(1, monsters, () => 0), null);
  });

  test('checkEncounter returns monster with currentHP on grass', () => {
    const result = checkEncounter(2, monsters, () => 0);
    assert.ok(result, 'should return encounter on grass with low roll');
    assert.strictEqual(result.currentHP, result.hp);
    assert.ok(result.name);
  });

  test('checkEncounter returns null when random roll is too high', () => {
    const result = checkEncounter(2, monsters, () => 0.5);
    assert.strictEqual(result, null);
  });

  test('checkEncounter applies scaling when context is provided', () => {
    const result = checkEncounter(2, monsters, () => 0, { playerLevel: 3 });
    assert.ok(result);
    // Level 3 = 1 + (3-1)*0.1 = 1.2x scale. Common hp=20 → floor(20*1.2) = 24
    assert.strictEqual(result.hp, 24);
    assert.strictEqual(result.currentHP, 24);
  });

  test('checkEncounter returns unscaled when no context', () => {
    const result = checkEncounter(2, monsters, () => 0);
    assert.ok(result);
    assert.strictEqual(result.hp, 20);
    assert.strictEqual(result.currentHP, 20);
  });

  // --- scaleEncounter ---
  test('scaleEncounter returns unmodified stats at level 1 with 0 encounters', () => {
    const mon = { id: 1, name: 'Test', hp: 30, currentHP: 30 };
    const scaled = scaleEncounter(mon, { playerLevel: 1, encounterCount: 0 });
    assert.strictEqual(scaled.hp, 30);
    assert.strictEqual(scaled.currentHP, 30);
  });

  test('scaleEncounter returns unmodified stats with empty context', () => {
    const mon = { id: 1, name: 'Test', hp: 30, currentHP: 30 };
    const scaled = scaleEncounter(mon);
    assert.strictEqual(scaled.hp, 30);
    assert.strictEqual(scaled.currentHP, 30);
  });

  test('scaleEncounter increases HP at higher player levels', () => {
    const mon = { id: 1, name: 'Test', hp: 20, currentHP: 20 };
    // Level 5 = 1 + (5-1)*0.1 = 1.4x → floor(20*1.4) = 28
    const scaled = scaleEncounter(mon, { playerLevel: 5 });
    assert.strictEqual(scaled.hp, 28);
    assert.strictEqual(scaled.currentHP, 28);
  });

  test('scaleEncounter increases HP with encounter count', () => {
    const mon = { id: 1, name: 'Test', hp: 100, currentHP: 100 };
    // 10 encounters = floor(10/5)*0.02 = 0.04 → 1.04x → floor(100*1.04) = 104
    const scaled = scaleEncounter(mon, { encounterCount: 10 });
    assert.strictEqual(scaled.hp, 104);
    assert.strictEqual(scaled.currentHP, 104);
  });

  test('scaleEncounter caps session scaling at +20%', () => {
    const mon = { id: 1, name: 'Test', hp: 100, currentHP: 100 };
    // 200 encounters = floor(200/5)*0.02 = 0.80 → capped at 0.20 → 1.2x → 120
    const scaled = scaleEncounter(mon, { encounterCount: 200 });
    assert.strictEqual(scaled.hp, 120);
    assert.strictEqual(scaled.currentHP, 120);
  });

  test('scaleEncounter does not mutate input', () => {
    const mon = { id: 1, name: 'Test', hp: 20, currentHP: 20 };
    scaleEncounter(mon, { playerLevel: 5 });
    assert.strictEqual(mon.hp, 20);
    assert.strictEqual(mon.currentHP, 20);
  });

  test('scaleEncounter uses hp as fallback when currentHP missing', () => {
    const mon = { id: 1, name: 'Test', hp: 20 };
    const scaled = scaleEncounter(mon, { playerLevel: 3 });
    // 1.2x → floor(20*1.2) = 24
    assert.strictEqual(scaled.hp, 24);
    assert.strictEqual(scaled.currentHP, 24);
  });
});
