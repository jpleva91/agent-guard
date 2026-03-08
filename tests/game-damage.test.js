import assert from 'node:assert';
import { test, suite } from './run.js';
import { calcDamage, isHealMove, calcHealing } from '../dist/game/battle/damage.js';

suite('Game damage module (game/battle/damage.js)', () => {
  const attacker = { attack: 10, type: 'backend' };
  const defender = { defense: 6, type: 'frontend' };
  const move = { power: 12, type: 'backend' };

  test('calcDamage returns damage, effectiveness, and critical', () => {
    const result = calcDamage(attacker, move, defender, {});
    assert.ok(typeof result.damage === 'number');
    assert.ok(typeof result.effectiveness === 'number');
    assert.ok(typeof result.critical === 'boolean');
  });

  test('calcDamage always returns at least 1 damage', () => {
    const weakAttacker = { attack: 1, type: 'backend' };
    const strongDefender = { defense: 20, type: 'frontend' };
    const weakMove = { power: 1, type: 'backend' };
    // Even with weak attacker, should be at least 1
    for (let i = 0; i < 50; i++) {
      const result = calcDamage(weakAttacker, weakMove, strongDefender, {});
      assert.ok(result.damage >= 1, `Damage was ${result.damage}`);
    }
  });

  test('calcDamage applies type effectiveness', () => {
    const typeChart = { backend: { frontend: 1.5 } };
    const damages = [];
    for (let i = 0; i < 100; i++) {
      damages.push(calcDamage(attacker, move, defender, typeChart));
    }
    // All should have 1.5 effectiveness
    assert.ok(damages.every(d => d.effectiveness === 1.5));
  });

  test('calcDamage defaults to 1.0 effectiveness for unknown types', () => {
    const result = calcDamage(attacker, move, defender, {});
    assert.strictEqual(result.effectiveness, 1.0);
  });

  test('calcDamage handles null typeChart gracefully', () => {
    const result = calcDamage(attacker, move, defender, null);
    assert.strictEqual(result.effectiveness, 1.0);
  });

  test('calcDamage critical hits produce higher damage on average', () => {
    // Run many trials, critical hits should produce higher damage
    let critDamages = 0;
    let critCount = 0;
    let normalDamages = 0;
    let normalCount = 0;
    for (let i = 0; i < 5000; i++) {
      const result = calcDamage(attacker, move, defender, {});
      if (result.critical) {
        critDamages += result.damage;
        critCount++;
      } else {
        normalDamages += result.damage;
        normalCount++;
      }
    }
    if (critCount > 0 && normalCount > 0) {
      const avgCrit = critDamages / critCount;
      const avgNormal = normalDamages / normalCount;
      assert.ok(avgCrit > avgNormal,
        `Crit avg (${avgCrit.toFixed(1)}) should exceed normal avg (${avgNormal.toFixed(1)})`);
    }
  });

  test('critical hit rate is approximately 1/16', () => {
    let crits = 0;
    const trials = 5000;
    for (let i = 0; i < trials; i++) {
      if (calcDamage(attacker, move, defender, {}).critical) crits++;
    }
    const rate = crits / trials;
    // 1/16 = 6.25%, allow ±4%
    assert.ok(rate > 0.02, `Crit rate too low: ${(rate * 100).toFixed(1)}%`);
    assert.ok(rate < 0.11, `Crit rate too high: ${(rate * 100).toFixed(1)}%`);
  });

  test('isHealMove returns true for heal category', () => {
    assert.strictEqual(isHealMove({ category: 'heal' }), true);
  });

  test('isHealMove returns false for non-heal moves', () => {
    assert.strictEqual(isHealMove({ category: 'attack' }), false);
    assert.strictEqual(isHealMove({}), false);
    assert.strictEqual(isHealMove({ power: 10 }), false);
  });

  test('calcHealing caps at missing HP', () => {
    const healMove = { power: 20 };
    const bugmon = { hp: 30, currentHP: 25 };
    const result = calcHealing(healMove, bugmon);
    assert.strictEqual(result.healing, 5); // Only 5 HP missing
  });

  test('calcHealing returns full power when enough HP missing', () => {
    const healMove = { power: 10 };
    const bugmon = { hp: 30, currentHP: 5 };
    const result = calcHealing(healMove, bugmon);
    assert.strictEqual(result.healing, 10);
  });

  test('calcHealing returns 0 at full HP', () => {
    const healMove = { power: 20 };
    const bugmon = { hp: 30, currentHP: 30 };
    const result = calcHealing(healMove, bugmon);
    assert.strictEqual(result.healing, 0);
  });
});
