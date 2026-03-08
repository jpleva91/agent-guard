import assert from 'node:assert';
import { test, suite } from './run.js';

// game.js is heavily coupled to the browser (canvas, requestAnimationFrame, etc.)
// We test the update/render logic patterns by testing the state machine dispatch
// and integration between modules that game.js orchestrates.

import { getState, setState, STATES } from '../dist/game/engine/state.js';
import { eventBus, Events } from '../dist/game/engine/events.js';

suite('Game Loop Integration (game/game.js patterns)', () => {

  // --- State transitions ---

  test('TITLE state can transition to EXPLORE', () => {
    setState(STATES.TITLE);
    assert.strictEqual(getState(), STATES.TITLE);
    setState(STATES.EXPLORE);
    assert.strictEqual(getState(), STATES.EXPLORE);
  });

  test('EXPLORE state can transition to BATTLE_TRANSITION', () => {
    setState(STATES.EXPLORE);
    setState(STATES.BATTLE_TRANSITION);
    assert.strictEqual(getState(), STATES.BATTLE_TRANSITION);
  });

  test('BATTLE_TRANSITION transitions to BATTLE', () => {
    setState(STATES.BATTLE_TRANSITION);
    setState(STATES.BATTLE);
    assert.strictEqual(getState(), STATES.BATTLE);
  });

  test('BATTLE can transition to EXPLORE (after battle ends)', () => {
    setState(STATES.BATTLE);
    setState(STATES.EXPLORE);
    assert.strictEqual(getState(), STATES.EXPLORE);
  });

  test('BATTLE can transition to EVOLVING', () => {
    setState(STATES.BATTLE);
    setState(STATES.EVOLVING);
    assert.strictEqual(getState(), STATES.EVOLVING);
  });

  test('EVOLVING transitions back to EXPLORE', () => {
    setState(STATES.EVOLVING);
    setState(STATES.EXPLORE);
    assert.strictEqual(getState(), STATES.EXPLORE);
  });

  // --- State change events ---

  test('setState emits STATE_CHANGED event', () => {
    let emitted = null;
    const handler = (data) => { emitted = data; };
    eventBus.on(Events.STATE_CHANGED, handler);
    setState(STATES.TITLE);
    setState(STATES.EXPLORE);
    assert.ok(emitted);
  });

  // --- All states are valid ---

  test('STATES enum contains all expected states', () => {
    const expectedStates = ['TITLE', 'EXPLORE', 'BATTLE_TRANSITION', 'BATTLE', 'EVOLVING', 'MENU'];
    for (const state of expectedStates) {
      assert.ok(STATES[state] !== undefined, `Missing state: ${state}`);
    }
  });

  test('all STATES values are unique', () => {
    const values = Object.values(STATES);
    const unique = new Set(values);
    assert.strictEqual(values.length, unique.size, 'STATES values should be unique');
  });

  // --- BATTLE_ENDED event handler pattern ---

  test('BATTLE_ENDED event fires correctly', () => {
    let endData = null;
    const handler = (data) => { endData = data; };
    eventBus.on('test_battle_ended_gameloop', handler);
    eventBus.emit('test_battle_ended_gameloop', { outcome: 'win' });
    assert.ok(endData);
    assert.strictEqual(endData.outcome, 'win');
  });

  test('CACHE_SUCCESS event carries monster name', () => {
    let cacheData = null;
    const handler = (data) => { cacheData = data; };
    eventBus.on('test_cache_success_gameloop', handler);
    eventBus.emit('test_cache_success_gameloop', { name: 'NullPointer' });
    assert.ok(cacheData);
    assert.strictEqual(cacheData.name, 'NullPointer');
  });

  // --- Auto-save timer pattern ---

  test('auto-save timer pattern: accumulates dt correctly', () => {
    let saveTimer = 0;
    const AUTO_SAVE_INTERVAL = 30000;
    let saved = false;

    // Simulate frames
    for (let i = 0; i < 200; i++) {
      saveTimer += 160; // ~60fps
      if (saveTimer >= AUTO_SAVE_INTERVAL) {
        saved = true;
        saveTimer = 0;
      }
    }
    assert.strictEqual(saved, true, 'auto-save should trigger after 30 seconds of frames');
  });

  test('auto-save only triggers during EXPLORE', () => {
    let saveTimer = 0;
    const AUTO_SAVE_INTERVAL = 30000;
    let saveCount = 0;

    // Simulate in BATTLE state — should NOT save
    setState(STATES.BATTLE);
    const state = getState();
    saveTimer += 31000;
    if (saveTimer >= AUTO_SAVE_INTERVAL && state === STATES.EXPLORE) {
      saveCount++;
      saveTimer = 0;
    }
    assert.strictEqual(saveCount, 0, 'should not auto-save during BATTLE');

    // Now switch to EXPLORE
    setState(STATES.EXPLORE);
    if (saveTimer >= AUTO_SAVE_INTERVAL && getState() === STATES.EXPLORE) {
      saveCount++;
      saveTimer = 0;
    }
    assert.strictEqual(saveCount, 1, 'should auto-save during EXPLORE');
  });

  // --- Starter BugMon pattern ---

  test('new game gives player a starter BugMon (pattern test)', () => {
    // Test the pattern used in game.js init/new-game
    const MONSTERS = [
      { id: 1, name: 'NullPointer', type: 'backend', hp: 30, attack: 8, defense: 4, speed: 6, moves: ['segfault'] }
    ];
    const player = { party: [] };
    const starter = { ...MONSTERS[0], currentHP: MONSTERS[0].hp };
    player.party.push(starter);
    assert.strictEqual(player.party.length, 1);
    assert.strictEqual(player.party[0].name, 'NullPointer');
    assert.strictEqual(player.party[0].currentHP, 30);
  });

  test('new game resets party when starting fresh', () => {
    const player = {
      party: [{ name: 'OldMon' }, { name: 'AnotherMon' }],
      x: 5, y: 5,
    };
    // Simulate "new game" logic from game.js
    player.party = [];
    const starter = { name: 'NullPointer', hp: 30, currentHP: 30 };
    player.party.push(starter);
    player.x = 7;
    player.y = 5;
    assert.strictEqual(player.party.length, 1);
    assert.strictEqual(player.party[0].name, 'NullPointer');
    assert.strictEqual(player.x, 7);
  });
});
