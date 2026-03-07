#!/usr/bin/env node
// Battle Simulator CLI
//
// Usage:
//   npm run simulate                                    # random matchup
//   npm run simulate -- NullPointer Deadlock             # specific matchup
//   npm run simulate -- NullPointer Deadlock --runs 1000 # statistical analysis
//   npm run simulate -- --all                            # full roster round-robin
//   npm run simulate -- --strategy typeAware             # select strategy

import { readFileSync } from 'fs';
import { runBattle, calcDamageHeadless } from './simulation/headlessBattle.js';
import { STRATEGIES } from './simulation/strategies.js';
import { createRNG } from './simulation/rng.js';

// Load game data
const monsters = JSON.parse(readFileSync('ecosystem/data/monsters.json', 'utf-8'));
const movesData = JSON.parse(readFileSync('ecosystem/data/moves.json', 'utf-8'));
const typeData = JSON.parse(readFileSync('ecosystem/data/types.json', 'utf-8'));
const typeChart = typeData.effectiveness;

function findMonster(name) {
  const mon = monsters.find(m => m.name.toLowerCase() === name.toLowerCase());
  if (!mon) {
    console.error(`Unknown BugMon: "${name}"`);
    console.error(`Available: ${monsters.map(m => m.name).join(', ')}`);
    process.exit(1);
  }
  return mon;
}

function getStrategy(args) {
  const idx = args.indexOf('--strategy');
  if (idx === -1) return STRATEGIES.mixed;
  const key = args[idx + 1];
  if (!STRATEGIES[key]) {
    console.error(`Unknown strategy: ${key}`);
    console.error(`Available: ${Object.keys(STRATEGIES).join(', ')}`);
    process.exit(1);
  }
  return STRATEGIES[key];
}

