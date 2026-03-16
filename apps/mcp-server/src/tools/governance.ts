// Governance tools — propose actions, evaluate policy, check invariants, simulate.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createKernel } from '@red-codes/kernel';
import type { KernelResult, RawAgentAction } from '@red-codes/kernel';
import { normalizeIntent } from '@red-codes/kernel';
import { evaluate, loadYamlPolicy } from '@red-codes/policy';
import type { LoadedPolicy } from '@red-codes/policy';
import { checkAllInvariants, buildSystemState, DEFAULT_INVARIANTS } from '@red-codes/invariants';
import {
  createSimulatorRegistry,
  createGitSimulator,
  createFilesystemSimulator,
  createPackageSimulator,
  createDependencyGraphSimulator,
} from '@red-codes/kernel';
import type { McpConfig } from '../config.js';

function loadPoliciesFromPath(policyPath?: string): LoadedPolicy[] {
  if (!policyPath) return [];
  try {
    const absPath = resolve(policyPath);
    if (!existsSync(absPath)) return [];
    const content = readFileSync(absPath, 'utf8');
    if (absPath.endsWith('.yaml') || absPath.endsWith('.yml')) {
      const policy = loadYamlPolicy(content, policyPath);
      return [{ id: policy.id, name: policy.name, rules: policy.rules, severity: policy.severity }];
    }
    const parsed = JSON.parse(content) as unknown;
    return (Array.isArray(parsed) ? parsed : [parsed]) as LoadedPolicy[];
  } catch {
    return [];
  }
}

function buildSimulatorRegistry() {
  const registry = createSimulatorRegistry();
  registry.register(createGitSimulator());
  registry.register(createFilesystemSimulator());
  registry.register(createPackageSimulator());
  registry.register(createDependencyGraphSimulator());
  return registry;
}

function serializeResult(result: KernelResult): object {
  return {
    allowed: result.allowed,
    executed: result.executed,
    decision: result.decision,
    runId: result.runId,
    action: result.action,
    events: result.events.map((e) => ({ kind: e.kind, timestamp: e.timestamp })),
    decisionRecord: result.decisionRecord
      ? {
          recordId: result.decisionRecord.recordId,
          outcome: result.decisionRecord.outcome,
          reason: result.decisionRecord.reason,
          invariants: result.decisionRecord.invariants,
          simulation: result.decisionRecord.simulation,
        }
      : undefined,
  };
}

export function registerGovernanceTools(server: McpServer, config: McpConfig): void {
  // propose_action — submit an action through the governance kernel
  server.tool(
    'propose_action',
    'Submit an action through the AgentGuard governance kernel for policy and invariant evaluation',
    {
      tool: z.string().describe('Tool name (e.g. Bash, Write, Edit, Read)'),
      command: z.string().optional().describe('Shell command (for Bash tool)'),
      file: z.string().optional().describe('Target file path'),
      content: z.string().optional().describe('File content (for Write/Edit)'),
      target: z.string().optional().describe('Action target'),
      branch: z.string().optional().describe('Git branch'),
      agent: z.string().optional().describe('Agent identity'),
      dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('Evaluate only, do not execute (default: true)'),
      policyPath: z.string().optional().describe('Path to policy file'),
    },
    async (args) => {
      try {
        const policies = loadPoliciesFromPath(args.policyPath || config.policyPath);

        const rawAction: RawAgentAction = {
          tool: args.tool,
          command: args.command,
          file: args.file,
          content: args.content,
          target: args.target,
          branch: args.branch,
          agent: args.agent || 'mcp-client',
        };

        const kernel = createKernel({
          policyDefs: policies,
          invariants: DEFAULT_INVARIANTS,
          dryRun: args.dryRun ?? true,
          simulators: buildSimulatorRegistry(),
        });

        const result = await kernel.propose(rawAction);
        kernel.shutdown();

        return {
          content: [{ type: 'text', text: JSON.stringify(serializeResult(result), null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        };
      }
    }
  );

  // evaluate_policy — test an action against policy rules without kernel
  server.tool(
    'evaluate_policy',
    'Evaluate an action against policy rules (standalone, no kernel overhead)',
    {
      action: z.string().describe('Canonical action type (e.g. git.push, file.write, shell.exec)'),
      target: z.string().optional().default('').describe('Target path or branch'),
      command: z.string().optional().describe('Shell command'),
      branch: z.string().optional().describe('Git branch'),
      agent: z.string().optional().default('mcp-client').describe('Agent identity'),
      policyPath: z.string().optional().describe('Path to policy file'),
    },
    async (args) => {
      try {
        const policies = loadPoliciesFromPath(args.policyPath || config.policyPath);
        const intent = normalizeIntent({
          tool: args.action,
          target: args.target,
          command: args.command,
          branch: args.branch,
          agent: args.agent,
        });

        const result = evaluate(intent, policies);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  allowed: result.allowed,
                  decision: result.decision,
                  reason: result.reason,
                  severity: result.severity,
                  matchedRule: result.matchedRule,
                  matchedPolicy: result.matchedPolicy,
                  trace: result.trace,
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

  // check_invariants — evaluate system state against all 17 built-in invariants
  server.tool(
    'check_invariants',
    'Check system state against all 17 built-in AgentGuard invariants',
    {
      modifiedFiles: z.array(z.string()).optional().describe('File paths being modified'),
      targetBranch: z.string().optional().describe('Target git branch'),
      directPush: z.boolean().optional().describe('Is this a direct push?'),
      forcePush: z.boolean().optional().describe('Is this a force push?'),
      isPush: z.boolean().optional().describe('Is this a push operation?'),
      testsPass: z.boolean().optional().describe('Have tests passed?'),
      formatPass: z.boolean().optional().describe('Has formatting (Prettier) passed?'),
      filesAffected: z.number().optional().describe('Number of files affected'),
      currentTarget: z.string().optional().describe('Current file target'),
      currentCommand: z.string().optional().describe('Current shell command'),
      currentActionType: z.string().optional().describe('Canonical action type'),
    },
    async (args) => {
      try {
        const state = buildSystemState(args);
        const result = checkAllInvariants(DEFAULT_INVARIANTS, state);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  allHold: result.allHold,
                  violationCount: result.violations.length,
                  violations: result.violations.map((v) => ({
                    id: v.invariant.id,
                    name: v.invariant.name,
                    severity: v.invariant.severity,
                    expected: v.result.expected,
                    actual: v.result.actual,
                  })),
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

  // simulate_action — predict impact without executing
  server.tool(
    'simulate_action',
    'Simulate an action and predict its impact without executing',
    {
      action: z.string().describe('Canonical action type (e.g. git.push, file.write)'),
      target: z.string().optional().default('').describe('Target path'),
      command: z.string().optional().describe('Shell command'),
      branch: z.string().optional().describe('Git branch'),
    },
    async (args) => {
      try {
        const intent = normalizeIntent({
          tool: args.action,
          target: args.target,
          command: args.command,
          branch: args.branch,
          agent: 'mcp-client',
        });

        const registry = buildSimulatorRegistry();
        const simulator = registry.find(intent);

        if (!simulator) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: 'No simulator supports this action type',
                  action: intent.action,
                  target: intent.target,
                }),
              },
            ],
          };
        }

        const result = await simulator.simulate(intent, {});

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  simulatorId: result.simulatorId,
                  riskLevel: result.riskLevel,
                  blastRadius: result.blastRadius,
                  predictedChanges: result.predictedChanges,
                  durationMs: result.durationMs,
                  forecast: result.forecast,
                  details: result.details,
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
