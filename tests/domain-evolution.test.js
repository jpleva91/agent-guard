import assert from 'node:assert';
import { test, suite } from './run.js';
import {
  findTrigger, checkEvolution, checkPartyEvolutions,
  applyEvolution, getEvolutionProgress
} from '../domain/evolution.js';

suite('Domain Evolution (domain/evolution.js)', () => {
  const monstersData = [
    { id: 1, name: 'NullPointer', type: 'backend', hp: 30, attack: 8, defense: 4, speed: 6, evolvesTo: 21 },
    { id: 21, name: 'OptionalChaining', type: 'backend', hp: 40, attack: 12, defense: 8, speed: 8 },
    { id: 2, name: 'CallbackHell', type: 'backend', hp: 28, attack: 7, defense: 5, speed: 4, evolvesTo: 23 },
    { id: 23, name: 'AsyncAwait', type: 'backend', hp: 38, attack: 11, defense: 7, speed: 7 },
  ];

  const evolutionData = {
    chains: [
      {
        id: 'null_chain', name: 'Null Safety',
        triggers: [{ from: 1, to: 21, condition: { event: 'commits', count: 10 } }],
      },
      {
        id: 'callback_chain', name: 'Async Evolution',
        triggers: [{ from: 2, to: 23, condition: { event: 'prs_merged', count: 5 } }],
      },
    ],
    events: { commits: { label: 'Commits' }, prs_merged: { label: 'PRs Merged' } },
  };

  // --- findTrigger ---
  test('findTrigger returns trigger and chain for known monster', () => {
    const result = findTrigger(1, evolutionData);
    assert.ok(result);
    assert.strictEqual(result.trigger.from, 1);
    assert.strictEqual(result.trigger.to, 21);
    assert.strictEqual(result.chain.name, 'Null Safety');
  });

  test('findTrigger returns null for unknown monster', () => {
    assert.strictEqual(findTrigger(999, evolutionData), null);
  });

  test('findTrigger returns null when evolutionData is null', () => {
    assert.strictEqual(findTrigger(1, null), null);
  });

  // --- checkEvolution ---
  test('checkEvolution returns evolution when condition met', () => {
    const monster = monstersData[0]; // NullPointer, evolvesTo 21
    const events = { commits: 15 }; // >= 10
    const result = checkEvolution(monster, events, evolutionData, monstersData);
    assert.ok(result);
    assert.strictEqual(result.from.name, 'NullPointer');
    assert.strictEqual(result.to.name, 'OptionalChaining');
  });

  test('checkEvolution returns null when condition not met', () => {
    const monster = monstersData[0];
    const events = { commits: 5 }; // < 10
    const result = checkEvolution(monster, events, evolutionData, monstersData);
    assert.strictEqual(result, null);
  });

  test('checkEvolution returns null when monster has no evolvesTo', () => {
    const noEvo = { id: 99, name: 'Stable', hp: 30, attack: 5, defense: 5, speed: 5 };
    const result = checkEvolution(noEvo, { commits: 100 }, evolutionData, monstersData);
    assert.strictEqual(result, null);
  });

  test('checkEvolution returns null when events is empty', () => {
    const monster = monstersData[0];
    const result = checkEvolution(monster, {}, evolutionData, monstersData);
    assert.strictEqual(result, null);
  });

  // --- checkPartyEvolutions ---
  test('checkPartyEvolutions finds first eligible evolution', () => {
    const party = [monstersData[0], monstersData[2]]; // NullPointer, CallbackHell
    const events = { commits: 10, prs_merged: 5 };
    const result = checkPartyEvolutions(party, events, evolutionData, monstersData);
    assert.ok(result);
    assert.strictEqual(result.partyIndex, 0);
    assert.strictEqual(result.from.name, 'NullPointer');
  });

  test('checkPartyEvolutions returns null when no evolution is ready', () => {
    const party = [monstersData[0]];
    const events = { commits: 2 };
    const result = checkPartyEvolutions(party, events, evolutionData, monstersData);
    assert.strictEqual(result, null);
  });

  // --- applyEvolution ---
  test('applyEvolution returns evolved form with proportional HP', () => {
    const oldMon = { ...monstersData[0], currentHP: 15 }; // 50% of 30 HP
    const evolvedForm = monstersData[1]; // OptionalChaining, hp: 40
    const result = applyEvolution(oldMon, evolvedForm);
    assert.strictEqual(result.name, 'OptionalChaining');
    assert.strictEqual(result.currentHP, 20); // ceil(40 * 0.5)
  });

  test('applyEvolution at full HP gives full evolved HP', () => {
    const oldMon = { ...monstersData[0], currentHP: 30 };
    const evolvedForm = monstersData[1];
    const result = applyEvolution(oldMon, evolvedForm);
    assert.strictEqual(result.currentHP, 40);
  });

  // --- getEvolutionProgress ---
  test('getEvolutionProgress returns progress data', () => {
    const monster = monstersData[0]; // NullPointer
    const events = { commits: 7 };
    const result = getEvolutionProgress(monster, events, evolutionData, monstersData);
    assert.ok(result);
    assert.strictEqual(result.chainName, 'Null Safety');
    assert.strictEqual(result.eventType, 'commits');
    assert.strictEqual(result.current, 7);
    assert.strictEqual(result.required, 10);
    assert.strictEqual(result.percentage, 70);
    assert.strictEqual(result.evolvesTo, 'OptionalChaining');
  });

  test('getEvolutionProgress returns null for non-evolving monster', () => {
    const noEvo = { id: 99, name: 'Stable' };
    const result = getEvolutionProgress(noEvo, {}, evolutionData, monstersData);
    assert.strictEqual(result, null);
  });

  test('getEvolutionProgress caps at 100%', () => {
    const monster = monstersData[0];
    const events = { commits: 999 };
    const result = getEvolutionProgress(monster, events, evolutionData, monstersData);
    assert.strictEqual(result.percentage, 100);
    assert.strictEqual(result.current, 10); // capped at required
  });
});
