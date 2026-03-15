// OpenClaw guard adapter — the core integration point.
// Translates OpenClaw tool calls into kernel proposals and returns structured decisions.
// The kernel handles all policy evaluation, invariant checking, and event emission.

import type { Kernel, KernelResult } from '@red-codes/kernel';
import type {
  OpenClawToolCall,
  OpenClawContext,
  GuardRequest,
  GuardDecision,
  GuardResult,
} from './types.js';
import { normalizeOpenClawAction, buildGuardRequest } from './normalize.js';

/** Map kernel violation severity (numeric) to GuardDecision severity labels. */
function mapSeverity(kernelResult: KernelResult): GuardDecision['severity'] {
  const violations = kernelResult.decision?.violations ?? [];
  const maxSeverity = Math.max(
    kernelResult.decision?.decision?.severity ?? 0,
    ...violations.map((v) => v.severity ?? 0)
  );

  if (maxSeverity >= 5) return 'critical';
  if (maxSeverity >= 4) return 'high';
  if (maxSeverity >= 3) return 'medium';
  return 'low';
}

/** Format a KernelResult into a GuardDecision. */
export function formatGuardDecision(kernelResult: KernelResult): GuardDecision {
  if (!kernelResult.allowed) {
    const reason = kernelResult.decision?.decision?.reason ?? 'Action denied';
    const violations = kernelResult.decision?.violations ?? [];
    const parts = [reason];
    if (violations.length > 0) {
      parts.push(`Violations: ${violations.map((v) => v.name).join(', ')}`);
    }
    return {
      allowed: false,
      reason: parts.join(' | '),
      severity: mapSeverity(kernelResult),
    };
  }

  return {
    allowed: true,
    reason: kernelResult.decision?.decision?.reason ?? 'Action allowed',
    severity: 'low',
  };
}

export interface OpenClawGuard {
  /** Evaluate a pre-built GuardRequest against the kernel. */
  evaluate(request: GuardRequest): Promise<GuardResult>;
  /** Convenience: evaluate an OpenClaw tool call directly. */
  evaluateToolCall(toolCall: OpenClawToolCall, context?: OpenClawContext): Promise<GuardResult>;
}

/**
 * Create an OpenClaw guard backed by an AgentGuard kernel.
 * The kernel should be configured with dryRun: true since OpenClaw handles execution.
 */
export function createOpenClawGuard(kernel: Kernel): OpenClawGuard {
  async function evaluateToolCall(
    toolCall: OpenClawToolCall,
    context?: OpenClawContext
  ): Promise<GuardResult> {
    const rawAction = normalizeOpenClawAction(toolCall, context);
    const request = buildGuardRequest(toolCall, context);

    const kernelResult = await kernel.propose(rawAction, {
      source: 'openclaw',
      sessionId: context?.sessionId,
      workspaceId: context?.workspaceId,
    });

    return {
      decision: formatGuardDecision(kernelResult),
      request,
      events: kernelResult.events,
      runId: kernelResult.runId,
    };
  }

  async function evaluate(request: GuardRequest): Promise<GuardResult> {
    const toolCall: OpenClawToolCall = {
      tool: request.toolName,
      input: request.args,
    };
    const context: OpenClawContext = {
      sessionId: request.sessionId,
      workspaceId: request.workspaceId,
      actor: request.actor,
    };
    return evaluateToolCall(toolCall, context);
  }

  return { evaluate, evaluateToolCall };
}
