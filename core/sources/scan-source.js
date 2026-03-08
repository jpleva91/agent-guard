// Scan source adapter — runs linters/compilers and feeds output to onRawSignal
// This is the plugin-contract wrapper around the scan pattern from scan.js.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Create a scan event source that runs available linting/type-checking
 * tools and feeds their output as raw signals.
 *
 * @param {{ target?: string }} options
 * @returns {{ name: string, start: function, stop: function, meta: object }}
 */
export function createScanSource(options = {}) {
  const { target = '.' } = options;
  let running = false;

  return {
    name: 'scan',

    async start(onRawSignal) {
      running = true;
      const resolved = resolve(target);

      // Try eslint
      const eslintResult = await tryRun('npx', ['eslint', '--format', 'unix', resolved]);
      if (running && eslintResult !== null && eslintResult.trim()) {
        onRawSignal(eslintResult);
        return;
      }

      // Try tsc if tsconfig exists
      if (running && existsSync(resolve('.', 'tsconfig.json'))) {
        const tscResult = await tryRun('npx', ['tsc', '--noEmit', '--pretty', 'false']);
        if (running && tscResult !== null && tscResult.trim()) {
          onRawSignal(tscResult);
          return;
        }
      }

      // Fallback: node --check
      if (running) {
        const nodeResult = await tryRun('node', ['--check', resolved]);
        if (running && nodeResult !== null && nodeResult.trim()) {
          onRawSignal(nodeResult);
        }
      }
    },

    stop() {
      running = false;
    },

    meta: {
      description: 'Scans project files using available linters and compilers',
    },
  };
}

function tryRun(cmd, args) {
  return new Promise((res) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', () => res(null));
    child.on('close', () => res(output));
  });
}
