import assert from 'node:assert';
import { test, suite } from './run.js';

// input.js relies on `window` for event listeners, so we provide a minimal shim
// and import the module's exported functions for unit testing.
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener() {} };
}

// Stub AudioContext for sound.js import
if (typeof globalThis.AudioContext === 'undefined') {
  globalThis.AudioContext = class { constructor() { this.state = 'running'; } };
}

const { simulatePress, simulateRelease, isDown, wasPressed, clearJustPressed } =
  await import('../dist/game/engine/input.js');

suite('Input system (game/engine/input.js)', () => {
  // Reset state before each test by clearing and releasing
  function reset() {
    clearJustPressed();
    simulateRelease('ArrowUp');
    simulateRelease('ArrowDown');
    simulateRelease('Enter');
    simulateRelease('a');
    simulateRelease('b');
  }

  test('simulatePress sets isDown to true', () => {
    reset();
    assert.strictEqual(isDown('ArrowUp'), false);
    simulatePress('ArrowUp');
    assert.strictEqual(isDown('ArrowUp'), true);
    simulateRelease('ArrowUp');
  });

  test('simulateRelease sets isDown to false', () => {
    reset();
    simulatePress('ArrowUp');
    assert.strictEqual(isDown('ArrowUp'), true);
    simulateRelease('ArrowUp');
    assert.strictEqual(isDown('ArrowUp'), false);
  });

  test('simulatePress sets wasPressed to true', () => {
    reset();
    assert.strictEqual(wasPressed('Enter'), false);
    simulatePress('Enter');
    assert.strictEqual(wasPressed('Enter'), true);
    simulateRelease('Enter');
  });

  test('clearJustPressed resets wasPressed', () => {
    reset();
    simulatePress('Enter');
    assert.strictEqual(wasPressed('Enter'), true);
    clearJustPressed();
    assert.strictEqual(wasPressed('Enter'), false);
    simulateRelease('Enter');
  });

  test('wasPressed remains true until clearJustPressed', () => {
    reset();
    simulatePress('a');
    assert.strictEqual(wasPressed('a'), true);
    // Reading wasPressed does NOT consume it (unlike some implementations)
    assert.strictEqual(wasPressed('a'), true);
    clearJustPressed();
    assert.strictEqual(wasPressed('a'), false);
    simulateRelease('a');
  });

  test('holding key does not re-trigger justPressed', () => {
    reset();
    simulatePress('a');
    assert.strictEqual(wasPressed('a'), true);
    clearJustPressed();
    // Second press while still held should NOT set justPressed again
    simulatePress('a');
    assert.strictEqual(wasPressed('a'), false);
    simulateRelease('a');
  });

  test('releasing and re-pressing does trigger justPressed', () => {
    reset();
    simulatePress('a');
    clearJustPressed();
    simulateRelease('a');
    simulatePress('a');
    assert.strictEqual(wasPressed('a'), true);
    simulateRelease('a');
  });

  test('multiple keys tracked independently', () => {
    reset();
    simulatePress('ArrowUp');
    simulatePress('Enter');
    assert.strictEqual(isDown('ArrowUp'), true);
    assert.strictEqual(isDown('Enter'), true);
    assert.strictEqual(isDown('ArrowDown'), false);
    simulateRelease('ArrowUp');
    assert.strictEqual(isDown('ArrowUp'), false);
    assert.strictEqual(isDown('Enter'), true);
    simulateRelease('Enter');
  });

  test('isDown returns false for never-pressed keys', () => {
    assert.strictEqual(isDown('F13'), false);
    assert.strictEqual(isDown(''), false);
  });

  test('wasPressed returns false for never-pressed keys', () => {
    assert.strictEqual(wasPressed('F13'), false);
  });
});
