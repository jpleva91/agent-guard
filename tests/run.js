#!/usr/bin/env node

// Minimal test harness — zero dependencies, uses node:assert
// Usage: node tests/run.js

import { FG, DIM, BOLD, RESET } from '../core/cli/colors.js';

let totalPassed = 0;
let totalFailed = 0;
let currentSuite = '';

const RED = FG.red;
const GREEN = FG.green;

export function test(name, fn) {
  try {
    fn();
    totalPassed++;
    console.log(`  ${GREEN}✓${RESET} ${DIM}${name}${RESET}`);
  } catch (err) {
    totalFailed++;
    console.log(`  ${RED}✗ ${name}${RESET}`);
    console.log(`    ${RED}${err.message}${RESET}`);
  }
}

export function suite(name, fn) {
  currentSuite = name;
  console.log(`\n${BOLD}${name}${RESET}`);
  fn();
}

// Import and run all test modules
async function main() {
  console.log('BugMon Test Suite\n');

  await import('./rng.test.js');
  await import('./damage.test.js');
  await import('./strategies.test.js');
  await import('./battle.test.js');
  await import('./simulator.test.js');
  await import('./report.test.js');
  await import('./data.test.js');
  await import('./build.test.js');
  await import('./battle-core.test.js');
  await import('./evolution.test.js');
  await import('./error-parser.test.js');
  await import('./stacktrace-parser.test.js');
  await import('./bug-event.test.js');
  await import('./events.test.js');
  await import('./matcher.test.js');
  await import('./map.test.js');
  await import('./input.test.js');
  await import('./state.test.js');
  await import('./encounters.test.js');
  await import('./bosses.test.js');
  await import('./bugdex-spec.test.js');
  await import('./save.test.js');
  await import('./storage.test.js');
  await import('./game-damage.test.js');
  await import('./tracker.test.js');
  await import('./player.test.js');
  await import('./bugdex.test.js');
  await import('./monsterGen.test.js');
  await import('./tiles.test.js');
  await import('./transition.test.js');
  await import('./evolution-animation.test.js');
  await import('./headless-battle.test.js');
  await import('./title.test.js');
  await import('./sound.test.js');
  await import('./sprites.test.js');
  await import('./sync-client.test.js');
  await import('./battleEngine.test.js');
  await import('./game-loop.test.js');
  await import('./sync-protocol.test.js');
  await import('./renderer.test.js');
  await import('./auto-walk.test.js');
  await import('./catch.test.js');
  await import('./integration.test.js');

  // Domain layer tests
  await import('./fingerprint.test.js');
  await import('./classifier.test.js');
  await import('./ingestion-parser.test.js');
  await import('./species-mapper.test.js');
  await import('./pipeline.test.js');
  await import('./domain-battle.test.js');
  await import('./domain-encounters.test.js');
  await import('./domain-event-bus.test.js');
  await import('./domain-evolution.test.js');

  console.log('\n' + '='.repeat(40));
  if (totalFailed === 0) {
    console.log(`${GREEN}${BOLD}All ${totalPassed} tests passed${RESET}`);
  } else {
    console.log(`${RED}${BOLD}${totalFailed} failed${RESET}, ${GREEN}${totalPassed} passed${RESET}`);
    process.exitCode = 1;
  }
  console.log('');
}

main().catch(err => {
  console.error('Test runner failed:', err);
  process.exitCode = 1;
});
