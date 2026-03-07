#!/usr/bin/env node

// BugMon Battle Simulator CLI
// Usage:
//   node simulation/cli.js [--battles N] [--strategy S] [--seed N]
//   node simulation/cli.js --compare [stratA stratB]

import { readFile } from 'fs/promises';
import { simulate, compareStrategies, compareAllStrategies } from './simulator.js';
import { generateReport, generateComparisonReport } from './report.js';
import { STRATEGIES } from './strategies.js';

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const idx = args.indexOf('--' + name);
  if (idx === -1) return fallback;
  return args[idx + 1] || fallback;
}

function hasFlag(name) {
  return args.includes('--' + name);
}

async function loadData() {
  const root = new URL('../', import.meta.url);
  const monsters = JSON.parse(await readFile(new URL('ecosystem/data/monsters.json', root), 'utf-8'));
  const moves = JSON.parse(await readFile(new URL('ecosystem/data/moves.json', root), 'utf-8'));
  const types = JSON.parse(await readFile(new URL('ecosystem/data/types.json', root), 'utf-8'));
  return { monsters, moves, types };
}

async function runCompare() {
  const numBattles = parseInt(getArg('battles', '5000'), 10);
  const seed = parseInt(getArg('seed', String(Date.now())), 10);
  const { monsters, moves, types } = await loadData();

  // Check for specific strategy pair after --compare (skip --flag value pairs)
  const compareIdx = args.indexOf('--compare');
  const afterCompare = [];
  for (let i = compareIdx + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) { i++; continue; } // skip --flag and its value
    afterCompare.push(args[i]);
  }

  if (afterCompare.length >= 2) {
    // Compare two specific strategies
    const [keyA, keyB] = afterCompare;
    if (!STRATEGIES[keyA] || !STRATEGIES[keyB]) {
      console.error(`Unknown strategy. Available: ${Object.keys(STRATEGIES).join(', ')}`);
      process.exit(1);
    }

    console.log(`Comparing "${STRATEGIES[keyA].name}" vs "${STRATEGIES[keyB].name}" (${numBattles} battles, seed: ${seed})...`);
    console.log('');

    const startTime = performance.now();
    const result = compareStrategies(
      monsters, moves, types.effectiveness,
      STRATEGIES[keyA].fn, STRATEGIES[keyB].fn,
      numBattles, seed,
      STRATEGIES[keyA].name, STRATEGIES[keyB].name
    );
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    const report = generateComparisonReport({ results: [result], strategyNames: [STRATEGIES[keyA].name, STRATEGIES[keyB].name] });
    console.log(report);
    console.log(`  Completed in ${elapsed}s`);
    console.log('');
  } else {
    // Compare all strategies against each other
    console.log(`Comparing all ${Object.keys(STRATEGIES).length} strategies (${numBattles} battles each, seed: ${seed})...`);
    console.log('');

    const startTime = performance.now();
    const result = compareAllStrategies(monsters, moves, types.effectiveness, STRATEGIES, numBattles, seed);
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    const report = generateComparisonReport(result);
    console.log(report);
    console.log(`  Completed in ${elapsed}s`);
    console.log('');
  }
}

async function runSimulate() {
  const numBattles = parseInt(getArg('battles', '10000'), 10);
  const strategyKey = getArg('strategy', 'mixed');
  const seed = parseInt(getArg('seed', String(Date.now())), 10);

  if (!STRATEGIES[strategyKey]) {
    console.error(`Unknown strategy: ${strategyKey}`);
    console.error(`Available: ${Object.keys(STRATEGIES).join(', ')}`);
    process.exit(1);
  }

  const strategy = STRATEGIES[strategyKey];
  const { monsters, moves, types } = await loadData();

  console.log(`Running ${numBattles} battles with "${strategy.name}" strategy (seed: ${seed})...`);
  console.log('');

  const startTime = performance.now();
  const result = simulate(monsters, moves, types.effectiveness, strategy.fn, numBattles, seed, strategy.name);
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

  const report = generateReport(result);
  console.log(report);
  console.log(`  Completed in ${elapsed}s`);
  console.log('');
}

async function main() {
  if (hasFlag('compare')) {
    await runCompare();
  } else {
    await runSimulate();
  }
}

main().catch(err => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
