// Watch source adapter — wraps a child process and feeds stderr to onRawSignal
// This is the plugin-contract wrapper around the watch pattern from adapter.js.

import { spawn } from 'node:child_process';

/**
 * Create a watch event source that spawns a child process
 * and pipes its stderr output as raw signals.
 *
 * @param {{ command: string, args?: string[] }} options
 * @returns {{ name: string, start: function, stop: function, meta: object }}
 */
export function createWatchSource(options = {}) {
  const { command, args = [] } = options;
  let child = null;

  return {
    name: 'watch',

    start(onRawSignal) {
      if (!command) return;

      child = spawn(command, args, {
        stdio: ['inherit', 'inherit', 'pipe'],
        shell: process.platform === 'win32',
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        // Pass stderr through so developers still see output
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
