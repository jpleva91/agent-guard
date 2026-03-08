import assert from 'node:assert';
import { test, suite } from './run.js';
import {
  createEvent,
  validateEvent,
  ALL_EVENT_KINDS,
  ERROR_OBSERVED,
  BUG_CLASSIFIED,
  ENCOUNTER_STARTED,
  MOVE_USED,
  DAMAGE_DEALT,
  HEALING_APPLIED,
  PASSIVE_ACTIVATED,
  BUGMON_FAINTED,
  CACHE_ATTEMPTED,
  CACHE_SUCCESS,
  BATTLE_ENDED,
  ACTIVITY_RECORDED,
  EVOLUTION_TRIGGERED,
  STATE_CHANGED,
  RUN_STARTED,
  RUN_ENDED,
  CHECKPOINT_REACHED,
} from '../domain/events.js';

suite('Domain Events — Schema Validation', () => {
  test('ALL_EVENT_KINDS contains all 17 event kinds', () => {
    assert.strictEqual(ALL_EVENT_KINDS.size, 17);
    assert.ok(ALL_EVENT_KINDS.has(ERROR_OBSERVED));
    assert.ok(ALL_EVENT_KINDS.has(BATTLE_ENDED));
    assert.ok(ALL_EVENT_KINDS.has(STATE_CHANGED));
  });

  // --- createEvent structure ---

  test('createEvent returns object with kind and timestamp', () => {
    const event = createEvent(ERROR_OBSERVED, { message: 'fail' });
    assert.strictEqual(event.kind, ERROR_OBSERVED);
    assert.strictEqual(typeof event.timestamp, 'number');
    assert.strictEqual(event.message, 'fail');
  });

  test('createEvent spreads data fields onto the event', () => {
    const event = createEvent(DAMAGE_DEALT, { amount: 10, target: 'enemy' });
    assert.strictEqual(event.amount, 10);
    assert.strictEqual(event.target, 'enemy');
  });

  // --- createEvent validation: unknown kind ---

  test('createEvent throws on unknown event kind', () => {
    assert.throws(
      () => createEvent('NonExistentKind', {}),
      (err) => err.message.includes('Unknown event kind'),
    );
  });

  // --- createEvent validation: missing required fields ---

  test('createEvent throws when ERROR_OBSERVED missing message', () => {
    assert.throws(
      () => createEvent(ERROR_OBSERVED, {}),
      (err) => err.message.includes('message'),
    );
  });

  test('createEvent throws when BUG_CLASSIFIED missing required fields', () => {
    assert.throws(
      () => createEvent(BUG_CLASSIFIED, { severity: 2 }),
      (err) => err.message.includes('speciesId'),
    );
  });

  test('createEvent throws when MOVE_USED missing attacker', () => {
    assert.throws(
      () => createEvent(MOVE_USED, { move: 'slash' }),
      (err) => err.message.includes('attacker'),
    );
  });

  test('createEvent throws when EVOLUTION_TRIGGERED missing fields', () => {
    assert.throws(
      () => createEvent(EVOLUTION_TRIGGERED, {}),
      (err) => err.message.includes('from') && err.message.includes('to'),
    );
  });

  // --- createEvent validation: success with required fields ---

  test('createEvent succeeds for ERROR_OBSERVED with required fields', () => {
    const event = createEvent(ERROR_OBSERVED, { message: 'null ref' });
    assert.strictEqual(event.kind, ERROR_OBSERVED);
    assert.strictEqual(event.message, 'null ref');
  });

  test('createEvent succeeds for BUG_CLASSIFIED with required fields', () => {
    const event = createEvent(BUG_CLASSIFIED, {
      severity: 2,
      speciesId: 1,
    });
    assert.strictEqual(event.severity, 2);
    assert.strictEqual(event.speciesId, 1);
  });

  test('createEvent succeeds for ENCOUNTER_STARTED', () => {
    const event = createEvent(ENCOUNTER_STARTED, { enemy: 'NullPointer' });
    assert.strictEqual(event.enemy, 'NullPointer');
  });

  test('createEvent succeeds for HEALING_APPLIED', () => {
    const event = createEvent(HEALING_APPLIED, { amount: 5, target: 'player' });
    assert.strictEqual(event.amount, 5);
  });

  test('createEvent succeeds for PASSIVE_ACTIVATED', () => {
    const event = createEvent(PASSIVE_ACTIVATED, {
      passive: 'regen',
      owner: 'enemy',
    });
    assert.strictEqual(event.passive, 'regen');
  });

  test('createEvent succeeds for BUGMON_FAINTED', () => {
    const event = createEvent(BUGMON_FAINTED, { bugmon: 'MemoryLeak' });
    assert.strictEqual(event.bugmon, 'MemoryLeak');
  });

  test('createEvent succeeds for CACHE_ATTEMPTED', () => {
    const event = createEvent(CACHE_ATTEMPTED, { target: 'enemy' });
    assert.strictEqual(event.target, 'enemy');
  });

  test('createEvent succeeds for CACHE_SUCCESS', () => {
    const event = createEvent(CACHE_SUCCESS, { target: 'enemy' });
    assert.strictEqual(event.target, 'enemy');
  });

  test('createEvent succeeds for BATTLE_ENDED', () => {
    const event = createEvent(BATTLE_ENDED, { result: 'victory' });
    assert.strictEqual(event.result, 'victory');
  });

  test('createEvent succeeds for ACTIVITY_RECORDED', () => {
    const event = createEvent(ACTIVITY_RECORDED, { activity: 'commit' });
    assert.strictEqual(event.activity, 'commit');
  });

  test('createEvent succeeds for STATE_CHANGED', () => {
    const event = createEvent(STATE_CHANGED, { from: 'TITLE', to: 'EXPLORE' });
    assert.strictEqual(event.from, 'TITLE');
    assert.strictEqual(event.to, 'EXPLORE');
  });

  // --- createEvent with optional fields ---

  test('createEvent allows optional fields on ERROR_OBSERVED', () => {
    const event = createEvent(ERROR_OBSERVED, {
      message: 'oops',
      source: 'stderr',
      file: 'main.js',
      line: 42,
    });
    assert.strictEqual(event.source, 'stderr');
    assert.strictEqual(event.file, 'main.js');
    assert.strictEqual(event.line, 42);
  });

  // --- validateEvent ---

  test('validateEvent returns valid for correct event', () => {
    const result = validateEvent({
      kind: DAMAGE_DEALT,
      amount: 10,
      target: 'enemy',
    });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('validateEvent returns errors for missing required fields', () => {
    const result = validateEvent({ kind: DAMAGE_DEALT });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length >= 2);
    assert.ok(result.errors.some((e) => e.includes('amount')));
    assert.ok(result.errors.some((e) => e.includes('target')));
  });

  test('validateEvent returns error for unknown kind', () => {
    const result = validateEvent({ kind: 'Bogus' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].includes('Unknown event kind'));
  });

  test('validateEvent returns error for null input', () => {
    const result = validateEvent(null);
    assert.strictEqual(result.valid, false);
  });

  test('validateEvent returns error for missing kind', () => {
    const result = validateEvent({ message: 'no kind' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].includes('kind'));
  });

  // --- Session event types ---

  test('RUN_STARTED constant is defined', () => {
    assert.strictEqual(RUN_STARTED, 'RunStarted');
    assert.ok(ALL_EVENT_KINDS.has(RUN_STARTED));
  });

  test('RUN_ENDED constant is defined', () => {
    assert.strictEqual(RUN_ENDED, 'RunEnded');
    assert.ok(ALL_EVENT_KINDS.has(RUN_ENDED));
  });

  test('CHECKPOINT_REACHED constant is defined', () => {
    assert.strictEqual(CHECKPOINT_REACHED, 'CheckpointReached');
    assert.ok(ALL_EVENT_KINDS.has(CHECKPOINT_REACHED));
  });

  test('createEvent succeeds for RUN_STARTED with required fields', () => {
    const event = createEvent(RUN_STARTED, { runId: 'run-001' });
    assert.strictEqual(event.kind, RUN_STARTED);
    assert.strictEqual(event.runId, 'run-001');
    assert.strictEqual(typeof event.timestamp, 'number');
  });

  test('createEvent succeeds for RUN_STARTED with optional fields', () => {
    const event = createEvent(RUN_STARTED, {
      runId: 'run-002',
      seed: 42,
      sessionStart: 1700000000000,
      playerLevel: 5,
    });
    assert.strictEqual(event.seed, 42);
    assert.strictEqual(event.sessionStart, 1700000000000);
    assert.strictEqual(event.playerLevel, 5);
  });

  test('createEvent throws when RUN_STARTED missing runId', () => {
    assert.throws(
      () => createEvent(RUN_STARTED, {}),
      (err) => err.message.includes('runId'),
    );
  });

  test('createEvent succeeds for RUN_ENDED with required fields', () => {
    const event = createEvent(RUN_ENDED, {
      runId: 'run-001',
      result: 'victory',
    });
    assert.strictEqual(event.kind, RUN_ENDED);
    assert.strictEqual(event.runId, 'run-001');
    assert.strictEqual(event.result, 'victory');
  });

  test('createEvent succeeds for RUN_ENDED with optional fields', () => {
    const event = createEvent(RUN_ENDED, {
      runId: 'run-001',
      result: 'defeat',
      score: 1500,
      encounterCount: 12,
      duration: 3600000,
      defeatedBosses: ['TheLegacySystem'],
    });
    assert.strictEqual(event.score, 1500);
    assert.strictEqual(event.encounterCount, 12);
    assert.strictEqual(event.duration, 3600000);
    assert.deepStrictEqual(event.defeatedBosses, ['TheLegacySystem']);
  });

  test('createEvent throws when RUN_ENDED missing required fields', () => {
    assert.throws(
      () => createEvent(RUN_ENDED, { runId: 'run-001' }),
      (err) => err.message.includes('result'),
    );
    assert.throws(
      () => createEvent(RUN_ENDED, { result: 'victory' }),
      (err) => err.message.includes('runId'),
    );
  });

  test('createEvent succeeds for CHECKPOINT_REACHED with required fields', () => {
    const event = createEvent(CHECKPOINT_REACHED, {
      runId: 'run-001',
      checkpoint: 'floor-3',
    });
    assert.strictEqual(event.kind, CHECKPOINT_REACHED);
    assert.strictEqual(event.runId, 'run-001');
    assert.strictEqual(event.checkpoint, 'floor-3');
  });

  test('createEvent succeeds for CHECKPOINT_REACHED with optional fields', () => {
    const event = createEvent(CHECKPOINT_REACHED, {
      runId: 'run-001',
      checkpoint: 'boss-room',
      encounterCount: 8,
      playerHp: 25,
      score: 900,
    });
    assert.strictEqual(event.encounterCount, 8);
    assert.strictEqual(event.playerHp, 25);
    assert.strictEqual(event.score, 900);
  });

  test('createEvent throws when CHECKPOINT_REACHED missing required fields', () => {
    assert.throws(
      () => createEvent(CHECKPOINT_REACHED, { runId: 'run-001' }),
      (err) => err.message.includes('checkpoint'),
    );
    assert.throws(
      () => createEvent(CHECKPOINT_REACHED, { checkpoint: 'floor-1' }),
      (err) => err.message.includes('runId'),
    );
  });

  test('validateEvent validates RUN_STARTED correctly', () => {
    const valid = validateEvent({ kind: RUN_STARTED, runId: 'run-001' });
    assert.strictEqual(valid.valid, true);

    const invalid = validateEvent({ kind: RUN_STARTED });
    assert.strictEqual(invalid.valid, false);
    assert.ok(invalid.errors.some((e) => e.includes('runId')));
  });
});
