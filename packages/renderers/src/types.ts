// Renderer plugin interface — contracts for governance output renderers.
// Renderers consume kernel results and produce output (terminal, file, etc.).

import type { KernelResult } from '@red-codes/kernel';
import type { MonitorDecision } from '@red-codes/kernel';
import type { GovernanceDecisionRecord } from '@red-codes/core';
import type { SimulationResult } from '@red-codes/kernel';

/** Configuration passed to renderers at run start */
export interface RendererConfig {
  readonly runId: string;
  readonly policyName?: string;
  readonly invariantCount?: number;
  readonly verbose?: boolean;
  readonly dryRun?: boolean;
  readonly simulatorCount?: number;
  readonly trace?: boolean;
  /** Enforcement posture: 'default-deny' (policy loaded) or 'fail-open' (no policy) */
  readonly posture?: 'default-deny' | 'fail-open';
}

/** A single policy trace event for real-time rendering */
export interface PolicyTracePayload {
  readonly actionType: string;
  readonly target?: string;
  readonly decision: string;
  readonly totalRulesChecked: number;
  readonly phaseThatMatched?: string | null;
  readonly rulesEvaluated?: ReadonlyArray<{
    readonly policyId: string;
    readonly policyName: string;
    readonly ruleIndex: number;
    readonly effect: string;
    readonly actionPattern: string | string[];
    readonly actionMatched: boolean;
    readonly conditionsMatched: boolean;
    readonly conditionDetails: {
      readonly scopeMatched?: boolean;
      readonly limitExceeded?: boolean;
      readonly branchMatched?: boolean;
    };
    readonly outcome: 'match' | 'no-match' | 'skipped';
  }>;
  readonly durationMs?: number;
}

/** Summary provided to renderers at run end */
export interface RunSummary {
  readonly runId: string;
  readonly totalActions: number;
  readonly allowed: number;
  readonly denied: number;
  readonly violations: number;
  readonly durationMs: number;
}

/**
 * GovernanceRenderer — the plugin interface for output renderers.
 *
 * Renderers receive lifecycle callbacks as actions flow through the kernel.
 * Multiple renderers can be active simultaneously (e.g., TUI + file report).
 *
 * All methods are optional — implement only the hooks you need.
 * All methods are synchronous to avoid blocking the kernel pipeline.
 */
export interface GovernanceRenderer {
  /** Unique identifier for this renderer */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Called when a governance run starts */
  onRunStarted?(config: RendererConfig): void;

  /** Called after each action is evaluated (allowed or denied) */
  onActionResult?(result: KernelResult): void;

  /** Called when escalation state changes */
  onMonitorStatus?(decision: MonitorDecision): void;

  /** Called when a pre-execution simulation completes */
  onSimulation?(simulation: SimulationResult): void;

  /** Called when a governance decision record is persisted */
  onDecisionRecord?(record: GovernanceDecisionRecord): void;

  /** Called when a policy evaluation trace is recorded */
  onPolicyTrace?(trace: PolicyTracePayload): void;

  /** Called when a governance run ends */
  onRunEnded?(summary: RunSummary): void;

  /** Called to release resources when the renderer is unregistered */
  dispose?(): void;
}
