import assert from 'node:assert';
import { test, suite } from './run.js';

// Mock localStorage for Node.js
const store = {};
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { for (const k in store) delete store[k]; },
  };
}

const { saveGame, loadGame, hasSave, applySave, recordBrowserCache } =
  await import('../dist/game/sync/save.js');

const MOCK_PLAYER = {
  x: 3,
  y: 7,
  dir: 'down',
  party: [
    { id: 1, name: 'NullPointer', type: 'backend', hp: 30, currentHP: 25, attack: 8, defense: 4, speed: 6, moves: ['segfault'], color: '#e74c3c', sprite: 'nullpointer', rarity: 'common', evolution: 'OptionalChaining', evolvesTo: 21 },
  ],
};

suite('Save/load system (game/sync/save.js)', () => {
  test('hasSave returns false when no save exists', () => {
    localStorage.clear();
    assert.strictEqual(hasSave(), false);
  });

  test('saveGame returns true on success', () => {
    localStorage.clear();
    const result = saveGame(MOCK_PLAYER);
    assert.strictEqual(result, true);
  });

  test('hasSave returns true after saveGame', () => {
    localStorage.clear();
    saveGame(MOCK_PLAYER);
    assert.strictEqual(hasSave(), true);
  });

  test('loadGame returns null when no save exists', () => {
    localStorage.clear();
    assert.strictEqual(loadGame(), null);
  });

  test('loadGame returns saved data', () => {
    localStorage.clear();
    saveGame(MOCK_PLAYER);
    const loaded = loadGame();
    assert.ok(loaded);
    assert.strictEqual(loaded.version, 1);
    assert.ok(loaded.timestamp);
    assert.strictEqual(loaded.player.x, 3);
    assert.strictEqual(loaded.player.y, 7);
  });

  test('round-trip preserves player position and party', () => {
    localStorage.clear();
    saveGame(MOCK_PLAYER);
    const loaded = loadGame();
    assert.strictEqual(loaded.player.x, MOCK_PLAYER.x);
    assert.strictEqual(loaded.player.y, MOCK_PLAYER.y);
    assert.strictEqual(loaded.player.dir, MOCK_PLAYER.dir);
    assert.strictEqual(loaded.player.party.length, 1);
    assert.strictEqual(loaded.player.party[0].name, 'NullPointer');
    assert.strictEqual(loaded.player.party[0].currentHP, 25);
  });

  test('applySave restores player state', () => {
    localStorage.clear();
    saveGame(MOCK_PLAYER);
    const loaded = loadGame();
    const player = { x: 0, y: 0, dir: 'up', party: [] };
    applySave(player, loaded);
    assert.strictEqual(player.x, 3);
    assert.strictEqual(player.y, 7);
    assert.strictEqual(player.dir, 'down');
    assert.strictEqual(player.party.length, 1);
  });

  test('applySave does nothing with null saveData', () => {
    const player = { x: 5, y: 5, dir: 'up', party: [] };
    applySave(player, null);
    assert.strictEqual(player.x, 5);
  });

  test('loadGame returns null for corrupted data', () => {
    localStorage.clear();
    localStorage.setItem('bugmon_save', 'not json');
    assert.strictEqual(loadGame(), null);
  });

  test('loadGame returns null for data missing player', () => {
    localStorage.clear();
    localStorage.setItem('bugmon_save', JSON.stringify({ version: 1 }));
    assert.strictEqual(loadGame(), null);
  });

  test('recordBrowserCache updates seen count', () => {
    localStorage.clear();
    saveGame(MOCK_PLAYER);
    recordBrowserCache({ id: 1 });
    const loaded = loadGame();
    assert.strictEqual(loaded.bugdex.seen[1], 1);
    recordBrowserCache({ id: 1 });
    const loaded2 = loadGame();
    assert.strictEqual(loaded2.bugdex.seen[1], 2);
  });

  test('recordBrowserCache increments totalCached', () => {
    localStorage.clear();
    saveGame(MOCK_PLAYER);
    recordBrowserCache({ id: 1 });
    recordBrowserCache({ id: 2 });
    const loaded = loadGame();
    assert.strictEqual(loaded.bugdex.stats.totalCached, 2);
  });

  // Edge case tests
  test('save with empty party', () => {
    localStorage.clear();
    const emptyParty = { x: 0, y: 0, dir: 'down', party: [] };
    assert.strictEqual(saveGame(emptyParty), true);
    const loaded = loadGame();
    assert.deepStrictEqual(loaded.player.party, []);
  });

  test('save with max party size (6 monsters)', () => {
    localStorage.clear();
    const fullParty = {
      x: 5, y: 5, dir: 'up',
      party: Array.from({ length: 6 }, (_, i) => ({
        id: i + 1, name: `Mon${i}`, type: 'backend', hp: 30, currentHP: 25,
        attack: 8, defense: 4, speed: 6, moves: ['segfault'], color: '#e74c3c',
        sprite: 'test', rarity: 'common',
      })),
    };
    saveGame(fullParty);
    const loaded = loadGame();
    assert.strictEqual(loaded.player.party.length, 6);
  });

  test('multiple sequential saves overwrite correctly', () => {
    localStorage.clear();
    saveGame({ x: 1, y: 1, dir: 'down', party: [] });
    saveGame({ x: 9, y: 9, dir: 'up', party: [] });
    const loaded = loadGame();
    assert.strictEqual(loaded.player.x, 9);
    assert.strictEqual(loaded.player.y, 9);
    assert.strictEqual(loaded.player.dir, 'up');
  });

  test('save data with multiple bugdex entries', () => {
    localStorage.clear();
    saveGame(MOCK_PLAYER);
    recordBrowserCache({ id: 1 });
    recordBrowserCache({ id: 2 });
    recordBrowserCache({ id: 1 });
    const loaded = loadGame();
    assert.strictEqual(loaded.bugdex.seen[1], 2);
    assert.strictEqual(loaded.bugdex.seen[2], 1);
  });

  // --- localStorage quota handling ---

  test('saveGame handles localStorage quota exceeded gracefully', () => {
    localStorage.clear();
    // Override setItem to throw
    const origSet = localStorage.setItem;
    localStorage.setItem = () => { throw new DOMException('quota exceeded', 'QuotaExceededError'); };
    const result = saveGame(MOCK_PLAYER);
    assert.strictEqual(result, false, 'should return false when storage is full');
    localStorage.setItem = origSet;
  });

  test('loadGame handles save with extra fields (forward compat)', () => {
    localStorage.clear();
    const extendedSave = {
      version: 1,
      timestamp: Date.now(),
      player: { x: 3, y: 7, dir: 'down', party: [] },
      bugdex: { seen: {}, storage: [], stats: {} },
      futureField: 'some new data',
    };
    localStorage.setItem('bugmon_save', JSON.stringify(extendedSave));
    const loaded = loadGame();
    assert.ok(loaded, 'should load successfully with extra fields');
    assert.strictEqual(loaded.player.x, 3);
  });

  test('applySave with evolved monster party member', () => {
    localStorage.clear();
    const evolvedParty = {
      ...MOCK_PLAYER,
      party: [{
        id: 21, name: 'OptionalChaining', type: 'backend', hp: 45, currentHP: 40,
        attack: 12, defense: 7, speed: 9, moves: ['segfault', 'nullcheck'],
        color: '#2ecc71', sprite: 'optionalchaining', rarity: 'evolved',
      }],
    };
    saveGame(evolvedParty);
    const loaded = loadGame();
    const player = { x: 0, y: 0, dir: 'up', party: [] };
    applySave(player, loaded);
    assert.strictEqual(player.party[0].name, 'OptionalChaining');
    assert.strictEqual(player.party[0].currentHP, 40);
    assert.strictEqual(player.party[0].rarity, 'evolved');
  });

  test('recordBrowserCache without prior save does nothing', () => {
    localStorage.clear();
    // No save exists, recordBrowserCache should not throw
    assert.doesNotThrow(() => recordBrowserCache({ id: 1 }));
  });

  test('saveGame serializes currentHP correctly for wounded monsters', () => {
    localStorage.clear();
    const woundedPlayer = {
      ...MOCK_PLAYER,
      party: [{ ...MOCK_PLAYER.party[0], currentHP: 1 }],
    };
    saveGame(woundedPlayer);
    const loaded = loadGame();
    assert.strictEqual(loaded.player.party[0].currentHP, 1);
  });
});
