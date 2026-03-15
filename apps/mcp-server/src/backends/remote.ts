// Remote data source — fetches governance data from the telemetry-server API.
// Requires AGENTGUARD_REMOTE_URL and optional AGENTGUARD_REMOTE_API_KEY.

import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';
import type { DataSource } from './types.js';
import type { McpConfig } from '../config.js';

export function createRemoteDataSource(config: McpConfig): DataSource {
  const baseUrl = config.remoteUrl?.replace(/\/$/, '') || '';
  const apiKey = config.remoteApiKey;

  async function fetchJson<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(`${baseUrl}${path}`, { headers });
    if (!response.ok) {
      throw new Error(`Remote API error: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  return {
    async listRuns(limit?: number): Promise<string[]> {
      const params = limit ? `?limit=${limit}` : '';
      const result = await fetchJson<{ runs: string[] }>(`/api/v1/events/runs${params}`);
      return result.runs || [];
    },

    async loadEvents(runId: string): Promise<DomainEvent[]> {
      const result = await fetchJson<{ events: DomainEvent[] }>(
        `/api/v1/events?runId=${encodeURIComponent(runId)}`
      );
      return result.events || [];
    },

    async loadDecisions(runId: string): Promise<GovernanceDecisionRecord[]> {
      const result = await fetchJson<{ decisions: GovernanceDecisionRecord[] }>(
        `/api/v1/decisions?runId=${encodeURIComponent(runId)}`
      );
      return result.decisions || [];
    },

    async queryEvents(opts: {
      runId?: string;
      kind?: string;
      limit?: number;
    }): Promise<DomainEvent[]> {
      const params = new URLSearchParams();
      if (opts.runId) params.set('runId', opts.runId);
      if (opts.kind) params.set('kind', opts.kind);
      if (opts.limit) params.set('limit', String(opts.limit));
      const result = await fetchJson<{ events: DomainEvent[] }>(
        `/api/v1/events?${params.toString()}`
      );
      return result.events || [];
    },
  };
}
