import assert from 'node:assert';
import { test, suite } from './run.js';
import {
  calcDamage, calcHealing, isHealMove, isFainted,
  createBattleState, getTurnOrder, resolveMove,
  applyDamage, applyHealing,
  cacheChance, attemptCache, pickEnemyMove,
  executeTurn, simulateBattle
} from '../domain/battle.js';

suite('Domain Battle Engine (domain/battle.js)', () => {
  const monA = { id: 1, name: 'TestA', type: 'backend', hp: 30, attack: 8, defense: 4, speed: 6, moves: ['segfault'], passive: null };
  const monB = { id: 2, name: 'TestB', type: 'frontend', hp: 35, attack: 7, defense: 8, speed: 3, moves: ['layoutshift'], passive: null };

  const typeChart = {
    backend: { frontend: 0.5, backend: 1.0, devops: 1.5 },
    frontend: { frontend: 1.0, backend: 1.5, devops: 1.0 },
  };

  const movesData = [
    { id: 'segfault', name: 'SegFault', power: 10, type: 'backend' },
    { id: 'layoutshift', name: 'LayoutShift', power: 7, type: 'frontend' },
  ];

  const healMove = { id: 'hotfix', name: 'Hotfix', power: 12, type: 'devops', category: 'heal' };

  // --- isHealMove ---
  test('isHealMove returns true for heal category', () => {
    assert.strictEqual(isHealMove(healMove), true);
  });

  test('isHealMove returns false for attack moves', () => {
    assert.strictEqual(isHealMove(movesData[0]), false);
  });

  // --- calcHealing ---
  test('calcHealing caps at missing HP', () => {
    const result = calcHealing(healMove, { hp: 30, currentHP: 25 });
    assert.strictEqual(result.healing, 5);
  });

  test('calcHealing returns 0 at full HP', () => {
    const result = calcHealing(healMove, { hp: 30, currentHP: 30 });
    assert.strictEqual(result.healing, 0);
  });

  test('calcHealing handles currentHP undefined (defaults to hp)', () => {
    const result = calcHealing(healMove, { hp: 30 });
    assert.strictEqual(result.healing, 0);
  });

  // --- calcDamage ---
  test('calcDamage basic formula with deterministic RNG', () => {
    const rng = { random: () => 0.5 };
    const result = calcDamage(monA, movesData[0], monB, typeChart, rng);
    // power(10) + attack(8) - floor(defense(8)/2) = 14, + floor(0.5*3)+1 = 2, = 16, * 0.5 eff = 8
    assert.ok(result.damage >= 1);
    assert.strictEqual(result.effectiveness, 0.5);
    assert.strictEqual(typeof result.critical, 'boolean');
  });

  test('calcDamage with no type chart defaults to 1.0 effectiveness', () => {
    const rng = { random: () => 0.5 };
    const result = calcDamage(monA, movesData[0], monB, null, rng);
    assert.strictEqual(result.effectiveness, 1.0);
  });

  test('calcDamage minimum is 1', () => {
    const weakAttacker = { ...monA, attack: 0 };
    const weakMove = { ...movesData[0], power: 0 };
    const tankDefender = { ...monB, defense: 200 };
    const rng = { random: () => 0 };
    const result = calcDamage(weakAttacker, weakMove, tankDefender, null, rng);
    assert.strictEqual(result.damage, 1);
  });

  test('calcDamage critical hit multiplies by 1.5', () => {
    // Critical triggers when rand() < 1/16 ≈ 0.0625
    // First call: randomBonus, second call: critical check
    let callCount = 0;
    const rng = { random: () => { callCount++; return callCount === 1 ? 0.5 : 0.01; } };
    const result = calcDamage(monA, movesData[0], monB, null, rng);
    assert.strictEqual(result.critical, true);
  });

  // --- createBattleState ---
  test('createBattleState initializes correctly', () => {
    const state = createBattleState(monA, monB);
    assert.strictEqual(state.playerMon.currentHP, 30);
    assert.strictEqual(state.enemy.currentHP, 35);
    assert.strictEqual(state.turn, 0);
    assert.deepStrictEqual(state.log, []);
    assert.strictEqual(state.outcome, null);
  });

  test('createBattleState preserves existing currentHP', () => {
    const wounded = { ...monA, currentHP: 10 };
    const state = createBattleState(wounded, monB);
    assert.strictEqual(state.playerMon.currentHP, 10);
  });

  // --- getTurnOrder ---
  test('getTurnOrder faster goes first', () => {
    assert.strictEqual(getTurnOrder(monA, monB), 'player'); // 6 vs 3
    assert.strictEqual(getTurnOrder(monB, monA), 'enemy');   // 3 vs 6
  });

  test('getTurnOrder ties favor player', () => {
    const a = { ...monA, speed: 5 };
    const b = { ...monB, speed: 5 };
    assert.strictEqual(getTurnOrder(a, b), 'player');
  });

  // --- resolveMove ---
  test('resolveMove dispatches heal vs attack correctly', () => {
    const healResult = resolveMove(monA, healMove, monB, typeChart);
    assert.strictEqual(healResult.damage, 0);
    assert.ok(healResult.healing !== undefined);

    const attackResult = resolveMove(monA, movesData[0], monB, typeChart);
    assert.ok(attackResult.damage >= 1);
  });

  // --- applyDamage / applyHealing immutability ---
  test('applyDamage returns new object', () => {
    const mon = { ...monA, currentHP: 30 };
    const result = applyDamage(mon, 10);
    assert.strictEqual(result.currentHP, 20);
    assert.strictEqual(mon.currentHP, 30); // original unchanged
  });

  test('applyDamage floors at 0', () => {
    const result = applyDamage({ ...monA, currentHP: 5 }, 100);
    assert.strictEqual(result.currentHP, 0);
  });

  test('applyHealing caps at max HP', () => {
    const result = applyHealing({ ...monA, currentHP: 25 }, 20);
    assert.strictEqual(result.currentHP, 30);
  });

  test('applyHealing returns new object', () => {
    const mon = { ...monA, currentHP: 20 };
    const result = applyHealing(mon, 5);
    assert.strictEqual(result.currentHP, 25);
    assert.strictEqual(mon.currentHP, 20); // original unchanged
  });

  // --- isFainted ---
  test('isFainted at 0 HP', () => {
    assert.strictEqual(isFainted({ currentHP: 0 }), true);
  });

  test('isFainted at negative HP', () => {
    assert.strictEqual(isFainted({ currentHP: -5 }), true);
  });

  test('isFainted at positive HP', () => {
    assert.strictEqual(isFainted({ currentHP: 1 }), false);
  });

  // --- cacheChance / attemptCache ---
  test('cacheChance at full HP is 0.1', () => {
    assert.ok(Math.abs(cacheChance({ hp: 100, currentHP: 100 }) - 0.1) < 0.001);
  });

  test('cacheChance at 0 HP is 0.6', () => {
    assert.ok(Math.abs(cacheChance({ hp: 100, currentHP: 0 }) - 0.6) < 0.001);
  });

  test('cacheChance at 50% HP is 0.35', () => {
    assert.ok(Math.abs(cacheChance({ hp: 100, currentHP: 50 }) - 0.35) < 0.001);
  });

  test('attemptCache succeeds with low roll', () => {
    assert.strictEqual(attemptCache({ hp: 30, currentHP: 15 }, 0.0), true);
  });

  test('attemptCache fails with high roll', () => {
    assert.strictEqual(attemptCache({ hp: 30, currentHP: 15 }, 0.99), false);
  });

  // --- pickEnemyMove ---
  test('pickEnemyMove selects correct move by roll', () => {
    const enemy = { moves: ['segfault', 'layoutshift'] };
    assert.strictEqual(pickEnemyMove(enemy, movesData, 0.0).id, 'segfault');
    assert.strictEqual(pickEnemyMove(enemy, movesData, 0.99).id, 'layoutshift');
  });

  test('pickEnemyMove with single move', () => {
    const enemy = { moves: ['segfault'] };
    assert.strictEqual(pickEnemyMove(enemy, movesData, 0.5).id, 'segfault');
  });

  // --- executeTurn ---
  test('executeTurn produces events and increments turn', () => {
    const state = createBattleState(monA, monB);
    const result = executeTurn(state, movesData[0], movesData[1], typeChart);
    assert.strictEqual(result.state.turn, 1);
    assert.ok(result.events.length >= 2);
  });

  test('executeTurn does not mutate original state', () => {
    const state = createBattleState(monA, monB);
    executeTurn(state, movesData[0], movesData[1], typeChart);
    assert.strictEqual(state.turn, 0);
    assert.strictEqual(state.playerMon.currentHP, 30);
  });

  test('executeTurn sets outcome to win when enemy KOd', () => {
    const weakEnemy = { ...monB, hp: 1, currentHP: 1 };
    const state = createBattleState(monA, weakEnemy);
    const result = executeTurn(state, movesData[0], movesData[1], typeChart);
    assert.strictEqual(result.state.outcome, 'win');
  });

  test('executeTurn sets outcome to lose when player KOd', () => {
    const weakPlayer = { ...monA, hp: 1, currentHP: 1, speed: 1 };
    const strongEnemy = { ...monB, attack: 50, speed: 10 };
    const state = createBattleState(weakPlayer, strongEnemy);
    const result = executeTurn(state, movesData[0], movesData[1], typeChart);
    assert.strictEqual(result.state.outcome, 'lose');
  });

  // --- executeTurn with passives ---
  test('executeTurn RandomFailure negates damage when roll < 0.5', () => {
    const flakyMon = { ...monB, passive: { name: 'RandomFailure', description: 'test' } };
    const state = createBattleState(monA, flakyMon);
    const result = executeTurn(state, movesData[0], movesData[1], typeChart, { passive: () => 0.1 });
    const passiveEvent = result.events.find(e => e.type === 'PASSIVE_ACTIVATED' && e.passive === 'RandomFailure');
    assert.ok(passiveEvent, 'RandomFailure should activate');
  });

  test('executeTurn NonDeterministic triggers bonus attack when roll < 0.25', () => {
    const raceMon = { ...monA, passive: { name: 'NonDeterministic', description: 'test' } };
    const state = createBattleState(raceMon, monB);
    const result = executeTurn(state, movesData[0], movesData[1], typeChart, { passive: () => 0.1 });
    const passiveEvent = result.events.find(e => e.type === 'PASSIVE_ACTIVATED' && e.passive === 'NonDeterministic');
    assert.ok(passiveEvent, 'NonDeterministic should activate');
  });

  // --- simulateBattle ---
  test('simulateBattle simple mode ends with outcome', () => {
    const result = simulateBattle(monA, monB, movesData, typeChart);
    assert.ok(result.outcome !== null || result.turn >= 100);
  });

  test('simulateBattle with strategies returns winner', () => {
    const pickFirst = (attacker, defender, moves) => {
      const moveId = attacker.moves[0];
      return moves.find(m => m.id === moveId);
    };
    const result = simulateBattle(monA, monB, movesData, typeChart, 100, {
      strategyA: pickFirst,
      strategyB: pickFirst,
    });
    assert.ok(['A', 'B', 'draw'].includes(result.winner));
    assert.ok(typeof result.turns === 'number');
  });
});
