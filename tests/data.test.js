import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { test, suite } from './run.js';

const root = new URL('../', import.meta.url);
const monsters = JSON.parse(await readFile(new URL('ecosystem/data/monsters.json', root), 'utf-8'));
const moves = JSON.parse(await readFile(new URL('ecosystem/data/moves.json', root), 'utf-8'));
const types = JSON.parse(await readFile(new URL('ecosystem/data/types.json', root), 'utf-8'));
const map = JSON.parse(await readFile(new URL('ecosystem/data/map.json', root), 'utf-8'));
const evolutions = JSON.parse(await readFile(new URL('ecosystem/data/evolutions.json', root), 'utf-8'));

const moveIds = new Set(moves.map(m => m.id));
const typeNames = new Set(types.types);

suite('Data Validation (data/*.json)', () => {
  test('all monsters have required fields', () => {
    const required = ['id', 'name', 'type', 'hp', 'attack', 'defense', 'speed', 'moves'];
    for (const mon of monsters) {
      for (const field of required) {
        assert.ok(mon[field] !== undefined, `${mon.name || mon.id} missing field: ${field}`);
      }
    }
  });

  test('no duplicate monster IDs', () => {
    const ids = monsters.map(m => m.id);
    const unique = new Set(ids);
    assert.strictEqual(ids.length, unique.size, `duplicate monster IDs found: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  });

  test('all monster move IDs reference valid moves', () => {
    for (const mon of monsters) {
      for (const moveId of mon.moves) {
        assert.ok(moveIds.has(moveId), `${mon.name} has invalid move ID: ${moveId}`);
      }
    }
  });

  test('all monster types are valid', () => {
    for (const mon of monsters) {
      assert.ok(typeNames.has(mon.type), `${mon.name} has invalid type: ${mon.type}`);
    }
  });

  test('monster stats are positive numbers', () => {
    for (const mon of monsters) {
      assert.ok(mon.hp > 0, `${mon.name} hp should be positive`);
      assert.ok(mon.attack > 0, `${mon.name} attack should be positive`);
      assert.ok(mon.defense > 0, `${mon.name} defense should be positive`);
      assert.ok(mon.speed > 0, `${mon.name} speed should be positive`);
    }
  });

  test('all moves have required fields', () => {
    const required = ['id', 'name', 'power', 'type'];
    for (const move of moves) {
      for (const field of required) {
        assert.ok(move[field] !== undefined, `move ${move.name || move.id} missing field: ${field}`);
      }
    }
  });

  test('no duplicate move IDs', () => {
    const ids = moves.map(m => m.id);
    const unique = new Set(ids);
    assert.strictEqual(ids.length, unique.size, `duplicate move IDs found`);
  });

  test('all move types are valid', () => {
    for (const move of moves) {
      assert.ok(typeNames.has(move.type), `move ${move.name} has invalid type: ${move.type}`);
    }
  });

  test('move power is a positive number', () => {
    for (const move of moves) {
      assert.ok(move.power > 0, `move ${move.name} power should be positive`);
    }
  });

  test('type effectiveness chart has entries for all types', () => {
    for (const type of typeNames) {
      assert.ok(types.effectiveness[type], `type chart missing entry for: ${type}`);
    }
  });

  test('type effectiveness values are valid (0.5, 1.0, or 1.5)', () => {
    const valid = [0.5, 1.0, 1.5];
    for (const [atkType, defenses] of Object.entries(types.effectiveness)) {
      for (const [defType, value] of Object.entries(defenses)) {
        assert.ok(valid.includes(value), `effectiveness ${atkType} vs ${defType} = ${value}, expected one of ${valid}`);
      }
    }
  });

  test('map has valid dimensions', () => {
    assert.ok(map.width > 0, 'map width should be positive');
    assert.ok(map.height > 0, 'map height should be positive');
    assert.strictEqual(map.tiles.length, map.height, 'tile rows should match height');
    for (const row of map.tiles) {
      assert.strictEqual(row.length, map.width, 'tile columns should match width');
    }
  });

  test('map tiles are all valid values (0, 1, or 2)', () => {
    const validTiles = [0, 1, 2];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        assert.ok(validTiles.includes(map.tiles[y][x]), `invalid tile at (${x},${y}): ${map.tiles[y][x]}`);
      }
    }
  });

  test('each monster has at least one move', () => {
    for (const mon of monsters) {
      assert.ok(mon.moves.length >= 1, `${mon.name} has no moves`);
    }
  });

  test('monster rarity values are valid', () => {
    const validRarities = ['common', 'uncommon', 'rare', 'legendary', 'evolved'];
    for (const mon of monsters) {
      assert.ok(validRarities.includes(mon.rarity),
        `${mon.name} has invalid rarity: "${mon.rarity}", expected one of ${validRarities}`);
    }
  });

  test('evolvesTo references valid monster IDs', () => {
    const monsterIds = new Set(monsters.map(m => m.id));
    for (const mon of monsters) {
      if (mon.evolvesTo) {
        assert.ok(monsterIds.has(mon.evolvesTo),
          `${mon.name} evolvesTo ID ${mon.evolvesTo} does not exist in monsters.json`);
      }
    }
  });

  test('evolution chain stages reference valid monsters', () => {
    const monsterIds = new Set(monsters.map(m => m.id));
    for (const chain of evolutions.chains) {
      for (const stage of chain.stages) {
        assert.ok(monsterIds.has(stage.monsterId),
          `evolution chain "${chain.name}" references non-existent monster ID ${stage.monsterId}`);
      }
    }
  });

  test('evolution triggers reference valid event types', () => {
    const validEvents = new Set(Object.keys(evolutions.events));
    for (const chain of evolutions.chains) {
      for (const trigger of chain.triggers) {
        assert.ok(validEvents.has(trigger.condition.event),
          `chain "${chain.name}" uses unknown event type "${trigger.condition.event}"`);
      }
    }
  });

  test('existing sprite PNGs match a valid monster sprite field', () => {
    // Verify that PNG files in sprites/ correspond to actual monsters
    // (Not all monsters have sprites yet — fallback rectangles are used)
    const monsterSprites = new Set(monsters.filter(m => m.sprite).map(m => m.sprite));
    const spritesDir = new URL('dist/game/sprites/', root);
    for (const mon of monsters) {
      if (mon.sprite) {
        const spritePath = new URL(`${mon.sprite}.png`, spritesDir);
        if (existsSync(spritePath)) {
          assert.ok(monsterSprites.has(mon.sprite),
            `sprite file "${mon.sprite}.png" exists but no monster references it`);
        }
      }
    }
    // At least some sprites should exist
    const existing = monsters.filter(m => m.sprite && existsSync(new URL(`${m.sprite}.png`, spritesDir)));
    assert.ok(existing.length > 0, 'at least one monster sprite should exist');
  });

  test('no duplicate monster names', () => {
    const names = monsters.map(m => m.name);
    const unique = new Set(names);
    assert.strictEqual(names.length, unique.size,
      `duplicate monster names found: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
  });

  test('no duplicate move names', () => {
    const names = moves.map(m => m.name);
    const unique = new Set(names);
    assert.strictEqual(names.length, unique.size,
      `duplicate move names found: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
  });
});
