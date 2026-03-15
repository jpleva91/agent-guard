import assert from 'node:assert';
import { test, suite } from './run.js';
import { replay } from '../dist/cli/replay.js';
import { createRecorder } from '../dist/cli/recorder.js';
import { loadSession, listSessions } from '../dist/cli/session-store.js';

suite('Replay CLI', () => {
  test('replay module exports a replay function', () => {
    assert.strictEqual(typeof replay, 'function');
  });

  test('replay end-to-end: record a session and verify loadable', () => {
    // Create a session with events via the recorder
    const recorder = createRecorder('npm', ['test']);
    recorder.recordError(
      { message: 'SyntaxError: unexpected token', type: 'syntax', severity: 3 },
      { file: 'index.js', line: 10 }
    );
    recorder.recordEncounter(
      { id: 5, name: 'SyntaxHorror', type: 'frontend', hp: 25 },
      { message: 'SyntaxError: unexpected token' }
    );
    recorder.recordBattle('victory');
    recorder.end(0);

    // Verify session is loadable and has correct structure
    const session = loadSession(recorder.sessionId);
    assert.ok(session, 'session loaded');
    assert.strictEqual(session.events.length, 3);
    assert.strictEqual(session.events[0].kind, 'ErrorObserved');
    assert.strictEqual(session.events[1].kind, 'ENCOUNTER_STARTED');
    assert.strictEqual(session.events[2].kind, 'BATTLE_ENDED');

    // Verify it appears in the session list
    const sessions = listSessions();
    const found = sessions.find((s) => s.id === recorder.sessionId);
    assert.ok(found, 'session appears in list');
    assert.strictEqual(found.eventCount, 3);
  });

  test('replay with stats: session has correct summary data', () => {
    const recorder = createRecorder('npm', ['test']);
    recorder.recordError({ message: 'err1', type: 'unknown', severity: 3 }, null);
    recorder.recordError({ message: 'err2', type: 'unknown', severity: 2 }, null);
    recorder.recordBattle('victory');
    recorder.recordBoss({ id: 'boss1', name: 'TestBoss', type: 'testing' });
    recorder.end(1);

    const session = loadSession(recorder.sessionId);
    assert.ok(session.summary, 'session has summary');
    assert.strictEqual(session.summary.errorsObserved, 2);
    assert.strictEqual(session.summary.bugsDefeated, 1);
    assert.strictEqual(session.summary.bossesEncountered, 1);
    assert.ok(session.summary.duration >= 0, 'summary has duration');
    assert.strictEqual(session.summary.exitCode, 1);
  });

  test('session events preserve monster metadata', () => {
    const recorder = createRecorder('node', ['app.js']);
    recorder.recordEncounter(
      { id: 1, name: 'NullPointer', type: 'backend', hp: 30 },
      { message: 'Cannot read property of null' }
    );
    recorder.end(0);

    const session = loadSession(recorder.sessionId);
    const encounter = session.events[0];
    assert.strictEqual(encounter.kind, 'ENCOUNTER_STARTED');
    assert.strictEqual(encounter.monster.name, 'NullPointer');
    assert.strictEqual(encounter.monster.type, 'backend');
    assert.strictEqual(encounter.monster.hp, 30);
    assert.strictEqual(encounter.errorMessage, 'Cannot read property of null');
  });

  test('session events preserve boss flag', () => {
    const recorder = createRecorder('npm', ['test']);
    recorder.recordBoss({ id: 'race-dragon', name: 'RaceConditionDragon', type: 'backend' });
    recorder.end(0);

    const session = loadSession(recorder.sessionId);
    const bossEvent = session.events[0];
    assert.strictEqual(bossEvent.isBoss, true);
    assert.strictEqual(bossEvent.boss.name, 'RaceConditionDragon');
  });

  test('unknown session returns null from loadSession', () => {
    const result = loadSession('nonexistent-id-12345');
    assert.strictEqual(result, null);
  });
});
