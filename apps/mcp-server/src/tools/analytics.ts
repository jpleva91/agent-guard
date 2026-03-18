// Cloud analytics tools — query AgentGuard Cloud API for events, runs, and analytics.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpConfig } from '../config.js';

/** Shared fetch helper for AgentGuard Cloud API calls. */
async function cloudFetch(
  config: McpConfig,
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<unknown> {
  if (!config.cloudEndpoint) {
    return {
      error:
        'AgentGuard Cloud is not configured. ' +
        'Set AGENTGUARD_CLOUD_ENDPOINT / AGENTGUARD_CLOUD_API_KEY env vars ' +
        'or add cloud.endpoint / cloud.apiKey to ~/.agentguard/config.json.',
    };
  }

  const url = new URL(path, config.cloudEndpoint);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  try {
    const response = await fetch(url.toString(), {
      headers: {
        ...(config.cloudApiKey ? { 'X-API-Key': config.cloudApiKey } : {}),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return { error: `Cloud API returned ${response.status}: ${response.statusText}` };
    }

    return await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Cloud API request failed: ${message}` };
  }
}

export function registerAnalyticsTools(server: McpServer, config: McpConfig): void {
  // cloud_events — query governance events from AgentGuard Cloud
  server.tool(
    'cloud_events',
    'Query governance events from AgentGuard Cloud',
    {
      limit: z.number().optional().default(50).describe('Maximum number of events to return'),
      sessionId: z.string().optional().describe('Filter by session ID'),
      agentId: z.string().optional().describe('Filter by agent ID'),
      eventType: z.string().optional().describe('Filter by event type'),
    },
    async ({ limit, sessionId, agentId, eventType }) => {
      const result = await cloudFetch(config, '/v1/events', {
        limit,
        sessionId,
        agentId,
        eventType,
        excludeService: 'true',
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // cloud_runs — list governance runs from AgentGuard Cloud
  server.tool(
    'cloud_runs',
    'List governance runs from AgentGuard Cloud',
    {
      limit: z.number().optional().default(20).describe('Maximum number of runs to return'),
      status: z.string().optional().describe('Filter by run status'),
      agentId: z.string().optional().describe('Filter by agent ID'),
    },
    async ({ limit, status, agentId }) => {
      const result = await cloudFetch(config, '/v1/runs', { limit, status, agentId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // cloud_run_summary — get a summary for a specific governance run
  server.tool(
    'cloud_run_summary',
    'Get summary for a specific governance run from AgentGuard Cloud',
    {
      runId: z.string().describe('The run ID to summarize'),
    },
    async ({ runId }) => {
      const result = await cloudFetch(config, `/v1/runs/${encodeURIComponent(runId)}/summary`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // cloud_analytics — get analytics summary from AgentGuard Cloud
  server.tool('cloud_analytics', 'Get analytics summary from AgentGuard Cloud', {}, async () => {
    const result = await cloudFetch(config, '/v1/analytics/summary');
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  });
}
