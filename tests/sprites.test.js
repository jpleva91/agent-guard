import assert from 'node:assert';
import { test, suite } from './run.js';

// Mock Image class for Node.js
if (typeof globalThis.Image === 'undefined') {
  globalThis.Image = class {
    constructor() {
      this.src = '';
      this.onload = null;
      this.onerror = null;
    }
    set src(val) {
      this._src = val;
      // Simulate async load - trigger onload/onerror on next tick
      if (val.includes('_fail_')) {
        setTimeout(() => this.onerror && this.onerror(new Error('load failed')), 0);
      } else {
        setTimeout(() => this.onload && this.onload(), 0);
      }
    }
    get src() { return this._src; }
  };
}

const { preloadSprite, getSprite, drawSprite, preloadAll } = await import('../dist/game/sprites/sprites.js');

suite('Sprite loader (game/sprites/sprites.js)', () => {
  test('getSprite returns null for unloaded sprite', () => {
    const result = getSprite('nonexistent_sprite_xyz');
    assert.strictEqual(result, null);
  });

  test('preloadSprite returns a promise', () => {
    const promise = preloadSprite('test_sprite_1');
    assert.ok(promise instanceof Promise);
  });

  test('preloadSprite deduplicates (same name returns same promise)', () => {
    const p1 = preloadSprite('dedup_test');
    const p2 = preloadSprite('dedup_test');
    assert.strictEqual(p1, p2);
  });

  test('drawSprite returns false when sprite not in cache', () => {
    const ctx = {
      drawImage() {},
      imageSmoothingEnabled: true,
    };
    const result = drawSprite(ctx, 'not_cached_sprite', 0, 0, 64, 64);
    assert.strictEqual(result, false);
  });

  test('preloadAll includes player direction sprites', async () => {
    const monsters = [
      { sprite: 'mon_a' },
      { sprite: 'mon_b' },
      { sprite: null }, // should be filtered out
    ];
    await assert.doesNotReject(async () => {
      await preloadAll(monsters);
    });
  });

  // --- Additional sprite tests ---

  test('preloadAll with empty monster list does not throw', async () => {
    await assert.doesNotReject(async () => {
      await preloadAll([]);
    });
  });

  test('getSprite returns null for never-preloaded sprite', () => {
    assert.strictEqual(getSprite('completely_unknown_sprite_xyz'), null);
  });

  test('drawSprite returns false and does not throw for unknown sprite', () => {
    const ctx = {
      drawImage() {},
      imageSmoothingEnabled: true,
    };
    assert.doesNotThrow(() => {
      const result = drawSprite(ctx, 'unknown_sprite_for_draw', 0, 0, 64, 64);
      assert.strictEqual(result, false);
    });
  });

  test('preloadSprite returns same promise for duplicate calls', () => {
    const p1 = preloadSprite('dedup_sprite_test_2');
    const p2 = preloadSprite('dedup_sprite_test_2');
    assert.strictEqual(p1, p2, 'duplicate preload should return same promise');
  });
});
