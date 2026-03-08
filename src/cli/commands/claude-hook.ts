// BugMon Claude Code hook — triggers encounters on errors during Claude Code sessions
// Always exits 0 — hooks must never fail.

import { parseErrors } from '../../core/error-parser.js';
import { matchMonster, getAllMonsters } from '../../core/matcher.js';
import { recordEncounter } from '../../ecosystem/storage.js';

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

    if (exitCode === 0 && !stderr.trim()) process.exit(0);

    const errors = parseErrors(stderr);
    if (errors.length === 0) process.exit(0);

    const error = errors[0];
    const { monster } = matchMonster(error);
    if (!monster) process.exit(0);

    const { xpGained, isNew, data: dexData } = recordEncounter(
      monster,
      error.message,
      null,
      null,
    );

    const allMonsters = getAllMonsters();
    const seenCount = Object.keys(dexData.seen || {}).length;
    const totalCount = allMonsters.length;

    const newTag = isNew ? ' \x1b[33m[NEW!]\x1b[0m' : '';
    const typeTag = `[${monster.type}]`;

    process.stdout.write('\n');
    process.stdout.write(
      `  \x1b[1m\x1b[31mWild ${monster.name} appeared!\x1b[0m ${typeTag} HP:${monster.hp}${newTag}\n`,
    );
    process.stdout.write(`  \x1b[2m${error.message.slice(0, 80)}\x1b[0m\n`);
    process.stdout.write(
      `  \x1b[32m+${xpGained} XP\x1b[0m | BugDex: ${seenCount}/${totalCount} | Lv.${dexData.stats.level}\n`,
    );
    process.stdout.write('\n');
  } catch {
    // Swallow all errors
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
