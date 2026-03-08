import assert from 'node:assert';
import { test, suite } from './run.js';
import {
  SYNC_PORT, PING_INTERVAL, RECONNECT_INTERVAL, MAX_RECONNECT_ATTEMPTS,
  MSG_PULL_CLI_STATE, MSG_BROWSER_STATE, MSG_PONG,
  MSG_CLI_STATE, MSG_CLI_EVENT, MSG_PING,
} from '../dist/ecosystem/sync-protocol.js';

suite('Sync Protocol Constants (ecosystem/sync-protocol.js)', () => {
  test('SYNC_PORT is 9876', () => {
    assert.strictEqual(SYNC_PORT, 9876);
  });

  test('PING_INTERVAL is 15000ms', () => {
    assert.strictEqual(PING_INTERVAL, 15000);
  });

  test('RECONNECT_INTERVAL is 5000ms', () => {
    assert.strictEqual(RECONNECT_INTERVAL, 5000);
  });

  test('MAX_RECONNECT_ATTEMPTS is 12', () => {
    assert.strictEqual(MAX_RECONNECT_ATTEMPTS, 12);
  });

  test('browser-to-server message types are strings', () => {
    assert.strictEqual(typeof MSG_PULL_CLI_STATE, 'string');
    assert.strictEqual(typeof MSG_BROWSER_STATE, 'string');
    assert.strictEqual(typeof MSG_PONG, 'string');
  });

  test('server-to-browser message types are strings', () => {
    assert.strictEqual(typeof MSG_CLI_STATE, 'string');
    assert.strictEqual(typeof MSG_CLI_EVENT, 'string');
    assert.strictEqual(typeof MSG_PING, 'string');
  });

  test('message type values are correct', () => {
    assert.strictEqual(MSG_PULL_CLI_STATE, 'pull_cli_state');
    assert.strictEqual(MSG_BROWSER_STATE, 'browser_state');
    assert.strictEqual(MSG_PONG, 'pong');
    assert.strictEqual(MSG_CLI_STATE, 'cli_state');
    assert.strictEqual(MSG_CLI_EVENT, 'cli_event');
    assert.strictEqual(MSG_PING, 'ping');
  });

  test('all message types are unique', () => {
    const types = [MSG_PULL_CLI_STATE, MSG_BROWSER_STATE, MSG_PONG, MSG_CLI_STATE, MSG_CLI_EVENT, MSG_PING];
    const unique = new Set(types);
    assert.strictEqual(types.length, unique.size, 'all message types should be unique');
  });

  test('intervals are positive numbers', () => {
    assert.ok(PING_INTERVAL > 0);
    assert.ok(RECONNECT_INTERVAL > 0);
    assert.ok(MAX_RECONNECT_ATTEMPTS > 0);
  });

  test('SYNC_PORT is a valid port number', () => {
    assert.ok(SYNC_PORT > 0);
    assert.ok(SYNC_PORT < 65536);
  });
});
