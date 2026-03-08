import assert from 'node:assert';
import { test, suite } from './run.js';
import {
  createHistory,
  addRun,
  serializeHistory,
  deserializeHistory,
  getRecentRuns,
  formatDuration,
} from '../domain/run-history.js';

suite('Run History (domain/run-history.js)', () => {
  function makeFakeRun(overrides = {}) {
    return {
      runId: `run_${Date.now()}_test`,
      startedAt: Date.now() - 60000,
      endedAt: Date.now(),
      duration: 60000,
      status: 'completed',
      repo: 'test-repo',
      playerLevel: 2,
      encounters: [
        { monsterId: 1, monsterName: 'A', resolved: true },
        { monsterId: 2, monsterName: 'B', resolved: false },
      ],
      summary: {
        duration: 60000,
        totalEncounters: 2,
        totalResolved: 1,
        unresolvedCount: 1,
        bossesDefeated: 0,
        maxCombo: 3,
        totalXP: 150,
        totalBonusXP: 25,
        score: 200,
        uniqueMonsters: 2,
      },
      ...overrides,
    };
  }

  // --- createHistory ---
  test('createHistory returns empty state', () => {
    const h = createHistory();
    assert.strictEqual(h.runs.length, 0);
    assert.strictEqual(h.allTime.totalRuns, 0);
  });

  // --- addRun ---
  test('addRun aggregates stats', () => {
    let h = createHistory();
    h = addRun(h, makeFakeRun());
    assert.strictEqual(h.allTime.totalRuns, 1);
    assert.strictEqual(h.allTime.totalEncounters, 2);
    assert.strictEqual(h.allTime.totalResolved, 1);
    assert.strictEqual(h.allTime.bestCombo, 3);
    assert.strictEqual(h.allTime.totalXP, 150);
    assert.strictEqual(h.runs.length, 1);
  });

  test('addRun tracks unique monsters', () => {
    let h = createHistory();
    h = addRun(h, makeFakeRun());
    assert.strictEqual(h.allTime.uniqueMonsters.size, 2);
  });

  test('addRun caps at 100 runs', () => {
    let h = createHistory();
    for (let i = 0; i < 105; i++) {
      h = addRun(h, makeFakeRun({ runId: `run_${i}` }));
    }
    assert.strictEqual(h.runs.length, 100);
    assert.strictEqual(h.allTime.totalRuns, 105);
  });

  // --- serialize/deserialize ---
  test('serialize then deserialize round-trips', () => {
    let h = createHistory();
    h = addRun(h, makeFakeRun());
    const serialized = serializeHistory(h);
    assert.ok(Array.isArray(serialized.allTime.uniqueMonsters));

    const deserialized = deserializeHistory(serialized);
    assert.ok(deserialized.allTime.uniqueMonsters instanceof Set);
    assert.strictEqual(deserialized.allTime.uniqueMonsters.size, 2);
  });

  test('deserializeHistory handles null/undefined', () => {
    const h = deserializeHistory(null);
    assert.strictEqual(h.runs.length, 0);
  });

  // --- getRecentRuns ---
  test('getRecentRuns returns most recent first', () => {
    let h = createHistory();
    h = addRun(h, makeFakeRun({ runId: 'first' }));
    h = addRun(h, makeFakeRun({ runId: 'second' }));
    h = addRun(h, makeFakeRun({ runId: 'third' }));
    const recent = getRecentRuns(h, 2);
    assert.strictEqual(recent.length, 2);
    assert.strictEqual(recent[0].runId, 'third');
    assert.strictEqual(recent[1].runId, 'second');
  });

  // --- formatDuration ---
  test('formatDuration formats milliseconds', () => {
    assert.strictEqual(formatDuration(500), '500ms');
  });

  test('formatDuration formats seconds', () => {
    assert.strictEqual(formatDuration(5000), '5s');
  });

  test('formatDuration formats minutes', () => {
    assert.strictEqual(formatDuration(125000), '2m 5s');
  });

  test('formatDuration formats hours', () => {
    assert.strictEqual(formatDuration(3725000), '1h 2m');
  });
});
