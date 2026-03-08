// bugmon init — install git hooks for evolution tracking

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { RESET, BOLD, DIM, FG } from '../colors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HOOK_NAMES = ['post-commit', 'post-merge'];

export async function init(options: { force?: boolean } = {}): Promise<void> {
  let gitDir: string;
  try {
    gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf8' }).trim();
  } catch {
    process.stderr.write(`\n  ${FG.red}Error:${RESET} Not inside a git repository.\n`);
    process.stderr.write(`  ${DIM}Run this command from the root of a git repo.${RESET}\n\n`);
    process.exit(1);
  }

  const hooksDir = join(gitDir, 'hooks');
  const sourceDir = join(__dirname, '..', '..', '..', 'hooks');

  let installed = 0;

  process.stderr.write('\n');
  process.stderr.write(
    `  ${BOLD}BugMon Init${RESET} — Installing git hooks for evolution tracking\n\n`,
  );

  for (const hookName of HOOK_NAMES) {
    const sourcePath = join(sourceDir, hookName);
    const destPath = join(hooksDir, hookName);

    if (!existsSync(sourcePath)) {
      process.stderr.write(`  ${FG.yellow}⚠${RESET}  ${hookName}: source hook not found, skipping\n`);
      continue;
    }

    if (existsSync(destPath) && !options.force) {
      process.stderr.write(
        `  ${FG.yellow}⚠${RESET}  ${hookName}: already exists ${DIM}(use --force to overwrite)${RESET}\n`,
      );
      continue;
    }

    const content = readFileSync(sourcePath, 'utf8');
    writeFileSync(destPath, content, 'utf8');
    chmodSync(destPath, 0o755);
    installed++;
    process.stderr.write(`  ${FG.green}✓${RESET}  ${hookName}: installed\n`);
  }

  process.stderr.write('\n');

  if (installed > 0) {
    process.stderr.write(
      `  ${FG.green}${BOLD}Done!${RESET} ${installed} hook${installed > 1 ? 's' : ''} installed.\n`,
    );
    process.stderr.write(`  ${DIM}Commits and merges will now track evolution progress.${RESET}\n`);
    process.stderr.write(
      `  ${DIM}Activity is saved to ${FG.cyan}.events.json${RESET}${DIM} in your repo root.${RESET}\n`,
    );
  } else {
    process.stderr.write(`  ${DIM}No hooks were installed.${RESET}\n`);
  }

  process.stderr.write('\n');
}
