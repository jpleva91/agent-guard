#!/usr/bin/env node
// Generates a new BugMon entry and adds it to monsters.json.
// Usage: node generate-bugmon.js '<bugmon-json>'
// Reads monsters.json, assigns next ID, writes updated file.

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const monstersPath = path.join(dataDir, 'monsters.json');

const bugmonJson = process.argv[2];
if (!bugmonJson) {
  console.error('Usage: node generate-bugmon.js \'<bugmon-json>\'');
  process.exit(1);
}

const bugmon = JSON.parse(bugmonJson);
const monsters = JSON.parse(fs.readFileSync(monstersPath, 'utf8'));

// Assign next ID
const maxId = monsters.reduce((max, m) => Math.max(max, m.id), 0);
const newId = maxId + 1;

// Generate sprite name (lowercase, no spaces)
const spriteName = bugmon.name.toLowerCase().replace(/[^a-z0-9]/g, '');

const newMonster = {
  id: newId,
  name: bugmon.name,
  type: bugmon.type,
  hp: bugmon.hp,
  attack: bugmon.attack,
  defense: bugmon.defense,
  speed: bugmon.speed,
  moves: bugmon.moves,
  color: bugmon.color,
  sprite: spriteName,
  rarity: bugmon.rarity || 'common',
  theme: bugmon.theme || '',
  evolution: bugmon.evolution || null,
  passive: null,
  description: bugmon.description,
};

monsters.push(newMonster);

fs.writeFileSync(monstersPath, JSON.stringify(monsters, null, 2) + '\n', 'utf8');

console.log(JSON.stringify(newMonster, null, 2));
