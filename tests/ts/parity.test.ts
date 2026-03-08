/**
 * Parity tests — verify JS and TS domain implementations produce identical results.
 *
 * These tests import the same functions from both domain/ (JS) and src/domain/ (TS)
 * and verify they return the same output for the same input. This ensures the
 * TypeScript refactor is behaviorally equivalent to the original JavaScript.
 */

import { describe, it, expect } from 'vitest';

// JS implementations
import * as jsBattle from '../../domain/battle.js';
import * as jsEncounters from '../../domain/encounters.js';
import * as jsEvolution from '../../domain/evolution.js';

// TS implementations
import * as tsBattle from '../../src/domain/battle.js';
import * as tsEncounters from '../../src/domain/encounters.js';
import * as tsEvolution from '../../src/domain/evolution.js';

// Shared test fixtures
const typeChart = {
  frontend: { frontend: 1, backend: 0.5, devops: 1, testing: 1, architecture: 1, security: 1, ai: 1.5 },
  backend: { frontend: 1.5, backend: 1, devops: 1, testing: 0.5, architecture: 1, security: 1, ai: 1 },
  devops: { frontend: 1, backend: 1, devops: 1, testing: 1, architecture: 1.5, security: 0.5, ai: 1 },
  testing: { frontend: 1, backend: 1.5, devops: 1, testing: 1, architecture: 0.5, security: 1, ai: 1 },
  architecture: { frontend: 1, backend: 1, devops: 0.5, testing: 1.5, architecture: 1, security: 1, ai: 1 },
  security: { frontend: 1, backend: 1, devops: 1.5, testing: 1, architecture: 1, security: 1, ai: 0.5 },
  ai: { frontend: 0.5, backend: 1, devops: 1, testing: 1, architecture: 1, security: 1.5, ai: 1 },
};

const makeMon = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'TestMon',
  type: 'backend',
  hp: 30,
  currentHP: 30,
  attack: 8,
  defense: 4,
  speed: 6,
  moves: ['move1'],
  passive: null,
  ...overrides,
});

const makeMove = (overrides: Record<string, unknown> = {}) => ({
  id: 'move1',
  name: 'TestMove',
  power: 10,
  type: 'backend',
  category: 'attack',
  ...overrides,
});

// --- Battle parity ---

