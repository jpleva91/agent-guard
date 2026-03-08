// Watch source adapter — wraps a child process and feeds stderr to onRawSignal

import { spawn, type ChildProcess } from 'node:child_process';

interface WatchSourceOptions {
  command?: string;
  args?: string[];
}

export interface EventSource {
  name: string;
  start(onRawSignal: (raw: string) => void): void;
  stop(): void;
  meta: Record<string, unknown>;
}

export function createWatchSource(options: WatchSourceOptions = {}): EventSource {
  const { command, args = [] } = options;
  let child: ChildProcess | null = null;

  return {
    name: 'watch',

    start(onRawSignal: (raw: string) => void) {
      if (!command) return;

      child = spawn(command, args, {
        stdio: ['inherit', 'inherit', 'pipe'],
        shell: process.platform === 'win32',
      });

      child.stderr!.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        process.stderr.write(chunk);
        onRawSignal(text);
      });

      child.on('error', () => {
        child = null;
      });

      child.on('close', () => {
        child = null;
      });
    },

    stop() {
      if (child) {
        child.kill();
        child = null;
      }
    },

    meta: {
      description: 'Watches a child process and captures stderr errors',
    },
  };
}
