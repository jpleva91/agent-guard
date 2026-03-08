import assert from 'node:assert';
import { test, suite } from './run.js';
import { BOSSES, BOSS_TRIGGERS, checkBossEncounter } from '../dist/ecosystem/bosses.js';

suite('Boss encounters (ecosystem/bosses.js)', () => {
  test('all bosses have required fields', () => {
    for (const boss of BOSSES) {
      assert.ok(boss.id, `Boss missing id`);
      assert.ok(boss.name, `Boss ${boss.id} missing name`);
      assert.ok(boss.type, `Boss ${boss.id} missing type`);
      assert.ok(boss.trigger, `Boss ${boss.id} missing trigger`);
      assert.ok(typeof boss.hp === 'number' && boss.hp > 0, `Boss ${boss.id} invalid hp`);
      assert.ok(typeof boss.attack === 'number' && boss.attack > 0, `Boss ${boss.id} invalid attack`);
      assert.ok(typeof boss.defense === 'number' && boss.defense >= 0, `Boss ${boss.id} invalid defense`);
      assert.ok(typeof boss.speed === 'number' && boss.speed > 0, `Boss ${boss.id} invalid speed`);
      assert.ok(Array.isArray(boss.moves) && boss.moves.length > 0, `Boss ${boss.id} needs moves`);
      assert.strictEqual(boss.rarity, 'boss');
    }
  });

  test('each boss trigger has a matching BOSS_TRIGGERS entry', () => {
    for (const boss of BOSSES) {
      assert.ok(BOSS_TRIGGERS[boss.trigger],
        `Boss ${boss.name} trigger "${boss.trigger}" not found in BOSS_TRIGGERS`);
    }
  });

  test('BOSS_TRIGGERS have valid thresholds', () => {
    for (const [id, trigger] of Object.entries(BOSS_TRIGGERS)) {
      assert.ok(typeof trigger.threshold === 'number' && trigger.threshold > 0,
        `Trigger ${id} must have positive threshold`);
      assert.ok(['session', 'single'].includes(trigger.window),
        `Trigger ${id} must have window 'session' or 'single'`);
    }
  });

  test('checkBossEncounter returns null when thresholds not met', () => {
    const counts = new Map();
    counts.set('assertion', 0);
    const result = checkBossEncounter(counts, '');
    assert.strictEqual(result, null);
  });

  test('checkBossEncounter returns null with empty counts', () => {
    const result = checkBossEncounter(new Map(), '');
    assert.strictEqual(result, null);
  });

  test('checkBossEncounter triggers on session error type threshold', () => {
    const counts = new Map();
    counts.set('assertion', 3); // Meets multiple-test-failures threshold
    const result = checkBossEncounter(counts, '');
    assert.ok(result, 'Should trigger a boss encounter');
    assert.strictEqual(result.trigger, 'multiple-test-failures');
    assert.strictEqual(result.boss.id, 'test-suite-hydra');
  });

  test('checkBossEncounter triggers on single-window pattern match', () => {
    const counts = new Map();
    const result = checkBossEncounter(counts, 'ERESOLVE unable to resolve dependency tree');
    assert.ok(result, 'Should trigger boss on ERESOLVE pattern');
    assert.strictEqual(result.trigger, 'npm-conflict');
    assert.strictEqual(result.boss.id, 'dependency-kraken');
  });

  test('checkBossEncounter triggers type-explosion on 10 type errors', () => {
    const counts = new Map();
    counts.set('null-reference', 5);
    counts.set('type-mismatch', 3);
    counts.set('type-error', 2);
    const result = checkBossEncounter(counts, '');
    assert.ok(result);
    assert.strictEqual(result.trigger, 'type-explosion');
  });

  test('checkBossEncounter does not trigger session patterns via message alone', () => {
    // heap-growth has patterns but window='session', so errorTypes must be checked
    const counts = new Map();
    // Below threshold
    counts.set('memory-leak', 0);
    const result = checkBossEncounter(counts, 'heap out of memory');
    // Should not trigger because memory-leak count is 0 (below threshold of 1)
    // But heap-growth also has patterns — let's verify behavior
    // The code only checks patterns for window='single', so this should be null
    assert.strictEqual(result, null);
  });
});
