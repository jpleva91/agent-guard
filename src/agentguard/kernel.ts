// Governed Action Kernel — the core orchestrator.
// Connects monitor (AAB + policy + invariants) with execution adapters.
// Emits full action lifecycle events: REQUESTED → ALLOWED/DENIED → EXECUTED/FAILED.
// Builds GovernanceDecisionRecords and sinks them for audit.

import type { DomainEvent, CanonicalAction } from '../core/types.js';
import { createMonitor } from './monitor.js';
import type { MonitorConfig, MonitorDecision } from './monitor.js';
import type { RawAgentAction } from './core/aab.js';
import { createAction, getActionClass } from '../domain/actions.js';
import { createAdapterRegistry } from '../domain/execution/adapters.js';
import type { AdapterRegistry, ExecutionResult, DecisionRecord } from '../core/types.js';
import {
  createEvent,
  ACTION_REQUESTED,
  ACTION_ALLOWED,
  ACTION_DENIED,
  ACTION_EXECUTED,
  ACTION_FAILED,
  DECISION_RECORDED,
  SIMULATION_COMPLETED,
} from '../domain/events.js';
import { simpleHash } from '../domain/hash.js';
import type { GovernanceDecisionRecord, DecisionSink } from './decisions/types.js';
import { buildDecisionRecord } from './decisions/factory.js';
import type { SimulatorRegistry } from './simulation/types.js';

export interface KernelResult {
  allowed: boolean;
  executed: boolean;
  decision: MonitorDecision;
  execution: ExecutionResult | null;
  action: CanonicalAction | null;
  events: DomainEvent[];
  runId: string;
  /** Governance decision record (additive — not present in older results) */
  decisionRecord?: GovernanceDecisionRecord;
}

export interface EventSink {
  write(event: DomainEvent): void;
  flush?(): void;
}

export interface KernelConfig extends MonitorConfig {
  runId?: string;
  sinks?: EventSink[];
  adapters?: AdapterRegistry;
  dryRun?: boolean;
  /** Optional decision sinks for persisting GovernanceDecisionRecords */
  decisionSinks?: DecisionSink[];
  /** Optional simulator registry for pre-execution impact simulation */
  simulators?: SimulatorRegistry;
  /** Blast radius threshold — simulation above this triggers invariant re-check */
  simulationBlastRadiusThreshold?: number;
}

export interface Kernel {
  propose(
    rawAction: RawAgentAction,
    systemContext?: Record<string, unknown>
  ): Promise<KernelResult>;
  getRunId(): string;
  getActionLog(): KernelResult[];
  getEventCount(): number;
  shutdown(): void;
}

function generateRunId(): string {
  return `run_${Date.now()}_${simpleHash(Math.random().toString())}`;
}

