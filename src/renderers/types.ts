// Renderer plugin interface — contracts for governance output renderers.
// Renderers consume kernel results and produce output (terminal, file, etc.).

import type { KernelResult } from '../kernel/kernel.js';
import type { MonitorDecision } from '../kernel/monitor.js';
import type { GovernanceDecisionRecord } from '../kernel/decisions/types.js';
import type { SimulationResult } from '../kernel/simulation/types.js';

/** Configuration passed to renderers at run start */
export interface RendererConfig {
  readonly runId: string;
  readonly policyName?: string;
  readonly invariantCount?: number;
  readonly verbose?: boolean;
  readonly dryRun?: boolean;
  readonly simulatorCount?: number;
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

  /** Called when a governance run ends */
  onRunEnded?(summary: RunSummary): void;

  /** Called to release resources when the renderer is unregistered */
  dispose?(): void;
}
