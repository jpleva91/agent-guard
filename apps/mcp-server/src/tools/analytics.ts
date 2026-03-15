// Analytics tools — violation analysis, risk scoring, rule suggestions.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyze, analyzeRisk, generateSuggestions, toYaml } from '@red-codes/analytics';

export function registerAnalyticsTools(server: McpServer): void {
  // analyze_violations — run the full analytics pipeline
  server.tool(
    'analyze_violations',
    'Analyze violation patterns across governance sessions (clusters, trends, risk scores)',
    {
      baseDir: z
        .string()
        .optional()
        .default('.agentguard')
        .describe('Base directory for governance data'),
      minClusterSize: z
        .number()
        .optional()
        .default(2)
        .describe('Minimum violations to form a cluster'),
    },
    async (args) => {
      try {
        const report = analyze({
          baseDir: args.baseDir,
          minClusterSize: args.minClusterSize,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  sessionsAnalyzed: report.sessionsAnalyzed,
                  totalViolations: report.totalViolations,
                  violationsByKind: report.violationsByKind,
                  clusters: report.clusters,
                  trends: report.trends,
                  topInferredCauses: report.topInferredCauses,
                  failureAnalysis: report.failureAnalysis,
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

  // risk_scores — per-session risk assessment
  server.tool(
    'risk_scores',
    'Compute per-session governance risk scores',
    {
      baseDir: z
        .string()
        .optional()
        .default('.agentguard')
        .describe('Base directory for governance data'),
    },
    async (args) => {
      try {
        const scores = analyzeRisk({ baseDir: args.baseDir });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: scores.length, scores }, null, 2),
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

  // suggest_rules — generate policy improvements from violation data
  server.tool(
    'suggest_rules',
    'Generate policy rule suggestions based on violation patterns',
    {
      baseDir: z
        .string()
        .optional()
        .default('.agentguard')
        .describe('Base directory for governance data'),
      minClusterSize: z.number().optional().default(2).describe('Minimum cluster size'),
    },
    async (args) => {
      try {
        const report = analyze({
          baseDir: args.baseDir,
          minClusterSize: args.minClusterSize,
        });
        const suggestions = generateSuggestions(report);
        const yaml = toYaml(suggestions);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  suggestionCount: suggestions.suggestions.length,
                  suggestions: suggestions.suggestions,
                  yaml,
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
}
