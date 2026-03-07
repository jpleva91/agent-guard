// Scan command — runs linters/compilers and converts output to BugMon encounters
// Tries eslint, then tsc, then falls back to a basic file scan

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseErrors } from '../error-parser.js';
import { matchMonster } from '../matcher.js';
import { recordEncounter } from '../../ecosystem/storage.js';
import { renderEncounter } from './renderer.js';

/**
 * Scan a target path for bugs using available tools.
 * @param {string} target - File or directory to scan
 */
export async function scan(target) {
  const resolved = resolve(target);

  // Try eslint first
  const eslintResult = await tryRun('npx', ['eslint', '--format', 'unix', resolved]);
  if (eslintResult !== null) {
    process.stderr.write(`\n  \x1b[1m\x1b[33mScanning with ESLint...\x1b[0m\n\n`);
    processOutput(eslintResult);
    return;
  }

  // Try tsc if tsconfig exists
  const hasTsConfig = existsSync(resolve('.', 'tsconfig.json'));
  if (hasTsConfig) {
    const tscResult = await tryRun('npx', ['tsc', '--noEmit', '--pretty', 'false']);
    if (tscResult !== null) {
      process.stderr.write(`\n  \x1b[1m\x1b[33mScanning with TypeScript compiler...\x1b[0m\n\n`);
      processOutput(tscResult);
      return;
    }
  }

  // Fallback: try node --check on JS files
  const nodeResult = await tryRun('node', ['--check', resolved]);
  if (nodeResult !== null && nodeResult.trim().length > 0) {
    process.stderr.write(`\n  \x1b[1m\x1b[33mScanning with Node.js syntax check...\x1b[0m\n\n`);
    processOutput(nodeResult);
    return;
  }

  process.stderr.write(`\n  \x1b[2mNo linting tools found (eslint, tsc) and no syntax errors detected.\x1b[0m\n`);
  process.stderr.write(`  \x1b[2mInstall eslint or add a tsconfig.json for deeper scanning.\x1b[0m\n\n`);
}

/**
 * Try to run a command and return its stderr output, or null if the command is not available.
 */
function tryRun(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let output = '';

    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });

    child.on('error', () => resolve(null));
    child.on('close', () => resolve(output));
  });
}

/**
 * Parse output text and render BugMon encounters.
 */
function processOutput(text) {
  const errors = parseErrors(text);

  if (errors.length === 0) {
    process.stderr.write(`  \x1b[32mNo bugs found! Your code is clean.\x1b[0m\n\n`);
    return;
  }

  process.stderr.write(`  Found ${errors.length} bug${errors.length === 1 ? '' : 's'}:\n\n`);

  for (const error of errors) {
    const { monster, confidence } = matchMonster(error);

    const { xpGained, isNew } = recordEncounter(
      monster,
      error.message,
      null,
      null,
    );

    renderEncounter(monster, error, null, confidence);

    const parts = [`+${xpGained} XP`];
    if (isNew) parts.push('NEW BugDex entry!');
    process.stderr.write(`  ${parts.join(' | ')}\n\n`);
  }
}
