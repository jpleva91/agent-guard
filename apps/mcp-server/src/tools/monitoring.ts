// Monitoring tools — inspect runs, list runs, query events, compare, traces.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DomainEvent } from '@red-codes/core';
import { compareReplaySessions, buildReplaySession } from '@red-codes/kernel';
import type { DataSource } from '../backends/types.js';

export function registerMonitoringTools(server: McpServer, dataSource: DataSource): void {
  // list_runs — enumerate recorded governance sessions
  server.tool(
    'list_runs',
    'List recorded AgentGuard governance sessions',
    {
      limit: z.number().optional().default(20).describe('Maximum runs to return (default: 20)'),
    },
    async (args) => {
      try {
        const runs = await dataSource.listRuns(args.limit);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ runs, count: runs.length }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    }
  );

  // inspect_run — load and display run details
  server.tool(
    'inspect_run',
    'Inspect a governance session: view events, decisions, and action graph',
    {
      runId: z.string().describe('Run ID to inspect'),
    },
    async (args) => {
      try {
        const events = await dataSource.loadEvents(args.runId);
        const decisions = await dataSource.loadDecisions(args.runId);

        const summary = {
          runId: args.runId,
          totalEvents: events.length,
          totalDecisions: decisions.length,
          eventKinds: countByKind(events),
          decisions: decisions.map((d) => ({
            recordId: d.recordId,
            outcome: d.outcome,
            action: d.action,
            reason: d.reason,
          })),
          timeline: events.slice(0, 50).map((e) => ({
            kind: e.kind,
            timestamp: e.timestamp,
          })),
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    }
  );

  // query_events — search events by kind, run, with limit
  server.tool(
    'query_events',
    'Search governance events by run ID, event kind, and limit',
    {
      runId: z.string().optional().describe('Filter by run ID'),
      kind: z
        .string()
        .optional()
        .describe('Filter by event kind (e.g. PolicyDenied, ActionExecuted)'),
      limit: z.number().optional().default(50).describe('Maximum events to return (default: 50)'),
    },
    async (args) => {
      try {
        const events = await dataSource.queryEvents({
          runId: args.runId,
          kind: args.kind,
          limit: args.limit,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: events.length, events }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    }
  );

  // compare_runs — diff two governance sessions
  server.tool(
    'compare_runs',
    'Compare two governance sessions side-by-side (action counts, denials, violations)',
    {
      runId1: z.string().describe('First run ID'),
      runId2: z.string().describe('Second run ID'),
    },
    async (args) => {
      try {
        const events1 = await dataSource.loadEvents(args.runId1);
        const events2 = await dataSource.loadEvents(args.runId2);

        const session1 = buildReplaySession(args.runId1, events1);
        const session2 = buildReplaySession(args.runId2, events2);
        const comparison = compareReplaySessions(session1, session2);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  totalComparisons: comparison.totalComparisons,
                  matches: comparison.matches,
                  divergences: comparison.divergences,
                  missing: comparison.missing,
                  extra: comparison.extra,
                  identical: comparison.identical,
                  comparisons: comparison.comparisons.slice(0, 50),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    }
  );

  // get_traces — display policy evaluation traces for a run
  server.tool(
    'get_traces',
    'Get policy evaluation traces for a governance session',
    {
      runId: z.string().describe('Run ID'),
      actionFilter: z.string().optional().describe('Filter by action type'),
      decisionFilter: z.string().optional().describe('Filter by decision (allow or deny)'),
    },
    async (args) => {
      try {
        const events = await dataSource.loadEvents(args.runId);
        let traces = events.filter((e) => e.kind === 'PolicyTraceRecorded');

        if (args.actionFilter) {
          traces = traces.filter((e) => {
            const payload = e as Record<string, unknown>;
            return String(payload.action || '').includes(args.actionFilter!);
          });
        }

        if (args.decisionFilter) {
          traces = traces.filter((e) => {
            const payload = e as Record<string, unknown>;
            return String(payload.decision || '') === args.decisionFilter;
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: traces.length, traces }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    }
  );
}

function countByKind(events: DomainEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  }
  return counts;
}
