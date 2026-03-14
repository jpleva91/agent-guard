// TUI governance renderer — wraps the existing tui.ts render functions
// into a GovernanceRenderer plugin. Writes ANSI-colored output to a stream.

import type {
  GovernanceRenderer,
  PolicyTracePayload,
  RendererConfig,
  RunSummary,
} from './types.js';
import type { KernelResult } from '@red-codes/kernel';
import type { MonitorDecision } from '@red-codes/kernel';
import type { GovernanceDecisionRecord } from '@red-codes/core';
import type { SimulationResult } from '@red-codes/kernel';
import {
  renderBanner,
  renderKernelResult,
  renderMonitorStatus,
  renderDecisionRecord,
  renderSimulation,
  renderPolicyTraces,
} from './tui-formatters.js';

export interface TuiRendererOptions {
  /** Output stream — defaults to process.stderr */
  output?: { write(s: string): boolean };
  /** Show verbose output (decision records, reasons) */
  verbose?: boolean;
  /** Show policy evaluation traces inline */
  trace?: boolean;
}

/**
 * Create a TUI governance renderer.
 *
 * This is the reference implementation of GovernanceRenderer. It adapts
 * the existing tui.ts render functions into the plugin interface, writing
 * ANSI-colored output to the configured stream (stderr by default).
 */
export function createTuiRenderer(options: TuiRendererOptions = {}): GovernanceRenderer {
  const output = options.output ?? process.stderr;
  const verbose = options.verbose ?? false;
  let traceEnabled = options.trace ?? false;

  return {
    id: 'tui',
    name: 'Terminal UI Renderer',

    onRunStarted(config: RendererConfig) {
      if (config.trace !== undefined) {
        traceEnabled = config.trace;
      }
      output.write(
        renderBanner({
          policyName: config.policyName,
          invariantCount: config.invariantCount,
          verbose: config.verbose ?? verbose,
        })
      );
      output.write(`  \x1b[2mrun: ${config.runId}\x1b[0m\n`);
      if (config.simulatorCount && config.simulatorCount > 0) {
        output.write(`  \x1b[2msimulators: ${config.simulatorCount} active\x1b[0m\n`);
      }
      output.write('\n');
    },

    onActionResult(result: KernelResult) {
      output.write(renderKernelResult(result, verbose) + '\n');
      if (result.decision.violations.length > 0 || !result.allowed) {
        output.write(renderMonitorStatus(result.decision) + '\n');
      }
    },

    onMonitorStatus(decision: MonitorDecision) {
      output.write(renderMonitorStatus(decision) + '\n');
    },

    onSimulation(simulation: SimulationResult) {
      output.write(renderSimulation(simulation) + '\n');
    },

    onDecisionRecord(record: GovernanceDecisionRecord) {
      if (verbose) {
        output.write(renderDecisionRecord(record) + '\n');
      }
    },

    onPolicyTrace(trace: PolicyTracePayload) {
      if (!traceEnabled) return;
      output.write(
        renderPolicyTraces([
          {
            kind: 'PolicyTraceRecorded',
            timestamp: Date.now(),
            actionType: trace.actionType,
            target: trace.target,
            decision: trace.decision,
            totalRulesChecked: trace.totalRulesChecked,
            phaseThatMatched: trace.phaseThatMatched,
            rulesEvaluated: trace.rulesEvaluated as Parameters<
              typeof renderPolicyTraces
            >[0][0]['rulesEvaluated'],
            durationMs: trace.durationMs,
          },
        ]) + '\n'
      );
    },

    onRunEnded(summary: RunSummary) {
      const lines: string[] = [];
      lines.push('');
      lines.push(`  \x1b[1m\x1b[36mRun Complete\x1b[0m \x1b[2m${summary.runId}\x1b[0m`);
      lines.push(
        `  \x1b[2mactions: ${summary.totalActions} | allowed: ${summary.allowed} | denied: ${summary.denied} | violations: ${summary.violations}\x1b[0m`
      );
      lines.push(`  \x1b[2mduration: ${summary.durationMs}ms\x1b[0m`);
      lines.push('');
      output.write(lines.join('\n'));
    },
  };
}
