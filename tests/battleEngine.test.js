import assert from 'node:assert';
import { test, suite } from './run.js';

// Mock browser globals (may already be mocked by prior test files)
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener() {} };
}
if (typeof globalThis.AudioContext === 'undefined') {
  globalThis.AudioContext = class {
    constructor() { this.state = 'running'; }
    createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    createBufferSource() { return { connect() {}, start() {}, buffer: null }; }
    createBuffer(_ch, len, _rate) { return { getChannelData() { return new Float32Array(len); } }; }
    get destination() { return {}; }
    get currentTime() { return 0; }
    resume() { return Promise.resolve(); }
  };
}
const store = {};
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { for (const k in store) delete store[k]; },
  };
}

import { eventBus, Events } from '../dist/game/engine/events.js';
import { simulatePress, simulateRelease, clearJustPressed } from '../dist/game/engine/input.js';

const { setMovesData, setTypeData, startBattle, getBattle, updateBattle } =
  await import('../dist/game/battle/battle-engine.js');

const playerMod = await import('../dist/game/world/player.js');
const _player = playerMod.getPlayer();

suite('Battle Engine UI (game/battle/battleEngine.js)', () => {
  const movesData = [
    { id: 'segfault', name: 'SegFault', power: 10, type: 'backend' },
    { id: 'layoutshift', name: 'LayoutShift', power: 7, type: 'frontend' },
    { id: 'hotfix', name: 'Hotfix', power: 12, type: 'devops', category: 'heal' },
  ];

  const typeData = {
    effectiveness: {
      backend:  { frontend: 0.5, backend: 1.0, devops: 1.5 },
      frontend: { frontend: 1.0, backend: 1.5, devops: 1.0 },
    },
  };

  const playerMon = {
    id: 1, name: 'NullPointer', type: 'backend', hp: 30, currentHP: 30,
    attack: 8, defense: 4, speed: 6, moves: ['segfault'],
    color: '#e74c3c', sprite: 'nullpointer', rarity: 'common',
  };

  const wildMon = {
    id: 2, name: 'CSSGlitch', type: 'frontend', hp: 35, currentHP: 35,
    attack: 7, defense: 8, speed: 3, moves: ['layoutshift'],
    color: '#3498db', sprite: 'cssglitch', rarity: 'common',
  };

  function resetPlayer() {
    _player.party.length = 0;
    _player.party.push({ ...playerMon });
    _player.x = 1;
    _player.y = 1;
  }

  function initBattle(customWild) {
    setMovesData(movesData);
    setTypeData(typeData);
    clearJustPressed();
    resetPlayer();
    return startBattle(customWild || { ...wildMon });
  }

  // --- startBattle tests ---

  test('startBattle creates battle with correct initial state', () => {
    const battle = initBattle();
    assert.ok(battle);
    assert.strictEqual(battle.state, 'menu');
    assert.strictEqual(battle.menuIndex, 0);
    assert.strictEqual(battle.moveIndex, 0);
    assert.strictEqual(battle.message, '');
    assert.strictEqual(battle.nextAction, null);
  });

  test('startBattle copies enemy BugMon correctly', () => {
    const battle = initBattle();
    assert.strictEqual(battle.enemy.name, 'CSSGlitch');
    assert.strictEqual(battle.enemy.currentHP, 35);
    assert.strictEqual(battle.enemy.hp, 35);
  });

  test('startBattle copies player BugMon from party[0]', () => {
    const battle = initBattle();
    assert.strictEqual(battle.playerMon.name, 'NullPointer');
    assert.strictEqual(battle.playerMon.currentHP, 30);
  });

  test('startBattle emits BATTLE_STARTED event', () => {
    let eventData = null;
    const handler = (data) => { eventData = data; };
    eventBus.on(Events.BATTLE_STARTED, handler);
    initBattle();
    assert.ok(eventData);
    assert.strictEqual(eventData.playerMon, 'NullPointer');
    assert.strictEqual(eventData.enemy, 'CSSGlitch');
  });

  test('getBattle returns current battle after startBattle', () => {
    initBattle();
    assert.ok(getBattle() !== null);
  });

  // --- Menu navigation tests ---

  test('ArrowRight increments menuIndex', () => {
    const battle = initBattle();
    simulatePress('ArrowRight');
    updateBattle(0);
    assert.strictEqual(battle.menuIndex, 1);
    simulateRelease('ArrowRight');
    clearJustPressed();
  });

  test('ArrowLeft decrements menuIndex', () => {
    const battle = initBattle();
    battle.menuIndex = 2;
    simulatePress('ArrowLeft');
    updateBattle(0);
    assert.strictEqual(battle.menuIndex, 1);
    simulateRelease('ArrowLeft');
    clearJustPressed();
  });

  test('menuIndex clamps at 0 (cannot go below)', () => {
    const battle = initBattle();
    battle.menuIndex = 0;
    simulatePress('ArrowLeft');
    updateBattle(0);
    assert.strictEqual(battle.menuIndex, 0);
    simulateRelease('ArrowLeft');
    clearJustPressed();
  });

  test('menuIndex clamps at 2 (cannot go above)', () => {
    const battle = initBattle();
    battle.menuIndex = 2;
    simulatePress('ArrowRight');
    updateBattle(0);
    assert.strictEqual(battle.menuIndex, 2);
    simulateRelease('ArrowRight');
    clearJustPressed();
  });

  // --- Fight submenu tests ---

  test('Enter on menuIndex 0 transitions to fight state', () => {
    const battle = initBattle();
    battle.menuIndex = 0;
    simulatePress('Enter');
    updateBattle(0);
    assert.strictEqual(battle.state, 'fight');
    assert.strictEqual(battle.moveIndex, 0);
    simulateRelease('Enter');
    clearJustPressed();
  });

  test('Escape in fight state returns to menu', () => {
    const battle = initBattle();
    battle.state = 'fight';
    simulatePress('Escape');
    updateBattle(0);
    assert.strictEqual(battle.state, 'menu');
    simulateRelease('Escape');
    clearJustPressed();
  });

  // --- Run away tests ---

  test('Enter on menuIndex 2 triggers run away message', () => {
    const battle = initBattle();
    battle.menuIndex = 2;
    simulatePress('Enter');
    updateBattle(0);
    assert.strictEqual(battle.state, 'message');
    assert.strictEqual(battle.message, 'Got away safely!');
    simulateRelease('Enter');
    clearJustPressed();
  });

  // --- Message timer tests ---

  test('message state decrements timer and fires nextAction when done', () => {
    const battle = initBattle();
    let called = false;
    battle.state = 'message';
    battle.message = 'Test message';
    battle.nextAction = () => { called = true; };
    updateBattle(1600);
    assert.strictEqual(called, true);
    assert.strictEqual(battle.nextAction, null);
  });

  test('message state does not fire nextAction before timer expires', () => {
    // Trigger message via run-away to properly set internal messageTimer
    const battle = initBattle();
    battle.menuIndex = 2;
    simulatePress('Enter');
    updateBattle(0); // triggers showMessage('Got away safely!'), sets timer to 1500
    simulateRelease('Enter');
    clearJustPressed();
    // Replace the nextAction to track if it fires
    let called = false;
    battle.nextAction = () => { called = true; };
    updateBattle(500); // only 500ms, timer should still have 1000ms left
    assert.strictEqual(called, false, 'nextAction should not fire before timer expires');
  });

  test('updateBattle does nothing when battle is null', () => {
    const battle = initBattle();
    battle.menuIndex = 2;
    simulatePress('Enter');
    updateBattle(0);
    simulateRelease('Enter');
    clearJustPressed();
    updateBattle(2000); // message timer expires, triggers endBattle
    assert.strictEqual(getBattle(), null);
    assert.doesNotThrow(() => updateBattle(100));
  });

  // --- Turn execution tests ---

  test('selecting a move in fight state triggers turn execution', () => {
    const battle = initBattle();
    battle.state = 'fight';
    battle.moveIndex = 0;
    simulatePress('Enter');
    updateBattle(0);
    assert.strictEqual(battle.state, 'message');
    assert.ok(battle.message.length > 0);
    simulateRelease('Enter');
    clearJustPressed();
  });

  test('player-first turn: faster player attacks first', () => {
    const battle = initBattle();
    battle.state = 'fight';
    battle.moveIndex = 0;
    simulatePress('Enter');
    updateBattle(0);
    assert.ok(battle.message.includes('SegFault') || battle.message.includes('NullPointer'),
      `Expected message about player attack, got: ${battle.message}`);
    simulateRelease('Enter');
    clearJustPressed();
  });

  test('enemy-first turn: slower player gets hit first', () => {
    resetPlayer();
    _player.party[0] = { ...playerMon, speed: 1 };
    setMovesData(movesData);
    setTypeData(typeData);
    clearJustPressed();
    const battle = startBattle({ ...wildMon, speed: 10 });
    battle.state = 'fight';
    battle.moveIndex = 0;
    simulatePress('Enter');
    updateBattle(0);
    assert.ok(battle.message.includes('LayoutShift') || battle.message.includes('CSSGlitch'),
      `Expected message about enemy attack, got: ${battle.message}`);
    simulateRelease('Enter');
    clearJustPressed();
  });

  // --- Cache attempt tests ---

  test('menuIndex 1 triggers cache attempt', () => {
    const battle = initBattle();
    battle.menuIndex = 1;
    simulatePress('Enter');
    updateBattle(0);
    assert.strictEqual(battle.state, 'message');
    assert.ok(
      battle.message.includes('Cached') || battle.message.includes('evicted'),
      `Expected cache-related message, got: ${battle.message}`
    );
    simulateRelease('Enter');
    clearJustPressed();
  });

  // --- BATTLE_ENDED event tests ---

  test('running away emits BATTLE_ENDED event', () => {
    let endEvent = null;
    const handler = (data) => { endEvent = data; };
    eventBus.on(Events.BATTLE_ENDED, handler);
    const battle = initBattle();
    battle.menuIndex = 2;
    simulatePress('Enter');
    updateBattle(0);
    simulateRelease('Enter');
    clearJustPressed();
    updateBattle(2000);
    assert.ok(endEvent);
    assert.strictEqual(endEvent.outcome, 'other');
  });

  // --- HP sync tests ---

  test('player HP syncs back to party after battle ends', () => {
    resetPlayer();
    _player.party[0].currentHP = 30;
    setMovesData(movesData);
    setTypeData(typeData);
    clearJustPressed();
    const battle = startBattle({ ...wildMon });
    battle.playerMon.currentHP = 15;
    battle.menuIndex = 2;
    simulatePress('Enter');
    updateBattle(0);
    simulateRelease('Enter');
    clearJustPressed();
    updateBattle(2000);
    assert.strictEqual(_player.party[0].currentHP, 15);
  });

  // --- Heal move in fight ---

  test('heal move in fight shows heal message', () => {
    resetPlayer();
    _player.party[0] = { ...playerMon, currentHP: 15, moves: ['hotfix'] };
    setMovesData(movesData);
    setTypeData(typeData);
    clearJustPressed();
    const battle = startBattle({ ...wildMon });
    battle.state = 'fight';
    battle.moveIndex = 0;
    simulatePress('Enter');
    updateBattle(0);
    assert.ok(battle.message.includes('Hotfix'),
      `Expected heal move message, got: ${battle.message}`);
    simulateRelease('Enter');
    clearJustPressed();
  });

  // --- Move index navigation in fight ---

  test('moveIndex navigates correctly with multiple moves', () => {
    resetPlayer();
    _player.party[0] = { ...playerMon, moves: ['segfault', 'layoutshift'] };
    setMovesData(movesData);
    setTypeData(typeData);
    clearJustPressed();
    const battle = startBattle({ ...wildMon });
    battle.state = 'fight';
    battle.moveIndex = 0;
    simulatePress('ArrowRight');
    updateBattle(0);
    assert.strictEqual(battle.moveIndex, 1);
    simulateRelease('ArrowRight');
    clearJustPressed();
  });

  test('moveIndex clamps at 0 in fight', () => {
    const battle = initBattle();
    battle.state = 'fight';
    battle.moveIndex = 0;
    simulatePress('ArrowLeft');
    updateBattle(0);
    assert.strictEqual(battle.moveIndex, 0);
    simulateRelease('ArrowLeft');
    clearJustPressed();
  });

  test('moveIndex clamps at moveCount - 1', () => {
    const battle = initBattle();
    battle.state = 'fight';
    battle.moveIndex = 0;
    simulatePress('ArrowRight');
    updateBattle(0);
    assert.strictEqual(battle.moveIndex, 0); // 1 move, can't go higher
    simulateRelease('ArrowRight');
    clearJustPressed();
  });
});
