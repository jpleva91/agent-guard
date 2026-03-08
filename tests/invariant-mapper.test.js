import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test, suite } from './run.js';
import {
  violationToMonster,
  isViolationEvent,
  VIOLATION_MONSTER_MAP,
} from '../domain/ingestion/invariant-mapper.js';

const root = new URL('../', import.meta.url);
const monsters = JSON.parse(
  await readFile(new URL('ecosystem/data/monsters.json', root), 'utf-8'),
);

suite('Invariant Mapper (domain/ingestion/invariant-mapper.js)', () => {
  // --- violationToMonster ---

  test('maps test_result violation to InvariantBeast (id 32)', () => {
    const event = {
      kind: 'InvariantViolation',
      invariant: 'tests_pass',
      expected: 'all tests pass',
      actual: 'tests failed',
      metadata: { type: 'test_result', severity: 4 },
    };
    const result = violationToMonster(event, monsters);
    assert.ok(result);
    assert.strictEqual(result.monster.id, 32);
    assert.strictEqual(result.monster.name, 'InvariantBeast');
    assert.strictEqual(result.confidence, 1.0);
  });

  test('maps action violation to RogueAgent (id 33)', () => {
    const event = {
      kind: 'InvariantViolation',
      invariant: 'no_shell_execution',
      expected: "action !== 'shell.exec'",
      actual: "action = 'shell.exec'",
      metadata: { type: 'action', severity: 5 },
    };
    const result = violationToMonster(event, monsters);
    assert.ok(result);
    assert.strictEqual(result.monster.id, 33);
    assert.strictEqual(result.monster.name, 'RogueAgent');
  });

  test('maps dependency violation to ChaosHydra (id 34)', () => {
    const event = {
      kind: 'InvariantViolation',
      invariant: 'core_isolation',
      expected: 'core must not depend on game',
      actual: 'core/matcher.js → game/renderer.js',
      metadata: { type: 'dependency', severity: 3 },
    };
    const result = violationToMonster(event, monsters);
    assert.ok(result);
    assert.strictEqual(result.monster.id, 34);
    assert.strictEqual(result.monster.name, 'ChaosHydra');
  });

  test('applies HP bonus based on severity', () => {
    const event = {
      kind: 'InvariantViolation',
      invariant: 'no_shell_execution',
      expected: 'x',
      actual: 'y',
      metadata: { type: 'action', severity: 5 },
    };
    const result = violationToMonster(event, monsters);
    const baseMonster = monsters.find((m) => m.id === 33);
    assert.strictEqual(result.hpBonus, 12); // (5-1)*3
    assert.strictEqual(result.monster.hp, baseMonster.hp + 12);
    assert.strictEqual(result.monster.currentHP, baseMonster.hp + 12);
  });

  test('defaults severity to 3 when not provided', () => {
    const event = {
      kind: 'InvariantViolation',
      invariant: 'x',
      expected: 'x',
      actual: 'y',
      metadata: { type: 'test_result' },
    };
    const result = violationToMonster(event, monsters);
    assert.strictEqual(result.hpBonus, 6); // (3-1)*3
  });

  test('returns null for unknown violation type', () => {
    const event = {
      kind: 'InvariantViolation',
      invariant: 'x',
      expected: 'x',
      actual: 'y',
      metadata: { type: 'unknown_type' },
    };
    const result = violationToMonster(event, monsters);
    assert.strictEqual(result, null);
  });

  test('returns null when no metadata', () => {
    const event = {
      kind: 'InvariantViolation',
      invariant: 'x',
      expected: 'x',
      actual: 'y',
    };
    const result = violationToMonster(event, monsters);
    assert.strictEqual(result, null);
  });

  // --- isViolationEvent ---

  test('isViolationEvent returns true for InvariantViolation', () => {
    assert.strictEqual(isViolationEvent({ kind: 'InvariantViolation' }), true);
  });

  test('isViolationEvent returns false for other events', () => {
    assert.strictEqual(isViolationEvent({ kind: 'ErrorObserved' }), false);
    assert.strictEqual(isViolationEvent({ kind: 'BugClassified' }), false);
  });

  test('isViolationEvent returns false for null', () => {
    assert.strictEqual(isViolationEvent(null), false);
    assert.strictEqual(isViolationEvent(undefined), false);
  });

  // --- VIOLATION_MONSTER_MAP ---

  test('VIOLATION_MONSTER_MAP has all 3 invariant types', () => {
    assert.strictEqual(VIOLATION_MONSTER_MAP.test_result, 32);
    assert.strictEqual(VIOLATION_MONSTER_MAP.action, 33);
    assert.strictEqual(VIOLATION_MONSTER_MAP.dependency, 34);
  });
});
