// Evidence pack generator — creates structured audit records.
// Pure domain logic. No DOM, no Node.js-specific APIs.

import type { DomainEvent, SimulationSummary } from '@red-codes/core';
import { createEvent, EVIDENCE_PACK_GENERATED } from '@red-codes/events';
import { simpleHash } from '@red-codes/core';
import type { NormalizedIntent, EvalResult } from '@red-codes/policy';
import type { InvariantCheck } from '@red-codes/invariants';

// ---------------------------------------------------------------------------
// Schema version for the explainable evidence pack format
// ---------------------------------------------------------------------------
export const EVIDENCE_PACK_SCHEMA_VERSION = '1.1.0';

// ---------------------------------------------------------------------------
// Core Evidence Pack (unchanged for backward compatibility)
// ---------------------------------------------------------------------------

export interface EvidencePack {
  packId: string;
  timestamp: number;
  intent: NormalizedIntent;
  decision: EvalResult;
  violations: Array<{
    invariantId: string;
    name: string;
    severity: number;
    expected: string;
    actual: string;
  }>;
  events: string[];
  summary: string;
  severity: number;
}

// ---------------------------------------------------------------------------
// Explainable Evidence Pack — formal governance interface
// ---------------------------------------------------------------------------

/** A single step in the governance evaluation path */
export interface EvaluationStep {
  phase:
    | 'normalization'
    | 'policy-evaluation'
    | 'invariant-check'
    | 'simulation'
    | 'intent-alignment'
    | 'verdict';
  description: string;
  outcome: 'pass' | 'fail' | 'skip' | 'match' | 'no-match';
  details?: Record<string, unknown>;
  durationMs?: number;
}

/**
 * Classification of reasoning used to produce a piece of evidence.
 * - `deterministic`: Binary outcome derived from rules or checks (policy match, invariant hold/fail)
 * - `probabilistic`: Predicted outcome with inherent uncertainty (simulation, AI-based assessment)
 */
export type ReasoningMode = 'deterministic' | 'probabilistic';

/** Links a piece of evidence to its authoritative source */
export interface ProvenanceEntry {
  sourceType: 'policy-rule' | 'invariant' | 'simulation' | 'default';
  sourceId: string;
  sourceName: string;
  contribution: 'allow' | 'deny' | 'neutral';
  evidence: string;
  /** Whether this evidence was produced by deterministic rules or probabilistic prediction */
  reasoningMode: ReasoningMode;
  /** Confidence score (0.0–1.0). Always 1.0 for deterministic; variable for probabilistic. */
  confidenceScore: number;
}

/**
 * Structured explanation that formally separates deterministic adjudication
 * from probabilistic advice. This is the primary interface for formal
 * verification tools (e.g., SMT solvers) to reason about governance decisions.
 */
export interface ExplanationChain {
  /** Evidence from deterministic sources (policy rules, invariants, defaults) */
  deterministicInputs: ProvenanceEntry[];
  /** Evidence from probabilistic sources (simulations, AI predictions) */
  probabilisticInputs: ProvenanceEntry[];
  /** The final allow/deny verdict */
  verdict: 'allow' | 'deny';
  /** How the verdict was derived — currently always deterministic */
  verdictBasis: 'deterministic';
  /** Human-readable derivation explaining how inputs combined to reach the verdict */
  derivation: string;
}

/** Summary of intent alignment for inclusion in evidence packs */
export interface IntentAlignmentSummary {
  aligned: boolean;
  drifts: Array<{
    driftType: string;
    reason: string;
  }>;
  intentDescription?: string;
}

/** Explainable evidence pack — extends EvidencePack with decision explanation */
export interface ExplainableEvidencePack extends EvidencePack {
  schemaVersion: string;
  evaluationPath: EvaluationStep[];
  provenance: ProvenanceEntry[];
  verdictType: 'deterministic';
  confidence: number;
  /** Formal separation of probabilistic advice from deterministic adjudication */
  explanationChain: ExplanationChain;
  /** Intent alignment summary (present when IntentSpec is configured) */
  intentAlignment?: IntentAlignmentSummary;
}

