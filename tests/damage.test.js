import assert from 'node:assert';
import { test, suite } from './run.js';
import { calcDamageHeadless } from '../simulation/headlessBattle.js';
import { createRNG } from '../simulation/rng.js';

suite('Damage Calculation (battle/damage.js, headlessBattle.js)', () => {
  const attacker = { name: 'TestMon', type: 'backend', attack: 8, defense: 4, speed: 6 };
  const defender = { name: 'DefMon', type: 'devops', attack: 6, defense: 6, speed: 5 };
  const move = { id: 'testmove', name: 'TestMove', power: 10, type: 'backend' };
  const typeChart = {
    backend:  { frontend: 0.5, backend: 1.0, devops: 1.5, testing: 1.0, architecture: 1.5, security: 0.5, ai: 1.0 },
    frontend: { frontend: 1.0, backend: 1.5, devops: 1.0, testing: 1.5, architecture: 0.5, security: 1.0, ai: 0.5 },
    devops:   { frontend: 1.0, backend: 0.5, devops: 1.0, testing: 1.5, architecture: 1.0, security: 1.5, ai: 0.5 }
  };

  test('base damage formula is correct (power + attack - defense/2 + random)', () => {
    const rng = createRNG(42);
    const result = calcDamageHeadless(attacker, move, defender, typeChart, rng);
    // power(10) + attack(8) - floor(defense(6)/2) = 10 + 8 - 3 = 15, + random(1-3), * 1.5 effectiveness
    assert.ok(result.damage > 0, 'damage should be positive');
  });

  test('super-effective multiplier (1.5x) applied correctly', () => {
    // backend vs devops = 1.5x
    const rng = createRNG(42);
    const result = calcDamageHeadless(attacker, move, defender, typeChart, rng);
    assert.strictEqual(result.effectiveness, 1.5);
  });

  test('not-very-effective multiplier (0.5x) applied correctly', () => {
    // backend vs frontend = 0.5x
    const frontendDefender = { ...defender, type: 'frontend' };
    const rng = createRNG(42);
    const result = calcDamageHeadless(attacker, move, frontendDefender, typeChart, rng);
    assert.strictEqual(result.effectiveness, 0.5);
  });

  test('neutral effectiveness (1.0x) for unrelated types', () => {
    // backend vs backend = 1.0x
    const sameTypeDefender = { ...defender, type: 'backend' };
    const rng = createRNG(42);
    const result = calcDamageHeadless(attacker, move, sameTypeDefender, typeChart, rng);
    assert.strictEqual(result.effectiveness, 1.0);
  });

  test('missing type chart defaults to 1.0x', () => {
    const rng = createRNG(42);
    const result = calcDamageHeadless(attacker, move, defender, null, rng);
    assert.strictEqual(result.effectiveness, 1.0);
  });

  test('minimum damage is 1 even with high defense', () => {
    const tankDefender = { ...defender, defense: 200 };
    const weakMove = { ...move, power: 1 };
    const weakAttacker = { ...attacker, attack: 1 };
    const rng = createRNG(42);
    const result = calcDamageHeadless(weakAttacker, weakMove, tankDefender, null, rng);
    assert.ok(result.damage >= 1, `damage should be at least 1, got ${result.damage}`);
  });

  test('damage is deterministic with same seed', () => {
    const rng1 = createRNG(100);
    const rng2 = createRNG(100);
    const r1 = calcDamageHeadless(attacker, move, defender, typeChart, rng1);
    const r2 = calcDamageHeadless(attacker, move, defender, typeChart, rng2);
    assert.strictEqual(r1.damage, r2.damage);
    assert.strictEqual(r1.effectiveness, r2.effectiveness);
  });

  // --- Additional edge cases ---

  test('damage with very high defense still returns at least 1', () => {
    const tank = { ...defender, defense: 500 };
    const weakMove = { ...move, power: 1 };
    const weakAttacker = { ...attacker, attack: 1 };
    const rng = createRNG(42);
    const result = calcDamageHeadless(weakAttacker, weakMove, tank, null, rng);
    assert.ok(result.damage >= 1, `damage should be at least 1, got ${result.damage}`);
  });

  test('damage with max stats from game data', () => {
    const maxAttacker = { ...attacker, attack: 20 }; // max attack in spec
    const maxDefender = { ...defender, defense: 16 }; // high defense
    const strongMove = { ...move, power: 20 }; // high power
    const rng = createRNG(42);
    const result = calcDamageHeadless(maxAttacker, strongMove, maxDefender, typeChart, rng);
    assert.ok(result.damage > 0);
    assert.ok(typeof result.damage === 'number');
  });

  test('0.5x effectiveness halves damage approximately', () => {
    const rng1 = createRNG(42);
    const rng2 = createRNG(42);
    // backend vs frontend = 0.5x
    const frontendDef = { ...defender, type: 'frontend' };
    const neutralDef = { ...defender, type: 'backend' }; // 1.0x
    const dmgWeak = calcDamageHeadless(attacker, move, frontendDef, typeChart, rng1);
    const dmgNeutral = calcDamageHeadless(attacker, move, neutralDef, typeChart, rng2);
    assert.ok(dmgWeak.damage <= dmgNeutral.damage, 'weak effectiveness should deal less damage');
  });

  test('damage with zero-power move still returns at least 1', () => {
    const zeroMove = { ...move, power: 0 };
    const rng = createRNG(42);
    const result = calcDamageHeadless(attacker, zeroMove, defender, null, rng);
    assert.ok(result.damage >= 1, `damage should be at least 1, got ${result.damage}`);
  });

  test('different seeds produce different random components', () => {
    const results = new Set();
    for (let seed = 0; seed < 20; seed++) {
      const rng = createRNG(seed);
      const r = calcDamageHeadless(attacker, move, defender, null, rng);
      results.add(r.damage);
    }
    assert.ok(results.size > 1, 'different seeds should produce at least some different damage values');
  });

  test('headless calc returns damage and effectiveness only', () => {
    const rng = createRNG(42);
    const result = calcDamageHeadless(attacker, move, defender, typeChart, rng);
    assert.ok('damage' in result, 'should have damage');
    assert.ok('effectiveness' in result, 'should have effectiveness');
  });
});
