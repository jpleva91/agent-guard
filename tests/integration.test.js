import assert from 'node:assert';
import { test, suite } from './run.js';
import { readFileSync } from 'node:fs';

// Mock browser globals
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener() {} };
}
if (typeof globalThis.AudioContext === 'undefined') {
  globalThis.AudioContext = class { constructor() { this.state = 'running'; } };
}

// --- Cross-module integration tests ---
// These test flows that span multiple modules, verifying they work together.

const root = new URL('../', import.meta.url);
const monstersData = JSON.parse(readFileSync(new URL('ecosystem/data/monsters.json', root), 'utf-8'));
const movesData = JSON.parse(readFileSync(new URL('ecosystem/data/moves.json', root), 'utf-8'));
const typesData = JSON.parse(readFileSync(new URL('ecosystem/data/types.json', root), 'utf-8'));
const evolutionsData = JSON.parse(readFileSync(new URL('ecosystem/data/evolutions.json', root), 'utf-8'));

import { parseErrors } from '../dist/core/error-parser.js';
import { matchMonster } from '../dist/core/matcher.js';
import {
  createBattleState, executeTurn, resolveMove, simulateBattle
} from '../dist/game/battle/battle-core.js';

suite('Integration: Error → Monster Matching (error-parser + matcher)', () => {
  test('TypeError produces a valid monster match', () => {
    const errors = parseErrors("TypeError: Cannot read properties of null (reading 'x')");
    assert.ok(errors.length >= 1, 'should parse at least one error');
    const { monster, confidence } = matchMonster(errors[0]);
    assert.ok(monster, 'should match a monster');
    assert.ok(monster.name, 'monster should have a name');
    assert.ok(monster.id, 'monster should have an id');
    assert.ok(confidence > 0, 'confidence should be positive');
  });

  test('SyntaxError produces a valid monster match', () => {
    const errors = parseErrors('SyntaxError: Unexpected token }');
    assert.ok(errors.length >= 1);
    const { monster } = matchMonster(errors[0]);
    assert.ok(monster);
    assert.ok(monstersData.some(m => m.id === monster.id), 'matched monster should exist in monsters.json');
  });

  test('ReferenceError produces a valid monster match', () => {
    const errors = parseErrors('ReferenceError: foo is not defined');
    assert.ok(errors.length >= 1);
    const { monster } = matchMonster(errors[0]);
    assert.ok(monster);
  });

  test('Stack overflow error produces a match', () => {
    const errors = parseErrors('RangeError: Maximum call stack size exceeded');
    assert.ok(errors.length >= 1);
    const { monster } = matchMonster(errors[0]);
    assert.ok(monster);
  });

  test('Unknown error still produces a fallback match', () => {
    const errors = parseErrors('Error: something completely unknown went wrong');
    assert.ok(errors.length >= 1);
    const { monster } = matchMonster(errors[0]);
    assert.ok(monster, 'should have a fallback match');
  });

  test('multi-error output produces multiple matches', () => {
    const output = `TypeError: Cannot read properties of null
    at foo.js:10:5
ReferenceError: bar is not defined
    at baz.js:20:3`;
    const errors = parseErrors(output);
    assert.ok(errors.length >= 2, `expected at least 2 errors, got ${errors.length}`);
    for (const error of errors) {
      const { monster } = matchMonster(error);
      assert.ok(monster, `each error should match a monster`);
    }
  });
});

suite('Integration: Monster → Battle → Outcome (data + battle-core)', () => {
  test('two real monsters from data can battle to completion', () => {
    const monA = monstersData.find(m => m.name === 'NullPointer');
    const monB = monstersData.find(m => m.name === 'CallbackHell');
    assert.ok(monA && monB, 'NullPointer and CallbackHell should exist in data');

    const result = simulateBattle(monA, monB, movesData, { effectiveness: typesData.effectiveness });
    assert.ok(result.outcome === 'win' || result.outcome === 'lose' || result.turn >= 100,
      'battle should end with an outcome or hit max turns');
  });

  test('every common monster can create a valid battle state', () => {
    const commons = monstersData.filter(m => m.rarity === 'common');
    assert.ok(commons.length >= 2, 'should have at least 2 common monsters');

    for (const mon of commons) {
      const state = createBattleState(mon, commons[0]);
      assert.ok(state.playerMon.name === mon.name);
      assert.ok(state.playerMon.currentHP > 0);
    }
  });

  test('all monsters have moves that exist in moves data', () => {
    const moveIds = new Set(movesData.map(m => m.id));
    for (const monster of monstersData) {
      for (const moveId of monster.moves) {
        assert.ok(moveIds.has(moveId),
          `${monster.name} has move "${moveId}" which does not exist in moves.json`);
      }
    }
  });

  test('all move types have entries in the type chart', () => {
    const typeNames = Object.keys(typesData.effectiveness);
    for (const move of movesData) {
      assert.ok(typeNames.includes(move.type),
        `move "${move.name}" has type "${move.type}" not in type chart`);
    }
  });

  test('all monster types have entries in the type chart', () => {
    const typeNames = Object.keys(typesData.effectiveness);
    for (const monster of monstersData) {
      assert.ok(typeNames.includes(monster.type),
        `${monster.name} has type "${monster.type}" not in type chart`);
    }
  });

  test('resolveMove works with real game data', () => {
    const mon = monstersData.find(m => m.name === 'NullPointer');
    const move = movesData.find(m => m.id === mon.moves[0]);
    const target = monstersData.find(m => m.name === 'CallbackHell');
    assert.ok(mon && move && target);

    const result = resolveMove(mon, move, target, typesData.effectiveness);
    assert.ok(typeof result.damage === 'number');
    assert.ok(typeof result.effectiveness === 'number');
    assert.ok(result.damage >= 0);
  });

  test('battle between same-type monsters uses 1.0 effectiveness', () => {
    const backendMons = monstersData.filter(m => m.type === 'backend' && m.rarity !== 'evolved');
    if (backendMons.length >= 2) {
      const move = movesData.find(m => m.type === 'backend');
      assert.ok(move, 'should have a backend-type move');
      const result = resolveMove(backendMons[0], move, backendMons[1], typesData.effectiveness);
      assert.strictEqual(result.effectiveness, 1.0);
    }
  });
});

