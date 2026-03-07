import assert from 'node:assert';
import { test, suite } from './run.js';

// Mock document.createElement('canvas') for Node.js
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext() {
            return {
              fillStyle: '',
              fillRect() {},
              beginPath() {},
              fill() {},
              moveTo() {},
              lineTo() {},
              createLinearGradient() {
                return { addColorStop() {} };
              },
            };
          },
        };
      }
      return {};
    },
  };
}

const { initTileTextures, getTileTexture, getGrassFrame, getBattleBackground } =
  await import('../game/sprites/tiles.js');

suite('Procedural Tile Textures (game/sprites/tiles.js)', () => {
  test('initTileTextures runs without error', () => {
    assert.doesNotThrow(() => initTileTextures());
  });

  test('getTileTexture returns ground tile', () => {
    initTileTextures();
    const ground = getTileTexture('ground');
    assert.ok(ground, 'ground tile should exist');
  });

  test('getTileTexture returns wall tile', () => {
    initTileTextures();
    const wall = getTileTexture('wall');
    assert.ok(wall, 'wall tile should exist');
  });

  test('getTileTexture defaults to ground for unknown types', () => {
    initTileTextures();
    const result = getTileTexture('unknown');
    const ground = getTileTexture('ground');
    assert.strictEqual(result, ground);
  });

  test('getGrassFrame returns a tile for different frame counts', () => {
    initTileTextures();
    const f0 = getGrassFrame(0);
    const f15 = getGrassFrame(15);
    const f30 = getGrassFrame(30);
    assert.ok(f0, 'frame 0 should exist');
    assert.ok(f15, 'frame 15 should exist');
    assert.ok(f30, 'frame 30 should exist');
  });

  test('getGrassFrame cycles through 4 frames', () => {
    initTileTextures();
    const f0 = getGrassFrame(0);    // frame index 0
    const f60 = getGrassFrame(60);  // 60/15 = 4, 4 % 4 = 0
    assert.strictEqual(f0, f60, 'should cycle back to frame 0 at count 60');
  });

  test('getBattleBackground returns a canvas', () => {
    initTileTextures();
    const bg = getBattleBackground();
    assert.ok(bg, 'battle background should exist');
  });
});
