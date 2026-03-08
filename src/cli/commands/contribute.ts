// Contribution prompts — nudge users to submit new BugMon

import { DIM, RESET, FG } from '../colors.js';

const ISSUE_URL = 'https://github.com/jpleva91/BugMon/issues/new?template=new-bugmon.yml';

export const LOW_CONFIDENCE_THRESHOLD = 0.3;
export const BUGDEX_CONTRIBUTION_MIN = 5;

export function renderContributionPrompt(): void {
  const sep = `${DIM}  ${'┈'.repeat(41)}${RESET}`;
  const lines = [
    '',
    sep,
    `${DIM}  This error didn't match a BugMon well.${RESET}`,
    `${DIM}  Know this bug? Submit a new BugMon:${RESET}`,
    `  ${FG.cyan}${ISSUE_URL}${RESET}`,
    sep,
    '',
  ];
  process.stderr.write(lines.join('\n') + '\n');
}

export function renderBugDexContributionPrompt(discoveredCount: number): string[] {
  if (discoveredCount < BUGDEX_CONTRIBUTION_MIN) return [];
  return [
    '',
    `${DIM}  Know a bug that's missing? Contribute a new BugMon:${RESET}`,
    `  ${FG.cyan}${ISSUE_URL}${RESET}`,
  ];
}
