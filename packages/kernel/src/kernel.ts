// Governed Action Kernel — the core orchestrator.
// Connects monitor (AAB + policy + invariants) with execution adapters.
// Emits full action lifecycle events: REQUESTED → ALLOWED/DENIED → EXECUTED/FAILED.
// Builds GovernanceDecisionRecords and sinks them for audit.

import type {
  DomainEvent,
  CanonicalAction,
  AdapterRegistry,
  ExecutionResult,
  DecisionRecord,
  SeededRng,
  EventSink,
} from '@red-codes/core';
import { createMonitor } from './monitor.js';
import type { MonitorConfig, MonitorDecision } from './monitor.js';
import type { RawAgentAction } from './aab.js';
import {
  createAction,
  getActionClass,
  createAdapterRegistry,
  simpleHash,
  generateSeed,
  createSeededRng,
} from '@red-codes/core';
import {
  createEvent,
  ACTION_REQUESTED,
  ACTION_ALLOWED,
  ACTION_DENIED,
  ACTION_ESCALATED,
  ACTION_EXECUTED,
  ACTION_FAILED,
  DECISION_RECORDED,
  SIMULATION_COMPLETED,
  INTENT_DRIFT_DETECTED,
} from '@red-codes/events';
import { INTERVENTION } from './decision.js';
import type { InterventionType } from './decision.js';
import type { GovernanceDecisionRecord, DecisionSink } from './decisions/types.js';
import { buildDecisionRecord } from './decisions/factory.js';
import { checkAllInvariants, buildSystemState } from '@red-codes/invariants';
import { DEFAULT_INVARIANTS } from '@red-codes/invariants';
import type { SimulatorRegistry, ImpactForecast } from './simulation/types.js';
import { buildImpactForecast } from './simulation/forecast.js';
import type { IntentSpec, IntentDriftResult } from './intent.js';
import { checkIntentAlignment } from './intent.js';
/** Minimal tracer interface (previously from @red-codes/telemetry, now inlined). */
interface TraceSpan {
  setAttribute(key: string, value: string | number | boolean): void;
  end(): void;
  endWithError(message: string): void;
}
interface Tracer {
  startSpan(name: string, label: string): TraceSpan;
  shutdown(): void;
}

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
  /** Intervention type that was applied (null if allowed without intervention) */
  intervention?: InterventionType | null;
  /** True if the action was paused and awaiting human approval */
  paused?: boolean;
  /** True if the action was executed then rolled back */
  rolledBack?: boolean;
  /** True if the action was modified by a MODIFY intervention and re-evaluated successfully */
  modified?: boolean;
  /** Intent drift results (advisory — present when an IntentSpec is configured) */
  intentDrift?: IntentDriftResult;
}

/**
 * Pause handler callback — invoked when the kernel encounters a PAUSE intervention.
 * Receives the action details and must return whether to approve or reject.
 * If not provided, PAUSE interventions auto-deny.
 */
export type PauseHandler = (context: {
  action: CanonicalAction | null;
  intent: MonitorDecision['intent'];
  reason: string;
  runId: string;
}) => Promise<{ approved: boolean; reason?: string }>;

/**
 * Snapshot provider — captures and restores pre-execution state for ROLLBACK support.
 * The kernel calls `capture()` before execution and `restore()` if rollback is needed.
 */
/**
 * Modify handler callback — invoked when the kernel encounters a MODIFY intervention.
 * Receives the action details and must return a modified version of the raw action.
 * If not provided, MODIFY interventions auto-deny.
 */
export type ModifyHandler = (context: {
  action: CanonicalAction | null;
  intent: MonitorDecision['intent'];
  reason: string;
  runId: string;
}) => Promise<{ modified: boolean; changes?: Partial<RawAgentAction>; reason?: string }>;

export interface SnapshotProvider {
  capture(action: CanonicalAction): Promise<{ snapshotId: string }>;
  restore(snapshotId: string): Promise<{ success: boolean; error?: string }>;
}