/** Serialized form suitable for JSON export and long-term archival */
export interface SerializedEvidencePack {
  schemaVersion: string;
  packId: string;
  timestamp: string;
  intent: {
    action: string;
    target: string;
    agent: string;
    destructive: boolean;
    branch?: string;
    command?: string;
  };
  verdict: {
    decision: 'allow' | 'deny';
    reason: string;
    severity: number;
    type: 'deterministic';
    confidence: number;
  };
  evaluationPath: EvaluationStep[];
  provenance: ProvenanceEntry[];
  explanationChain: ExplanationChain;
  violations: Array<{
    invariantId: string;
    name: string;
    severity: number;
    expected: string;
    actual: string;
  }>;
  relatedEventIds: string[];
  summary: string;
  intentAlignment?: IntentAlignmentSummary;
}

function generatePackId(timestamp: number, intent: NormalizedIntent): string {
  const content = `${timestamp}:${intent.action}:${intent.target}:${intent.agent}`;
  return `pack_${simpleHash(content)}`;
}

function computeMaxSeverity(decision: EvalResult, violations: InvariantCheck[]): number {
  let maxSeverity = decision.severity || 0;

  for (const v of violations) {
    if (v.invariant && v.invariant.severity > maxSeverity) {
      maxSeverity = v.invariant.severity;
    }
  }

  return maxSeverity;
}

function generateSummary(
  intent: NormalizedIntent,
  decision: EvalResult,
  violations: InvariantCheck[]
): string {
  const parts: string[] = [];

  parts.push(`Action: ${intent.action} on ${intent.target || 'unknown'}`);
  parts.push(`Decision: ${decision.decision.toUpperCase()}`);

  if (decision.reason) {
    parts.push(`Reason: ${decision.reason}`);
  }

  if (violations.length > 0) {
    const names = violations.map((v) => v.invariant.name);
    parts.push(`Violations: ${names.join(', ')}`);
  }

  return parts.join(' | ');
}

export function createEvidencePack(params: {
  intent: NormalizedIntent;
  decision: EvalResult;
  violations?: InvariantCheck[];
  events?: DomainEvent[];
}): { pack: EvidencePack; event: DomainEvent } {
  const { intent, decision, violations = [], events = [] } = params;
  const timestamp = Date.now();
  const packId = generatePackId(timestamp, intent);
  const severity = computeMaxSeverity(decision, violations);
  const summary = generateSummary(intent, decision, violations);

  const pack: EvidencePack = {
    packId,
    timestamp,
    intent,
    decision,
    violations: violations.map((v) => ({
      invariantId: v.invariant.id,
      name: v.invariant.name,
      severity: v.invariant.severity,
      expected: v.result.expected,
      actual: v.result.actual,
    })),
    events: events.map((e) => e.id),
    summary,
    severity,
  };

  const event = createEvent(EVIDENCE_PACK_GENERATED, {
    packId,
    eventIds: events.map((e) => e.id),
    summary,
    metadata: { severity, violationCount: violations.length },
  });

  return { pack, event };
}

// ---------------------------------------------------------------------------
// Explainable Evidence Pack creation
// ---------------------------------------------------------------------------

