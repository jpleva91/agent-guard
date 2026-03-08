import assert from 'node:assert';
import { test, suite } from './run.js';

// Mock WebSocket for Node.js
let _lastWsUrl = null;
let _lastWsInstance = null;

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    constructor(url) {
      _lastWsUrl = url;
      _lastWsInstance = this;
      this.readyState = 3; // CLOSED by default (simulates failed connection)
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      this._sent = [];
      // Simulate immediate connection failure
      setTimeout(() => {
        if (this.onerror) this.onerror();
        if (this.onclose) this.onclose();
      }, 0);
    }
    send(data) { this._sent.push(data); }
    close() {
      this.readyState = 3;
      if (this.onclose) this.onclose();
    }
  };
  // Also set the OPEN/CLOSED constants on the class
  WebSocket.OPEN = 1;
  WebSocket.CLOSED = 3;
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener() {}, bugmon: null };
}

const { getSyncStatus, pushToCLI, pullFromCLI } = await import('../dist/game/sync/client.js');

suite('Sync client (game/sync/client.js)', () => {
  test('getSyncStatus returns object with expected fields', () => {
    const status = getSyncStatus();
    assert.ok('connected' in status);
    assert.ok('serverUrl' in status);
    assert.ok('reconnectAttempts' in status);
    assert.ok('hint' in status);
  });

  test('getSyncStatus shows not connected by default', () => {
    const status = getSyncStatus();
    assert.strictEqual(status.connected, false);
    assert.ok(status.hint.includes('Not connected'));
  });

  test('pushToCLI returns false when not connected', () => {
    const result = pushToCLI({ test: 'data' });
    assert.strictEqual(result, false);
  });

  test('pullFromCLI returns false when not connected', () => {
    const result = pullFromCLI();
    assert.strictEqual(result, false);
  });

  test('getSyncStatus serverUrl includes expected port', () => {
    const status = getSyncStatus();
    assert.ok(status.serverUrl.includes('9876'), 'server URL should include port 9876');
  });
});
