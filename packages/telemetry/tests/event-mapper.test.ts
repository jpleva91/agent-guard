import { describe, it, expect } from 'vitest';
import type { DomainEvent, GovernanceDecisionRecord } from '@red-codes/core';
import { mapDomainEventToAgentEvent, mapDecisionToAgentEvent } from '../src/event-mapper.js';

// ---------------------------------------------------------------------------
// Helpers — minimal valid DomainEvent and GovernanceDecisionRecord factories
// ---------------------------------------------------------------------------

function makeDomainEvent(
  overrides: Partial<DomainEvent> & { kind: DomainEvent['kind'] }
): DomainEvent {
  return {
    id: 'evt_1',
    kind: overrides.kind,
    timestamp: 1710000000000,
    fingerprint: 'fp_test',
    ...overrides,
  };
}

function makeDecisionRecord(
  overrides: Partial<GovernanceDecisionRecord> = {}
): GovernanceDecisionRecord {
  return {
    recordId: 'dec_1',
    runId: 'run_1',
    timestamp: 1710000000000,
    action: {
      type: 'file.write',
      target: '/src/index.ts',
      agent: 'test-agent',
      destructive: false,
    },
    outcome: 'allow',
    reason: 'Matched capability',
    intervention: null,
    policy: {
      matchedPolicyId: 'policy-v1',
      matchedPolicyName: 'default',
      severity: 1,
    },
    invariants: {
      allHold: true,
      violations: [],
    },
    simulation: null,
    evidencePackId: null,
    monitor: {
      escalationLevel: 0,
      totalEvaluations: 10,
      totalDenials: 0,
    },
    execution: {
      executed: true,
      success: true,
      durationMs: 42,
      error: null,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mapDomainEventToAgentEvent
// ---------------------------------------------------------------------------

describe('mapDomainEventToAgentEvent', () => {
  it('maps ActionRequested to tool_call', () => {
    const event = makeDomainEvent({
      kind: 'ActionRequested',
      actionType: 'file.write',
      target: '/src/app.ts',
      agentId: 'agent-1',
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.eventType).toBe('tool_call');
    expect(result.action).toBe('file.write');
    expect(result.resource).toBe('/src/app.ts');
    expect(result.agentId).toBe('agent-1');
    expect(result.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('maps ActionAllowed to decision with success outcome', () => {
    const event = makeDomainEvent({
      kind: 'ActionAllowed',
      actionType: 'file.read',
      target: '/README.md',
      agentId: 'agent-2',
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.eventType).toBe('decision');
    expect(result.outcome).toBe('success');
  });

  it('maps ActionDenied to decision with denied outcome', () => {
    const event = makeDomainEvent({
      kind: 'ActionDenied',
      actionType: 'git.push',
      target: 'main',
      agentId: 'agent-3',
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.eventType).toBe('decision');
    expect(result.outcome).toBe('denied');
  });

  it('maps ActionFailed to tool_call with failure outcome', () => {
    const event = makeDomainEvent({
      kind: 'ActionFailed',
      actionType: 'shell.exec',
      target: 'npm test',
      agentId: 'agent-4',
      error: 'Exit code 1',
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.eventType).toBe('tool_call');
    expect(result.outcome).toBe('failure');
  });

  it('maps ActionExecuted to tool_call with success outcome', () => {
    const event = makeDomainEvent({
      kind: 'ActionExecuted',
      actionType: 'file.write',
      target: '/src/index.ts',
      agentId: 'agent-5',
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.eventType).toBe('tool_call');
    expect(result.outcome).toBe('success');
  });

  it('maps ActionEscalated to decision with escalated outcome', () => {
    const event = makeDomainEvent({
      kind: 'ActionEscalated',
      actionType: 'deploy.trigger',
      target: 'production',
      agentId: 'agent-6',
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.eventType).toBe('decision');
    expect(result.outcome).toBe('escalated');
  });

  it('maps SimulationCompleted to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'SimulationCompleted',
      simulatorId: 'fs-sim',
      riskLevel: 'medium',
      blastRadius: 5,
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.eventType).toBe('policy_evaluation');
    expect(result.riskLevel).toBe('medium');
  });

  it('maps PolicyDenied to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'PolicyDenied',
      policy: 'strict-policy',
      action: 'git.push',
      reason: 'Protected branch',
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.eventType).toBe('policy_evaluation');
  });

  it('maps InvariantViolation to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'InvariantViolation',
      invariant: 'no-force-push',
      expected: 'no force push',
      actual: 'force push detected',
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.eventType).toBe('policy_evaluation');
  });

  it('maps PolicyTraceRecorded to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'PolicyTraceRecorded',
      actionType: 'file.write',
      decision: 'allow',
      totalRulesChecked: 5,
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.eventType).toBe('policy_evaluation');
  });

  it('maps DecisionRecorded to decision', () => {
    const event = makeDomainEvent({
      kind: 'DecisionRecorded',
      recordId: 'dec_123',
      outcome: 'allow',
      actionType: 'file.write',
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.eventType).toBe('decision');
  });

  it('defaults riskLevel to low when no simulation data', () => {
    const event = makeDomainEvent({
      kind: 'ActionRequested',
      actionType: 'file.read',
      target: '/README.md',
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.riskLevel).toBe('low');
  });

  it('uses "unknown" agentId fallback when not present', () => {
    const event = makeDomainEvent({
      kind: 'ActionRequested',
      actionType: 'file.read',
      target: '/README.md',
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.agentId).toBe('unknown');
  });

  it('includes metadata when present on the event', () => {
    const event = makeDomainEvent({
      kind: 'ActionRequested',
      actionType: 'file.write',
      target: '/app.ts',
      agentId: 'agent-7',
      metadata: { extra: 'info' },
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.metadata).toEqual({ extra: 'info' });
  });

  it('produces a valid ISO timestamp', () => {
    const event = makeDomainEvent({
      kind: 'ActionRequested',
      actionType: 'file.read',
      target: '/test',
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.timestamp).toBe(new Date(1710000000000).toISOString());
  });

  it('uses event kind as action fallback when actionType missing', () => {
    const event = makeDomainEvent({
      kind: 'SimulationCompleted',
      simulatorId: 'sim',
      riskLevel: 'low',
      blastRadius: 1,
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.action).toBe('SimulationCompleted');
  });

  it('extracts riskLevel from nested simulation object', () => {
    const event = makeDomainEvent({
      kind: 'ActionRequested',
      actionType: 'file.write',
      target: '/app.ts',
      simulation: { riskLevel: 'high' },
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.riskLevel).toBe('high');
  });

  it('promotes to critical when monitor escalationLevel >= 3', () => {
    const event = makeDomainEvent({
      kind: 'ActionDenied',
      actionType: 'git.push',
      target: 'main',
      agentId: 'agent-9',
      monitor: { escalationLevel: 3 },
    });
    const result = mapDomainEventToAgentEvent(event);

    expect(result.riskLevel).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// mapDecisionToAgentEvent
// ---------------------------------------------------------------------------

describe('mapDecisionToAgentEvent', () => {
  it('maps deny outcome to denied', () => {
    const record = makeDecisionRecord({ outcome: 'deny' });
    const result = mapDecisionToAgentEvent(record);

    expect(result.outcome).toBe('denied');
  });

  it('maps allow outcome to success', () => {
    const record = makeDecisionRecord({ outcome: 'allow' });
    const result = mapDecisionToAgentEvent(record);

    expect(result.outcome).toBe('success');
  });

  it('generates UUID for eventId', () => {
    const record = makeDecisionRecord({ recordId: 'dec_abc123' });
    const result = mapDecisionToAgentEvent(record);

    expect(result.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('includes metadata with governance context', () => {
    const record = makeDecisionRecord({
      reason: 'Policy matched',
      intervention: 'rollback',
    });
    const result = mapDecisionToAgentEvent(record);

    expect(result.metadata).toBeDefined();
    expect(result.metadata!.reason).toBe('Policy matched');
    expect(result.metadata!.intervention).toBe('rollback');
    expect(result.metadata!.destructive).toBe(false);
    expect(result.metadata!.invariantsHold).toBe(true);
  });

  it('uses policyVersion from matchedPolicyId', () => {
    const record = makeDecisionRecord({
      policy: {
        matchedPolicyId: 'strict-v2',
        matchedPolicyName: 'strict',
        severity: 3,
      },
    });
    const result = mapDecisionToAgentEvent(record);

    expect(result.policyVersion).toBe('strict-v2');
  });

  it('does not set policyVersion when matchedPolicyId is null', () => {
    const record = makeDecisionRecord({
      policy: {
        matchedPolicyId: null,
        matchedPolicyName: null,
        severity: 1,
      },
    });
    const result = mapDecisionToAgentEvent(record);

    expect(result.policyVersion).toBeUndefined();
  });

  it('promotes to critical when escalationLevel >= 3', () => {
    const record = makeDecisionRecord({
      monitor: {
        escalationLevel: 3,
        totalEvaluations: 50,
        totalDenials: 20,
      },
    });
    const result = mapDecisionToAgentEvent(record);

    expect(result.riskLevel).toBe('critical');
  });

  it('uses simulation riskLevel when present', () => {
    const record = makeDecisionRecord({
      simulation: {
        predictedChanges: ['modify /src/app.ts'],
        blastRadius: 3,
        riskLevel: 'high',
        simulatorId: 'fs-sim',
        durationMs: 15,
      },
    });
    const result = mapDecisionToAgentEvent(record);

    expect(result.riskLevel).toBe('high');
    expect(result.metadata!.simulation).toBeDefined();
  });

  it('defaults riskLevel to low when no simulation', () => {
    const record = makeDecisionRecord({ simulation: null });
    const result = mapDecisionToAgentEvent(record);

    expect(result.riskLevel).toBe('low');
  });

  it('includes sessionId from runId', () => {
    const record = makeDecisionRecord({ runId: 'run_xyz' });
    const result = mapDecisionToAgentEvent(record);

    expect(result.sessionId).toBe('run_xyz');
  });

  it('includes invariant violations in metadata', () => {
    const record = makeDecisionRecord({
      invariants: {
        allHold: false,
        violations: [
          {
            invariantId: 'no-force-push',
            name: 'No Force Push',
            severity: 5,
            expected: 'no force push',
            actual: 'force push detected',
          },
        ],
      },
    });
    const result = mapDecisionToAgentEvent(record);

    expect(result.metadata!.invariantsHold).toBe(false);
    expect(result.metadata!.violations).toHaveLength(1);
  });

  it('includes execution metadata when executed', () => {
    const record = makeDecisionRecord({
      execution: {
        executed: true,
        success: true,
        durationMs: 100,
        error: null,
      },
    });
    const result = mapDecisionToAgentEvent(record);

    expect(result.metadata!.execution).toEqual({
      success: true,
      durationMs: 100,
    });
  });

  it('includes execution error in metadata', () => {
    const record = makeDecisionRecord({
      execution: {
        executed: true,
        success: false,
        durationMs: 50,
        error: 'ENOENT',
      },
    });
    const result = mapDecisionToAgentEvent(record);

    expect(result.metadata!.executionError).toBe('ENOENT');
  });

  it('uses agent from action field', () => {
    const record = makeDecisionRecord({
      action: {
        type: 'git.commit',
        target: 'main',
        agent: 'claude-agent',
        destructive: false,
      },
    });
    const result = mapDecisionToAgentEvent(record);

    expect(result.agentId).toBe('claude-agent');
    expect(result.action).toBe('git.commit');
    expect(result.resource).toBe('main');
  });

  it('sets eventType to decision', () => {
    const record = makeDecisionRecord();
    const result = mapDecisionToAgentEvent(record);

    expect(result.eventType).toBe('decision');
  });

  it('produces a valid ISO timestamp', () => {
    const record = makeDecisionRecord({ timestamp: 1710000000000 });
    const result = mapDecisionToAgentEvent(record);

    expect(result.timestamp).toBe(new Date(1710000000000).toISOString());
  });
});

// ---------------------------------------------------------------------------
// Unmapped event kinds — TDD: write failing tests first, then add mappings
// ---------------------------------------------------------------------------

describe('mapDomainEventToAgentEvent — session events', () => {
  it('maps StateChanged to decision', () => {
    const event = makeDomainEvent({ kind: 'StateChanged', from: 'NORMAL', to: 'ELEVATED' });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('decision');
  });

  it('maps RunStarted to decision', () => {
    const event = makeDomainEvent({ kind: 'RunStarted', runId: 'run_001' });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('decision');
  });

  it('maps RunEnded to decision', () => {
    const event = makeDomainEvent({ kind: 'RunEnded', runId: 'run_001', result: 'success' });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('decision');
  });

  it('maps CheckpointReached to decision', () => {
    const event = makeDomainEvent({
      kind: 'CheckpointReached',
      runId: 'run_001',
      checkpoint: 'stage-1',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('decision');
  });
});

describe('mapDomainEventToAgentEvent — governance events (unmapped subset)', () => {
  it('maps UnauthorizedAction to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'UnauthorizedAction',
      action: 'git.push',
      reason: 'No permission',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('policy_evaluation');
  });

  it('maps BlastRadiusExceeded to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'BlastRadiusExceeded',
      filesAffected: 50,
      limit: 20,
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('policy_evaluation');
  });

  it('maps MergeGuardFailure to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'MergeGuardFailure',
      branch: 'main',
      reason: 'Protected branch',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('policy_evaluation');
  });

  it('maps EvidencePackGenerated to decision', () => {
    const event = makeDomainEvent({
      kind: 'EvidencePackGenerated',
      packId: 'pack_1',
      eventIds: ['evt_1', 'evt_2'],
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('decision');
  });

  it('maps PolicyComposed to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'PolicyComposed',
      policyCount: 3,
      totalRules: 15,
      sources: ['default', 'custom'],
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('policy_evaluation');
  });
});

describe('mapDomainEventToAgentEvent — pipeline events', () => {
  it('maps PipelineStarted to tool_call', () => {
    const event = makeDomainEvent({
      kind: 'PipelineStarted',
      runId: 'run_001',
      task: 'code-review',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });

  it('maps StageCompleted to tool_call', () => {
    const event = makeDomainEvent({
      kind: 'StageCompleted',
      runId: 'run_001',
      stageId: 'stage-1',
      status: 'passed',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });

  it('maps StageFailed to tool_call', () => {
    const event = makeDomainEvent({
      kind: 'StageFailed',
      runId: 'run_001',
      stageId: 'stage-2',
      errors: ['timeout'],
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });

  it('maps PipelineCompleted to tool_call', () => {
    const event = makeDomainEvent({
      kind: 'PipelineCompleted',
      runId: 'run_001',
      result: 'success',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });

  it('maps PipelineFailed to tool_call', () => {
    const event = makeDomainEvent({
      kind: 'PipelineFailed',
      runId: 'run_001',
      failedStage: 'stage-3',
      errors: ['exit code 1'],
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });

  it('maps FileScopeViolation to tool_call', () => {
    const event = makeDomainEvent({
      kind: 'FileScopeViolation',
      runId: 'run_001',
      files: ['/etc/passwd'],
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });
});

describe('mapDomainEventToAgentEvent — developer signal events', () => {
  it('maps FileSaved to tool_call', () => {
    const event = makeDomainEvent({ kind: 'FileSaved', file: '/src/app.ts' });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });

  it('maps TestCompleted to tool_call', () => {
    const event = makeDomainEvent({ kind: 'TestCompleted', result: 'passed' });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });

  it('maps BuildCompleted to tool_call', () => {
    const event = makeDomainEvent({ kind: 'BuildCompleted', result: 'success' });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });

  it('maps CommitCreated to tool_call', () => {
    const event = makeDomainEvent({ kind: 'CommitCreated', hash: 'abc123' });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });

  it('maps CodeReviewed to tool_call', () => {
    const event = makeDomainEvent({ kind: 'CodeReviewed', action: 'approved' });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });

  it('maps DeployCompleted to tool_call', () => {
    const event = makeDomainEvent({ kind: 'DeployCompleted', result: 'success' });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });

  it('maps LintCompleted to tool_call', () => {
    const event = makeDomainEvent({ kind: 'LintCompleted', result: 'passed' });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });
});

describe('mapDomainEventToAgentEvent — token optimization', () => {
  it('maps TokenOptimizationApplied to tool_call', () => {
    const event = makeDomainEvent({
      kind: 'TokenOptimizationApplied',
      tool: 'rtk',
      command: 'git status',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('tool_call');
  });
});

describe('mapDomainEventToAgentEvent — agent liveness events', () => {
  it('maps HeartbeatEmitted to decision', () => {
    const event = makeDomainEvent({ kind: 'HeartbeatEmitted', agentId: 'agent-1' });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('decision');
  });

  it('maps HeartbeatMissed to decision', () => {
    const event = makeDomainEvent({
      kind: 'HeartbeatMissed',
      agentId: 'agent-1',
      missedCount: 2,
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('decision');
  });

  it('maps AgentUnresponsive to decision', () => {
    const event = makeDomainEvent({
      kind: 'AgentUnresponsive',
      agentId: 'agent-1',
      missedCount: 5,
      threshold: 3,
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('decision');
  });
});

describe('mapDomainEventToAgentEvent — integrity events', () => {
  it('maps HookIntegrityVerified to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'HookIntegrityVerified',
      settingsPath: '/path/to/settings.json',
      hash: 'sha256:abc',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('policy_evaluation');
  });

  it('maps HookIntegrityFailed to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'HookIntegrityFailed',
      settingsPath: '/path/to/settings.json',
      reason: 'Hash mismatch',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('policy_evaluation');
  });

  it('maps PolicyTrustVerified to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'PolicyTrustVerified',
      policyPath: '/policies/default.yaml',
      status: 'trusted',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('policy_evaluation');
  });

  it('maps PolicyTrustDenied to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'PolicyTrustDenied',
      policyPath: '/policies/untrusted.yaml',
      reason: 'Not in trust store',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('policy_evaluation');
  });
});

describe('mapDomainEventToAgentEvent — adoption and learning events', () => {
  it('maps AdoptionAnalyzed to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'AdoptionAnalyzed',
      sessionId: 'sess_001',
      adoptionPct: 85,
      totalToolCalls: 100,
      governedActions: 85,
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('policy_evaluation');
  });

  it('maps AdoptionAnalysisFailed to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'AdoptionAnalysisFailed',
      sessionId: 'sess_001',
      error: 'Database unavailable',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('policy_evaluation');
  });

  it('maps DenialPatternDetected to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'DenialPatternDetected',
      actionType: 'git.push',
      occurrences: 5,
      confidence: 0.9,
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('policy_evaluation');
  });

  it('maps IntentDriftDetected to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'IntentDriftDetected',
      actionType: 'file.write',
      target: '/etc/hosts',
      driftType: 'scope-expansion',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('policy_evaluation');
  });
});

describe('mapDomainEventToAgentEvent — environmental enforcement', () => {
  it('maps IdeSocketAccessBlocked to policy_evaluation', () => {
    const event = makeDomainEvent({
      kind: 'IdeSocketAccessBlocked',
      socketPattern: '*.sock',
      source: 'shell-adapter',
    });
    const result = mapDomainEventToAgentEvent(event);
    expect(result.eventType).toBe('policy_evaluation');
  });
});
