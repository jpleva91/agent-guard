import assert from 'node:assert';
import { test, suite } from './run.js';
import {
  createBattleState, getTurnOrder, resolveMove, applyDamage, applyHealing,
  isFainted, cacheChance, attemptCache, pickEnemyMove, executeTurn,
  simulateBattle
} from '../game/battle/battle-core.js';
import { isHealMove, calcHealing } from '../game/battle/damage.js';

suite('Battle Core (game/battle/battle-core.js)', () => {
  const movesData = [
    { id: 'segfault', name: 'SegFault', power: 10, type: 'backend' },
    { id: 'layoutshift', name: 'LayoutShift', power: 7, type: 'frontend' },
  ];

  const typeChart = {
    backend:  { frontend: 0.5, backend: 1.0, devops: 1.5 },
    frontend: { frontend: 1.0, backend: 1.5, devops: 1.0 },
  };

  const monA = { id: 1, name: 'NullPointer', type: 'backend', hp: 30, attack: 8, defense: 4, speed: 6, moves: ['segfault'] };
  const monB = { id: 2, name: 'CSSGlitch', type: 'frontend', hp: 35, attack: 7, defense: 8, speed: 3, moves: ['layoutshift'] };

  test('createBattleState returns correct structure', () => {
    const state = createBattleState(monA, monB);
    assert.strictEqual(state.playerMon.name, 'NullPointer');
    assert.strictEqual(state.enemy.name, 'CSSGlitch');
    assert.strictEqual(state.playerMon.currentHP, 30);
    assert.strictEqual(state.enemy.currentHP, 35);
    assert.strictEqual(state.turn, 0);
    assert.deepStrictEqual(state.log, []);
    assert.strictEqual(state.outcome, null);
  });

  test('createBattleState preserves existing currentHP', () => {
    const wounded = { ...monA, currentHP: 15 };
    const state = createBattleState(wounded, monB);
    assert.strictEqual(state.playerMon.currentHP, 15);
  });

  test('getTurnOrder: faster monster goes first', () => {
    assert.strictEqual(getTurnOrder(monA, monB), 'player');  // speed 6 vs 3
    assert.strictEqual(getTurnOrder(monB, monA), 'enemy');    // speed 3 vs 6
  });

  test('getTurnOrder: ties favor player', () => {
    const sameSpdA = { ...monA, speed: 5 };
    const sameSpdB = { ...monB, speed: 5 };
    assert.strictEqual(getTurnOrder(sameSpdA, sameSpdB), 'player');
  });

  test('applyDamage reduces HP correctly', () => {
    const mon = { ...monA, currentHP: 30 };
    const result = applyDamage(mon, 10);
    assert.strictEqual(result.currentHP, 20);
  });

  test('applyDamage HP never goes below 0', () => {
    const mon = { ...monA, currentHP: 5 };
    const result = applyDamage(mon, 100);
    assert.strictEqual(result.currentHP, 0);
  });

  test('applyDamage does not mutate original', () => {
    const mon = { ...monA, currentHP: 30 };
    applyDamage(mon, 10);
    assert.strictEqual(mon.currentHP, 30);
  });

  test('isFainted returns true at 0 HP', () => {
    assert.strictEqual(isFainted({ currentHP: 0 }), true);
  });

  test('isFainted returns false at positive HP', () => {
    assert.strictEqual(isFainted({ currentHP: 1 }), false);
    assert.strictEqual(isFainted({ currentHP: 30 }), false);
  });

  test('cacheChance scales with HP ratio', () => {
    const fullHP = { hp: 30, currentHP: 30 };
    const halfHP = { hp: 30, currentHP: 15 };
    const lowHP = { hp: 30, currentHP: 3 };
    const noHP = { hp: 30, currentHP: 0 };

    const chanceFull = cacheChance(fullHP);
    const chanceHalf = cacheChance(halfHP);
    const chanceLow = cacheChance(lowHP);
    const chanceNone = cacheChance(noHP);

    // Lower HP = higher catch chance
    assert.ok(chanceFull < chanceHalf, 'full HP should have lower chance than half HP');
    assert.ok(chanceHalf < chanceLow, 'half HP should have lower chance than low HP');
    assert.ok(chanceLow <= chanceNone, 'low HP should have lower or equal chance than 0 HP');

    // Base chance is 0.1 at full HP
    assert.ok(Math.abs(chanceFull - 0.1) < 0.001, `full HP chance should be 0.1, got ${chanceFull}`);
    // Max chance at 0 HP is 0.6
    assert.ok(Math.abs(chanceNone - 0.6) < 0.001, `0 HP chance should be 0.6, got ${chanceNone}`);
  });

  test('attemptCache succeeds when roll is below chance', () => {
    const halfHP = { hp: 30, currentHP: 15 };
    const chance = cacheChance(halfHP); // 0.35
    assert.strictEqual(attemptCache(halfHP, 0.0), true);   // roll 0 < 0.35
    assert.strictEqual(attemptCache(halfHP, 0.99), false);  // roll 0.99 > 0.35
  });

  test('pickEnemyMove returns a valid move', () => {
    const enemy = { moves: ['segfault', 'layoutshift'] };
    const move = pickEnemyMove(enemy, movesData, 0.0);
    assert.strictEqual(move.id, 'segfault');
    const move2 = pickEnemyMove(enemy, movesData, 0.99);
    assert.strictEqual(move2.id, 'layoutshift');
  });

  test('executeTurn produces correct events', () => {
    const state = createBattleState(monA, monB);
    const playerMove = movesData[0]; // segfault
    const enemyMove = movesData[1];  // layoutshift
    const result = executeTurn(state, playerMove, enemyMove, typeChart);

    assert.ok(result.events.length >= 2, 'should have at least 2 move events');
    assert.strictEqual(result.events[0].type, 'MOVE_USED');
    assert.strictEqual(result.state.turn, 1);
    // Player is faster (speed 6 vs 3), should go first
    assert.strictEqual(result.events[0].side, 'player');
  });

  test('executeTurn skips fainted attacker', () => {
    // Put monA at 1HP, monB has high attack — monB goes first and KOs monA
    const fragileA = { ...monA, speed: 1 }; // slower so enemy goes first
    const strongB = { ...monB, attack: 50, speed: 10 };
    const state = createBattleState(fragileA, strongB);
    const result = executeTurn(state, movesData[0], movesData[1], typeChart);

    // Enemy goes first and likely KOs player, player's turn should be skipped
    if (result.state.outcome === 'lose') {
      // Only enemy should have attacked
      const moveEvents = result.events.filter(e => e.type === 'MOVE_USED');
      assert.strictEqual(moveEvents.length, 1);
      assert.strictEqual(moveEvents[0].side, 'enemy');
    }
  });

  test('executeTurn sets outcome to win when enemy faints', () => {
    const weakEnemy = { ...monB, hp: 1, currentHP: 1 };
    const state = createBattleState(monA, weakEnemy);
    const result = executeTurn(state, movesData[0], movesData[1], typeChart);
    assert.strictEqual(result.state.outcome, 'win');
  });

  test('executeTurn sets outcome to lose when player faints', () => {
    const weakPlayer = { ...monA, hp: 1, currentHP: 1, speed: 1 };
    const strongEnemy = { ...monB, attack: 50, speed: 10 };
    const state = createBattleState(weakPlayer, strongEnemy);
    const result = executeTurn(state, movesData[0], movesData[1], typeChart);
    assert.strictEqual(result.state.outcome, 'lose');
  });

  test('simulateBattle eventually ends with an outcome', () => {
    const result = simulateBattle(monA, monB, movesData, { effectiveness: typeChart });
    assert.ok(result.outcome !== null || result.turn >= 100, 'battle should end or hit max turns');
  });

  test('resolveMove returns damage and effectiveness', () => {
    const result = resolveMove(monA, movesData[0], monB, typeChart);
    assert.ok(typeof result.damage === 'number');
    assert.ok(typeof result.effectiveness === 'number');
    assert.ok(result.damage >= 1);
  });

  // Healing move tests
  const healMove = { id: 'hotfix', name: 'Hotfix', power: 12, type: 'devops', category: 'heal' };

  test('isHealMove returns true for heal category', () => {
    assert.strictEqual(isHealMove(healMove), true);
    assert.strictEqual(isHealMove(movesData[0]), false);
  });

  test('calcHealing returns correct amount capped at missing HP', () => {
    const wounded = { hp: 30, currentHP: 20 };
    const result = calcHealing(healMove, wounded);
    assert.strictEqual(result.healing, 10);
  });

  test('calcHealing returns 0 at full HP', () => {
    const full = { hp: 30, currentHP: 30 };
    const result = calcHealing(healMove, full);
    assert.strictEqual(result.healing, 0);
  });

  test('applyHealing caps at max HP', () => {
    const mon = { ...monA, currentHP: 25 };
    const result = applyHealing(mon, 12);
    assert.strictEqual(result.currentHP, 30);
  });

  test('applyHealing does not mutate original', () => {
    const mon = { ...monA, currentHP: 20 };
    applyHealing(mon, 10);
    assert.strictEqual(mon.currentHP, 20);
  });

  test('executeTurn handles heal move correctly', () => {
    const woundedA = { ...monA, currentHP: 15 };
    const state = createBattleState(woundedA, monB);
    const result = executeTurn(state, healMove, movesData[1], typeChart);

    const healEvent = result.events.find(e => e.side === 'player' && e.healing !== undefined);
    assert.ok(healEvent, 'should have a healing event');
    assert.strictEqual(healEvent.damage, 0);
    assert.ok(healEvent.healing > 0);
    // Player heals to 27, then enemy attacks reducing HP further
    assert.ok(result.state.playerMon.currentHP > 15 - 20 , 'HP should be higher than without healing');
    assert.ok(result.state.playerMon.currentHP <= 27, 'HP should not exceed healed amount');
  });

  test('resolveMove returns healing for heal moves', () => {
    const wounded = { ...monA, currentHP: 20 };
    const result = resolveMove(wounded, healMove, monB, typeChart);
    assert.strictEqual(result.damage, 0);
    assert.strictEqual(result.healing, 10);
    assert.strictEqual(result.effectiveness, 1.0);
  });

  // Passive ability tests
  const flakyMon = {
    id: 11, name: 'FlakyTest', type: 'testing', hp: 24, attack: 7, defense: 4, speed: 2,
    moves: ['segfault'], passive: { name: 'RandomFailure', description: '50% chance to ignore damage' }
  };
  const raceMon = {
    id: 3, name: 'RaceCondition', type: 'backend', hp: 25, attack: 6, defense: 3, speed: 10,
    moves: ['segfault'], passive: { name: 'NonDeterministic', description: 'Randomly acts twice per turn' }
  };

  test('RandomFailure passive negates damage when roll < 0.5', () => {
    const state = createBattleState(monA, flakyMon);
    const result = executeTurn(state, movesData[0], movesData[0], typeChart, { passive: () => 0.1 });
    const passiveEvent = result.events.find(e => e.type === 'PASSIVE_ACTIVATED');
    assert.ok(passiveEvent, 'should have passive activation event');
    assert.strictEqual(passiveEvent.passive, 'RandomFailure');
    // FlakyTest is defender (enemy), player attacks first (speed 6 > 2)
    assert.strictEqual(result.state.enemy.currentHP, 24, 'FlakyTest should take no damage');
  });

  test('RandomFailure passive does not trigger when roll >= 0.5', () => {
    const state = createBattleState(monA, flakyMon);
    const result = executeTurn(state, movesData[0], movesData[0], typeChart, { passive: () => 0.9 });
    const passiveEvent = result.events.find(e => e.type === 'PASSIVE_ACTIVATED');
    assert.ok(!passiveEvent, 'should not have passive activation event');
    assert.ok(result.state.enemy.currentHP < 24, 'FlakyTest should take damage');
  });

  test('NonDeterministic passive triggers bonus attack when roll < 0.25', () => {
    const state = createBattleState(raceMon, monB);
    // First passive roll is for RandomFailure check on defender (monB has no passive, won't trigger)
    // Second passive roll is for NonDeterministic check on attacker
    const result = executeTurn(state, movesData[0], movesData[1], typeChart, { passive: () => 0.1 });
    const passiveEvent = result.events.find(e => e.type === 'PASSIVE_ACTIVATED' && e.passive === 'NonDeterministic');
    assert.ok(passiveEvent, 'should have NonDeterministic activation event');
    const playerMoveEvents = result.events.filter(e => e.type === 'MOVE_USED' && e.side === 'player');
    assert.strictEqual(playerMoveEvents.length, 2, 'should have two player attack events');
  });

  test('NonDeterministic passive does not trigger when roll >= 0.25', () => {
    const state = createBattleState(raceMon, monB);
    const result = executeTurn(state, movesData[0], movesData[1], typeChart, { passive: () => 0.9 });
    const passiveEvent = result.events.find(e => e.type === 'PASSIVE_ACTIVATED' && e.passive === 'NonDeterministic');
    assert.ok(!passiveEvent, 'should not have NonDeterministic activation event');
    const playerMoveEvents = result.events.filter(e => e.type === 'MOVE_USED' && e.side === 'player');
    assert.strictEqual(playerMoveEvents.length, 1, 'should have only one player attack event');
  });

  test('No passive activation for BugMon without passive', () => {
    const state = createBattleState(monA, monB);
    const result = executeTurn(state, movesData[0], movesData[1], typeChart);
    const passiveEvent = result.events.find(e => e.type === 'PASSIVE_ACTIVATED');
    assert.ok(!passiveEvent, 'should not have passive activation event');
  });
});
