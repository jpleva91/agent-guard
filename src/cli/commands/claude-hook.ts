// AgentGuard Claude Code hook — PostToolUse handler for governance integration
// Always exits 0 — hooks must never fail.

export async function claudeHook(): Promise<void> {
  try {
    const input = await readStdin();
    if (!input) process.exit(0);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(input) as Record<string, unknown>;
    } catch {
      process.exit(0);
    }

    if (data!.tool_name !== 'Bash') process.exit(0);

    const output = (data!.tool_output || {}) as Record<string, unknown>;
    const exitCode = (output.exit_code ?? output.exitCode ?? 0) as number;
    const stderr = (output.stderr || '') as string;

    if (exitCode !== 0 && stderr.trim()) {
      process.stdout.write('\n');
      process.stdout.write(`  \x1b[1m\x1b[31mError detected:\x1b[0m ${stderr.trim().split('\n')[0].slice(0, 80)}\n`);
      process.stdout.write('\n');
    }
  } catch {
    // Swallow all errors — hooks must never fail
  }
  process.exit(0);
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
