import assert from 'node:assert';
import { test, suite } from './run.js';
import {
  createRun,
  addEncounter,
  addResolution,
  addBossDefeat,
  endRun,
  getRunStats,
} from '../domain/run-session.js';

suite('Run Session Tracker (domain/run-session.js)', () => {
  // --- createRun ---
  test('createRun creates a valid run', () => {
    const run = createRun({ repo: 'test-repo', playerLevel: 3 });
    assert.ok(run.runId.startsWith('run_'));
    assert.strictEqual(run.repo, 'test-repo');
    assert.strictEqual(run.playerLevel, 3);
    assert.strictEqual(run.status, 'active');
    assert.strictEqual(run.encounters.length, 0);
    assert.strictEqual(run.resolutions.length, 0);
    assert.strictEqual(run.score, 0);
    assert.strictEqual(run.combo.streak, 0);
  });

  // --- addEncounter ---
  test('addEncounter adds encounter and breaks combo', () => {
    let run = createRun();
    // Build a streak first
    const r1 = addResolution(run, { monsterId: 1, monsterName: 'Test', baseXP: 50 });
    run = r1.run;
    const r2 = addResolution(run, { monsterId: 1, monsterName: 'Test', baseXP: 50 });
    run = r2.run;
    assert.strictEqual(run.combo.streak, 2);

    // Encounter breaks the streak
    const { run: updated, brokeStreak } = addEncounter(run, {
      monsterId: 1,
      monsterName: 'NullPointer',
      error: 'Cannot read property of null',
    });
    assert.strictEqual(updated.encounters.length, 1);
    assert.strictEqual(updated.combo.streak, 0);
    assert.strictEqual(brokeStreak, 2);
  });

  // --- addResolution ---
  test('addResolution builds combo and applies multiplier', () => {
    let run = createRun();

    // First resolution: no combo
    const r1 = addResolution(run, { monsterId: 1, monsterName: 'Bug1', baseXP: 50 });
    assert.strictEqual(r1.multiplier, 1.0);
    assert.strictEqual(r1.totalXP, 50);
    assert.strictEqual(r1.bonusXP, 0);
    run = r1.run;

    // Second: DOUBLE (1.5x)
    const r2 = addResolution(run, { monsterId: 2, monsterName: 'Bug2', baseXP: 50 });
    assert.strictEqual(r2.multiplier, 1.5);
    assert.strictEqual(r2.totalXP, 75);
    assert.strictEqual(r2.bonusXP, 25);
    run = r2.run;

    // Third: COMBO (2x)
    const r3 = addResolution(run, { monsterId: 3, monsterName: 'Bug3', baseXP: 50 });
    assert.strictEqual(r3.multiplier, 2.0);
    assert.strictEqual(r3.totalXP, 100);
    run = r3.run;

    assert.strictEqual(run.resolutions.length, 3);
    assert.strictEqual(run.combo.streak, 3);
  });

  test('addResolution marks matching encounter as resolved', () => {
    let run = createRun();
    const { run: r1 } = addEncounter(run, { monsterId: 5, monsterName: 'Bug', error: 'err' });
    run = r1;
    assert.strictEqual(run.encounters[0].resolved, false);

    const { run: r2 } = addResolution(run, { monsterId: 5, monsterName: 'Bug', baseXP: 50 });
    assert.strictEqual(r2.encounters[0].resolved, true);
  });

  // --- addBossDefeat ---
  test('addBossDefeat tracks boss and adds score', () => {
    let run = createRun();
    run = addBossDefeat(run, { bossId: 'hydra', bossName: 'Test Hydra', xp: 200 });
    assert.strictEqual(run.bossesDefeated.length, 1);
    assert.strictEqual(run.totalXP, 200);
    assert.strictEqual(run.score, 400); // boss xp * 2
  });

  // --- endRun ---
  test('endRun produces a summary', () => {
    let run = createRun();
    const { run: r1 } = addEncounter(run, { monsterId: 1, monsterName: 'A', error: 'e1' });
    run = r1;
    const { run: r2 } = addEncounter(run, { monsterId: 2, monsterName: 'B', error: 'e2' });
    run = r2;
    const { run: r3 } = addResolution(run, { monsterId: 1, monsterName: 'A', baseXP: 50 });
    run = r3;

    const final = endRun(run, 'completed');
    assert.strictEqual(final.status, 'completed');
    assert.ok(final.endedAt);
    assert.ok(final.duration >= 0);
    assert.strictEqual(final.summary.totalEncounters, 2);
    assert.strictEqual(final.summary.totalResolved, 1);
    assert.strictEqual(final.summary.unresolvedCount, 1);
    assert.strictEqual(final.summary.uniqueMonsters, 2);
  });

  // --- getRunStats ---
  test('getRunStats returns current snapshot', () => {
    let run = createRun();
    const { run: r1 } = addEncounter(run, { monsterId: 1, monsterName: 'A', error: 'e' });
    run = r1;
    const { run: r2 } = addResolution(run, { monsterId: 1, monsterName: 'A', baseXP: 50 });
    run = r2;

    const stats = getRunStats(run);
    assert.strictEqual(stats.encounters, 1);
    assert.strictEqual(stats.resolved, 1);
    assert.strictEqual(stats.unresolved, 0);
    assert.strictEqual(stats.comboStreak, 1);
    assert.ok(stats.elapsed >= 0);
  });
});
