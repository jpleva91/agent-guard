// Claude hook source adapter — reads stdin JSON and feeds stderr to onRawSignal
// This is the plugin-contract wrapper around the hook pattern from claude-hook.js.

/**
 * Create a Claude Code hook event source that reads tool output
 * from stdin and feeds any stderr content as raw signals.
 *
 * @returns {{ name: string, start: function, stop: function, meta: object }}
 */
export function createClaudeHookSource() {
  let active = false;

  return {
    name: 'claude-hook',

    async start(onRawSignal) {
      active = true;

      const input = await readStdin();
      if (!active || !input) return;

      let data;
      try {
        data = JSON.parse(input);
      } catch {
        return;
      }

      // Only process Bash tool results
      if (data.tool_name !== 'Bash') return;

      const output = data.tool_output || {};
      const exitCode = output.exit_code ?? output.exitCode ?? 0;
      const stderr = output.stderr || '';

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

function readStdin() {
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => resolve(input));
    process.stdin.on('error', () => resolve(''));
    if (process.stdin.isTTY) resolve('');
  });
}
