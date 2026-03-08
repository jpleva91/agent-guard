// Claude hook source adapter — reads stdin JSON and feeds stderr to onRawSignal

import type { EventSource } from './watch-source.js';

export function createClaudeHookSource(): EventSource {
  let active = false;

  return {
    name: 'claude-hook',

    async start(onRawSignal: (raw: string) => void) {
      active = true;

      const input = await readStdin();
      if (!active || !input) return;

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(input) as Record<string, unknown>;
      } catch {
        return;
      }

      if (data.tool_name !== 'Bash') return;

      const output = (data.tool_output || {}) as Record<string, unknown>;
      const exitCode = (output.exit_code ?? output.exitCode ?? 0) as number;
      const stderr = (output.stderr || '') as string;

      if (exitCode === 0 && !stderr.trim()) return;

      if (active && stderr.trim()) {
        onRawSignal(stderr);
      }
    },

    stop() {
      active = false;
    },

    meta: {
      description: 'Captures errors from Claude Code Bash tool invocations',
    },
  };
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      input += chunk;
    });
    process.stdin.on('end', () => resolve(input));
    process.stdin.on('error', () => resolve(''));
    if (process.stdin.isTTY) resolve('');
  });
}
