import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test, suite } from './run.js';
import {
  validateInvariant,
  loadInvariants,
  evaluateInvariant,
  evaluateAll,
  violationFingerprint,
  violationToEncounterParams,
  INVARIANT_TYPES,
  SEVERITY,
} from '../domain/invariants.js';
import { INVARIANT_VIOLATION } from '../domain/events.js';

const root = new URL('../', import.meta.url);
const monsters = JSON.parse(
  await readFile(new URL('ecosystem/data/monsters.json', root), 'utf-8'),
);

// --- Sample invariants for testing ---
const TEST_INVARIANTS = {
  invariants: [
    {
      id: 'tests_pass',
      name: 'Tests Must Pass',
      type: 'test_result',
      condition: "result === 'pass'",
      severity: 4,
      description: 'All tests must pass',
    },
    {
      id: 'no_shell_execution',
      name: 'No Shell Execution',
      type: 'action',
      condition: "action !== 'shell.exec'",
      severity: 5,
      description: 'Shell execution forbidden',
    },
    {
      id: 'core_isolation',
      name: 'Core Isolation',
      type: 'dependency',
      condition: "source.layer !== 'core' || target.layer !== 'game'",
      severity: 3,
      description: 'Core must not depend on game',
    },
  ],
};

suite('Invariant Enforcement Engine (domain/invariants.js)', () => {
  // --- validateInvariant ---

  test('validateInvariant accepts a valid invariant', () => {
    const result = validateInvariant(TEST_INVARIANTS.invariants[0]);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('validateInvariant rejects null', () => {
    const result = validateInvariant(null);
    assert.strictEqual(result.valid, false);
  });

  test('validateInvariant rejects missing id', () => {
    const result = validateInvariant({ name: 'x', type: 'action', condition: 'y' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('id')));
  });

  test('validateInvariant rejects missing name', () => {
    const result = validateInvariant({ id: 'x', type: 'action', condition: 'y' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('name')));
  });

  test('validateInvariant rejects unknown type', () => {
    const result = validateInvariant({
      id: 'x',
      name: 'y',
      type: 'unknown_type',
      condition: 'z',
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Unknown invariant type')));
  });

  test('validateInvariant rejects missing condition', () => {
    const result = validateInvariant({ id: 'x', name: 'y', type: 'action' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('condition')));
  });

  // --- loadInvariants ---

  test('loadInvariants loads valid config', () => {
    const result = loadInvariants(TEST_INVARIANTS);
    assert.strictEqual(result.invariants.length, 3);
    assert.strictEqual(result.errors.length, 0);
  });

  test('loadInvariants filters invalid invariants', () => {
    const config = {
      invariants: [
        TEST_INVARIANTS.invariants[0],
        { id: 'bad', type: 'fake' }, // missing name, condition, bad type
      ],
    };
    const result = loadInvariants(config);
    assert.strictEqual(result.invariants.length, 1);
    assert.ok(result.errors.length > 0);
  });

  test('loadInvariants handles null config', () => {
    const result = loadInvariants(null);
    assert.strictEqual(result.invariants.length, 0);
    assert.ok(result.errors.length > 0);
  });

  test('loadInvariants handles config without invariants array', () => {
    const result = loadInvariants({});
    assert.strictEqual(result.invariants.length, 0);
  });

  // --- evaluateInvariant: test_result ---

  test('evaluateInvariant returns null when test passes', () => {
    const inv = TEST_INVARIANTS.invariants[0];
    const result = evaluateInvariant(inv, { result: 'pass' });
    assert.strictEqual(result, null);
  });

  test('evaluateInvariant returns violation when test fails', () => {
    const inv = TEST_INVARIANTS.invariants[0];
    const result = evaluateInvariant(inv, { result: 'fail', failed: 3 });
    assert.ok(result !== null);
    assert.strictEqual(result.kind, INVARIANT_VIOLATION);
    assert.strictEqual(result.invariant, 'tests_pass');
    assert.ok(result.actual.includes('3 failures'));
  });

  // --- evaluateInvariant: action ---

  test('evaluateInvariant returns null for allowed action', () => {
    const inv = TEST_INVARIANTS.invariants[1];
    const result = evaluateInvariant(inv, { action: 'file.write' });
    assert.strictEqual(result, null);
  });

  test('evaluateInvariant returns violation for forbidden action', () => {
    const inv = TEST_INVARIANTS.invariants[1];
    const result = evaluateInvariant(inv, { action: 'shell.exec' });
    assert.ok(result !== null);
    assert.strictEqual(result.kind, INVARIANT_VIOLATION);
    assert.strictEqual(result.invariant, 'no_shell_execution');
  });

  // --- evaluateInvariant: dependency ---

  test('evaluateInvariant returns null for valid dependency', () => {
    const inv = TEST_INVARIANTS.invariants[2];
    const result = evaluateInvariant(inv, {
      source: { layer: 'core', module: 'matcher.js' },
      target: { layer: 'domain', module: 'events.js' },
    });
    assert.strictEqual(result, null);
  });

  test('evaluateInvariant returns violation for forbidden dependency', () => {
    const inv = TEST_INVARIANTS.invariants[2];
    const result = evaluateInvariant(inv, {
      source: { layer: 'core', module: 'matcher.js' },
      target: { layer: 'game', module: 'renderer.js' },
    });
    assert.ok(result !== null);
    assert.strictEqual(result.kind, INVARIANT_VIOLATION);
    assert.strictEqual(result.invariant, 'core_isolation');
    assert.ok(result.actual.includes('core/matcher.js'));
    assert.ok(result.actual.includes('game/renderer.js'));
  });

  // --- evaluateInvariant: unknown type ---

  test('evaluateInvariant returns null for unknown type', () => {
    const result = evaluateInvariant(
      { id: 'x', name: 'y', type: 'nonexistent', condition: 'z' },
      {},
    );
    assert.strictEqual(result, null);
  });

  // --- evaluateAll ---

  test('evaluateAll returns empty array when no violations', () => {
    const results = evaluateAll(TEST_INVARIANTS.invariants, {
      result: 'pass',
      action: 'file.write',
      source: { layer: 'game', module: 'a.js' },
      target: { layer: 'game', module: 'b.js' },
    });
    assert.strictEqual(results.length, 0);
  });

  test('evaluateAll returns violations for failing invariants', () => {
    const results = evaluateAll(TEST_INVARIANTS.invariants, {
      result: 'fail',
      failed: 2,
      action: 'shell.exec',
      source: { layer: 'core', module: 'a.js' },
      target: { layer: 'game', module: 'b.js' },
    });
    assert.strictEqual(results.length, 3);
    for (const r of results) {
      assert.strictEqual(r.kind, INVARIANT_VIOLATION);
    }
  });

  // --- Violation event structure ---

  test('violation event has correct metadata', () => {
    const inv = TEST_INVARIANTS.invariants[1];
    const result = evaluateInvariant(inv, { action: 'shell.exec' });
    assert.strictEqual(result.metadata.name, 'No Shell Execution');
    assert.strictEqual(result.metadata.type, 'action');
    assert.strictEqual(result.metadata.severity, 5);
    assert.strictEqual(result.metadata.description, 'Shell execution forbidden');
  });

  test('violation event has id and timestamp', () => {
    const inv = TEST_INVARIANTS.invariants[0];
    const result = evaluateInvariant(inv, { result: 'fail', failed: 1 });
    assert.ok(result.id.startsWith('evt_'));
    assert.strictEqual(typeof result.timestamp, 'number');
  });

  // --- violationFingerprint ---

  test('violationFingerprint produces stable output', () => {
    const fp1 = violationFingerprint('tests_pass', 'tests failed');
    const fp2 = violationFingerprint('tests_pass', 'tests failed');
    assert.strictEqual(fp1, fp2);
  });

  test('violationFingerprint differs for different inputs', () => {
    const fp1 = violationFingerprint('tests_pass', 'tests failed');
    const fp2 = violationFingerprint('no_shell', 'shell.exec');
    assert.notStrictEqual(fp1, fp2);
  });

  // --- violationToEncounterParams ---

  test('violationToEncounterParams returns correct HP bonus', () => {
    assert.deepStrictEqual(violationToEncounterParams(3), { hpBonus: 6, isBoss: false });
    assert.deepStrictEqual(violationToEncounterParams(4), { hpBonus: 9, isBoss: true });
    assert.deepStrictEqual(violationToEncounterParams(5), { hpBonus: 12, isBoss: true });
  });

  test('violationToEncounterParams marks severity >= 4 as boss', () => {
    assert.strictEqual(violationToEncounterParams(3).isBoss, false);
    assert.strictEqual(violationToEncounterParams(4).isBoss, true);
    assert.strictEqual(violationToEncounterParams(5).isBoss, true);
  });

  // --- Constants ---

  test('INVARIANT_TYPES has expected values', () => {
    assert.strictEqual(INVARIANT_TYPES.test_result, 'test_result');
    assert.strictEqual(INVARIANT_TYPES.action, 'action');
    assert.strictEqual(INVARIANT_TYPES.dependency, 'dependency');
  });

  test('SEVERITY has expected values', () => {
    assert.strictEqual(SEVERITY.LOW, 2);
    assert.strictEqual(SEVERITY.MEDIUM, 3);
    assert.strictEqual(SEVERITY.HIGH, 4);
    assert.strictEqual(SEVERITY.CRITICAL, 5);
  });

  // --- Violation monsters exist in monsters.json ---

  test('InvariantBeast monster exists (id 32)', () => {
    const mon = monsters.find((m) => m.id === 32);
    assert.ok(mon, 'InvariantBeast should exist');
    assert.strictEqual(mon.name, 'InvariantBeast');
    assert.strictEqual(mon.type, 'testing');
  });

  test('RogueAgent monster exists (id 33)', () => {
    const mon = monsters.find((m) => m.id === 33);
    assert.ok(mon, 'RogueAgent should exist');
    assert.strictEqual(mon.name, 'RogueAgent');
    assert.strictEqual(mon.type, 'security');
  });

  test('ChaosHydra monster exists (id 34)', () => {
    const mon = monsters.find((m) => m.id === 34);
    assert.ok(mon, 'ChaosHydra should exist');
    assert.strictEqual(mon.name, 'ChaosHydra');
    assert.strictEqual(mon.type, 'architecture');
  });
});