describe('Battle parity (JS vs TS)', () => {
  it('calcDamage produces identical results', () => {
    const attacker = makeMon({ attack: 10 });
    const defender = makeMon({ defense: 6 });
    const move = makeMove({ power: 12, type: 'frontend' });

    for (let seed = 0; seed < 20; seed++) {
      const fixedRng = () => seed / 20;
      const jsResult = jsBattle.calcDamage(move, attacker, defender, typeChart, fixedRng);
      const tsResult = tsBattle.calcDamage(
        move as Parameters<typeof tsBattle.calcDamage>[0],
        attacker as Parameters<typeof tsBattle.calcDamage>[1],
        defender as Parameters<typeof tsBattle.calcDamage>[2],
        typeChart as Parameters<typeof tsBattle.calcDamage>[3],
        fixedRng,
      );

      expect(tsResult.damage).toBe(jsResult.damage);
      expect(tsResult.multiplier).toBe(jsResult.multiplier);
    }
  });

  it('calcHealing produces identical results', () => {
    const move = makeMove({ power: 15, category: 'heal' });
    const mon = makeMon({ hp: 30, currentHP: 20 });

    const jsResult = jsBattle.calcHealing(move, mon);
    const tsResult = tsBattle.calcHealing(
      move as Parameters<typeof tsBattle.calcHealing>[0],
      mon as Parameters<typeof tsBattle.calcHealing>[1],
    );
    expect(tsResult.healing).toBe(jsResult.healing);
  });

  it('isHealMove produces identical results', () => {
    const attack = makeMove({ category: 'attack' });
    const heal = makeMove({ category: 'heal' });

    expect(tsBattle.isHealMove(heal as Parameters<typeof tsBattle.isHealMove>[0]))
      .toBe(jsBattle.isHealMove(heal));
    expect(tsBattle.isHealMove(attack as Parameters<typeof tsBattle.isHealMove>[0]))
      .toBe(jsBattle.isHealMove(attack));
  });

  it('getTurnOrder produces identical results', () => {
    const fast = makeMon({ speed: 10 });
    const slow = makeMon({ speed: 5 });

    const jsOrder = jsBattle.getTurnOrder(fast, slow);
    const tsOrder = tsBattle.getTurnOrder(
      fast as Parameters<typeof tsBattle.getTurnOrder>[0],
      slow as Parameters<typeof tsBattle.getTurnOrder>[1],
    );
    expect(tsOrder).toEqual(jsOrder);
  });

  it('isFainted produces identical results', () => {
    expect(tsBattle.isFainted(makeMon({ currentHP: 0 }) as Parameters<typeof tsBattle.isFainted>[0]))
      .toBe(jsBattle.isFainted(makeMon({ currentHP: 0 })));
    expect(tsBattle.isFainted(makeMon({ currentHP: 10 }) as Parameters<typeof tsBattle.isFainted>[0]))
      .toBe(jsBattle.isFainted(makeMon({ currentHP: 10 })));
    expect(tsBattle.isFainted(makeMon({ currentHP: -5 }) as Parameters<typeof tsBattle.isFainted>[0]))
      .toBe(jsBattle.isFainted(makeMon({ currentHP: -5 })));
  });

  it('applyDamage produces identical results', () => {
    const mon = makeMon({ hp: 30, currentHP: 25 });
    const jsResult = jsBattle.applyDamage(mon, 10);
    const tsResult = tsBattle.applyDamage(
      mon as Parameters<typeof tsBattle.applyDamage>[0], 10);
    expect(tsResult).toEqual(jsResult);
  });

  it('cacheChance produces identical results', () => {
    const mon = makeMon({ hp: 30, currentHP: 10 });
    const jsChance = jsBattle.cacheChance(mon);
    const tsChance = tsBattle.cacheChance(
      mon as Parameters<typeof tsBattle.cacheChance>[0]);
    expect(tsChance).toBe(jsChance);
  });

  it('attemptCache produces identical results with fixed RNG', () => {
    const mon = makeMon({ hp: 30, currentHP: 10 });
    for (let seed = 0; seed < 20; seed++) {
      const rng = () => seed / 20;
      const jsResult = jsBattle.attemptCache(mon, rng);
      const tsResult = tsBattle.attemptCache(
        mon as Parameters<typeof tsBattle.attemptCache>[0], rng);
      expect(tsResult).toBe(jsResult);
    }
  });
});

// --- Encounters parity ---

describe('Encounters parity (JS vs TS)', () => {
  it('shouldEncounter produces identical results', () => {
    for (let tile = 0; tile <= 3; tile++) {
      for (let seed = 0; seed < 20; seed++) {
        const rng = () => seed / 20;
        const jsResult = jsEncounters.shouldEncounter(tile, rng);
        const tsResult = tsEncounters.shouldEncounter(tile, rng);
        expect(tsResult).toBe(jsResult);
      }
    }
  });

  it('pickWeightedRandom produces identical results', () => {
    const roster = [
      makeMon({ id: 1, name: 'Common', rarity: 'common' }),
      makeMon({ id: 2, name: 'Uncommon', rarity: 'uncommon' }),
      makeMon({ id: 3, name: 'Rare', rarity: 'rare' }),
      makeMon({ id: 4, name: 'Legend', rarity: 'legendary' }),
    ];

    for (let seed = 0; seed < 50; seed++) {
      const rng = () => seed / 50;
      const jsResult = jsEncounters.pickWeightedRandom(roster, rng);
      const tsResult = tsEncounters.pickWeightedRandom(
        roster as Parameters<typeof tsEncounters.pickWeightedRandom>[0], rng);
      expect(tsResult.name).toBe(jsResult.name);
    }
  });

  it('scaleEncounter produces identical results', () => {
    const mon = makeMon({ hp: 40, currentHP: 40 });
    const contexts = [
      {},
      { playerLevel: 1 },
      { playerLevel: 5 },
      { encounterCount: 0 },
      { encounterCount: 25 },
      { playerLevel: 3, encounterCount: 15 },
      { playerLevel: 10, encounterCount: 100 },
    ];

    for (const ctx of contexts) {
      const jsResult = jsEncounters.scaleEncounter(mon, ctx);
      const tsResult = tsEncounters.scaleEncounter(
        mon as Parameters<typeof tsEncounters.scaleEncounter>[0], ctx);
      expect(tsResult.hp).toBe(jsResult.hp);
      expect(tsResult.currentHP).toBe(jsResult.currentHP);
    }
  });

  it('RARITY_WEIGHTS are identical', () => {
    expect(tsEncounters.RARITY_WEIGHTS).toEqual(jsEncounters.RARITY_WEIGHTS);
  });
});

