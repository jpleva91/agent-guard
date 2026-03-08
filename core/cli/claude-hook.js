// BugMon Claude Code hook — triggers encounters on errors during Claude Code sessions
//
// This script runs as a Claude Code PostToolUse hook on every Bash tool invocation.
// It reads JSON from stdin, checks for errors in the command output, and prints
// a brief encounter notification if a BugMon is matched.
//
// Performance: no-error path < 10ms, error path < 50ms.
// Always exits 0 — hooks must never fail or they block Claude Code.
//
// TODO(roadmap/phase-2): Emit governance events when agent actions trigger policy violations

import { parseErrors } from '../error-parser.js';
import { matchMonster, getAllMonsters } from '../matcher.js';
import { recordEncounter, loadBugDex } from '../../ecosystem/storage.js';

export async function claudeHook() {
  try {
    const input = await readStdin();
    if (!input) process.exit(0);

    let data;
    try {
      data = JSON.parse(input);
    } catch {
      process.exit(0);
    }

    // Only process Bash tool results
    if (data.tool_name !== 'Bash') process.exit(0);

    const output = data.tool_output || {};
    const exitCode = output.exit_code ?? output.exitCode ?? 0;
    const stderr = output.stderr || '';

    // Fast path: no error
    if (exitCode === 0 && !stderr.trim()) process.exit(0);

    // Parse errors from stderr
    const errors = parseErrors(stderr);
    if (errors.length === 0) process.exit(0);

    // Match first error to a BugMon
    const error = errors[0];
    const { monster, confidence } = matchMonster(error);
    if (!monster) process.exit(0);

    // Record the encounter
    const { xpGained, isNew, data: dexData } = recordEncounter(monster, error.message, null, null);

    // Count BugDex completion
    const allMonsters = getAllMonsters();
    const seenCount = Object.keys(dexData.seen || {}).length;
    const totalCount = allMonsters.length;
    const partyCount = (dexData.party || []).length;

    // Print compact encounter notification
    const newTag = isNew ? ' \x1b[33m[NEW!]\x1b[0m' : '';
    const typeTag = `[${monster.type}]`;

    process.stdout.write('\n');
    process.stdout.write(
      `  \x1b[1m\x1b[31mWild ${monster.name} appeared!\x1b[0m ${typeTag} HP:${monster.hp}${newTag}\n`
    );
    process.stdout.write(`  \x1b[2m${error.message.slice(0, 80)}\x1b[0m\n`);
    process.stdout.write(
      `  \x1b[32m+${xpGained} XP\x1b[0m | BugDex: ${seenCount}/${totalCount} | Lv.${dexData.stats.level}\n`
    );
    process.stdout.write('\n');
  } catch {
    // Swallow all errors — hooks must never fail
  }
  process.exit(0);
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
    // If stdin is a TTY (manual testing), don't hang
    if (process.stdin.isTTY) resolve('');
  });
}

// Auto-run when executed directly (e.g., `node claude-hook.js`)
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  claudeHook();
}
