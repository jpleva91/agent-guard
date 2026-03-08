import assert from 'node:assert';
import { test, suite } from './run.js';

// Mock browser globals
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener() {} };
}
if (typeof globalThis.AudioContext === 'undefined') {
  globalThis.AudioContext = class { constructor() { this.state = 'running'; } };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement() {
      return {
        width: 0, height: 0,
        getContext() {
          return {
            fillStyle: '', globalAlpha: 1, font: '', textAlign: 'left',
            fillRect() {}, fillText() {}, beginPath() {}, fill() {},
            drawImage() {},
          };
        },
      };
    },
  };
}
// Mock Image for sprites.js
if (typeof globalThis.Image === 'undefined') {
  globalThis.Image = class { set src(v) {} };
}

const {
  startEvolutionAnimation,
  updateEvolutionAnimation,
  getEvolutionAnimation,
  clearEvolutionAnimation,
} = await import('../dist/game/evolution/animation.js');

const FROM_MON = { id: 1, name: 'BaseMon', color: '#e74c3c', sprite: 'base' };
const TO_MON = { id: 2, name: 'EvolvedMon', color: '#3498db', sprite: 'evolved' };

suite('Evolution Animation (game/evolution/animation.js)', () => {
  test('startEvolutionAnimation returns animation object', () => {
    const anim = startEvolutionAnimation(FROM_MON, TO_MON);
    assert.ok(anim);
    assert.strictEqual(anim.fromMon, FROM_MON);
    assert.strictEqual(anim.toMon, TO_MON);
    assert.strictEqual(anim.done, false);
    assert.strictEqual(anim.timer, 0);
  });

  test('getEvolutionAnimation returns current animation', () => {
    startEvolutionAnimation(FROM_MON, TO_MON);
    const anim = getEvolutionAnimation();
    assert.ok(anim);
    assert.strictEqual(anim.fromMon.name, 'BaseMon');
  });

  test('clearEvolutionAnimation resets to null', () => {
    startEvolutionAnimation(FROM_MON, TO_MON);
    clearEvolutionAnimation();
    assert.strictEqual(getEvolutionAnimation(), null);
  });

  test('updateEvolutionAnimation returns false while in progress', () => {
    startEvolutionAnimation(FROM_MON, TO_MON);
    const result = updateEvolutionAnimation(100);
    assert.strictEqual(result, false);
  });

  test('updateEvolutionAnimation returns false when no animation', () => {
    clearEvolutionAnimation();
    assert.strictEqual(updateEvolutionAnimation(100), false);
  });

  test('updateEvolutionAnimation returns true when complete', () => {
    startEvolutionAnimation(FROM_MON, TO_MON);
    // Total: 2000+3000+1500+2000 = 8500ms
    let result = false;
    for (let t = 0; t < 10000; t += 100) {
      result = updateEvolutionAnimation(100);
      if (result) break;
    }
    assert.strictEqual(result, true);
  });

  test('animation completes at approximately 8500ms', () => {
    startEvolutionAnimation(FROM_MON, TO_MON);
    let elapsed = 0;
    let done = false;
    while (elapsed < 10000) {
      done = updateEvolutionAnimation(10);
      elapsed += 10;
      if (done) break;
    }
    assert.ok(elapsed >= 8490, `Completed too fast: ${elapsed}ms`);
    assert.ok(elapsed <= 8510, `Completed too slow: ${elapsed}ms`);
  });

  test('animation marks done flag when complete', () => {
    startEvolutionAnimation(FROM_MON, TO_MON);
    for (let t = 0; t < 10000; t += 500) {
      updateEvolutionAnimation(500);
    }
    const anim = getEvolutionAnimation();
    assert.ok(anim.done);
  });
});
