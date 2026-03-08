// Scan command — runs linters/compilers and converts output to BugMon encounters

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseErrors } from '../../core/error-parser.js';
import { matchMonster } from '../../core/matcher.js';
import { recordEncounter } from '../../ecosystem/storage.js';
import { renderEncounter } from '../renderer.js';

export async function scan(target: string): Promise<void> {
  const resolved = resolve(target);

  const eslintResult = await tryRun('npx', ['eslint', '--format', 'unix', resolved]);
  if (eslintResult !== null) {
    process.stderr.write(`\n  \x1b[1m\x1b[33mScanning with ESLint...\x1b[0m\n\n`);
    processOutput(eslintResult);
    return;
  }

  const hasTsConfig = existsSync(resolve('.', 'tsconfig.json'));
  if (hasTsConfig) {
    const tscResult = await tryRun('npx', ['tsc', '--noEmit', '--pretty', 'false']);
    if (tscResult !== null) {
      process.stderr.write(`\n  \x1b[1m\x1b[33mScanning with TypeScript compiler...\x1b[0m\n\n`);
      processOutput(tscResult);
      return;
    }
  }

  const nodeResult = await tryRun('node', ['--check', resolved]);
  if (nodeResult !== null && nodeResult.trim().length > 0) {
    process.stderr.write(`\n  \x1b[1m\x1b[33mScanning with Node.js syntax check...\x1b[0m\n\n`);
    processOutput(nodeResult);
    return;
  }

  process.stderr.write(
    `\n  \x1b[2mNo linting tools found (eslint, tsc) and no syntax errors detected.\x1b[0m\n`,
  );
  process.stderr.write(
    `  \x1b[2mInstall eslint or add a tsconfig.json for deeper scanning.\x1b[0m\n\n`,
  );
}

function tryRun(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((res) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let output = '';

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    child.on('error', () => res(null));
    child.on('close', () => res(output));
  });
}

function processOutput(text: string): void {
  const errors = parseErrors(text);

  if (errors.length === 0) {
    process.stderr.write(`  \x1b[32mNo bugs found! Your code is clean.\x1b[0m\n\n`);
    return;
  }

  process.stderr.write(`  Found ${errors.length} bug${errors.length === 1 ? '' : 's'}:\n\n`);

  for (const error of errors) {
    const { monster, confidence } = matchMonster(error);

    const { xpGained, isNew } = recordEncounter(monster, error.message, null, null);

    renderEncounter(monster, error, null, confidence);

    const parts = [`+${xpGained} XP`];
    if (isNew) parts.push('NEW BugDex entry!');
    process.stderr.write(`  ${parts.join(' | ')}\n\n`);
  }
}
