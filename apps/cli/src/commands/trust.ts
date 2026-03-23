// CLI command: agentguard trust — interactive policy trust flow + hook baseline.
//
// Usage:
//   agentguard trust <policy-file>        Interactive trust flow with risk review
//   agentguard trust <policy-file> --yes  Skip confirmation prompt (for scripts/CI)
//   agentguard trust --hooks              Re-baseline hook integrity (accept current settings.json)

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { FG, RESET, DIM, BOLD } from '../colors.js';

const MAX_DISPLAY_LINES = 40;

function printUsage(): void {
  process.stderr.write('\n  Usage: agentguard trust <policy-file> [flags]\n');
  process.stderr.write('         agentguard trust --hooks\n');
  process.stderr.write('\n  Flags:\n');
  process.stderr.write('    --yes, -y   Skip confirmation prompt\n');
  process.stderr.write('    --hooks     Re-baseline hook integrity (accept current settings.json)\n');
  process.stderr.write('\n  Examples:\n');
  process.stderr.write('    agentguard trust agentguard.yaml\n');
  process.stderr.write('    agentguard trust .agentguard/policy.yaml --yes\n');
  process.stderr.write('    agentguard trust --hooks\n\n');
}

async function trustHooks(): Promise<number> {
  const { storeHookBaseline, verifyHookIntegrity } = await import('@red-codes/adapters');

  // Check both local and global settings
  const candidates = [
    join(process.cwd(), '.claude', 'settings.json'),
    join(homedir(), '.claude', 'settings.json'),
  ];

  let baselined = 0;
  for (const settingsPath of candidates) {
    if (!existsSync(settingsPath)) continue;
    storeHookBaseline(settingsPath);
    const result = verifyHookIntegrity(settingsPath);
    if (result === 'verified') {
      process.stderr.write(
        `  ${FG.green}✓${RESET}  Hook baseline updated: ${DIM}${settingsPath}${RESET}\n`
      );
      baselined++;
    }
  }

  if (baselined === 0) {
    process.stderr.write(
      `  ${FG.yellow}No settings.json with AgentGuard hooks found.${RESET}\n`
    );
    process.stderr.write(
      `  ${DIM}Run "agentguard claude-init" first.${RESET}\n`
    );
    return 1;
  }

  process.stderr.write(`\n  ${DIM}Hook integrity status will now show "verified".${RESET}\n\n`);
  return 0;
}

/**
 * Interactive policy trust command.
 * Reads the policy file, analyzes risks, prompts for confirmation, then records trust.
 */
export async function trust(args: string[]): Promise<number> {
  // Handle --hooks subcommand
  if (args.includes('--hooks')) {
    return trustHooks();
  }

  // Parse flags
  const yes = args.includes('--yes') || args.includes('-y');

  // Get policy path (first non-flag argument)
  const policyPath = args.find((a) => !a.startsWith('-'));

  if (!policyPath) {
    process.stderr.write(`\n  ${FG.red}Error: No policy file specified.${RESET}\n`);
    printUsage();
    return 1;
  }

  const absPath = resolve(policyPath);

  if (!existsSync(absPath)) {
    process.stderr.write(`\n  ${FG.red}Error: File not found: ${absPath}${RESET}\n\n`);
    return 1;
  }

  // Read policy content
  let content: string;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch (e) {
    process.stderr.write(
      `\n  ${FG.red}Error: Cannot read file: ${e instanceof Error ? e.message : String(e)}${RESET}\n\n`
    );
    return 1;
  }

  // Display policy content (truncated if large)
  const lines = content.split('\n');
  const truncated = lines.length > MAX_DISPLAY_LINES;

  process.stderr.write(`\n  ${BOLD}Policy file:${RESET} ${DIM}${absPath}${RESET}\n`);
  process.stderr.write(`  ${DIM}${'─'.repeat(60)}${RESET}\n`);

  const displayLines = truncated ? lines.slice(0, MAX_DISPLAY_LINES) : lines;
  for (const line of displayLines) {
    process.stderr.write(`  ${DIM}${line}${RESET}\n`);
  }

  if (truncated) {
    process.stderr.write(`  ${DIM}... (${lines.length - MAX_DISPLAY_LINES} more lines)${RESET}\n`);
  }

  process.stderr.write(`  ${DIM}${'─'.repeat(60)}${RESET}\n\n`);

  // Analyze policy risk
  const { analyzePolicyRisk } = await import('@red-codes/policy');
  const riskFlags = analyzePolicyRisk(content);

  const hasDanger = riskFlags.some((f) => f.level === 'danger');
  const hasWarning = riskFlags.some((f) => f.level === 'warning');

  if (riskFlags.length === 0) {
    process.stderr.write(`  ${FG.green}✓ No risk flags detected.${RESET}\n\n`);
  } else {
    process.stderr.write(`  ${BOLD}Risk analysis:${RESET}\n`);
    for (const flag of riskFlags) {
      let icon: string;
      let colorCode: string;

      if (flag.level === 'danger') {
        icon = '✗';
        colorCode = FG.red;
      } else if (flag.level === 'warning') {
        icon = '!';
        colorCode = FG.yellow;
      } else {
        icon = 'i';
        colorCode = DIM;
      }

      process.stderr.write(
        `    ${colorCode}${icon} [${flag.level.toUpperCase()}] ${flag.message}${RESET}\n`
      );
      process.stderr.write(`      ${DIM}Pattern: ${flag.pattern}${RESET}\n`);
    }
    process.stderr.write('\n');
  }

  // Non-TTY auto-deny (unless --yes)
  const isTTY = process.stdin.isTTY;
  if (!isTTY && !yes) {
    process.stderr.write(
      `  ${FG.red}✗ Non-interactive environment detected. Use --yes to trust non-interactively.${RESET}\n\n`
    );
    return 1;
  }

  // If danger risks without --yes, warn strongly
  if (hasDanger && !yes) {
    process.stderr.write(
      `  ${FG.red}${BOLD}WARNING: This policy contains dangerous configurations.${RESET}\n`
    );
    process.stderr.write(`  ${FG.red}You must explicitly confirm to trust it.${RESET}\n\n`);
  }

  if (hasWarning && !hasDanger && !yes) {
    process.stderr.write(
      `  ${FG.yellow}This policy contains warnings. Review carefully before trusting.${RESET}\n\n`
    );
  }

  // Prompt for confirmation (if not --yes)
  if (!yes) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const answer = await new Promise<string>((resolve) => {
      rl.question(`  Trust this policy? [y/N] `, resolve);
    });
    rl.close();

    const confirmed = answer.trim().toLowerCase() === 'y';
    if (!confirmed) {
      process.stderr.write(`\n  ${FG.yellow}Trust cancelled.${RESET}\n\n`);
      return 1;
    }
  } else {
    process.stderr.write(`  ${DIM}--yes flag set, skipping confirmation.${RESET}\n\n`);
  }

  // Record trust
  const { trustFile } = await import('@red-codes/core');
  const entry = await trustFile(absPath);

  process.stderr.write(`  ${FG.green}✓ Policy trusted.${RESET}\n`);
  process.stderr.write(`  ${DIM}Path:       ${entry.path}${RESET}\n`);
  process.stderr.write(`  ${DIM}Hash:       ${entry.hash}${RESET}\n`);
  process.stderr.write(`  ${DIM}Trusted at: ${entry.trustedAt}${RESET}\n\n`);

  return 0;
}