function buildEvaluationPath(
  intent: NormalizedIntent,
  decision: EvalResult,
  violations: InvariantCheck[],
  simulation: SimulationSummary | null,
  intentAlignment?: IntentAlignmentSummary | null
): EvaluationStep[] {
  const steps: EvaluationStep[] = [];

  // Step 1: Normalization
  steps.push({
    phase: 'normalization',
    description: `Normalized action "${intent.action}" targeting "${intent.target || 'unknown'}"`,
    outcome: 'pass',
    details: {
      agent: intent.agent,
      destructive: intent.destructive,
      ...(intent.branch ? { branch: intent.branch } : {}),
    },
  });

  // Step 2: Policy evaluation
  const trace = decision.trace;
  if (trace) {
    for (const ruleEval of trace.rulesEvaluated) {
      if (ruleEval.outcome === 'skipped') continue;

      steps.push({
        phase: 'policy-evaluation',
        description:
          `Rule ${ruleEval.ruleIndex} in "${ruleEval.policyName}" ` +
          `(${ruleEval.rule.effect}): ${ruleEval.outcome}`,
        outcome: ruleEval.outcome === 'match' ? 'match' : 'no-match',
        details: {
          policyId: ruleEval.policyId,
          policyName: ruleEval.policyName,
          ruleIndex: ruleEval.ruleIndex,
          effect: ruleEval.rule.effect,
          actionMatched: ruleEval.actionMatched,
          conditionsMatched: ruleEval.conditionsMatched,
        },
      });
    }
  } else {
    steps.push({
      phase: 'policy-evaluation',
      description: decision.matchedPolicy
        ? `Matched policy "${decision.matchedPolicy.name}": ${decision.decision}`
        : `No policy trace available: ${decision.decision}`,
      outcome: decision.decision === 'deny' ? 'fail' : 'pass',
    });
  }

  // Step 3: Invariant checks
  for (const v of violations) {
    steps.push({
      phase: 'invariant-check',
      description: `Invariant "${v.invariant.name}" violated: expected ${v.result.expected}, got ${v.result.actual}`,
      outcome: 'fail',
      details: {
        invariantId: v.invariant.id,
        severity: v.invariant.severity,
      },
    });
  }

  if (violations.length === 0) {
    steps.push({
      phase: 'invariant-check',
      description: 'All invariants hold',
      outcome: 'pass',
    });
  }

  // Step 4: Simulation (if available)
  if (simulation) {
    steps.push({
      phase: 'simulation',
      description: `Simulation "${simulation.simulatorId}": risk=${simulation.riskLevel}, blast-radius=${simulation.blastRadius}`,
      outcome: simulation.riskLevel === 'high' ? 'fail' : 'pass',
      details: {
        simulatorId: simulation.simulatorId,
        riskLevel: simulation.riskLevel,
        blastRadius: simulation.blastRadius,
        predictedChanges: simulation.predictedChanges,
      },
      durationMs: simulation.durationMs,
    });
  }

  // Step 5: Intent alignment (if IntentSpec is configured)
  if (intentAlignment) {
    if (intentAlignment.aligned) {
      steps.push({
        phase: 'intent-alignment',
        description: 'Action aligns with declared intent',
        outcome: 'pass',
        details: intentAlignment.intentDescription
          ? { intentDescription: intentAlignment.intentDescription }
          : undefined,
      });
    } else {
      for (const drift of intentAlignment.drifts) {
        steps.push({
          phase: 'intent-alignment',
          description: `Intent drift (advisory): ${drift.reason}`,
          outcome: 'fail',
          details: { driftType: drift.driftType },
        });
      }
    }
  }

  // Step 6: Final verdict
  steps.push({
    phase: 'verdict',
    description: `Final verdict: ${decision.decision.toUpperCase()} — ${decision.reason}`,
    outcome: decision.decision === 'deny' ? 'fail' : 'pass',
  });

  return steps;
}

/** Map simulation risk level to a confidence score for probabilistic entries */
function simulationConfidence(riskLevel: string): number {
  switch (riskLevel) {
    case 'high':
      return 0.9;
    case 'medium':
      return 0.7;
    case 'low':
      return 0.5;
    default:
      return 0.5;
  }
}

function buildProvenance(
  decision: EvalResult,
  violations: InvariantCheck[],
  simulation: SimulationSummary | null
): ProvenanceEntry[] {
  const entries: ProvenanceEntry[] = [];

  // Provenance from matched policy rule (deterministic)
  if (decision.matchedPolicy && decision.matchedRule) {
    entries.push({
      sourceType: 'policy-rule',
      sourceId: decision.matchedPolicy.id,
      sourceName: decision.matchedPolicy.name,
      contribution: decision.decision === 'deny' ? 'deny' : 'allow',
      evidence: decision.reason,
      reasoningMode: 'deterministic',
      confidenceScore: 1.0,
    });
  }

  // Provenance from default (no rule matched — deterministic)
  if (!decision.matchedPolicy && !decision.matchedRule) {
    entries.push({
      sourceType: 'default',
      sourceId: 'default-allow',
      sourceName: 'Default policy (no matching rule)',
      contribution: 'allow',
      evidence: decision.reason,
      reasoningMode: 'deterministic',
      confidenceScore: 1.0,
    });
  }

  // Provenance from invariant violations (deterministic)
  for (const v of violations) {
    entries.push({
      sourceType: 'invariant',
      sourceId: v.invariant.id,
      sourceName: v.invariant.name,
      contribution: 'deny',
      evidence: `Expected: ${v.result.expected}. Actual: ${v.result.actual}`,
      reasoningMode: 'deterministic',
      confidenceScore: 1.0,
    });
  }

  // Provenance from simulation (probabilistic — predictions carry uncertainty)
  if (simulation) {
    entries.push({
      sourceType: 'simulation',
      sourceId: simulation.simulatorId,
      sourceName: `Simulation (${simulation.simulatorId})`,
      contribution: simulation.riskLevel === 'high' ? 'deny' : 'neutral',
      evidence:
        `Risk: ${simulation.riskLevel}, blast radius: ${simulation.blastRadius}, ` +
        `predicted changes: ${simulation.predictedChanges.length}`,
      reasoningMode: 'probabilistic',
      confidenceScore: simulationConfidence(simulation.riskLevel),
    });
  }

  return entries;
}

