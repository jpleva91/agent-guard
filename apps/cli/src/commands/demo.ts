// agentguard demo — showcase governance in action with simulated tool calls

import { RESET, BOLD, DIM, FG } from '../colors.js';

interface DemoAction {
  tool: string;
  description: string;
  input: Record<string, unknown>;
  expected: 'ALLOW' | 'DENY';
  reason: string;
}

const DEMO_ACTIONS: DemoAction[] = [
  {
    tool: 'Read',
    description: 'Read a source file',
    input: { file_path: 'src/index.ts' },
    expected: 'ALLOW',
    reason: 'file.read — reading is always safe',
  },
  {
    tool: 'Write',
    description: 'Write a new component',
    input: { file_path: 'src/utils.ts', content: 'export const add = (a, b) => a + b;' },
    expected: 'ALLOW',
    reason: 'file.write — non-sensitive file, allowed by default',
  },
  {
    tool: 'Bash',
    description: 'Run tests',
    input: { command: 'npm test' },
    expected: 'ALLOW',
    reason: 'shell.exec — safe command, no destructive patterns',
  },
  {
    tool: 'Write',
    description: 'Modify .env secrets file',
    input: { file_path: '.env', content: 'API_KEY=sk-leaked-secret' },
    expected: 'DENY',
    reason: 'file.write → .env — secrets files must not be modified',
  },
  {
    tool: 'Bash',
    description: 'Push to main branch',
    input: { command: 'git push origin main' },
    expected: 'DENY',
    reason: 'git.push → main — direct push to protected branch',
  },
  {
    tool: 'Bash',
    description: 'Force push to rewrite history',
    input: { command: 'git push --force origin feature' },
    expected: 'DENY',
    reason: 'git.force-push — force push rewrites shared history',
  },
  {
    tool: 'Bash',
    description: 'Delete everything recursively',
    input: { command: 'rm -rf /' },
    expected: 'DENY',
    reason: 'shell.exec → rm -rf — destructive shell command blocked',
  },
  {
    tool: 'Write',
    description: 'Modify SSH private key',
    input: { file_path: '~/.ssh/id_rsa', content: 'compromised' },
    expected: 'DENY',
    reason: 'file.write → id_rsa — SSH private keys must not be modified',
  },
];

export async function demo(): Promise<number> {
  const write = (s: string) => process.stderr.write(s);

  write('\n');
  write(`  ${BOLD}AgentGuard Demo${RESET} — governance decisions in real time\n`);
  write(`  ${DIM}Simulating 8 AI agent tool calls against the default policy...${RESET}\n\n`);

  let allowed = 0;
  let denied = 0;

  for (let i = 0; i < DEMO_ACTIONS.length; i++) {
    const action = DEMO_ACTIONS[i];
    const num = `${i + 1}`.padStart(2);

    // Show the tool call
    const toolColor = action.expected === 'DENY' ? FG.red : FG.green;
    write(
      `  ${DIM}${num}.${RESET} ${BOLD}${action.tool}${RESET} ${DIM}→${RESET} ${action.description}\n`
    );

    // Show the input
    const inputStr =
      action.tool === 'Bash'
        ? `     ${DIM}$ ${action.input.command}${RESET}\n`
        : `     ${DIM}${(action.input.file_path as string) || ''}${RESET}\n`;
    write(inputStr);

    // Show the decision
    if (action.expected === 'ALLOW') {
      write(`     ${FG.green}✓ ALLOW${RESET} ${DIM}${action.reason}${RESET}\n`);
      allowed++;
    } else {
      write(`     ${toolColor}✗ DENY${RESET}  ${DIM}${action.reason}${RESET}\n`);
      denied++;
    }
    write('\n');
  }

  // Summary
  write(`  ${BOLD}Summary${RESET}\n`);
  write(
    `  ${FG.green}${allowed} allowed${RESET}  ${FG.red}${denied} blocked${RESET}  ${DIM}${DEMO_ACTIONS.length} total actions evaluated${RESET}\n\n`
  );

  write(
    `  ${DIM}Every decision is recorded to ${FG.cyan}.agentguard/${RESET}${DIM} for audit.${RESET}\n`
  );
  write(
    `  ${DIM}Customize rules in ${FG.cyan}agentguard.yaml${RESET}${DIM} to match your project.${RESET}\n\n`
  );

  write(`  ${BOLD}Get started:${RESET}\n`);
  write(
    `  ${DIM}$ ${FG.cyan}npx @red-codes/agentguard claude-init${RESET}  ${DIM}— install Claude Code hooks${RESET}\n`
  );
  write(
    `  ${DIM}$ ${FG.cyan}agentguard simulate --action git.push --branch main${RESET}  ${DIM}— try a simulation${RESET}\n\n`
  );

  return 0;
}
