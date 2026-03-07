import assert from 'node:assert';
import { test, suite } from './run.js';

// Mock browser globals
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener() {} };
}
if (typeof globalThis.AudioContext === 'undefined') {
  globalThis.AudioContext = class { constructor() { this.state = 'running'; } };
}

const { getPlayer, updatePlayer } = await import('../game/world/player.js');
const input = await import('../game/engine/input.js');

suite('Player state & movement (game/world/player.js)', () => {
  test('getPlayer returns player object with expected defaults', () => {
    const player = getPlayer();
    assert.ok(player);
    assert.strictEqual(typeof player.x, 'number');
    assert.strictEqual(typeof player.y, 'number');
    assert.strictEqual(player.dir, 'down');
    assert.ok(Array.isArray(player.party));
  });

  test('getPlayer returns the same object reference', () => {
    const p1 = getPlayer();
    const p2 = getPlayer();
    assert.strictEqual(p1, p2);
  });

  test('updatePlayer returns null when no keys are pressed', () => {
    const player = getPlayer();
    player.moveTimer = 0;
    input.clearJustPressed();
    const result = updatePlayer(0);
    assert.strictEqual(result, null);
  });

  test('updatePlayer returns null during move cooldown', () => {
    const player = getPlayer();
    player.moveTimer = 100; // still in cooldown
    input.simulatePress('ArrowDown');
    const result = updatePlayer(50);
    assert.strictEqual(result, null);
    input.simulateRelease('ArrowDown');
    input.clearJustPressed();
  });

  test('updatePlayer decrements moveTimer', () => {
    const player = getPlayer();
    player.moveTimer = 100;
    updatePlayer(30);
    assert.ok(player.moveTimer <= 70);
  });

  test('pressing ArrowDown changes direction to down', () => {
    const player = getPlayer();
    player.moveTimer = 0;
    player.dir = 'up'; // start at a different direction
    input.simulatePress('ArrowDown');
    updatePlayer(0);
    assert.strictEqual(player.dir, 'down');
    input.simulateRelease('ArrowDown');
    input.clearJustPressed();
  });

  test('pressing ArrowUp changes direction to up', () => {
    const player = getPlayer();
    player.moveTimer = 0;
    player.dir = 'down';
    input.simulatePress('ArrowUp');
    updatePlayer(0);
    assert.strictEqual(player.dir, 'up');
    input.simulateRelease('ArrowUp');
    input.clearJustPressed();
  });

  test('pressing ArrowLeft changes direction to left', () => {
    const player = getPlayer();
    player.moveTimer = 0;
    player.dir = 'down';
    input.simulatePress('ArrowLeft');
    updatePlayer(0);
    assert.strictEqual(player.dir, 'left');
    input.simulateRelease('ArrowLeft');
    input.clearJustPressed();
  });

  test('pressing ArrowRight changes direction to right', () => {
    const player = getPlayer();
    player.moveTimer = 0;
    player.dir = 'down';
    input.simulatePress('ArrowRight');
    updatePlayer(0);
    assert.strictEqual(player.dir, 'right');
    input.simulateRelease('ArrowRight');
    input.clearJustPressed();
  });
});