export function createKernel(config: KernelConfig = {}): Kernel {
  const runId = config.runId || generateRunId();
  const sinks: EventSink[] = config.sinks || [];
  const decisionSinks: DecisionSink[] = config.decisionSinks || [];
  const adapters = config.adapters || createAdapterRegistry();
  const dryRun = config.dryRun ?? false;
  const simulators = config.simulators || null;
  const blastRadiusThreshold = config.simulationBlastRadiusThreshold ?? 50;
  const actionLog: KernelResult[] = [];
  let eventCount = 0;

  const monitor = createMonitor({
    policyDefs: config.policyDefs,
    invariants: config.invariants,
    denialThreshold: config.denialThreshold,
    violationThreshold: config.violationThreshold,
    windowSize: config.windowSize,
  });

  function sinkEvent(event: DomainEvent): void {
    eventCount++;
    for (const sink of sinks) {
      sink.write(event);
    }
  }

  function sinkEvents(events: DomainEvent[]): void {
    for (const event of events) {
      sinkEvent(event);
    }
  }

  function sinkDecision(record: GovernanceDecisionRecord): void {
    for (const sink of decisionSinks) {
      sink.write(record);
    }
  }

  return {
    propose: async (rawAction, systemContext = {}) => {
      const allEvents: DomainEvent[] = [];

      // 1. Emit ACTION_REQUESTED
      const requestedEvent = createEvent(ACTION_REQUESTED, {
        actionType: rawAction.tool || 'unknown',
        target: rawAction.file || rawAction.target || '',
        justification: (rawAction.metadata?.justification as string) || 'agent action',
        actionId: undefined,
        agentId: rawAction.agent || 'unknown',
        metadata: { runId, command: rawAction.command },
      });
      allEvents.push(requestedEvent);

      // 2. Evaluate via monitor (AAB → policy → invariants → evidence)
      const decision = monitor.process(rawAction, systemContext);

      // 3. Create canonical action object for execution
      let action: CanonicalAction | null = null;
      try {
        const actionType = decision.intent.action;
        const target = decision.intent.target;
        if (actionType !== 'unknown') {
          action = createAction(actionType, target, 'kernel-proposed', {
            command: rawAction.command,
            agent: rawAction.agent,
            runId,
          });
        }
      } catch {
        // Action creation may fail for unknown types — continue with null
      }

      // 4. Emit decision events from monitor
      sinkEvents(decision.events);

      if (!decision.allowed) {
        // 5a. DENIED — emit denial event, build decision record
        const deniedEvent = createEvent(ACTION_DENIED, {
          actionType: decision.intent.action,
          target: decision.intent.target,
          reason: decision.decision.reason,
          actionId: action?.id,
          policyHash: decision.decision.matchedPolicy?.id,
          metadata: {
            runId,
            intervention: decision.intervention,
            violations: decision.violations,
          },
        });
        allEvents.push(deniedEvent);
        sinkEvents(allEvents);

        const decisionRecord = buildDecisionRecord({
          runId,
          decision,
          execution: null,
          executionDurationMs: null,
          simulation: null,
        });
        sinkDecision(decisionRecord);

        // Emit DECISION_RECORDED event
        const decisionEvent = createEvent(DECISION_RECORDED, {
          recordId: decisionRecord.recordId,
          outcome: decisionRecord.outcome,
          actionType: decisionRecord.action.type,
          target: decisionRecord.action.target,
          reason: decisionRecord.reason,
        });
        sinkEvent(decisionEvent);

        const result: KernelResult = {
          allowed: false,
          executed: false,
          decision,
          execution: null,
          action,
          events: allEvents,
          runId,
          decisionRecord,
        };
        actionLog.push(result);
        return result;
      }

      // 5b. ALLOWED — run simulation if available, then re-check
      let simulationResult = null;

      if (simulators && simulators.find(decision.intent)) {
        const simulator = simulators.find(decision.intent)!;
        try {
          simulationResult = await simulator.simulate(decision.intent, systemContext);

          // Emit simulation event
          const simEvent = createEvent(SIMULATION_COMPLETED, {
            simulatorId: simulationResult.simulatorId,
            riskLevel: simulationResult.riskLevel,
            blastRadius: simulationResult.blastRadius,
            predictedChanges: simulationResult.predictedChanges,
            durationMs: simulationResult.durationMs,
          });
          allEvents.push(simEvent);
          sinkEvent(simEvent);

          // Re-check invariants if simulation reveals elevated risk
          if (
            simulationResult.blastRadius > blastRadiusThreshold ||
            simulationResult.riskLevel === 'high'
          ) {
            // Import checker for re-check
            const { checkAllInvariants, buildSystemState } = await import(
              './invariants/checker.js'
            );
            const { DEFAULT_INVARIANTS } = await import('./invariants/definitions.js');

            const reCheckState = buildSystemState({
              ...systemContext,
              filesAffected: simulationResult.blastRadius,
              simulatedBlastRadius: simulationResult.blastRadius,
              simulatedRiskLevel: simulationResult.riskLevel,
              targetBranch: decision.intent.branch || (systemContext.targetBranch as string),
              forcePush: decision.intent.action === 'git.force-push',
              directPush: decision.intent.action === 'git.push',
              isPush:
                decision.intent.action === 'git.push' ||
                decision.intent.action === 'git.force-push',
            });

            const reCheck = checkAllInvariants(
              config.invariants || DEFAULT_INVARIANTS,
              reCheckState
            );

            if (!reCheck.allHold) {
              // Simulation-triggered denial
              sinkEvents(reCheck.events);

              const deniedEvent = createEvent(ACTION_DENIED, {
                actionType: decision.intent.action,
                target: decision.intent.target,
                reason: `Simulation revealed elevated risk: ${simulationResult.riskLevel} (blast radius: ${simulationResult.blastRadius})`,
                actionId: action?.id,
                metadata: {
                  runId,
                  simulationTriggered: true,
                  simulatorId: simulationResult.simulatorId,
                  violations: reCheck.violations.map((v) => ({
                    invariantId: v.invariant.id,
                    name: v.invariant.name,
                    severity: v.invariant.severity,
                    expected: v.result.expected,
                    actual: v.result.actual,
                  })),
                },
              });
              allEvents.push(deniedEvent);
              sinkEvents(allEvents);

              const simSummary = {
                predictedChanges: simulationResult.predictedChanges,
                blastRadius: simulationResult.blastRadius,
                riskLevel: simulationResult.riskLevel,
                simulatorId: simulationResult.simulatorId,
                durationMs: simulationResult.durationMs,
              };

              const decisionRecord = buildDecisionRecord({
                runId,
                decision: {
                  ...decision,
                  allowed: false,
                  violations: reCheck.violations.map((v) => ({
                    invariantId: v.invariant.id,
                    name: v.invariant.name,
                    severity: v.invariant.severity,
                    expected: v.result.expected,
                    actual: v.result.actual,
                  })),
                },
                execution: null,
                executionDurationMs: null,
                simulation: simSummary,
              });
              sinkDecision(decisionRecord);

              const decisionEvent = createEvent(DECISION_RECORDED, {
                recordId: decisionRecord.recordId,
                outcome: 'deny',
                actionType: decisionRecord.action.type,
                target: decisionRecord.action.target,
                reason: `Simulation-triggered denial`,
              });
              sinkEvent(decisionEvent);

              const result: KernelResult = {
                allowed: false,
                executed: false,
                decision: {
                  ...decision,
                  allowed: false,
                  violations: reCheck.violations.map((v) => ({
                    invariantId: v.invariant.id,
                    name: v.invariant.name,
                    severity: v.invariant.severity,
                    expected: v.result.expected,
                    actual: v.result.actual,
                  })),
                },
                execution: null,
                action,
                events: allEvents,
                runId,
                decisionRecord,
              };
              actionLog.push(result);
              return result;
            }
          }
        } catch {
          // Simulation failure is non-fatal — continue with execution
        }
      }

      // Emit allowed event
      const allowedEvent = createEvent(ACTION_ALLOWED, {
        actionType: decision.intent.action,
        target: decision.intent.target,
        capability: decision.decision.matchedPolicy?.id || 'default-allow',
        actionId: action?.id,
        reason: decision.decision.reason,
        metadata: { runId },
      });
      allEvents.push(allowedEvent);

      // 6. Execute via adapter (unless dry-run)
      let execution: ExecutionResult | null = null;
      let executionDurationMs: number | null = null;
      if (!dryRun && action) {
        const actionClass = getActionClass(action.type);
        if (actionClass && adapters.has(actionClass)) {
          const adapterDecisionRecord: DecisionRecord = {
            actionId: action.id,
            decision: 'allow',
            reason: decision.decision.reason,
            timestamp: Date.now(),
            policyHash: decision.decision.matchedPolicy?.id || 'none',
          };

          const startTime = Date.now();
          try {
            execution = await adapters.execute(action, adapterDecisionRecord);
            executionDurationMs = Date.now() - startTime;

            if (execution.success) {
              const executedEvent = createEvent(ACTION_EXECUTED, {
                actionType: action.type,
                target: action.target,
                result: 'success',
                actionId: action.id,
                duration: executionDurationMs,
                metadata: { runId },
              });
              allEvents.push(executedEvent);
            } else {
              const failedEvent = createEvent(ACTION_FAILED, {
                actionType: action.type,
                target: action.target,
                error: execution.error || 'Unknown execution error',
                actionId: action.id,
                duration: executionDurationMs,
                metadata: { runId },
              });
              allEvents.push(failedEvent);
            }
          } catch (err) {
            executionDurationMs = Date.now() - startTime;
            execution = { success: false, error: (err as Error).message };
            const failedEvent = createEvent(ACTION_FAILED, {
              actionType: action.type,
              target: action.target,
              error: (err as Error).message,
              actionId: action.id,
              duration: executionDurationMs,
              metadata: { runId },
            });
            allEvents.push(failedEvent);
          }
        }
      }

      sinkEvents(allEvents);

      // Build and sink governance decision record
      const simSummary = simulationResult
        ? {
            predictedChanges: simulationResult.predictedChanges,
            blastRadius: simulationResult.blastRadius,
            riskLevel: simulationResult.riskLevel,
            simulatorId: simulationResult.simulatorId,
            durationMs: simulationResult.durationMs,
          }
        : null;

      const decisionRecord = buildDecisionRecord({
        runId,
        decision,
        execution,
        executionDurationMs,
        simulation: simSummary,
      });
      sinkDecision(decisionRecord);

      // Emit DECISION_RECORDED event
      const decisionEvent = createEvent(DECISION_RECORDED, {
        recordId: decisionRecord.recordId,
        outcome: decisionRecord.outcome,
        actionType: decisionRecord.action.type,
        target: decisionRecord.action.target,
        reason: decisionRecord.reason,
      });
      sinkEvent(decisionEvent);

      const result: KernelResult = {
        allowed: true,
        executed: execution !== null,
        decision,
        execution,
        action,
        events: allEvents,
        runId,
        decisionRecord,
      };
      actionLog.push(result);
      return result;
    },

    getRunId() {
      return runId;
    },

    getActionLog() {
      return [...actionLog];
    },

    getEventCount() {
      return eventCount;
    },

    shutdown() {
      for (const sink of sinks) {
        if (sink.flush) sink.flush();
      }
      for (const sink of decisionSinks) {
        if (sink.flush) sink.flush();
      }
    },
  };
}
