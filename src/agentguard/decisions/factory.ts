// Decision record factory — builds GovernanceDecisionRecord from kernel data.
// Pure logic. Combines MonitorDecision + execution result into a single record.

import type { GovernanceDecisionRecord, SimulationSummary } from './types.js';
import type { MonitorDecision } from '../monitor.js';
import type { ExecutionResult } from '../../core/types.js';
import { simpleHash } from '../../domain/hash.js';

export interface DecisionFactoryInput {
  runId: string;
  decision: MonitorDecision;
  execution: ExecutionResult | null;
  executionDurationMs: number | null;
  simulation: SimulationSummary | null;
}

function generateRecordId(timestamp: number, runId: string, action: string): string {
  const content = `${timestamp}:${runId}:${action}`;
  return `dec_${timestamp}_${simpleHash(content)}`;
}

export function buildDecisionRecord(input: DecisionFactoryInput): GovernanceDecisionRecord {
  const { runId, decision, execution, executionDurationMs, simulation } = input;
  const timestamp = Date.now();
  const intent = decision.intent;

  return {
    recordId: generateRecordId(timestamp, runId, intent.action),
    runId,
    timestamp,
    action: {
      type: intent.action,
      target: intent.target,
      agent: intent.agent,
      destructive: intent.destructive,
      command: intent.command,
    },
    outcome: decision.allowed ? 'allow' : 'deny',
    reason: decision.decision.reason,
    intervention: decision.intervention,
    policy: {
      matchedPolicyId: decision.decision.matchedPolicy?.id ?? null,
      matchedPolicyName: decision.decision.matchedPolicy?.name ?? null,
      severity: decision.decision.severity,
    },
    invariants: {
      allHold: decision.violations.length === 0,
      violations: decision.violations.map((v) => ({
        invariantId: v.invariantId,
        name: v.name,
        severity: v.severity,
        expected: v.expected,
        actual: v.actual,
      })),
    },
    simulation,
    evidencePackId: decision.evidencePack?.packId ?? null,
    monitor: {
      escalationLevel: decision.monitor.escalationLevel,
      totalEvaluations: decision.monitor.totalEvaluations,
      totalDenials: decision.monitor.totalDenials,
    },
    execution: {
      executed: execution !== null,
      success: execution?.success ?? null,
      durationMs: executionDurationMs,
      error: execution?.error ?? null,
    },
  };
}
