// Local data source — reads governance data from JSONL files or SQLite.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';
import { getEventFilePath, getDecisionFilePath } from '@red-codes/events';
import type { DataSource } from './types.js';
import type { McpConfig } from '../config.js';

function parseJsonlFile<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf8');
  const items: T[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      items.push(JSON.parse(trimmed) as T);
    } catch {
      // Skip malformed lines
    }
  }
  return items;
}

export function createLocalDataSource(config: McpConfig): DataSource {
  const baseDir = config.baseDir;
  const eventsDir = join(baseDir, 'events');

  return {
    async listRuns(limit?: number): Promise<string[]> {
      if (!existsSync(eventsDir)) return [];
      const files = readdirSync(eventsDir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => f.replace('.jsonl', ''))
        .sort()
        .reverse();
      return limit ? files.slice(0, limit) : files;
    },

    async loadEvents(runId: string): Promise<DomainEvent[]> {
      const filePath = getEventFilePath(runId, baseDir);
      return parseJsonlFile<DomainEvent>(filePath);
    },

    async loadDecisions(runId: string): Promise<GovernanceDecisionRecord[]> {
      const filePath = getDecisionFilePath(runId, baseDir);
      return parseJsonlFile<GovernanceDecisionRecord>(filePath);
    },

    async queryEvents(opts: {
      runId?: string;
      kind?: string;
      limit?: number;
    }): Promise<DomainEvent[]> {
      let events: DomainEvent[] = [];

      if (opts.runId) {
        events = await this.loadEvents(opts.runId);
      } else {
        // Load from all runs (most recent first)
        const runs = await this.listRuns(10);
        for (const runId of runs) {
          events.push(...(await this.loadEvents(runId)));
        }
      }

      if (opts.kind) {
        events = events.filter((e) => e.kind === opts.kind);
      }

      if (opts.limit) {
        events = events.slice(0, opts.limit);
      }

      return events;
    },
  };
}
