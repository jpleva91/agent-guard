#!/usr/bin/env node
// Simulates a battle preview for a submitted BugMon.
// Usage: node battle-preview.js '<bugmon-json>'
// Outputs a markdown-formatted battle log to stdout.

const fs = require('fs');
const path = require('path');

const PREVIEW_TURNS = 5;

function seededRandom(seed) {
  // Simple mulberry32 PRNG
  let t = seed + 0x6D2B79F5;
  return function () {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function calcDamage(attacker, move, defender, typeChart, rand) {
  const random = Math.floor(rand() * 3) + 1;
  let dmg = move.power + attacker.attack - Math.floor(defender.defense / 2) + random;

  let effectiveness = 1.0;
  if (typeChart && move.type && defender.type) {
    effectiveness = typeChart[move.type]?.[defender.type] ?? 1.0;
  }
  dmg = Math.floor(dmg * effectiveness);

  return { damage: Math.max(1, dmg), effectiveness };
}

function effectivenessText(eff) {
  if (eff > 1.0) return ' It was super effective!';
  if (eff < 1.0) return ' It was not very effective...';
  return '';
}

function simulate(submittedBugmon) {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  const monsters = JSON.parse(fs.readFileSync(path.join(dataDir, 'monsters.json'), 'utf8'));
  const moves = JSON.parse(fs.readFileSync(path.join(dataDir, 'moves.json'), 'utf8'));
  const typesData = JSON.parse(fs.readFileSync(path.join(dataDir, 'types.json'), 'utf8'));
  const typeChart = typesData.effectiveness;

  const moveLookup = {};
  for (const m of moves) {
    moveLookup[m.id] = m;
  }

  // Pick an opponent: choose the monster whose type is strong against the submission
  // (for an interesting preview), or fall back to the first monster
  const strongTypes = Object.entries(typeChart)
    .filter(([_, matchups]) => matchups[submittedBugmon.type] > 1.0)
    .map(([t]) => t);

  let opponent = monsters.find(m => strongTypes.includes(m.type)) || monsters[0];

  // Create combatants with HP tracking
  const player = {
    ...submittedBugmon,
    currentHp: submittedBugmon.hp,
    movesData: submittedBugmon.moves.map(id => moveLookup[id]).filter(Boolean),
  };
  const enemy = {
    ...opponent,
    currentHp: opponent.hp,
    movesData: opponent.moves.map(id => moveLookup[id]).filter(Boolean),
  };

  // Use a seed derived from the BugMon name for reproducibility
  let seed = 0;
  for (let i = 0; i < submittedBugmon.name.length; i++) {
    seed = ((seed << 5) - seed + submittedBugmon.name.charCodeAt(i)) | 0;
  }
  const rand = seededRandom(Math.abs(seed));

  const lines = [];
  lines.push(`## Battle Preview: ${player.name} vs ${enemy.name}\n`);
  lines.push(`| | ${player.name} | ${enemy.name} |`);
  lines.push(`|---|---|---|`);
  lines.push(`| **Type** | ${player.type} | ${enemy.type} |`);
  lines.push(`| **HP** | ${player.hp} | ${enemy.hp} |`);
  lines.push(`| **ATK** | ${player.attack} | ${enemy.attack} |`);
  lines.push(`| **DEF** | ${player.defense} | ${enemy.defense} |`);
  lines.push(`| **SPD** | ${player.speed} | ${enemy.speed} |`);
  lines.push('');

  for (let turn = 1; turn <= PREVIEW_TURNS; turn++) {
    if (player.currentHp <= 0 || enemy.currentHp <= 0) break;

    lines.push(`**Turn ${turn}:**`);

    // Determine turn order by speed
    const playerFirst = player.speed >= enemy.speed;
    const first = playerFirst ? player : enemy;
    const second = playerFirst ? enemy : player;

    // First attacker
    const firstMove = first.movesData[Math.floor(rand() * first.movesData.length)];
    if (firstMove) {
      const result = calcDamage(first, firstMove, second, typeChart, rand);
      second.currentHp = Math.max(0, second.currentHp - result.damage);
      lines.push(`${first.name} used **${firstMove.name}**! (${result.damage} dmg)${effectivenessText(result.effectiveness)}`);
      lines.push(`${second.name} HP: ${second.currentHp}/${playerFirst ? enemy.hp : player.hp}`);
    }

    if (second.currentHp <= 0) {
      lines.push(`\n**${second.name} fainted!** ${first.name} wins!`);
      break;
    }

    // Second attacker
    const secondMove = second.movesData[Math.floor(rand() * second.movesData.length)];
    if (secondMove) {
      const result = calcDamage(second, secondMove, first, typeChart, rand);
      first.currentHp = Math.max(0, first.currentHp - result.damage);
      lines.push(`${second.name} used **${secondMove.name}**! (${result.damage} dmg)${effectivenessText(result.effectiveness)}`);
      lines.push(`${first.name} HP: ${first.currentHp}/${playerFirst ? player.hp : enemy.hp}`);
    }

    if (first.currentHp <= 0) {
      lines.push(`\n**${first.name} fainted!** ${second.name} wins!`);
      break;
    }

    lines.push('');
  }

  if (player.currentHp > 0 && enemy.currentHp > 0) {
    lines.push(`\n*Battle preview ended after ${PREVIEW_TURNS} turns.*`);
    lines.push(`${player.name}: ${player.currentHp}/${player.hp} HP | ${enemy.name}: ${enemy.currentHp}/${enemy.hp} HP`);
  }

  return lines.join('\n');
}

// Main
const bugmonJson = process.argv[2];
if (!bugmonJson) {
  console.error('Usage: node battle-preview.js \'<bugmon-json>\'');
  process.exit(1);
}

const bugmon = JSON.parse(bugmonJson);
const preview = simulate(bugmon);
console.log(preview);