function verboseBattle(monA, monB, strategy) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ${monA.name} (${monA.type}) vs ${monB.name} (${monB.type})`);
  console.log(`  Strategy: ${strategy.name}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  ${monA.name}: HP ${monA.hp} | ATK ${monA.attack} | DEF ${monA.defense} | SPD ${monA.speed}`);
  console.log(`  ${monB.name}: HP ${monB.hp} | ATK ${monB.attack} | DEF ${monB.defense} | SPD ${monB.speed}`);
  console.log();

  const rng = createRNG(Date.now());
  const result = runBattle(monA, monB, movesData, typeChart, strategy.fn, strategy.fn, rng);

  // Print battle log
  for (const entry of result.log) {
    if (entry.turn > (result.log[result.log.indexOf(entry) - 1]?.turn ?? 0)) {
      console.log(`Turn ${entry.turn}`);
    }

    if (entry.healing) {
      console.log(`  ${entry.attacker} used ${entry.move}`);
      console.log(`  Healed ${entry.healing} HP (HP: ${entry.targetHP})`);
    } else {
      let effectText = '';
      if (entry.effectiveness > 1.0) effectText = ' (super effective!)';
      else if (entry.effectiveness < 1.0) effectText = ' (not very effective)';

      console.log(`  ${entry.attacker} used ${entry.move}`);
      console.log(`  Damage: ${entry.damage}${effectText} (HP: ${entry.targetHP})`);
    }

    if (entry.targetHP <= 0) {
      const fainted = result.log.filter(e => e.turn === entry.turn).find(e => e !== entry)?.attacker || entry.attacker;
      // The one whose target HP hit 0 is the winner's target
    }
  }

  console.log();
  const winner = result.winner === 'A' ? monA.name : result.winner === 'B' ? monB.name : 'Draw';
  console.log(`Winner: ${winner} (${result.turns} turns)`);
  console.log();

  return result;
}

function runStatistical(monA, monB, runs, strategy) {
  let winsA = 0;
  let winsB = 0;
  let totalTurns = 0;

  for (let i = 0; i < runs; i++) {
    const rng = createRNG(i);
    const result = runBattle(monA, monB, movesData, typeChart, strategy.fn, strategy.fn, rng);
    if (result.winner === 'A') winsA++;
    else if (result.winner === 'B') winsB++;
    totalTurns += result.turns;
  }

  console.log(`\n${monA.name} vs ${monB.name} — ${runs} battles (${strategy.name})`);
  console.log(`${'─'.repeat(40)}`);
  console.log(`  ${monA.name} wins: ${winsA} (${(winsA / runs * 100).toFixed(1)}%)`);
  console.log(`  ${monB.name} wins: ${winsB} (${(winsB / runs * 100).toFixed(1)}%)`);
  console.log(`  Avg turns: ${(totalTurns / runs).toFixed(1)}`);
  console.log();
}

function roundRobin(runs, strategy) {
  console.log(`\nFull Roster Round-Robin (${runs} battles each, ${strategy.name})\n`);

  const results = {};
  for (const mon of monsters) {
    results[mon.name] = { wins: 0, losses: 0 };
  }

  for (let i = 0; i < monsters.length; i++) {
    for (let j = i + 1; j < monsters.length; j++) {
      const monA = monsters[i];
      const monB = monsters[j];

      let winsA = 0;
      for (let r = 0; r < runs; r++) {
        const rng = createRNG(i * 10000 + j * 100 + r);
        const result = runBattle(monA, monB, movesData, typeChart, strategy.fn, strategy.fn, rng);
        if (result.winner === 'A') winsA++;
      }

      results[monA.name].wins += winsA;
      results[monA.name].losses += runs - winsA;
      results[monB.name].wins += runs - winsA;
      results[monB.name].losses += winsA;
    }
  }

  // Sort by win rate
  const ranked = Object.entries(results)
    .map(([name, r]) => ({
      name,
      wins: r.wins,
      losses: r.losses,
      rate: r.wins / (r.wins + r.losses),
    }))
    .sort((a, b) => b.rate - a.rate);

  console.log('Rank  Name                  Win Rate    W / L');
  console.log('─'.repeat(55));
  ranked.forEach((r, i) => {
    const name = r.name.padEnd(20);
    const rate = (r.rate * 100).toFixed(1).padStart(5) + '%';
    const record = `${String(r.wins).padStart(4)} / ${r.losses}`;
    console.log(`  ${String(i + 1).padStart(2)}  ${name}  ${rate}    ${record}`);
  });
  console.log();
}

// Parse CLI args
const args = process.argv.slice(2);
const strategy = getStrategy(args);

if (args.includes('--all')) {
  const runsIdx = args.indexOf('--runs');
  const runs = runsIdx !== -1 ? parseInt(args[runsIdx + 1], 10) : 100;
  roundRobin(runs, strategy);
} else if (args.length >= 2 && !args[0].startsWith('-')) {
  const monA = findMonster(args[0]);
  const monB = findMonster(args[1]);
  const runsIdx = args.indexOf('--runs');

  if (runsIdx !== -1) {
    const runs = parseInt(args[runsIdx + 1], 10);
    runStatistical(monA, monB, runs, strategy);
  } else {
    verboseBattle(monA, monB, strategy);
  }
} else if (args.length === 0 || args.includes('--help')) {
  if (args.includes('--help')) {
    console.log(`
BugMon Battle Simulator

Usage:
  npm run simulate                              Random matchup (verbose)
  npm run simulate -- MonA MonB                 Specific matchup (verbose)
  npm run simulate -- MonA MonB --runs 1000     Statistical analysis
  npm run simulate -- --all                     Full roster round-robin
  npm run simulate -- --all --runs 500          Round-robin with custom sample
  npm run simulate -- --strategy typeAware      Select AI strategy

Strategies:
  ${Object.entries(STRATEGIES).map(([k, v]) => `${k.padEnd(15)} ${v.name}`).join('\n  ')}

Available BugMon:
  ${monsters.map(m => m.name).join(', ')}
`);
  } else {
    // Random matchup
    const a = Math.floor(Math.random() * monsters.length);
    let b = Math.floor(Math.random() * (monsters.length - 1));
    if (b >= a) b++;
    verboseBattle(monsters[a], monsters[b], strategy);
  }
}