// --- Evolution parity ---

describe('Evolution parity (JS vs TS)', () => {
  const evolutionData = {
    chains: [
      {
        id: 'test_chain',
        name: 'Test Chain',
        stages: [
          { monsterId: 1, name: 'Stage1' },
          { monsterId: 10, name: 'Stage2' },
        ],
        triggers: [
          { from: 1, to: 10, condition: { event: 'commits', count: 5 }, description: 'Make 5 commits' },
        ],
      },
    ],
    events: {
      commits: { label: 'Commits' },
    },
  };

  const monstersData = [
    makeMon({ id: 1, name: 'Baby', evolvesTo: 10 }),
    makeMon({ id: 10, name: 'Evolved', hp: 50 }),
  ];

  it('findTrigger produces identical results', () => {
    const jsResult = jsEvolution.findTrigger(1, evolutionData);
    const tsResult = tsEvolution.findTrigger(1, evolutionData as Parameters<typeof tsEvolution.findTrigger>[1]);
    expect(tsResult).toEqual(jsResult);

    expect(tsEvolution.findTrigger(999, evolutionData as Parameters<typeof tsEvolution.findTrigger>[1]))
      .toEqual(jsEvolution.findTrigger(999, evolutionData));
  });

  it('checkEvolution produces identical results', () => {
    // Not enough events
    const jsNotReady = jsEvolution.checkEvolution(monstersData[0], { commits: 3 }, evolutionData, monstersData);
    const tsNotReady = tsEvolution.checkEvolution(
      monstersData[0] as Parameters<typeof tsEvolution.checkEvolution>[0],
      { commits: 3 },
      evolutionData as Parameters<typeof tsEvolution.checkEvolution>[2],
      monstersData as Parameters<typeof tsEvolution.checkEvolution>[3],
    );
    expect(tsNotReady).toEqual(jsNotReady);

    // Enough events
    const jsReady = jsEvolution.checkEvolution(monstersData[0], { commits: 5 }, evolutionData, monstersData);
    const tsReady = tsEvolution.checkEvolution(
      monstersData[0] as Parameters<typeof tsEvolution.checkEvolution>[0],
      { commits: 5 },
      evolutionData as Parameters<typeof tsEvolution.checkEvolution>[2],
      monstersData as Parameters<typeof tsEvolution.checkEvolution>[3],
    );
    expect(tsReady).toEqual(jsReady);
  });

  it('applyEvolution produces identical results', () => {
    const old = makeMon({ hp: 30, currentHP: 15 });
    const evolved = makeMon({ hp: 50, currentHP: 50 });

    const jsResult = jsEvolution.applyEvolution(old, evolved);
    const tsResult = tsEvolution.applyEvolution(
      old as Parameters<typeof tsEvolution.applyEvolution>[0],
      evolved as Parameters<typeof tsEvolution.applyEvolution>[1],
    );
    expect(tsResult).toEqual(jsResult);
  });

  it('getEvolutionProgress produces identical results', () => {
    const mon = makeMon({ id: 1, evolvesTo: 10 });
    const events = { commits: 3 };

    const jsResult = jsEvolution.getEvolutionProgress(mon, events, evolutionData, monstersData);
    const tsResult = tsEvolution.getEvolutionProgress(
      mon as Parameters<typeof tsEvolution.getEvolutionProgress>[0],
      events,
      evolutionData as Parameters<typeof tsEvolution.getEvolutionProgress>[2],
      monstersData as Parameters<typeof tsEvolution.getEvolutionProgress>[3],
    );
    expect(tsResult).toEqual(jsResult);
  });

  it('checkPartyEvolutions produces identical results', () => {
    const party = [
      makeMon({ id: 1, evolvesTo: 10 }),
      makeMon({ id: 2 }),
    ];
    const events = { commits: 10 };

    const jsResult = jsEvolution.checkPartyEvolutions(party, events, evolutionData, monstersData);
    const tsResult = tsEvolution.checkPartyEvolutions(
      party as Parameters<typeof tsEvolution.checkPartyEvolutions>[0],
      events,
      evolutionData as Parameters<typeof tsEvolution.checkPartyEvolutions>[2],
      monstersData as Parameters<typeof tsEvolution.checkPartyEvolutions>[3],
    );
    expect(tsResult).toEqual(jsResult);
  });
});
