#!/usr/bin/env node
// Verify that module exports match their declared contracts.
// Zero dependencies — uses only Node.js built-ins + project modules.
// Usage: node scripts/check-contracts.js

import path from 'path';
import { fileURLToPath } from 'url';
import { MODULE_CONTRACTS, validateContract } from '../dist/domain/contracts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Map contract module names to import paths
const MODULE_PATHS = {
  'domain/battle': '../dist/domain/battle.js',
  'domain/encounters': '../dist/domain/encounters.js',
  'domain/evolution': '../dist/domain/evolution.js',
  'domain/events': '../dist/domain/events.js',
  'domain/event-bus': '../dist/core/event-bus.js',
  'domain/event-store': '../dist/domain/event-store.js',
  'domain/ingestion/pipeline': '../dist/domain/ingestion/pipeline.js',
  'domain/ingestion/fingerprint': '../dist/domain/ingestion/fingerprint.js',
  'domain/ingestion/classifier': '../dist/domain/ingestion/classifier.js',
};

console.log('Checking module contracts...\n');

let totalModules = 0;
let passedModules = 0;
let totalExports = 0;
let failedExports = 0;
const failures = [];

for (const moduleName of Object.keys(MODULE_CONTRACTS)) {
  totalModules++;
  const importPath = MODULE_PATHS[moduleName];

  if (!importPath) {
    failures.push(`  ${moduleName}: no import path configured`);
    continue;
  }

  try {
    const mod = await import(importPath);
    const { valid, errors } = validateContract(moduleName, mod);
    const exportCount = Object.keys(MODULE_CONTRACTS[moduleName].exports).length;
    totalExports += exportCount;

    if (valid) {
      passedModules++;
      console.log(`  ✓ ${moduleName} (${exportCount} exports)`);
    } else {
      failedExports += errors.length;
      console.log(`  ✗ ${moduleName}`);
      for (const error of errors) {
        console.log(`    - ${error}`);
        failures.push(`  ${moduleName}: ${error}`);
      }
    }
  } catch (err) {
    console.log(`  ✗ ${moduleName}: import failed — ${err.message}`);
    failures.push(`  ${moduleName}: import failed — ${err.message}`);
  }
}

console.log(`\n${passedModules}/${totalModules} modules passed (${totalExports} exports checked)`);

if (failures.length > 0) {
  console.log(`\n${failures.length} failure(s):`);
  for (const f of failures) console.log(f);
  process.exit(1);
} else {
  console.log('All contracts verified.');
}