export interface KernelConfig extends MonitorConfig {
  runId?: string;
  sinks?: EventSink[];
  adapters?: AdapterRegistry;
  /**
   * When true, the kernel evaluates policies and invariants but skips adapter execution.
   * Events and decision records are still emitted and persisted.
   * Used by the Claude Code hook where Claude Code handles actual tool execution.
   */
  dryRun?: boolean;
  /** Optional decision sinks for persisting GovernanceDecisionRecords */
  decisionSinks?: DecisionSink[];
  /** Optional simulator registry for pre-execution impact simulation */
  simulators?: SimulatorRegistry;
  /** Blast radius threshold — simulation above this triggers invariant re-check */
  simulationBlastRadiusThreshold?: number;
  /** Optional seeded RNG for deterministic replay. If omitted, a random seed is generated. */
  rng?: SeededRng;
  /** Maximum time (ms) for the full propose pipeline. Default: 30000 */
  proposalTimeoutMs?: number;
  /** Optional tracer for kernel-level tracing. Spans are sent to registered backends. */
  tracer?: Tracer;
  /** Callback for PAUSE interventions. If not provided, PAUSE auto-denies. */
  pauseHandler?: PauseHandler;
  /** Timeout (ms) for PAUSE interventions before auto-deny. Default: 30000 */
  pauseTimeoutMs?: number;
  /** Snapshot provider for ROLLBACK interventions. If not provided, rollback is best-effort. */
  snapshotProvider?: SnapshotProvider;
  /** Callback for MODIFY interventions. If not provided, MODIFY auto-denies. */
  modifyHandler?: ModifyHandler;
  /** Timeout (ms) for MODIFY interventions before auto-deny. Default: 30000 */
  modifyTimeoutMs?: number;
  /**
   * Intent specification — declares what the agent is allowed to do.
   * When provided, the kernel compares each action against this spec and emits
   * IntentDriftDetected events for actions that fall outside declared intent.
   * Advisory mode only — does not block execution.
   */
  intentSpec?: IntentSpec;
}

export interface Kernel {
  propose(
    rawAction: RawAgentAction,
    systemContext?: Record<string, unknown>
  ): Promise<KernelResult>;
  getRunId(): string;
  /** Returns the seed used by this kernel's RNG (for session recording / replay) */
  getSeed(): number;
  getActionLog(): KernelResult[];
  getEventCount(): number;
  shutdown(): void;
}

function generateRunId(rng: SeededRng): string {
  return `run_${Date.now()}_${simpleHash(rng.random().toString())}`;
}

