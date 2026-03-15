import assert from 'node:assert';
import { test, suite } from './run.js';
import { createRecorder } from '../dist/cli/recorder.js';
import { loadSession } from '../dist/cli/session-store.js';

suite('Session Recorder', () => {
  test('createRecorder returns recorder with sessionId and methods', () => {
    const recorder = createRecorder('npm', ['test']);
    assert.ok(recorder.sessionId, 'recorder has sessionId');
    assert.strictEqual(typeof recorder.record, 'function');
    assert.strictEqual(typeof recorder.recordError, 'function');
    assert.strictEqual(typeof recorder.recordEncounter, 'function');
    assert.strictEqual(typeof recorder.recordBattle, 'function');
    assert.strictEqual(typeof recorder.recordBoss, 'function');
    assert.strictEqual(typeof recorder.end, 'function');
    recorder.end(0);
  });

  test('recordError creates an ErrorObserved event', () => {
    const recorder = createRecorder('npm', ['test']);
    recorder.recordError(
      { message: 'ReferenceError: x is not defined', type: 'undefined-reference', severity: 2 },
      { file: 'app.js', line: 42 }
    );
    recorder.end(1);

    const session = loadSession(recorder.sessionId);
    assert.ok(session, 'session exists');
    assert.strictEqual(session.events.length, 1);
    assert.strictEqual(session.events[0].kind, 'ErrorObserved');
    assert.strictEqual(session.events[0].file, 'app.js');
    assert.strictEqual(session.events[0].line, 42);
  });

  test('recordEncounter creates an ENCOUNTER_STARTED event', () => {
    const recorder = createRecorder('node', ['server.js']);
    recorder.recordEncounter(
      { id: 1, name: 'NullPointer', type: 'backend', hp: 30 },
      { message: 'Cannot read property of null' }
    );
    recorder.end(0);

    const session = loadSession(recorder.sessionId);
    assert.strictEqual(session.events.length, 1);
    assert.strictEqual(session.events[0].kind, 'ENCOUNTER_STARTED');
    assert.strictEqual(session.events[0].monster.name, 'NullPointer');
  });

  test('recordBattle creates a BATTLE_ENDED event', () => {
    const recorder = createRecorder('npm', ['test']);
    recorder.recordBattle('victory', { cached: true });
    recorder.end(0);

    const session = loadSession(recorder.sessionId);
    assert.strictEqual(session.events.length, 1);
    assert.strictEqual(session.events[0].kind, 'BATTLE_ENDED');
    assert.strictEqual(session.events[0].result, 'victory');
  });

  test('end produces summary with counts', () => {
    const recorder = createRecorder('npm', ['test']);
    recorder.recordError({ message: 'err', type: 'unknown', severity: 3 }, null);
    recorder.recordEncounter(
      { id: 1, name: 'NullPointer', type: 'backend', hp: 30 },
      { message: 'err' }
    );
    recorder.recordBattle('victory');
    recorder.recordBoss({ id: 'boss1', name: 'TestBoss', type: 'testing' });
    recorder.end(1);

    const session = loadSession(recorder.sessionId);
    assert.strictEqual(session.summary.errorsObserved, 1);
    assert.strictEqual(session.summary.bugsDefeated, 1);
    assert.strictEqual(session.summary.bossesEncountered, 1);
    assert.strictEqual(session.summary.exitCode, 1);
  });
});
