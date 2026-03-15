// OpenClaw adapter types — translation boundary between OpenClaw and AgentGuard.
// These types define the adapter's public API surface.
// No OpenClaw runtime internals are exposed to the kernel.

import type { DomainEvent } from '@red-codes/core';

/** Incoming tool invocation from the OpenClaw runtime. */
export interface OpenClawToolCall {
  /** OpenClaw tool name (e.g., 'file_read', 'shell_exec', 'http_fetch') */
  tool: string;
  /** Tool-specific arguments */
  input: Record<string, unknown>;
}

/** Session and identity context from the OpenClaw runtime. */
export interface OpenClawContext {
  sessionId?: string;
  workspaceId?: string;
  /** Agent or user identity */
  actor?: string;
  /** Originating plugin identifier */
  pluginId?: string;
}

/** Normalized guard request — canonical shape for policy evaluation. */
export interface GuardRequest {
  toolName: string;
  args: Record<string, unknown>;
  sessionId?: string;
  workspaceId?: string;
  actor?: string;
  source: 'openclaw';
  riskHints?: string[];
}

/** Guard decision — the allow/deny verdict with severity. */
export interface GuardDecision {
  allowed: boolean;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  requireApproval?: boolean;
}

/** Full guard result including audit data. */
export interface GuardResult {
  decision: GuardDecision;
  request: GuardRequest;
  events: DomainEvent[];
  runId: string;
}
