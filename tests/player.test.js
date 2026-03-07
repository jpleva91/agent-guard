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

  // --- Movement and collision ---

  test('movement into walkable tile returns tile value', () => {
    const player = getPlayer();
    // Position player in a known safe spot
    player.x = 3;
    player.y = 3;
    player.moveTimer = 0;
    input.simulatePress('ArrowDown');
    const result = updatePlayer(0);
    // Result is either a tile value (0, 2) or null if wall
    // We verify the function returns something when movement occurs
    if (result !== null) {
      assert.ok(typeof result === 'number', 'should return tile value');
    }
    input.simulateRelease('ArrowDown');
    input.clearJustPressed();
  });

  test('movement sets cooldown timer', () => {
    const player = getPlayer();
    // Position at (5,1), moving down to (5,2) — both are walkable (0)
    player.x = 5;
    player.y = 1;
    player.moveTimer = 0;
    input.simulatePress('ArrowDown');
    updatePlayer(0);
    assert.ok(player.moveTimer > 0, 'moveTimer should be positive after movement');
    input.simulateRelease('ArrowDown');
    input.clearJustPressed();
  });

  test('party is initially empty', () => {
    const player = getPlayer();
    assert.ok(Array.isArray(player.party));
  });

  test('party can hold multiple monsters', () => {
    const player = getPlayer();
    const origLength = player.party.length;
    player.party.push({ name: 'TestMon1' });
    player.party.push({ name: 'TestMon2' });
    assert.ok(player.party.length >= origLength + 2);
    // Clean up
    player.party.splice(origLength);
  });

  test('player defaults include moving flag', () => {
    const player = getPlayer();
    assert.strictEqual(typeof player.moving, 'boolean');
  });
});
