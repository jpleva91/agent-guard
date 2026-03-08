import assert from 'node:assert';
import { test, suite } from './run.js';
import {
  createEvent,
  validateEvent,
  resetEventCounter,
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
  POLICY_DENIED,
  UNAUTHORIZED_ACTION,
  INVARIANT_VIOLATION,
  BLAST_RADIUS_EXCEEDED,
  MERGE_GUARD_FAILURE,
  EVIDENCE_PACK_GENERATED,
  FILE_SAVED,
  TEST_COMPLETED,
  BUILD_COMPLETED,
  COMMIT_CREATED,
  CODE_REVIEWED,
  DEPLOY_COMPLETED,
  LINT_COMPLETED,
} from '../domain/events.js';

suite('Domain Events — Schema Validation', () => {
  test('ALL_EVENT_KINDS contains all 42 event kinds', () => {
    assert.strictEqual(ALL_EVENT_KINDS.size, 42);
    assert.ok(ALL_EVENT_KINDS.has(ERROR_OBSERVED));
    assert.ok(ALL_EVENT_KINDS.has(BATTLE_ENDED));
    assert.ok(ALL_EVENT_KINDS.has(STATE_CHANGED));
    assert.ok(ALL_EVENT_KINDS.has(FILE_SAVED));
    assert.ok(ALL_EVENT_KINDS.has(COMMIT_CREATED));
  });

  // --- createEvent structure ---

  test('createEvent returns object with kind, timestamp, id, and fingerprint', () => {
    const event = createEvent(ERROR_OBSERVED, { message: 'fail' });
    assert.strictEqual(event.kind, ERROR_OBSERVED);
    assert.strictEqual(typeof event.timestamp, 'number');
    assert.strictEqual(event.message, 'fail');
    assert.ok(event.id.startsWith('evt_'));
    assert.strictEqual(typeof event.fingerprint, 'string');
  });

  test('createEvent spreads data fields onto the event', () => {
    const event = createEvent(DAMAGE_DEALT, { amount: 10, target: 'enemy' });
    assert.strictEqual(event.amount, 10);
    assert.strictEqual(event.target, 'enemy');
  });

  test('createEvent generates unique IDs for consecutive events', () => {
    const e1 = createEvent(DAMAGE_DEALT, { amount: 1, target: 'a' });
    const e2 = createEvent(DAMAGE_DEALT, { amount: 2, target: 'b' });
    assert.notStrictEqual(e1.id, e2.id);
  });

  test('createEvent generates stable fingerprints for same data', () => {
    const data = { amount: 10, target: 'enemy' };
    const e1 = createEvent(DAMAGE_DEALT, data);
    const e2 = createEvent(DAMAGE_DEALT, data);
    assert.strictEqual(e1.fingerprint, e2.fingerprint);
  });

  test('createEvent preserves explicitly provided fingerprint', () => {
    const event = createEvent(ERROR_OBSERVED, {
      message: 'test',
      fingerprint: 'custom-fp',
    });
    assert.strictEqual(event.fingerprint, 'custom-fp');
  });

  test('resetEventCounter resets the ID counter', () => {
    resetEventCounter();
    const e1 = createEvent(DAMAGE_DEALT, { amount: 1, target: 'a' });
    const counter1 = e1.id.split('_')[2];
    resetEventCounter();
    const e2 = createEvent(DAMAGE_DEALT, { amount: 2, target: 'b' });
    const counter2 = e2.id.split('_')[2];
    assert.strictEqual(counter1, counter2);
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

  // --- Governance event types ---

  test('POLICY_DENIED constant is defined', () => {
    assert.strictEqual(POLICY_DENIED, 'PolicyDenied');
    assert.ok(ALL_EVENT_KINDS.has(POLICY_DENIED));
  });

  test('createEvent succeeds for POLICY_DENIED with required fields', () => {
    const event = createEvent(POLICY_DENIED, {
      policy: 'no-force-push',
      action: 'git push --force',
      reason: 'Force push is prohibited on protected branches',
    });
    assert.strictEqual(event.kind, POLICY_DENIED);
    assert.strictEqual(event.policy, 'no-force-push');
    assert.strictEqual(event.action, 'git push --force');
    assert.strictEqual(event.reason, 'Force push is prohibited on protected branches');
  });

  test('createEvent succeeds for POLICY_DENIED with optional fields', () => {
    const event = createEvent(POLICY_DENIED, {
      policy: 'no-force-push',
      action: 'git push --force',
      reason: 'Prohibited',
      agentId: 'agent-001',
      file: 'deploy.sh',
      line: 10,
      metadata: { branch: 'main' },
    });
    assert.strictEqual(event.agentId, 'agent-001');
    assert.strictEqual(event.file, 'deploy.sh');
    assert.deepStrictEqual(event.metadata, { branch: 'main' });
  });

  test('createEvent throws when POLICY_DENIED missing required fields', () => {
    assert.throws(
      () => createEvent(POLICY_DENIED, { policy: 'no-force-push' }),
      (err) => err.message.includes('action'),
    );
  });

  test('createEvent succeeds for UNAUTHORIZED_ACTION with required fields', () => {
    const event = createEvent(UNAUTHORIZED_ACTION, {
      action: 'delete-database',
      reason: 'Action outside agent scope',
    });
    assert.strictEqual(event.kind, UNAUTHORIZED_ACTION);
    assert.strictEqual(event.action, 'delete-database');
  });

  test('createEvent throws when UNAUTHORIZED_ACTION missing required fields', () => {
    assert.throws(
      () => createEvent(UNAUTHORIZED_ACTION, { action: 'delete-database' }),
      (err) => err.message.includes('reason'),
    );
  });

  test('createEvent succeeds for INVARIANT_VIOLATION with required fields', () => {
    const event = createEvent(INVARIANT_VIOLATION, {
      invariant: 'size-budget',
      expected: '17KB',
      actual: '22KB',
    });
    assert.strictEqual(event.kind, INVARIANT_VIOLATION);
    assert.strictEqual(event.invariant, 'size-budget');
    assert.strictEqual(event.expected, '17KB');
    assert.strictEqual(event.actual, '22KB');
  });

  test('createEvent throws when INVARIANT_VIOLATION missing required fields', () => {
    assert.throws(
      () => createEvent(INVARIANT_VIOLATION, { invariant: 'size-budget' }),
      (err) => err.message.includes('expected') && err.message.includes('actual'),
    );
  });

  test('createEvent succeeds for BLAST_RADIUS_EXCEEDED with required fields', () => {
    const event = createEvent(BLAST_RADIUS_EXCEEDED, {
      filesAffected: 25,
      limit: 10,
    });
    assert.strictEqual(event.kind, BLAST_RADIUS_EXCEEDED);
    assert.strictEqual(event.filesAffected, 25);
    assert.strictEqual(event.limit, 10);
  });

  test('createEvent succeeds for BLAST_RADIUS_EXCEEDED with optional fields', () => {
    const event = createEvent(BLAST_RADIUS_EXCEEDED, {
      filesAffected: 25,
      limit: 10,
      files: ['a.js', 'b.js'],
      action: 'refactor',
    });
    assert.deepStrictEqual(event.files, ['a.js', 'b.js']);
    assert.strictEqual(event.action, 'refactor');
  });

  test('createEvent throws when BLAST_RADIUS_EXCEEDED missing required fields', () => {
    assert.throws(
      () => createEvent(BLAST_RADIUS_EXCEEDED, { filesAffected: 25 }),
      (err) => err.message.includes('limit'),
    );
  });

  test('createEvent succeeds for MERGE_GUARD_FAILURE with required fields', () => {
    const event = createEvent(MERGE_GUARD_FAILURE, {
      branch: 'main',
      reason: 'Direct push to protected branch',
    });
    assert.strictEqual(event.kind, MERGE_GUARD_FAILURE);
    assert.strictEqual(event.branch, 'main');
  });

  test('createEvent throws when MERGE_GUARD_FAILURE missing required fields', () => {
    assert.throws(
      () => createEvent(MERGE_GUARD_FAILURE, { branch: 'main' }),
      (err) => err.message.includes('reason'),
    );
  });

  test('createEvent succeeds for EVIDENCE_PACK_GENERATED with required fields', () => {
    const event = createEvent(EVIDENCE_PACK_GENERATED, {
      packId: 'pack-001',
      eventIds: ['evt-1', 'evt-2', 'evt-3'],
    });
    assert.strictEqual(event.kind, EVIDENCE_PACK_GENERATED);
    assert.strictEqual(event.packId, 'pack-001');
    assert.deepStrictEqual(event.eventIds, ['evt-1', 'evt-2', 'evt-3']);
  });

  test('createEvent throws when EVIDENCE_PACK_GENERATED missing required fields', () => {
    assert.throws(
      () => createEvent(EVIDENCE_PACK_GENERATED, { packId: 'pack-001' }),
      (err) => err.message.includes('eventIds'),
    );
  });

  // --- Developer signal event types ---

  test('FILE_SAVED constant is defined', () => {
    assert.strictEqual(FILE_SAVED, 'FileSaved');
    assert.ok(ALL_EVENT_KINDS.has(FILE_SAVED));
  });

  test('createEvent succeeds for FILE_SAVED with required fields', () => {
    const event = createEvent(FILE_SAVED, { file: 'src/main.js' });
    assert.strictEqual(event.kind, FILE_SAVED);
    assert.strictEqual(event.file, 'src/main.js');
  });

  test('createEvent succeeds for FILE_SAVED with optional fields', () => {
    const event = createEvent(FILE_SAVED, {
      file: 'src/main.js',
      language: 'javascript',
      linesChanged: 15,
    });
    assert.strictEqual(event.language, 'javascript');
    assert.strictEqual(event.linesChanged, 15);
  });

  test('createEvent throws when FILE_SAVED missing file', () => {
    assert.throws(
      () => createEvent(FILE_SAVED, {}),
      (err) => err.message.includes('file'),
    );
  });

  test('createEvent succeeds for TEST_COMPLETED with required fields', () => {
    const event = createEvent(TEST_COMPLETED, { result: 'pass' });
    assert.strictEqual(event.kind, TEST_COMPLETED);
    assert.strictEqual(event.result, 'pass');
  });

  test('createEvent succeeds for TEST_COMPLETED with optional fields', () => {
    const event = createEvent(TEST_COMPLETED, {
      result: 'fail',
      suite: 'unit',
      duration: 1200,
      passed: 48,
      failed: 2,
      total: 50,
    });
    assert.strictEqual(event.suite, 'unit');
    assert.strictEqual(event.passed, 48);
    assert.strictEqual(event.failed, 2);
  });

  test('createEvent throws when TEST_COMPLETED missing result', () => {
    assert.throws(
      () => createEvent(TEST_COMPLETED, {}),
      (err) => err.message.includes('result'),
    );
  });

  test('createEvent succeeds for BUILD_COMPLETED with required fields', () => {
    const event = createEvent(BUILD_COMPLETED, { result: 'pass' });
    assert.strictEqual(event.kind, BUILD_COMPLETED);
    assert.strictEqual(event.result, 'pass');
  });

  test('createEvent succeeds for BUILD_COMPLETED with optional fields', () => {
    const event = createEvent(BUILD_COMPLETED, {
      result: 'fail',
      duration: 5000,
      tool: 'esbuild',
      exitCode: 1,
    });
    assert.strictEqual(event.tool, 'esbuild');
    assert.strictEqual(event.exitCode, 1);
  });

  test('createEvent succeeds for COMMIT_CREATED with required fields', () => {
    const event = createEvent(COMMIT_CREATED, { hash: 'abc123' });
    assert.strictEqual(event.kind, COMMIT_CREATED);
    assert.strictEqual(event.hash, 'abc123');
  });

  test('createEvent succeeds for COMMIT_CREATED with optional fields', () => {
    const event = createEvent(COMMIT_CREATED, {
      hash: 'abc123',
      message: 'fix bug',
      filesChanged: 3,
      additions: 10,
      deletions: 5,
    });
    assert.strictEqual(event.message, 'fix bug');
    assert.strictEqual(event.filesChanged, 3);
  });

  test('createEvent throws when COMMIT_CREATED missing hash', () => {
    assert.throws(
      () => createEvent(COMMIT_CREATED, {}),
      (err) => err.message.includes('hash'),
    );
  });

  test('createEvent succeeds for CODE_REVIEWED with required fields', () => {
    const event = createEvent(CODE_REVIEWED, { action: 'approve' });
    assert.strictEqual(event.kind, CODE_REVIEWED);
    assert.strictEqual(event.action, 'approve');
  });

  test('createEvent succeeds for CODE_REVIEWED with optional fields', () => {
    const event = createEvent(CODE_REVIEWED, {
      action: 'comment',
      prId: 'pr-42',
      file: 'src/main.js',
      comment: 'looks good',
    });
    assert.strictEqual(event.prId, 'pr-42');
  });

  test('createEvent succeeds for DEPLOY_COMPLETED with required fields', () => {
    const event = createEvent(DEPLOY_COMPLETED, { result: 'pass' });
    assert.strictEqual(event.kind, DEPLOY_COMPLETED);
    assert.strictEqual(event.result, 'pass');
  });

  test('createEvent succeeds for DEPLOY_COMPLETED with optional fields', () => {
    const event = createEvent(DEPLOY_COMPLETED, {
      result: 'pass',
      environment: 'production',
      duration: 30000,
      version: '1.2.0',
    });
    assert.strictEqual(event.environment, 'production');
    assert.strictEqual(event.version, '1.2.0');
  });

  test('createEvent succeeds for LINT_COMPLETED with required fields', () => {
    const event = createEvent(LINT_COMPLETED, { result: 'pass' });
    assert.strictEqual(event.kind, LINT_COMPLETED);
    assert.strictEqual(event.result, 'pass');
  });

  test('createEvent succeeds for LINT_COMPLETED with optional fields', () => {
    const event = createEvent(LINT_COMPLETED, {
      result: 'fail',
      tool: 'eslint',
      errors: 3,
      warnings: 7,
      fixed: 2,
    });
    assert.strictEqual(event.tool, 'eslint');
    assert.strictEqual(event.errors, 3);
    assert.strictEqual(event.fixed, 2);
  });
});