export function createKernel(config: KernelConfig = {}): Kernel {
  const rng = config.rng || createSeededRng(generateSeed());
  const runId = config.runId || generateRunId(rng);
  const sinks: EventSink[] = config.sinks || [];
  const decisionSinks: DecisionSink[] = config.decisionSinks || [];
  const adapters = config.adapters || createAdapterRegistry();
  const dryRun = config.dryRun ?? false;
  const simulators = config.simulators || null;
  const blastRadiusThreshold = config.simulationBlastRadiusThreshold ?? 50;
  const proposalTimeoutMs = config.proposalTimeoutMs ?? 30_000;
  const pauseHandler = config.pauseHandler ?? null;
  const pauseTimeoutMs = config.pauseTimeoutMs ?? 30_000;
  const snapshotProvider = config.snapshotProvider ?? null;
  const modifyHandler = config.modifyHandler ?? null;
  const modifyTimeoutMs = config.modifyTimeoutMs ?? 30_000;
  const tracer = config.tracer ?? null;
  const intentSpec = config.intentSpec ?? null;
  const actionLog: KernelResult[] = [];
  let eventCount = 0;
  let filesModifiedCount = 0;

  const monitor = createMonitor({
    policyDefs: config.policyDefs,
    invariants: config.invariants,
    denialThreshold: config.denialThreshold,
    violationThreshold: config.violationThreshold,
    windowSize: config.windowSize,
    evaluateOptions: config.evaluateOptions,
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
      const span =
        tracer?.startSpan('kernel.propose', `propose:${rawAction.tool || 'unknown'}`) ?? null;
      const proposalBody = async (): Promise<KernelResult> => {
        const allEvents: DomainEvent[] = [];
        let wasModified = false;

        // 1. Emit ACTION_REQUESTED
        const requestedEvent = createEvent(ACTION_REQUESTED, {
          actionType: rawAction.tool || 'unknown',
          target: rawAction.file || rawAction.target || '',
          justification: (rawAction.metadata?.justification as string) || 'agent action',
          actionId: undefined,
          agentId: rawAction.agent || 'unknown',
          metadata: { runId, command: rawAction.command, persona: rawAction.persona },
        });
        allEvents.push(requestedEvent);

        // 2. Evaluate via monitor (AAB → policy → invariants → evidence)
        // `let` because the PAUSE-approved path reassigns: decision = { ...decision, allowed: true }
        let decision = monitor.process(rawAction, systemContext);

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
          const interventionType = decision.intervention;

          // PAUSE/ROLLBACK only apply when there's an explicit policy denial or
          // invariant violation — not for default-deny (no matching rule).
          const hasExplicitDenial =
            decision.decision.matchedPolicy !== null || decision.violations.length > 0;

          // 5a-i. PAUSE intervention — escalate for human approval
          if (hasExplicitDenial && interventionType === INTERVENTION.PAUSE) {
            const escalatedEvent = createEvent(ACTION_ESCALATED, {
              actionType: decision.intent.action,
              target: decision.intent.target,
              reason: `PAUSE intervention: ${decision.decision.reason}`,
              actionId: action?.id,
              policyHash: decision.decision.matchedPolicy?.id,
              metadata: {
                runId,
                intervention: interventionType,
                violations: decision.violations,
                pauseTimeoutMs,
              },
            });
            allEvents.push(escalatedEvent);
            // escalatedEvent flushed via sinkEvents(allEvents) at path end

            let pauseApproved = false;
            let pauseReason = 'No pause handler — auto-denied';

            if (pauseHandler) {
              try {
                let timer: ReturnType<typeof setTimeout> | undefined;
                const timeoutPromise = new Promise<{ approved: false; reason: string }>(
                  (resolve) => {
                    timer = setTimeout(
                      () =>
                        resolve({
                          approved: false,
                          reason: `PAUSE timed out after ${pauseTimeoutMs}ms`,
                        }),
                      pauseTimeoutMs
                    );
                  }
                );
                const handlerPromise = pauseHandler({
                  action,
                  intent: decision.intent,
                  reason: decision.decision.reason,
                  runId,
                });
                const pauseResult = await Promise.race([handlerPromise, timeoutPromise]);
                clearTimeout(timer!);
                pauseApproved = pauseResult.approved;
                pauseReason =
                  pauseResult.reason || (pauseApproved ? 'Human approved' : 'Human rejected');
              } catch (err) {
                pauseApproved = false;
                pauseReason = `Pause handler error: ${err instanceof Error ? err.message : String(err)}`;
              }
            }

            if (pauseApproved) {
              // Human approved — override decision to allowed and fall through to execution
              decision = { ...decision, allowed: true };
              // Continue to the ALLOWED path below (no return here)
            } else {
              // Denied (timeout, rejection, or no handler)
              const deniedEvent = createEvent(ACTION_DENIED, {
                actionType: decision.intent.action,
                target: decision.intent.target,
                reason: pauseReason,
                actionId: action?.id,
                policyHash: decision.decision.matchedPolicy?.id,
                metadata: { runId, intervention: interventionType, paused: true },
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
                intervention: interventionType,
                paused: true,
              };
              actionLog.push(result);
              return result;
            }
          }
          // 5a-ii. MODIFY intervention — programmatic action rewrite + re-evaluation
          else if (hasExplicitDenial && interventionType === INTERVENTION.MODIFY) {
            const escalatedEvent = createEvent(ACTION_ESCALATED, {
              actionType: decision.intent.action,
              target: decision.intent.target,
              reason: `MODIFY intervention: ${decision.decision.reason}`,
              actionId: action?.id,
              policyHash: decision.decision.matchedPolicy?.id,
              metadata: {
                runId,
                intervention: interventionType,
                violations: decision.violations,
                modifyTimeoutMs,
              },
            });
            allEvents.push(escalatedEvent);

            let modifyApplied = false;
            let modifyReason = 'No modify handler — auto-denied';

            if (modifyHandler) {
              try {
                let timer: ReturnType<typeof setTimeout> | undefined;
                const timeoutPromise = new Promise<{ modified: false; reason: string }>(
                  (resolve) => {
                    timer = setTimeout(
                      () =>
                        resolve({
                          modified: false,
                          reason: `MODIFY timed out after ${modifyTimeoutMs}ms`,
                        }),
                      modifyTimeoutMs
                    );
                  }
                );
                const handlerPromise = modifyHandler({
                  action,
                  intent: decision.intent,
                  reason: decision.decision.reason,
                  runId,
                });
                const modifyResult = await Promise.race([handlerPromise, timeoutPromise]);
                clearTimeout(timer!);

                if (modifyResult.modified && modifyResult.changes) {
                  // Merge modifications into the original raw action and re-evaluate
                  const modifiedRawAction: RawAgentAction = {
                    ...rawAction,
                    ...modifyResult.changes,
                    metadata: {
                      ...rawAction.metadata,
                      ...modifyResult.changes.metadata,
                      modifiedBy: 'modify-intervention',
                      originalCommand: rawAction.command,
                    },
                  };

                  const reEvalDecision = monitor.process(modifiedRawAction, systemContext);

                  if (reEvalDecision.allowed) {
                    // Modified action passed re-evaluation — update decision and action
                    decision = reEvalDecision;
                    modifyApplied = true;
                    modifyReason =
                      modifyResult.reason || 'Action modified and re-evaluation passed';

                    // Rebuild canonical action from modified intent
                    try {
                      const modifiedActionType = decision.intent.action;
                      const modifiedTarget = decision.intent.target;
                      if (modifiedActionType !== 'unknown') {
                        action = createAction(
                          modifiedActionType,
                          modifiedTarget,
                          'kernel-modified',
                          {
                            command: modifiedRawAction.command,
                            agent: modifiedRawAction.agent,
                            runId,
                          }
                        );
                      }
                    } catch {
                      // Action creation may fail — continue with original action
                    }
                  } else {
                    modifyApplied = false;
                    modifyReason =
                      'Modified action denied on re-evaluation: ' + reEvalDecision.decision.reason;
                  }
                } else {
                  modifyApplied = false;
                  modifyReason = modifyResult.reason || 'Modify handler declined to modify';
                }
              } catch (err) {
                modifyApplied = false;
                modifyReason = `Modify handler error: ${err instanceof Error ? err.message : String(err)}`;
              }
            }

            if (modifyApplied) {
              wasModified = true;
            }

            if (!modifyApplied) {
              // Modification failed or declined — deny
              const deniedEvent = createEvent(ACTION_DENIED, {
                actionType: decision.intent.action,
                target: decision.intent.target,
                reason: modifyReason,
                actionId: action?.id,
                policyHash: decision.decision.matchedPolicy?.id,
                metadata: { runId, intervention: interventionType, modified: false },
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
                intervention: interventionType,
                modified: false,
              };
              actionLog.push(result);
              return result;
            }
            // modifyApplied === true — fall through to the ALLOWED execution path below
          }
          // 5a-iii. ROLLBACK intervention — execute with snapshot safety net
          else if (hasExplicitDenial && interventionType === INTERVENTION.ROLLBACK) {
            // ROLLBACK: allow execution but capture pre-execution snapshot for undo
            const escalatedEvent = createEvent(ACTION_ESCALATED, {
              actionType: decision.intent.action,
              target: decision.intent.target,
              reason: `ROLLBACK intervention: ${decision.decision.reason}`,
              actionId: action?.id,
              policyHash: decision.decision.matchedPolicy?.id,
              metadata: {
                runId,
                intervention: interventionType,
                violations: decision.violations,
              },
            });
            allEvents.push(escalatedEvent);
            // escalatedEvent flushed via sinkEvents(allEvents) at path end

            // Capture pre-execution snapshot
            let snapshotId: string | null = null;
            if (snapshotProvider && action) {
              try {
                const snap = await snapshotProvider.capture(action);
                snapshotId = snap.snapshotId;
              } catch {
                // Snapshot capture failure is non-fatal — proceed without rollback capability
              }
            }

            // Execute the action (override the denied decision for execution)
            let execution: ExecutionResult | null = null;
            let executionDurationMs: number | null = null;
            let rolledBack = false;

            if (!dryRun && action) {
              const actionClass = getActionClass(action.type);
              if (actionClass && adapters.has(actionClass)) {
                const adapterDecisionRecord: DecisionRecord = {
                  actionId: action.id,
                  decision: 'allow',
                  reason: `ROLLBACK intervention — executing with rollback safety net`,
                  timestamp: Date.now(),
                  policyHash: decision.decision.matchedPolicy?.id || 'none',
                };

                const startTime = Date.now();
                try {
                  execution = await adapters.execute(action, adapterDecisionRecord);
                  executionDurationMs = Date.now() - startTime;

                  if (!execution.success && snapshotId && snapshotProvider) {
                    // Execution failed — attempt rollback
                    try {
                      const rollbackResult = await snapshotProvider.restore(snapshotId);
                      rolledBack = rollbackResult.success;
                      if (!rollbackResult.success) {
                        // Rollback failed — escalate to LOCKDOWN
                        monitor.process(
                          { tool: 'kernel.rollback-failed', agent: rawAction.agent || 'kernel' },
                          { ...systemContext, forceEscalation: 'LOCKDOWN' }
                        );
                      }
                    } catch {
                      rolledBack = false;
                    }
                  }
                } catch (err) {
                  executionDurationMs = Date.now() - startTime;
                  execution = { success: false, error: (err as Error).message };

                  // Attempt rollback on exception
                  if (snapshotId && snapshotProvider) {
                    try {
                      const rollbackResult = await snapshotProvider.restore(snapshotId);
                      rolledBack = rollbackResult.success;
                    } catch {
                      rolledBack = false;
                    }
                  }
                }
              }
            }

            const executedEvent = execution?.success
              ? createEvent(ACTION_EXECUTED, {
                  actionType: decision.intent.action,
                  target: decision.intent.target,
                  result: 'success',
                  actionId: action?.id,
                  duration: executionDurationMs,
                  metadata: { runId, intervention: interventionType, snapshotId },
                })
              : createEvent(ACTION_FAILED, {
                  actionType: decision.intent.action,
                  target: decision.intent.target,
                  error: execution?.error || 'Execution skipped (no adapter or dry-run)',
                  actionId: action?.id,
                  duration: executionDurationMs,
                  metadata: { runId, intervention: interventionType, rolledBack, snapshotId },
                });
            allEvents.push(executedEvent);
            sinkEvents(allEvents);

            const decisionRecord = {
              ...buildDecisionRecord({
                runId,
                decision,
                execution,
                executionDurationMs,
                simulation: null,
              }),
              // Use 'rollback' outcome so audit consumers reading decision records
              // directly from JSONL/SQLite see the correct governance disposition —
              // the policy denied this action; it executed under rollback safety net.
              outcome: 'rollback' as const,
            };
            sinkDecision(decisionRecord);

            const decisionEvent = createEvent(DECISION_RECORDED, {
              recordId: decisionRecord.recordId,
              outcome: rolledBack ? 'deny' : decisionRecord.outcome,
              actionType: decisionRecord.action.type,
              target: decisionRecord.action.target,
              reason: rolledBack ? 'Executed then rolled back' : decisionRecord.reason,
            });
            sinkEvent(decisionEvent);

            const result: KernelResult = {
              allowed: true,
              executed: execution !== null,
              decision: { ...decision, allowed: true },
              execution,
              action,
              events: allEvents,
              runId,
              decisionRecord,
              intervention: interventionType,
              rolledBack,
            };
            actionLog.push(result);
            return result;
          }
          // 5a-iii. DENY (or TEST_ONLY) — standard denial path
          else {
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
              intervention: interventionType,
            };
            actionLog.push(result);
            return result;
          }
        }

        // 5b. ALLOWED — run simulation if available, then re-check
        let simulationResult = null;
        let forecast: ImpactForecast | null = null;

        if (simulators && simulators.find(decision.intent)) {
          const simulator = simulators.find(decision.intent)!;
          try {
            simulationResult = await simulator.simulate(decision.intent, systemContext);

            // Build structured impact forecast
            forecast = buildImpactForecast(decision.intent, simulationResult, blastRadiusThreshold);
            simulationResult.forecast = forecast;

            // Emit simulation event with forecast data
            const simEvent = createEvent(SIMULATION_COMPLETED, {
              simulatorId: simulationResult.simulatorId,
              riskLevel: simulationResult.riskLevel,
              blastRadius: simulationResult.blastRadius,
              predictedChanges: simulationResult.predictedChanges,
              durationMs: simulationResult.durationMs,
              forecast,
            });
            allEvents.push(simEvent);
            sinkEvent(simEvent);

            // Re-check invariants if simulation reveals elevated risk
            if (
              simulationResult.blastRadius > blastRadiusThreshold ||
              simulationResult.riskLevel === 'high'
            ) {
              const reCheckState = buildSystemState({
                ...systemContext,
                filesAffected: simulationResult.blastRadius,
                simulatedBlastRadius: simulationResult.blastRadius,
                simulatedRiskLevel: simulationResult.riskLevel,
                currentActionType: decision.intent.action,
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
                  forecast: forecast || undefined,
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
          } catch (simErr) {
            // Simulation failure is non-fatal — emit event and continue with execution
            const simFailEvent = createEvent(SIMULATION_COMPLETED, {
              simulatorId: 'unknown',
              riskLevel: 'unknown',
              blastRadius: 0,
              predictedChanges: [],
              durationMs: 0,
              metadata: {
                failed: true,
                error: simErr instanceof Error ? simErr.message : String(simErr),
              },
            });
            allEvents.push(simFailEvent);
            sinkEvent(simFailEvent);
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

        // 5c. Intent drift check (advisory — does not block execution)
        let intentDrift: IntentDriftResult | undefined;
        if (intentSpec) {
          intentDrift = checkIntentAlignment(decision.intent, intentSpec, {
            filesModified: filesModifiedCount,
          });

          if (!intentDrift.aligned) {
            for (const drift of intentDrift.drifts) {
              const driftEvent = createEvent(INTENT_DRIFT_DETECTED, {
                actionType: decision.intent.action,
                target: decision.intent.target,
                driftType: drift.driftType,
                reason: drift.reason,
                severity: 'advisory',
                metadata: {
                  runId,
                  intentDescription: intentSpec.description,
                },
              });
              allEvents.push(driftEvent);
              sinkEvent(driftEvent);
            }
          }

          // Track file modifications for scope limit checking
          if (
            decision.intent.action === 'file.write' ||
            decision.intent.action === 'file.delete' ||
            decision.intent.action === 'file.move'
          ) {
            filesModifiedCount++;
          }
        }

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
          } else {
            // Deny actions with no registered adapter — close the audit trail gap
            const adapterReason = !actionClass
              ? `No action class for type: ${action.type}`
              : `No adapter registered for action class: ${actionClass}`;

            const noAdapterDeniedEvent = createEvent(ACTION_DENIED, {
              actionType: action.type,
              target: action.target,
              reason: `no_registered_adapter: ${adapterReason}`,
              actionId: action.id,
              metadata: { runId, noAdapter: true },
            });
            allEvents.push(noAdapterDeniedEvent);
            sinkEvents(allEvents);

            const noAdapterSimSummary = simulationResult
              ? {
                  predictedChanges: simulationResult.predictedChanges,
                  blastRadius: simulationResult.blastRadius,
                  riskLevel: simulationResult.riskLevel,
                  simulatorId: simulationResult.simulatorId,
                  durationMs: simulationResult.durationMs,
                  forecast: forecast || undefined,
                }
              : null;

            const noAdapterDecisionRecord = buildDecisionRecord({
              runId,
              decision: {
                ...decision,
                allowed: false,
                decision: {
                  ...decision.decision,
                  reason: `no_registered_adapter: ${adapterReason}`,
                },
              },
              execution: null,
              executionDurationMs: null,
              simulation: noAdapterSimSummary,
            });
            sinkDecision(noAdapterDecisionRecord);

            const noAdapterDecisionEvent = createEvent(DECISION_RECORDED, {
              recordId: noAdapterDecisionRecord.recordId,
              outcome: 'deny',
              actionType: noAdapterDecisionRecord.action.type,
              target: noAdapterDecisionRecord.action.target,
              reason: `no_registered_adapter`,
            });
            sinkEvent(noAdapterDecisionEvent);

            const noAdapterResult: KernelResult = {
              allowed: false,
              executed: false,
              decision: {
                ...decision,
                allowed: false,
              },
              execution: null,
              action,
              events: allEvents,
              runId,
              decisionRecord: noAdapterDecisionRecord,
            };
            actionLog.push(noAdapterResult);
            return noAdapterResult;
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
              forecast: forecast || undefined,
            }
          : null;

        const decisionRecord = wasModified
          ? {
              ...buildDecisionRecord({
                runId,
                decision,
                execution,
                executionDurationMs,
                simulation: simSummary,
              }),
              outcome: 'modify' as const,
            }
          : buildDecisionRecord({
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
          ...(wasModified ? { modified: true, intervention: INTERVENTION.MODIFY } : {}),
          ...(intentDrift ? { intentDrift } : {}),
        };
        actionLog.push(result);
        return result;
      };

      try {
        let result: KernelResult;
        if (proposalTimeoutMs <= 0 || proposalTimeoutMs === Infinity) {
          result = await proposalBody();
        } else {
          let timer: ReturnType<typeof setTimeout>;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`Proposal timed out after ${proposalTimeoutMs}ms`)),
              proposalTimeoutMs
            );
          });
          try {
            result = await Promise.race([proposalBody(), timeoutPromise]);
          } finally {
            clearTimeout(timer!);
          }
        }
        span?.setAttribute('outcome', result.allowed ? 'allow' : 'deny');
        span?.end();
        return result;
      } catch (err) {
        span?.endWithError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },

    getRunId() {
      return runId;
    },

    getSeed() {
      return rng.seed;
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
      tracer?.shutdown();
    },
  };
}