function buildExplanationChain(
  decision: EvalResult,
  provenance: ProvenanceEntry[]
): ExplanationChain {
  const deterministicInputs = provenance.filter((p) => p.reasoningMode === 'deterministic');
  const probabilisticInputs = provenance.filter((p) => p.reasoningMode === 'probabilistic');

  const verdict: 'allow' | 'deny' = decision.decision === 'deny' ? 'deny' : 'allow';

  // Build human-readable derivation
  const parts: string[] = [];

  if (deterministicInputs.length > 0) {
    const denyingSources = deterministicInputs.filter((p) => p.contribution === 'deny');
    const allowingSources = deterministicInputs.filter((p) => p.contribution === 'allow');

    if (denyingSources.length > 0) {
      parts.push(`Deterministic deny from: ${denyingSources.map((s) => s.sourceName).join(', ')}`);
    } else if (allowingSources.length > 0) {
      parts.push(
        `Deterministic allow from: ${allowingSources.map((s) => s.sourceName).join(', ')}`
      );
    }
  }

  if (probabilisticInputs.length > 0) {
    const advisories = probabilisticInputs.map(
      (p) => `${p.sourceName} (confidence: ${p.confidenceScore.toFixed(1)}, ${p.contribution})`
    );
    parts.push(`Probabilistic advisory: ${advisories.join('; ')}`);
  }

  parts.push(`Verdict: ${verdict.toUpperCase()} (basis: deterministic)`);

  return {
    deterministicInputs,
    probabilisticInputs,
    verdict,
    verdictBasis: 'deterministic',
    derivation: parts.join('. '),
  };
}

export function createExplainableEvidencePack(params: {
  intent: NormalizedIntent;
  decision: EvalResult;
  violations?: InvariantCheck[];
  events?: DomainEvent[];
  simulation?: SimulationSummary | null;
  intentAlignment?: IntentAlignmentSummary | null;
}): { pack: ExplainableEvidencePack; event: DomainEvent } {
  const { simulation = null, intentAlignment = null } = params;
  const { pack: basePack, event } = createEvidencePack(params);

  const violations = params.violations ?? [];
  const evaluationPath = buildEvaluationPath(
    params.intent,
    params.decision,
    violations,
    simulation,
    intentAlignment
  );
  const provenance = buildProvenance(params.decision, violations, simulation);
  const explanationChain = buildExplanationChain(params.decision, provenance);

  const pack: ExplainableEvidencePack = {
    ...basePack,
    schemaVersion: EVIDENCE_PACK_SCHEMA_VERSION,
    evaluationPath,
    provenance,
    verdictType: 'deterministic',
    confidence: 1.0,
    explanationChain,
    ...(intentAlignment ? { intentAlignment } : {}),
  };

  return { pack, event };
}

// ---------------------------------------------------------------------------
// Serialization — self-contained JSON for archival and external consumption
// ---------------------------------------------------------------------------

export function serializeEvidencePack(pack: ExplainableEvidencePack): SerializedEvidencePack {
  return {
    schemaVersion: pack.schemaVersion,
    packId: pack.packId,
    timestamp: new Date(pack.timestamp).toISOString(),
    intent: {
      action: pack.intent.action,
      target: pack.intent.target,
      agent: pack.intent.agent,
      destructive: pack.intent.destructive,
      ...(pack.intent.branch ? { branch: pack.intent.branch } : {}),
      ...(pack.intent.command ? { command: pack.intent.command } : {}),
    },
    verdict: {
      decision: pack.decision.decision,
      reason: pack.decision.reason,
      severity: pack.severity,
      type: pack.verdictType,
      confidence: pack.confidence,
    },
    evaluationPath: pack.evaluationPath,
    provenance: pack.provenance,
    explanationChain: pack.explanationChain,
    violations: pack.violations,
    relatedEventIds: pack.events,
    summary: pack.summary,
    ...(pack.intentAlignment ? { intentAlignment: pack.intentAlignment } : {}),
  };
}
