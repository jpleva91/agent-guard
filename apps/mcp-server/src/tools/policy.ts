// Policy tools — validate policies, list invariants.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadYamlPolicy, validatePolicy } from '@red-codes/policy';
import { DEFAULT_INVARIANTS } from '@red-codes/invariants';

export function registerPolicyTools(server: McpServer): void {
  // validate_policy — check policy file syntax
  server.tool(
    'validate_policy',
    'Validate AgentGuard policy content (YAML or JSON) for syntax and structure',
    {
      content: z.string().describe('Policy content (YAML or JSON string)'),
      format: z.enum(['yaml', 'json']).optional().default('yaml').describe('Policy format'),
    },
    async (args) => {
      try {
        if (args.format === 'yaml') {
          const policy = loadYamlPolicy(args.content, 'inline');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    valid: true,
                    policy: {
                      id: policy.id,
                      name: policy.name,
                      ruleCount: policy.rules.length,
                      rules: policy.rules.map((r) => ({
                        action: r.action,
                        effect: r.effect,
                        reason: r.reason,
                      })),
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // JSON format
        const parsed = JSON.parse(args.content) as unknown;
        const policies = Array.isArray(parsed) ? parsed : [parsed];
        const result = validatePolicy(policies);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ valid: false, error: String(err) }, null, 2),
            },
          ],
        };
      }
    }
  );

  // list_invariants — show all 17 built-in invariant definitions
  server.tool(
    'list_invariants',
    'List all 17 built-in AgentGuard invariants with their IDs, names, and descriptions',
    {},
    async () => {
      const invariants = DEFAULT_INVARIANTS.map((inv) => ({
        id: inv.id,
        name: inv.name,
        description: inv.description,
        severity: inv.severity,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ count: invariants.length, invariants }, null, 2),
          },
        ],
      };
    }
  );
}
