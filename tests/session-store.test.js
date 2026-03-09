import assert from 'node:assert';
import { test, suite } from './run.js';
import { createSession, loadSession, listSessions } from '../dist/cli/session-store.js';
import { createEvent, ERROR_OBSERVED } from '../dist/events/schema.js';

suite('Session Store', () => {
  let sessionId = null;

  test('createSession returns an object with id, path, append, end', () => {
    const session = createSession({ command: 'npm test' });
    assert.ok(session.id, 'session has id');
    assert.ok(session.path, 'session has path');
    assert.strictEqual(typeof session.append, 'function');
    assert.strictEqual(typeof session.end, 'function');
    sessionId = session.id;
    session.end({ exitCode: 0 });
  });

  test('loadSession returns the session data', () => {
    assert.ok(sessionId, 'sessionId was set by prior test');
    const data = loadSession(sessionId);
    assert.ok(data, 'session loaded');
    assert.strictEqual(data.id, sessionId);
    assert.strictEqual(data.command, 'npm test');
    assert.ok(data.endedAt, 'session has endedAt');
    assert.ok(data.summary, 'session has summary');
  });

  test('loadSession returns null for unknown ID', () => {
    const data = loadSession('nonexistent-session-id');
    assert.strictEqual(data, null);
  });

  test('listSessions returns an array including recent session', () => {
    const sessions = listSessions();
    assert.ok(Array.isArray(sessions));
    if (sessionId) {
      const found = sessions.find((s) => s.id === sessionId);
      assert.ok(found, 'recently created session appears in list');
    }
  });

  test('append adds events to the session', () => {
    const session = createSession({ command: 'test-append' });
    const event = createEvent(ERROR_OBSERVED, {
      message: 'TypeError: null is not an object',
      severity: 3,
    });
    session.append(event);
    session.end();

    const loaded = loadSession(session.id);
    assert.strictEqual(loaded.events.length, 1);
    assert.strictEqual(loaded.events[0].kind, 'ErrorObserved');
    assert.strictEqual(loaded.events[0].message, 'TypeError: null is not an object');
  });
});
