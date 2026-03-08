import assert from 'node:assert';
import { test, suite } from './run.js';
import { MODULE_CONTRACTS, validateContract } from '../domain/contracts.js';

suite('Domain Contracts — Contract Validation', () => {
  // --- MODULE_CONTRACTS structure ---

  test('MODULE_CONTRACTS contains expected modules', () => {
    const expected = [
      'domain/battle',
      'domain/encounters',
      'domain/evolution',
      'domain/events',
      'domain/event-bus',
      'domain/event-store',
      'domain/ingestion/pipeline',
      'domain/ingestion/fingerprint',
      'domain/ingestion/classifier',
    ];
    for (const name of expected) {
      assert.ok(MODULE_CONTRACTS[name], `Missing contract for: ${name}`);
    }
  });

  test('each contract has exports, invariants, and dependencies', () => {
    for (const [name, contract] of Object.entries(MODULE_CONTRACTS)) {
      assert.ok(contract.exports, `${name} missing exports`);
      assert.ok(Array.isArray(contract.invariants), `${name} invariants should be an array`);
      assert.ok(contract.invariants.length > 0, `${name} should have at least one invariant`);
      assert.ok(Array.isArray(contract.dependencies), `${name} dependencies should be an array`);
    }
  });

  test('each export has params and returns', () => {
    for (const [name, contract] of Object.entries(MODULE_CONTRACTS)) {
      for (const [exportName, spec] of Object.entries(contract.exports)) {
        assert.ok(Array.isArray(spec.params), `${name}.${exportName} missing params`);
        assert.ok(spec.returns, `${name}.${exportName} missing returns`);
      }
    }
  });

  // --- validateContract ---

  test('validateContract returns error for unknown module', () => {
    const result = validateContract('nonexistent/module', {});
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].includes('Unknown module'));
  });

  test('validateContract detects missing exports', () => {
    const result = validateContract('domain/encounters', {
      shouldEncounter: () => {},
      // missing pickWeightedRandom and checkEncounter
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('pickWeightedRandom')));
    assert.ok(result.errors.some(e => e.includes('checkEncounter')));
  });

  test('validateContract detects non-function exports', () => {
    const result = validateContract('domain/encounters', {
      shouldEncounter: () => {},
      pickWeightedRandom: 'not a function',
      checkEncounter: () => {},
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('pickWeightedRandom') && e.includes('function')));
  });

  test('validateContract passes when all exports are present', () => {
    const result = validateContract('domain/encounters', {
      shouldEncounter: () => {},
      pickWeightedRandom: () => {},
      checkEncounter: () => {},
    });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('validateContract accepts class exports for EventBus', () => {
    const result = validateContract('domain/event-bus', {
      EventBus: class EventBus {},
    });
    assert.strictEqual(result.valid, true);
  });

  // --- Live contract verification against actual modules ---

  test('domain/encounters module satisfies its contract', async () => {
    const mod = await import('../domain/encounters.js');
    const result = validateContract('domain/encounters', mod);
    assert.strictEqual(result.valid, true, `Failures: ${result.errors.join(', ')}`);
  });

  test('domain/events module satisfies its contract', async () => {
    const mod = await import('../domain/events.js');
    const result = validateContract('domain/events', mod);
    assert.strictEqual(result.valid, true, `Failures: ${result.errors.join(', ')}`);
  });

  test('domain/event-bus module satisfies its contract', async () => {
    const mod = await import('../domain/event-bus.js');
    const result = validateContract('domain/event-bus', mod);
    assert.strictEqual(result.valid, true, `Failures: ${result.errors.join(', ')}`);
  });

  test('domain/evolution module satisfies its contract', async () => {
    const mod = await import('../domain/evolution.js');
    const result = validateContract('domain/evolution', mod);
    assert.strictEqual(result.valid, true, `Failures: ${result.errors.join(', ')}`);
  });

  test('domain/event-store module satisfies its contract', async () => {
    const mod = await import('../domain/event-store.js');
    const result = validateContract('domain/event-store', mod);
    assert.strictEqual(result.valid, true, `Failures: ${result.errors.join(', ')}`);
  });

  test('domain/ingestion/fingerprint module satisfies its contract', async () => {
    const mod = await import('../domain/ingestion/fingerprint.js');
    const result = validateContract('domain/ingestion/fingerprint', mod);
    assert.strictEqual(result.valid, true, `Failures: ${result.errors.join(', ')}`);
  });
});
