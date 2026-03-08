import assert from 'node:assert';
import { test, suite } from './run.js';
import { getState, setState, STATES } from '../dist/game/engine/state.js';
import { eventBus, Events } from '../dist/game/engine/events.js';

suite('Game state machine (game/engine/state.js)', () => {
  test('STATES contains all expected states', () => {
    const expected = ['TITLE', 'EXPLORE', 'BATTLE_TRANSITION', 'BATTLE', 'EVOLVING', 'MENU'];
    for (const s of expected) {
      assert.ok(STATES[s], `Missing state: ${s}`);
      assert.strictEqual(STATES[s], s);
    }
  });

  test('getState returns current state', () => {
    const state = getState();
    assert.ok(Object.values(STATES).includes(state), `Invalid state: ${state}`);
  });

  test('setState changes current state', () => {
    const original = getState();
    setState(STATES.EXPLORE);
    assert.strictEqual(getState(), STATES.EXPLORE);
    setState(STATES.BATTLE);
    assert.strictEqual(getState(), STATES.BATTLE);
    // Restore
    setState(original);
  });

  test('setState emits STATE_CHANGED event with from/to', () => {
    const original = getState();
    let received = null;
    eventBus.on(Events.STATE_CHANGED, (data) => { received = data; });
    setState(STATES.MENU);
    assert.ok(received, 'STATE_CHANGED event should have been emitted');
    assert.strictEqual(received.to, STATES.MENU);
    assert.ok(received.from !== undefined, 'should include from state');
    // Restore
    setState(original);
  });

  test('setState to same state still emits event', () => {
    setState(STATES.EXPLORE);
    let emitted = false;
    eventBus.on('STATE_CHANGED', () => { emitted = true; });
    setState(STATES.EXPLORE);
    assert.strictEqual(emitted, true);
  });

  test('all state transitions work', () => {
    const original = getState();
    for (const state of Object.values(STATES)) {
      setState(state);
      assert.strictEqual(getState(), state);
    }
    setState(original);
  });
});
