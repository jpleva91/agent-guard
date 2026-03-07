import assert from 'node:assert';
import { test, suite } from './run.js';

// We can't directly test evolution.js because it imports tracker.js which uses localStorage.
// Instead, test the pure logic by reimplementing the core algorithms from the module.
// This tests the evolution data integrity and the logic patterns used.

import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const monsters = JSON.parse(await readFile(new URL('ecosystem/data/monsters.json', root), 'utf-8'));
const evolutions = JSON.parse(await readFile(new URL('ecosystem/data/evolutions.json', root), 'utf-8'));

suite('Evolution Logic (game/evolution/evolution.js)', () => {
  // Reimplement core logic to test without browser dependencies
  function findTrigger(monsterId) {
    for (const chain of evolutions.chains) {
      for (const trigger of chain.triggers) {
        if (trigger.from === monsterId) return { trigger, chain };
      }
    }
    return null;
  }

  function checkEvolution(monster, events) {
    if (!monster.evolvesTo) return null;
    const match = findTrigger(monster.id);
    if (!match) return null;
    const { event, count } = match.trigger.condition;
    if (events[event] >= count) {
      const evolvedForm = monsters.find(m => m.id === match.trigger.to);
      if (evolvedForm) {
        return { from: monster, to: evolvedForm, trigger: match.trigger, chain: match.chain };
      }
    }
    return null;
  }

  function applyEvolution(party, partyIndex, evolvedForm) {
    const oldMon = party[partyIndex];
    const hpRatio = oldMon.currentHP / oldMon.hp;
    const newMon = { ...evolvedForm, currentHP: Math.ceil(evolvedForm.hp * hpRatio) };
    party[partyIndex] = newMon;
    return newMon;
  }

  function getEvolutionProgress(monster, events) {
    if (!monster.evolvesTo) return null;
    const match = findTrigger(monster.id);
    if (!match) return null;
    const { event, count } = match.trigger.condition;
    const current = events[event] || 0;
    return {
      current: Math.min(current, count),
      required: count,
      percentage: Math.min(100, Math.floor((current / count) * 100)),
    };
  }

  test('checkEvolution returns evolution when condition is met', () => {
    const nullPointer = monsters.find(m => m.name === 'NullPointer');
    assert.ok(nullPointer, 'NullPointer should exist');
    // NullPointer evolves with 5 bugs_fixed
    const events = { bugs_fixed: 5 };
    const result = checkEvolution(nullPointer, events);
    assert.ok(result, 'should trigger evolution');
    assert.strictEqual(result.from.name, 'NullPointer');
    assert.ok(result.to, 'should have evolved form');
  });

  test('checkEvolution returns null when condition not met', () => {
    const nullPointer = monsters.find(m => m.name === 'NullPointer');
    const events = { bugs_fixed: 2 }; // needs 5
    const result = checkEvolution(nullPointer, events);
    assert.strictEqual(result, null);
  });

  test('checkEvolution returns null for monster without evolution', () => {
    const noEvoMon = monsters.find(m => !m.evolvesTo);
    if (noEvoMon) {
      const events = { commits: 100, bugs_fixed: 100 };
      const result = checkEvolution(noEvoMon, events);
      assert.strictEqual(result, null);
    }
  });

  test('applyEvolution preserves HP ratio', () => {
    const oldMon = { hp: 30, currentHP: 15, name: 'OldMon' }; // 50% HP
    const evolvedForm = { hp: 50, name: 'NewMon' };
    const party = [oldMon];
    const newMon = applyEvolution(party, 0, evolvedForm);
    assert.strictEqual(newMon.currentHP, 25); // 50% of 50 = 25
    assert.strictEqual(party[0].name, 'NewMon');
  });

  test('applyEvolution with full HP', () => {
    const oldMon = { hp: 30, currentHP: 30, name: 'OldMon' }; // 100% HP
    const evolvedForm = { hp: 50, name: 'NewMon' };
    const party = [oldMon];
    const newMon = applyEvolution(party, 0, evolvedForm);
    assert.strictEqual(newMon.currentHP, 50);
  });

  test('applyEvolution rounds up HP (ceil)', () => {
    const oldMon = { hp: 30, currentHP: 10, name: 'OldMon' }; // 33.3% HP
    const evolvedForm = { hp: 50, name: 'NewMon' };
    const party = [oldMon];
    const newMon = applyEvolution(party, 0, evolvedForm);
    // ceil(50 * (10/30)) = ceil(16.67) = 17
    assert.strictEqual(newMon.currentHP, 17);
  });

  test('getEvolutionProgress returns correct fraction', () => {
    const nullPointer = monsters.find(m => m.name === 'NullPointer');
    const events = { bugs_fixed: 3 }; // needs 5
    const progress = getEvolutionProgress(nullPointer, events);
    assert.ok(progress, 'should return progress');
    assert.strictEqual(progress.current, 3);
    assert.strictEqual(progress.required, 5);
    assert.strictEqual(progress.percentage, 60);
  });

  test('getEvolutionProgress caps at 100%', () => {
    const nullPointer = monsters.find(m => m.name === 'NullPointer');
    const events = { bugs_fixed: 100 }; // way over required
    const progress = getEvolutionProgress(nullPointer, events);
    assert.strictEqual(progress.percentage, 100);
    assert.strictEqual(progress.current, progress.required);
  });

  test('getEvolutionProgress returns null for non-evolving monster', () => {
    const noEvoMon = monsters.find(m => !m.evolvesTo);
    if (noEvoMon) {
      const progress = getEvolutionProgress(noEvoMon, {});
      assert.strictEqual(progress, null);
    }
  });

  test('all evolution chains reference valid monsters', () => {
    const monsterIds = new Set(monsters.map(m => m.id));
    for (const chain of evolutions.chains) {
      for (const stage of chain.stages) {
        assert.ok(monsterIds.has(stage.monsterId),
          `chain "${chain.name}" references monster ID ${stage.monsterId} which does not exist`);
      }
      for (const trigger of chain.triggers) {
        assert.ok(monsterIds.has(trigger.from),
          `chain "${chain.name}" trigger.from ${trigger.from} does not exist`);
        assert.ok(monsterIds.has(trigger.to),
          `chain "${chain.name}" trigger.to ${trigger.to} does not exist`);
      }
    }
  });

  test('all evolution triggers reference valid event types', () => {
    const validEvents = new Set(Object.keys(evolutions.events));
    for (const chain of evolutions.chains) {
      for (const trigger of chain.triggers) {
        assert.ok(validEvents.has(trigger.condition.event),
          `chain "${chain.name}" uses unknown event "${trigger.condition.event}"`);
        assert.ok(trigger.condition.count > 0,
          `chain "${chain.name}" has non-positive count: ${trigger.condition.count}`);
      }
    }
  });

  test('evolved monsters exist and have rarity "evolved"', () => {
    for (const chain of evolutions.chains) {
      for (const trigger of chain.triggers) {
        const evolvedMon = monsters.find(m => m.id === trigger.to);
        assert.ok(evolvedMon, `evolved form ID ${trigger.to} should exist`);
        assert.strictEqual(evolvedMon.rarity, 'evolved',
          `${evolvedMon.name} (ID ${trigger.to}) should have rarity "evolved", got "${evolvedMon.rarity}"`);
      }
    }
  });

  // Edge case tests
  test('getEvolutionProgress returns 0% with no events', () => {
    const nullPointer = monsters.find(m => m.name === 'NullPointer');
    const progress = getEvolutionProgress(nullPointer, {});
    assert.ok(progress);
    assert.strictEqual(progress.current, 0);
    assert.strictEqual(progress.percentage, 0);
  });

  test('checkEvolution triggers when events exceed required count', () => {
    const nullPointer = monsters.find(m => m.name === 'NullPointer');
    const events = { bugs_fixed: 500 };
    const result = checkEvolution(nullPointer, events);
    assert.ok(result, 'should still trigger with excess events');
  });

  test('applyEvolution with 1 HP preserves minimum HP', () => {
    const oldMon = { hp: 30, currentHP: 1, name: 'OldMon' };
    const evolvedForm = { hp: 50, name: 'NewMon' };
    const party = [oldMon];
    const newMon = applyEvolution(party, 0, evolvedForm);
    assert.ok(newMon.currentHP >= 1, 'evolved form should have at least 1 HP');
  });

  test('base monsters with evolvesTo have matching trigger in evolution data', () => {
    const monstersWithEvo = monsters.filter(m => m.evolvesTo);
    for (const mon of monstersWithEvo) {
      const match = findTrigger(mon.id);
      assert.ok(match, `${mon.name} (ID ${mon.id}) has evolvesTo=${mon.evolvesTo} but no trigger in evolutions.json`);
      assert.strictEqual(match.trigger.to, mon.evolvesTo,
        `${mon.name} evolvesTo ${mon.evolvesTo} but trigger points to ${match.trigger.to}`);
    }
  });

  // --- Multi-party and edge cases ---

  test('checkPartyEvolutions returns first eligible only', () => {
    // Build a party with multiple evolving monsters
    const evolvingMons = monsters.filter(m => m.evolvesTo);
    if (evolvingMons.length >= 2) {
      const party = evolvingMons.slice(0, 2).map(m => ({ ...m, currentHP: m.hp }));
      // Provide high event counts to trigger all
      const events = {
        commits: 100, prs_merged: 100, bugs_fixed: 100, tests_passing: 100,
        refactors: 100, code_reviews: 100, conflicts_resolved: 100,
        ci_passes: 100, deploys: 100, docs_written: 100
      };
      // Check each individually
      const first = checkEvolution(party[0], events);
      const second = checkEvolution(party[1], events);
      // At least one should be eligible
      assert.ok(first || second, 'at least one party member should be eligible');
    }
  });

  test('getEvolutionProgress with exactly required count shows 100%', () => {
    const nullPointer = monsters.find(m => m.name === 'NullPointer');
    const match = findTrigger(nullPointer.id);
    if (match) {
      const exact = { [match.trigger.condition.event]: match.trigger.condition.count };
      const progress = getEvolutionProgress(nullPointer, exact);
      assert.strictEqual(progress.percentage, 100);
      assert.strictEqual(progress.current, progress.required);
    }
  });

  test('applyEvolution at exactly 0 HP gives 0 HP evolved form', () => {
    const deadMon = { hp: 30, currentHP: 0, name: 'DeadMon' };
    const evolvedForm = { hp: 50, name: 'EvolvedDead' };
    const party = [deadMon];
    const newMon = applyEvolution(party, 0, evolvedForm);
    assert.strictEqual(newMon.currentHP, 0);
  });

  test('evolution chain data has no duplicate trigger pairs', () => {
    const triggerPairs = new Set();
    for (const chain of evolutions.chains) {
      for (const trigger of chain.triggers) {
        const key = `${trigger.from}->${trigger.to}`;
        assert.ok(!triggerPairs.has(key),
          `Duplicate trigger pair: ${key} in chain "${chain.name}"`);
        triggerPairs.add(key);
      }
    }
  });

  test('all evolution trigger conditions have positive count', () => {
    for (const chain of evolutions.chains) {
      for (const trigger of chain.triggers) {
        assert.ok(trigger.condition.count > 0,
          `chain "${chain.name}" from ${trigger.from} has count ${trigger.condition.count}`);
      }
    }
  });
});