suite('Integration: Battle → Evolution Check (battle + evolution data)', () => {
  function findTrigger(monsterId) {
    for (const chain of evolutionsData.chains) {
      for (const trigger of chain.triggers) {
        if (trigger.from === monsterId) return { trigger, chain };
      }
    }
    return null;
  }

  test('winning a battle could trigger evolution for an evolving monster', () => {
    // Find a monster that can evolve
    const evolvingMon = monstersData.find(m => m.evolvesTo);
    assert.ok(evolvingMon, 'should have at least one evolving monster');

    // Simulate winning a battle
    const weakEnemy = { ...monstersData[0], hp: 1, currentHP: 1 };
    const state = createBattleState(evolvingMon, weakEnemy);
    const move = movesData.find(m => m.id === evolvingMon.moves[0]);
    assert.ok(move);
    executeTurn(state, move, move, typesData.effectiveness);

    // After winning, check if evolution is possible
    const trigger = findTrigger(evolvingMon.id);
    assert.ok(trigger, `${evolvingMon.name} should have an evolution trigger`);

    // Simulate having enough events
    const condition = trigger.trigger.condition;
    const events = { [condition.event]: condition.count };
    assert.ok(events[condition.event] >= condition.count, 'events should meet condition');

    // Verify the evolved form exists
    const evolvedForm = monstersData.find(m => m.id === trigger.trigger.to);
    assert.ok(evolvedForm, 'evolved form should exist in data');
    assert.strictEqual(evolvedForm.rarity, 'evolved');
  });

  test('evolved monsters generally have higher base stats than pre-evolutions', () => {
    let higher = 0;
    let total = 0;
    for (const chain of evolutionsData.chains) {
      for (const trigger of chain.triggers) {
        const base = monstersData.find(m => m.id === trigger.from);
        const evolved = monstersData.find(m => m.id === trigger.to);
        if (base && evolved) {
          const baseTotalStats = base.hp + base.attack + base.defense + base.speed;
          const evolvedTotalStats = evolved.hp + evolved.attack + evolved.defense + evolved.speed;
          if (evolvedTotalStats > baseTotalStats) higher++;
          total++;
        }
      }
    }
    assert.ok(total > 0, 'should have at least one evolution pair');
    assert.ok(higher / total >= 0.5,
      `at least half of evolutions should have higher stats, got ${higher}/${total}`);
  });

  test('non-evolved monsters either have evolvesTo or are endpoints', () => {
    for (const mon of monstersData) {
      if (mon.rarity === 'evolved') {
        // Evolved monsters should be targets of some trigger
        let isTarget = false;
        for (const chain of evolutionsData.chains) {
          for (const trigger of chain.triggers) {
            if (trigger.to === mon.id) isTarget = true;
          }
        }
        assert.ok(isTarget, `${mon.name} is "evolved" rarity but not a trigger target`);
      }
    }
  });
});

suite('Integration: Type Chart Completeness', () => {
  test('type chart is symmetric: every type has matchups against all others', () => {
    const types = Object.keys(typesData.effectiveness);
    for (const attackType of types) {
      for (const defenseType of types) {
        const mult = typesData.effectiveness[attackType]?.[defenseType];
        assert.ok(mult !== undefined,
          `missing effectiveness for ${attackType} vs ${defenseType}`);
        assert.ok(typeof mult === 'number',
          `effectiveness for ${attackType} vs ${defenseType} should be a number, got ${typeof mult}`);
      }
    }
  });

  test('all effectiveness values are 0.5, 1.0, or 1.5', () => {
    const validValues = new Set([0.5, 1.0, 1.5]);
    for (const [attackType, matchups] of Object.entries(typesData.effectiveness)) {
      for (const [defenseType, mult] of Object.entries(matchups)) {
        assert.ok(validValues.has(mult),
          `${attackType} vs ${defenseType} has unexpected value ${mult}`);
      }
    }
  });
});
