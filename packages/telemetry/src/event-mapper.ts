// Event Mapper — converts DomainEvent and GovernanceDecisionRecord to AgentEvent.
// AgentEvent is the wire format sent to the cloud telemetry API.

import { randomUUID } from 'node:crypto';
import type {
  DomainEvent,
  EventKind,
  GovernanceDecisionRecord,
  GovernanceEventEnvelope,
} from '@red-codes/core';

// ---------------------------------------------------------------------------
// AgentEvent — cloud telemetry wire format (defined locally, not imported)
// ---------------------------------------------------------------------------

export interface AgentEvent {
  eventId?: string;
  agentId: string;
  timestamp?: string;
  eventType:
    | 'tool_call'
    | 'decision'
    | 'error'
    | 'policy_evaluation'
    | 'context_snapshot'
    | 'approval_request'
    | 'approval_response';
  action: string;
  resource?: string;
  outcome?: 'success' | 'failure' | 'denied' | 'escalated' | 'pending';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
  policyVersion?: string;
  sessionId?: string;
  parentSessionId?: string;
}

// ---------------------------------------------------------------------------
// Kind → eventType mapping
// ---------------------------------------------------------------------------

const KIND_TO_EVENT_TYPE: Partial<Record<EventKind, AgentEvent['eventType']>> = {
  // Reference Monitor
  ActionRequested: 'tool_call',
  ActionExecuted: 'tool_call',
  ActionFailed: 'tool_call',
  ActionAllowed: 'decision',
  ActionDenied: 'decision',
  ActionEscalated: 'decision',

  // Decision & Simulation
  DecisionRecorded: 'decision',
  SimulationCompleted: 'policy_evaluation',

  // Governance
  PolicyDenied: 'policy_evaluation',
  UnauthorizedAction: 'policy_evaluation',
  InvariantViolation: 'policy_evaluation',
  BlastRadiusExceeded: 'policy_evaluation',
  MergeGuardFailure: 'policy_evaluation',
  EvidencePackGenerated: 'decision',

  // Policy
  PolicyComposed: 'policy_evaluation',
  PolicyTraceRecorded: 'policy_evaluation',

  // Session
  StateChanged: 'decision',
  RunStarted: 'decision',
  RunEnded: 'decision',
  CheckpointReached: 'decision',

  // Pipeline
  PipelineStarted: 'tool_call',
  StageCompleted: 'tool_call',
  StageFailed: 'tool_call',
  PipelineCompleted: 'tool_call',
  PipelineFailed: 'tool_call',
  FileScopeViolation: 'tool_call',

  // Developer Signals
  FileSaved: 'tool_call',
  TestCompleted: 'tool_call',
  BuildCompleted: 'tool_call',
  CommitCreated: 'tool_call',
  CodeReviewed: 'tool_call',
  DeployCompleted: 'tool_call',
  LintCompleted: 'tool_call',

  // Token Optimization
  TokenOptimizationApplied: 'tool_call',

  // Agent Liveness
  HeartbeatEmitted: 'decision',
  HeartbeatMissed: 'decision',
  AgentUnresponsive: 'decision',

  // Integrity & Trust
  HookIntegrityVerified: 'policy_evaluation',
  HookIntegrityFailed: 'policy_evaluation',
  PolicyTrustVerified: 'policy_evaluation',
  PolicyTrustDenied: 'policy_evaluation',

  // Adoption Analytics
  AdoptionAnalyzed: 'policy_evaluation',
  AdoptionAnalysisFailed: 'policy_evaluation',

  // Denial Learning
  DenialPatternDetected: 'policy_evaluation',

  // Intent Drift
  IntentDriftDetected: 'policy_evaluation',

  // Environmental Enforcement
  IdeSocketAccessBlocked: 'policy_evaluation',
};

// ---------------------------------------------------------------------------
// Kind → outcome mapping
// ---------------------------------------------------------------------------

const KIND_TO_OUTCOME: Partial<Record<EventKind, AgentEvent['outcome']>> = {
  ActionAllowed: 'success',
  ActionDenied: 'denied',
  ActionEscalated: 'escalated',
  ActionExecuted: 'success',
  ActionFailed: 'failure',
};

// ---------------------------------------------------------------------------
// Risk level resolution
// ---------------------------------------------------------------------------

function resolveRiskLevel(
  simulationRiskLevel?: string,
  escalationLevel?: number
): AgentEvent['riskLevel'] {
  // escalationLevel >= 3 promotes to critical regardless of simulation
  if (escalationLevel !== undefined && escalationLevel >= 3) {
    return 'critical';
  }

  if (
    simulationRiskLevel === 'low' ||
    simulationRiskLevel === 'medium' ||
    simulationRiskLevel === 'high'
  ) {
    return simulationRiskLevel;
  }

  return 'low';
}

// ---------------------------------------------------------------------------
// mapDomainEventToAgentEvent
// ---------------------------------------------------------------------------

/**
 * Map a DomainEvent to an AgentEvent for cloud telemetry.
 *
 * Extracts actionType, target, agentId, and other fields from the
 * DomainEvent's dynamic payload (indexed signature on DomainEvent).
 */
