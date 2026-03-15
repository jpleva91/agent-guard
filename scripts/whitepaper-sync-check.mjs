#!/usr/bin/env node

/**
 * White paper sync checker — verifies that paper/agentguard-whitepaper.md
 * matches the current codebase state for key numeric claims.
 *
 * Usage: node scripts/whitepaper-sync-check.mjs
 *
 * Checks:
 *   - Invariant count matches packages/invariants/src/definitions.ts
 *   - Event kind count matches packages/events/src/schema.ts
 *   - Action type count matches packages/core/src/data/actions.json
 *   - Package listing matches actual workspace packages
 *   - Test file count matches actual test files
 *
 * Exit codes:
 *   0 — all claims match codebase
 *   1 — one or more claims are stale
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PAPER = join(ROOT, 'paper', 'agentguard-whitepaper.md');

let exitCode = 0;

const ok = (label) => console.log(`  ✓ ${label}`);
const stale = (label, expected, actual) => {
  console.log(`  ✗ ${label}: paper says ${expected}, codebase has ${actual}`);
  exitCode = 1;
};

console.log('White paper sync check\n');

// --- 1. Invariant count ---
const defsPath = join(ROOT, 'packages', 'invariants', 'src', 'definitions.ts');
if (existsSync(defsPath)) {
  const defsContent = readFileSync(defsPath, 'utf8');
  const invariantIds = defsContent.match(/id: '/g);
  const actualInvariants = invariantIds ? invariantIds.length : 0;

  const paper = readFileSync(PAPER, 'utf8');
  const invariantClaims = paper.match(/(\d+)\s+(?:built-in\s+)?invariant/gi) || [];
  const claimedCounts = invariantClaims.map((m) => parseInt(m.match(/\d+/)[0], 10));
  const maxClaimed = Math.max(...claimedCounts, 0);

  if (maxClaimed === actualInvariants) {
    ok(`Invariant count: ${actualInvariants}`);
  } else {
    stale('Invariant count', maxClaimed, actualInvariants);
  }
}

// --- 2. Event kind count ---
const schemaPath = join(ROOT, 'packages', 'events', 'src', 'schema.ts');
if (existsSync(schemaPath)) {
  const schemaContent = readFileSync(schemaPath, 'utf8');
  const eventExports = schemaContent.match(/^export const [A-Z_]+.*EventKind/gm);
  const actualEvents = eventExports ? eventExports.length : 0;

  const paper = readFileSync(PAPER, 'utf8');
  const eventClaims = paper.match(/(\d+)\s+event kinds/gi) || [];
  const claimedEvents = eventClaims.map((m) => parseInt(m.match(/\d+/)[0], 10));
  const maxClaimedEvents = Math.max(...claimedEvents, 0);

  if (maxClaimedEvents === actualEvents) {
    ok(`Event kind count: ${actualEvents}`);
  } else {
    stale('Event kind count', maxClaimedEvents, actualEvents);
  }
}

// --- 3. Action type count ---
const actionsPath = join(ROOT, 'packages', 'core', 'src', 'data', 'actions.json');
if (existsSync(actionsPath)) {
  const actionsData = JSON.parse(readFileSync(actionsPath, 'utf8'));
  const types = actionsData.types || actionsData;
  const actualActionTypes = Object.keys(types).length;
  const actualClasses = actionsData.classes
    ? Object.keys(actionsData.classes).length
    : new Set(Object.values(types).map((a) => a.class)).size;

  const paper = readFileSync(PAPER, 'utf8');
  const actionClaims = paper.match(/(\d+)\s+action types/gi) || [];
  const claimedActions = actionClaims.map((m) => parseInt(m.match(/\d+/)[0], 10));
  const maxClaimedActions = Math.max(...claimedActions, 0);

  if (maxClaimedActions === actualActionTypes) {
    ok(`Action type count: ${actualActionTypes} across ${actualClasses} classes`);
  } else {
    stale('Action type count', maxClaimedActions, actualActionTypes);
  }
}

// --- 4. Package listing ---
const packagesDir = join(ROOT, 'packages');
const appsDir = join(ROOT, 'apps');
const actualPackages = readdirSync(packagesDir)
  .filter((d) => statSync(join(packagesDir, d)).isDirectory())
  .sort();
const actualApps = readdirSync(appsDir)
  .filter((d) => statSync(join(appsDir, d)).isDirectory())
  .sort();

const paper = readFileSync(PAPER, 'utf8');

const removedPackages = [
  'analytics',
  'telemetry',
  'telemetry-client',
  'adapter-openclaw',
  'sentinel01',
];
const removedApps = ['telemetry-server', 'agentguardhq'];

let hasRemovedRefs = false;
for (const pkg of removedPackages) {
  if (paper.includes(`${pkg}/src/`)) {
    stale('Removed package referenced', 'present in paper', `${pkg} deleted from codebase`);
    hasRemovedRefs = true;
  }
}
for (const app of removedApps) {
  if (paper.includes(`${app}/src/`)) {
    stale('Removed app referenced', 'present in paper', `${app} deleted from codebase`);
    hasRemovedRefs = true;
  }
}
if (!hasRemovedRefs) {
  ok('No references to removed packages/apps');
}

// --- 5. Test file count ---
const countTestFiles = (dir, ext) => {
  let count = 0;
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        count++;
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return count;
};

const tsTestFiles =
  countTestFiles(join(ROOT, 'packages'), '.test.ts') +
  countTestFiles(join(ROOT, 'apps'), '.test.ts');
const jsTestFiles = countTestFiles(join(ROOT, 'tests'), '.test.js');

const testClaims = paper.match(/(\d+)\s+TypeScript test files/i);
const claimedTsTests = testClaims ? parseInt(testClaims[1], 10) : 0;

if (claimedTsTests === tsTestFiles) {
  ok(`TypeScript test file count: ${tsTestFiles}`);
} else {
  stale('TypeScript test file count', claimedTsTests, tsTestFiles);
}

console.log(
  `\n${exitCode === 0 ? 'All checks passed.' : 'Stale claims detected — update the white paper.'}`
);
process.exit(exitCode);
