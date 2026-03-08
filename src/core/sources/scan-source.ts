// Scan source adapter — runs linters/compilers and feeds output to onRawSignal

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EventSource } from './watch-source.js';

interface ScanSourceOptions {
  target?: string;
}

export function createScanSource(options: ScanSourceOptions = {}): EventSource {
  const { target = '.' } = options;
  let running = false;

  return {
    name: 'scan',

    async start(onRawSignal: (raw: string) => void) {
      running = true;
      const resolved = resolve(target);

      const eslintResult = await tryRun('npx', ['eslint', '--format', 'unix', resolved]);
      if (running && eslintResult !== null && eslintResult.trim()) {
        onRawSignal(eslintResult);
        return;
      }

      if (running && existsSync(resolve('.', 'tsconfig.json'))) {
        const tscResult = await tryRun('npx', ['tsc', '--noEmit', '--pretty', 'false']);
        if (running && tscResult !== null && tscResult.trim()) {
          onRawSignal(tscResult);
          return;
        }
      }

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
