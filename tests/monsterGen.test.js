import assert from 'node:assert';
import { test, suite } from './run.js';

// Mock document.createElement('canvas') for Node.js
if (typeof globalThis.document === 'undefined') {
  const _ops = [];
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext() {
            return {
              fillStyle: '',
              globalAlpha: 1,
              lineWidth: 1,
              strokeStyle: '',
              font: '',
              textAlign: 'left',
              fillRect() {},
              strokeRect() {},
              beginPath() {},
              fill() {},
              stroke() {},
              ellipse() {},
              moveTo() {},
              lineTo() {},
              fillText() {},
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

const { generateMonster, generateEgg } = await import('../dist/game/sprites/monster-gen.js');

suite('Procedural Monster Sprites (game/sprites/monsterGen.js)', () => {
  test('generateMonster returns a canvas-like object', () => {
    const result = generateMonster(1, '#e74c3c', 64);
    assert.ok(result);
    assert.strictEqual(result.width, 64);
    assert.strictEqual(result.height, 64);
  });

  test('generateMonster is deterministic (same inputs = same cached result)', () => {
    const r1 = generateMonster(1, '#e74c3c', 64);
    const r2 = generateMonster(1, '#e74c3c', 64);
    assert.strictEqual(r1, r2, 'Same inputs should return cached result');
  });

  test('generateMonster returns different objects for different IDs', () => {
    const r1 = generateMonster(1, '#e74c3c', 64);
    const r2 = generateMonster(2, '#e74c3c', 64);
    assert.notStrictEqual(r1, r2);
  });

  test('generateMonster returns different objects for different colors', () => {
    const r1 = generateMonster(10, '#e74c3c', 64);
    const r2 = generateMonster(10, '#3498db', 64);
    assert.notStrictEqual(r1, r2);
  });

  test('generateEgg returns a canvas-like object', () => {
    const result = generateEgg(1, '#e74c3c', 64);
    assert.ok(result);
    assert.strictEqual(result.width, 64);
    assert.strictEqual(result.height, 64);
  });

  test('generateEgg is deterministic (cached)', () => {
    const r1 = generateEgg(1, '#e74c3c', 64);
    const r2 = generateEgg(1, '#e74c3c', 64);
    assert.strictEqual(r1, r2);
  });
});
