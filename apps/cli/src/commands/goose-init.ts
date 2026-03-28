// agentguard goose-init — set up Goose (Block) CLI integration
// Goose uses ~/.config/goose/config.yaml for configuration.
// AgentGuard integrates as an MCP server that Goose calls for governance checks.
//
// Goose hook model: Goose supports "extensions" that can intercept tool calls.
// AgentGuard registers as a governance extension via the MCP server protocol.

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { RESET, BOLD, DIM, FG } from '../colors.js';
import { resolveBinary } from '../resolve-binary.js';
import { resolveMainRepoRoot } from '@red-codes/core';

const GOOSE_CONFIG_DIR = join(homedir(), '.config', 'goose');
const GOOSE_CONFIG_PATH = join(GOOSE_CONFIG_DIR, 'config.yaml');
const GOOSE_PROJECT_CONFIG = '.goose/config.yaml';

export default async function gooseInit(args: string[] = []): Promise<void> {
  const isGlobal = args.includes('--global');
  const storeIdx = args.indexOf('--store');
  const store = storeIdx >= 0 ? args[storeIdx + 1] : undefined;

  const { cli, isLocal, resolution } = resolveBinary(isGlobal);

  console.log(`\n${BOLD}AgentGuard — Goose CLI Integration${RESET}\n`);
  console.log(`${DIM}Binary: ${cli} (${resolution})${RESET}`);

  // Determine config path
  const configDir = isGlobal ? GOOSE_CONFIG_DIR : join(resolveMainRepoRoot(), '.goose');
  const configPath = isGlobal
    ? GOOSE_CONFIG_PATH
    : join(resolveMainRepoRoot(), GOOSE_PROJECT_CONFIG);

  // Ensure config directory exists
  mkdirSync(configDir, { recursive: true });

  // Build the MCP server command for AgentGuard governance
  const storeSuffix = store ? ` --store ${store}` : '';
  const mcpCommand = isLocal
    ? `node apps/cli/dist/bin.js mcp-server${storeSuffix}`
    : `${cli} mcp-server${storeSuffix}`;

  // Goose config uses YAML — write the AgentGuard extension config
  const agentguardExtension = `
# AgentGuard governance extension
# Added by: agentguard goose-init
extensions:
  agentguard:
    type: mcp
    command: "${mcpCommand}"
    description: "AgentGuard governance — policy enforcement for AI agent tool calls"
    enabled: true
`.trim();

  if (existsSync(configPath)) {
    const existing = readFileSync(configPath, 'utf8');
    if (existing.includes('agentguard')) {
      console.log(`\n${FG.yellow}⚠${RESET}  AgentGuard already configured in ${configPath}`);
      console.log(
        `${DIM}   Remove the agentguard extension block and re-run to reconfigure.${RESET}`
      );
      return;
    }
    // Append to existing config
    writeFileSync(configPath, existing + '\n' + agentguardExtension + '\n', 'utf8');
    console.log(`\n${FG.green}✓${RESET}  Appended AgentGuard extension to ${configPath}`);
  } else {
    writeFileSync(configPath, agentguardExtension + '\n', 'utf8');
    console.log(`\n${FG.green}✓${RESET}  Created ${configPath} with AgentGuard extension`);
  }

  console.log(`\n${BOLD}Next steps:${RESET}`);
  console.log(
    `  ${DIM}1.${RESET} Install Goose: ${FG.cyan}pip install goose-ai${RESET} or ${FG.cyan}brew install block/tap/goose${RESET}`
  );
  console.log(`  ${DIM}2.${RESET} Run: ${FG.cyan}goose session${RESET}`);
  console.log(`  ${DIM}3.${RESET} AgentGuard governance will enforce on every tool call\n`);
}
