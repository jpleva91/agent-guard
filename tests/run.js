#!/usr/bin/env node

// Minimal test harness — zero dependencies, uses node:assert
// Usage: node tests/run.js

import { FG, DIM, BOLD, RESET } from '../dist/cli/colors.js';

let totalPassed = 0;
let totalFailed = 0;
let _currentSuite = '';

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
  _currentSuite = name;
  console.log(`\n${BOLD}${name}${RESET}`);
  fn();
}

// Import and run all test modules
async function main() {
  console.log('AgentGuard Test Suite\n');

  // Event model
  await import('./domain-events.test.js');
  await import('./domain-event-bus.test.js');
  await import('./event-store.test.js');
  await import('./domain-actions.test.js');

  // Governance kernel
  await import('./aab.test.js');
  await import('./rta-engine.test.js');
  await import('./runtime-monitor.test.js');
  await import('./evidence-pack.test.js');

  // Policy system
  await import('./policy-loader.test.js');
  await import('./policy-evaluator.test.js');

  // Invariant system
  await import('./invariant-checker.test.js');

  // Replay system
  await import('./session-store.test.js');
  await import('./recorder.test.js');
  await import('./replay.test.js');

  console.log('\n' + '='.repeat(40));
  if (totalFailed === 0) {
    console.log(`${GREEN}${BOLD}All ${totalPassed} tests passed${RESET}`);
  } else {
    console.log(
      `${RED}${BOLD}${totalFailed} failed${RESET}, ${GREEN}${totalPassed} passed${RESET}`
    );
    process.exitCode = 1;
  }
  console.log('');
}

main().catch((err) => {
  console.error('Test runner failed:', err);
  process.exitCode = 1;
});
