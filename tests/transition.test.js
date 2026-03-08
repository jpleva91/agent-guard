import assert from 'node:assert';
import { test, suite } from './run.js';

// Mock browser globals for sound.js
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener() {} };
}
if (typeof globalThis.AudioContext === 'undefined') {
  globalThis.AudioContext = class { constructor() { this.state = 'running'; } };
}

const { startTransition, updateTransition } =
  await import('../dist/game/engine/transition.js');

const MOCK_WILD_MON = {
  id: 1, name: 'TestMon', type: 'backend', hp: 30,
  color: '#e74c3c', sprite: 'test'
};

suite('Battle Transition (game/engine/transition.js)', () => {
  test('startTransition initializes without error', () => {
    assert.doesNotThrow(() => startTransition(MOCK_WILD_MON));
  });

  test('updateTransition returns null while transition is in progress', () => {
    startTransition(MOCK_WILD_MON);
    const result = updateTransition(10);
    assert.strictEqual(result, null);
  });

  test('updateTransition returns null when no transition is active', () => {
    // Drive any existing transition to completion first
    startTransition(MOCK_WILD_MON);
    let result = null;
    for (let t = 0; t < 2000; t += 100) {
      result = updateTransition(100);
      if (result) break;
    }
    // Now there's no active transition
    assert.strictEqual(updateTransition(10), null);
  });

  test('updateTransition returns wildMon when transition completes', () => {
    startTransition(MOCK_WILD_MON);
    // Total duration: 60+80+60+80+80+300+200 = 860ms
    let result = null;
    for (let t = 0; t < 2000; t += 10) {
      result = updateTransition(10);
      if (result) break;
    }
    assert.ok(result, 'Should return wildMon when done');
    assert.strictEqual(result.name, 'TestMon');
  });

  test('transition completes in approximately 860ms', () => {
    startTransition(MOCK_WILD_MON);
    let elapsed = 0;
    let result = null;
    while (elapsed < 2000) {
      result = updateTransition(1);
      elapsed++;
      if (result) break;
    }
    // Should complete at ~860ms (allow some tolerance for timer accumulation)
    assert.ok(elapsed >= 850, `Completed too fast: ${elapsed}ms`);
    assert.ok(elapsed <= 870, `Completed too slow: ${elapsed}ms`);
  });

  test('transition returns the exact wildMon object', () => {
    const mon = { id: 99, name: 'SpecificMon', color: '#fff', sprite: 'x' };
    startTransition(mon);
    let result = null;
    for (let t = 0; t < 2000; t += 50) {
      result = updateTransition(50);
      if (result) break;
    }
    assert.strictEqual(result.id, 99);
    assert.strictEqual(result.name, 'SpecificMon');
  });
});