export function mapDomainEventToAgentEvent(event: DomainEvent): AgentEvent {
  const eventType = KIND_TO_EVENT_TYPE[event.kind] ?? 'tool_call';
  const outcome = KIND_TO_OUTCOME[event.kind];

  const actionType = (event['actionType'] as string | undefined) ?? event.kind;
  const target = (event['target'] as string | undefined) ?? '';
  const agentId = (event['agentId'] as string | undefined) ?? 'unknown';

  const simulationRiskLevel =
    (event['riskLevel'] as string | undefined) ??
    (event['simulation'] as { riskLevel?: string } | undefined)?.riskLevel;
  const escalationLevel = (event['monitor'] as { escalationLevel?: number } | undefined)
    ?.escalationLevel;

  const riskLevel = resolveRiskLevel(simulationRiskLevel, escalationLevel);

  const agentEvent: AgentEvent = {
    eventId: randomUUID(),
    agentId,
    timestamp: new Date(event.timestamp).toISOString(),
    eventType,
    action: actionType,
    resource: target || undefined,
    riskLevel,
  };

  if (outcome !== undefined) {
    agentEvent.outcome = outcome;
  }

  // Attach metadata if present
  const metadata = event['metadata'] as Record<string, unknown> | undefined;
  if (metadata !== undefined) {
    agentEvent.metadata = metadata;
  }

  return agentEvent;
}

// ---------------------------------------------------------------------------
// mapDecisionToAgentEvent
// ---------------------------------------------------------------------------

/**
 * Map a GovernanceDecisionRecord to an AgentEvent for cloud telemetry.
 *
 * Richer than DomainEvent mapping because decision records carry full
 * governance context (policy, invariants, simulation, monitor state).
 */
export function mapDecisionToAgentEvent(record: GovernanceDecisionRecord): AgentEvent {
  const outcome: AgentEvent['outcome'] = record.outcome === 'deny' ? 'denied' : 'success';

  const simulationRiskLevel = record.simulation?.riskLevel;
  const escalationLevel = record.monitor?.escalationLevel;
  const riskLevel = resolveRiskLevel(simulationRiskLevel, escalationLevel);

  const agentEvent: AgentEvent = {
    eventId: randomUUID(),
    agentId: record.action.agent,
    timestamp: new Date(record.timestamp).toISOString(),
    eventType: 'decision',
    action: record.action.type,
    resource: record.action.target || undefined,
    outcome,
    riskLevel,
    sessionId: record.runId,
  };

  // Policy version from matchedPolicyId
  if (record.policy.matchedPolicyId) {
    agentEvent.policyVersion = record.policy.matchedPolicyId;
  }

  // Build metadata with governance context
  const metadata: Record<string, unknown> = {
    reason: record.reason,
    destructive: record.action.destructive,
    invariantsHold: record.invariants.allHold,
  };

  if (record.invariants.violations.length > 0) {
    metadata.violations = record.invariants.violations;
  }

  if (record.intervention) {
    metadata.intervention = record.intervention;
  }

  if (record.simulation) {
    metadata.simulation = {
      blastRadius: record.simulation.blastRadius,
      riskLevel: record.simulation.riskLevel,
      simulatorId: record.simulation.simulatorId,
    };
  }

  if (record.execution.executed) {
    metadata.execution = {
      success: record.execution.success,
      durationMs: record.execution.durationMs,
    };
    if (record.execution.error) {
      metadata.executionError = record.execution.error;
    }
  }

  agentEvent.metadata = metadata;

  return agentEvent;
}

// ---------------------------------------------------------------------------
// mapEnvelopeToAgentEvent — KE-3 envelope-aware mapping
// ---------------------------------------------------------------------------

/**
 * Map a GovernanceEventEnvelope to an AgentEvent for cloud telemetry.
 *
 * Extracts envelope-level metadata (source, policyVersion, performance metrics)
 * and merges it with the inner DomainEvent mapping. This is the preferred path
 * for telemetry once all producers emit envelopes.
 */
export function mapEnvelopeToAgentEvent(envelope: GovernanceEventEnvelope): AgentEvent {
  // Map the inner event using the existing pipeline
  const agentEvent = mapDomainEventToAgentEvent(envelope.event);

  // Enrich with envelope-level metadata
  if (envelope.policyVersion) {
    agentEvent.policyVersion = envelope.policyVersion;
  }

  // Merge envelope metadata into the AgentEvent metadata
  const envelopeMeta: Record<string, unknown> = {
    envelopeId: envelope.envelopeId,
    schemaVersion: envelope.schemaVersion,
    source: envelope.source,
  };

  if (envelope.decisionCodes.length > 0) {
    envelopeMeta.decisionCodes = envelope.decisionCodes;
  }

  if (
    envelope.performanceMetrics.hookLatencyUs !== undefined ||
    envelope.performanceMetrics.evaluationLatencyUs !== undefined
  ) {
    envelopeMeta.performanceMetrics = envelope.performanceMetrics;
  }

  agentEvent.metadata = { ...agentEvent.metadata, ...envelopeMeta };

  return agentEvent;
}
