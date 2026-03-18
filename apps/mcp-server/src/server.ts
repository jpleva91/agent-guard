// AgentGuard MCP Server — exposes governance tools via the Model Context Protocol.
// Supports stdio transport for Claude Code integration.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveConfig } from './config.js';
import type { DataSource } from './backends/types.js';
import { createLocalDataSource } from './backends/local.js';
import { registerGovernanceTools } from './tools/governance.js';
import { registerMonitoringTools } from './tools/monitoring.js';
import { registerPolicyTools } from './tools/policy.js';
import { registerAnalyticsTools } from './tools/analytics.js';

async function resolveDataSource(): Promise<DataSource> {
  const config = resolveConfig();

  switch (config.backend) {
    case 'remote': {
      const { createRemoteDataSource } = await import('./backends/remote.js');
      return createRemoteDataSource(config);
    }
    case 'local':
    default:
      return createLocalDataSource(config);
  }
}

async function main(): Promise<void> {
  const config = resolveConfig();
  const dataSource = await resolveDataSource();

  const server = new McpServer(
    { name: 'agentguard', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'AgentGuard governance tools for AI coding agents. ' +
        'Propose actions through the governance kernel, evaluate policies, ' +
        'check invariants, simulate impact, inspect sessions, and analyze violations.',
    }
  );

  // Register all tool categories
  registerGovernanceTools(server, config);
  registerMonitoringTools(server, dataSource);
  registerPolicyTools(server);
  registerAnalyticsTools(server, config);

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`AgentGuard MCP server error: ${err}\n`);
  process.exit(1);
});
