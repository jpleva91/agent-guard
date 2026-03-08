import assert from 'node:assert';
import { test, suite } from './run.js';

// Mock browser globals before importing title.js
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener() {} };
}
if (typeof globalThis.AudioContext === 'undefined') {
  globalThis.AudioContext = class { constructor() { this.state = 'running'; } };
}

// Mock localStorage for save.js
const store = {};
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { for (const k in store) delete store[k]; },
  };
}

// We need to test updateTitle which depends on wasPressed (from input.js) and hasSave (from save.js).
// Since these are module-level imports, we test through the actual modules.
import { simulatePress, simulateRelease, clearJustPressed } from '../dist/game/engine/input.js';
import { saveGame } from '../dist/game/sync/save.js';
const { updateTitle } = await import('../dist/game/engine/title.js');

suite('Title screen (game/engine/title.js)', () => {
  test('updateTitle returns null when no key pressed', () => {
    localStorage.clear();
    clearJustPressed();
    const result = updateTitle(0.016);
    assert.strictEqual(result, null);
  });

  test('updateTitle returns "new" on Enter when no save exists', () => {
    localStorage.clear();
    clearJustPressed();
    // Need to prime initialized state by calling updateTitle once
    updateTitle(0.016);
    clearJustPressed();
    // Simulate Enter press
    simulatePress('Enter');
    const result = updateTitle(0.016);
    simulateRelease('Enter');
    clearJustPressed();
    assert.strictEqual(result, 'new');
  });

  test('updateTitle returns "continue" on Enter when save exists and first option selected', () => {
    localStorage.clear();
    // Create a save
    saveGame({ x: 0, y: 0, dir: 'down', party: [{ id: 1, name: 'Test', hp: 30, currentHP: 30 }] });
    clearJustPressed();
    // Prime title
    updateTitle(0.016);
    clearJustPressed();
    // Press Enter on first option (CONTINUE)
    simulatePress('Enter');
    const result = updateTitle(0.016);
    simulateRelease('Enter');
    clearJustPressed();
    assert.strictEqual(result, 'continue');
  });

  test('updateTitle returns "new" on Enter when save exists and second option selected', () => {
    localStorage.clear();
    saveGame({ x: 0, y: 0, dir: 'down', party: [{ id: 1, name: 'Test', hp: 30, currentHP: 30 }] });
    clearJustPressed();
    // Prime title
    updateTitle(0.016);
    clearJustPressed();
    // Navigate down to NEW GAME
    simulatePress('ArrowDown');
    updateTitle(0.016);
    simulateRelease('ArrowDown');
    clearJustPressed();
    // Press Enter
    simulatePress('Enter');
    const result = updateTitle(0.016);
    simulateRelease('Enter');
    clearJustPressed();
    assert.strictEqual(result, 'new');
  });

  test('arrow keys clamp within valid range', () => {
    localStorage.clear();
    clearJustPressed();
    // No save: only 1 option, ArrowUp/ArrowDown should stay at 0
    updateTitle(0.016);
    clearJustPressed();
    // Press ArrowUp (already at 0, should stay)
    simulatePress('ArrowUp');
    const result = updateTitle(0.016);
    simulateRelease('ArrowUp');
    clearJustPressed();
    assert.strictEqual(result, null); // Still no selection
    // Press Enter on NEW GAME (index 0)
    simulatePress('Enter');
    const selection = updateTitle(0.016);
    simulateRelease('Enter');
    clearJustPressed();
    assert.strictEqual(selection, 'new');
  });

  test('space key also triggers selection', () => {
    localStorage.clear();
    clearJustPressed();
    updateTitle(0.016);
    clearJustPressed();
    simulatePress(' ');
    const result = updateTitle(0.016);
    simulateRelease(' ');
    clearJustPressed();
    assert.strictEqual(result, 'new');
  });
});
