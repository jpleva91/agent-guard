// Governance Decision Record — first-class audit artifact.
// Aggregates monitor decision, execution data, and evidence into
// a single persisted, queryable record per agent action.

export interface GovernanceDecisionRecord {
  /** Unique record ID: "dec_<timestamp>_<hash>" */
  recordId: string;
  /** Kernel run ID this decision belongs to */
  runId: string;
  /** When the decision was made */
  timestamp: number;
  /** The action that was evaluated */
  action: {
    type: string;
    target: string;
    agent: string;
    destructive: boolean;
    command?: string;
  };
  /** Final governance outcome */
  outcome: 'allow' | 'deny';
  /** Human-readable reason for the outcome */
  reason: string;
  /** Intervention type if denied (deny, rollback, pause, test-only) */
  intervention: string | null;
  /** Policy matching details */
  policy: {
    matchedPolicyId: string | null;
    matchedPolicyName: string | null;
    severity: number;
  };
  /** Invariant evaluation results */
  invariants: {
    allHold: boolean;
    violations: Array<{
      invariantId: string;
      name: string;
      severity: number;
      expected: string;
      actual: string;
    }>;
  };
  /** Pre-execution simulation results (Phase 2 integration point) */
  simulation: SimulationSummary | null;
  /** Evidence pack ID if generated */
  evidencePackId: string | null;
  /** Monitor state at decision time */
  monitor: {
    escalationLevel: number;
    totalEvaluations: number;
    totalDenials: number;
  };
  /** Execution results (null if denied or dry-run) */
  execution: {
    executed: boolean;
    success: boolean | null;
    durationMs: number | null;
    error: string | null;
  };
}

/** Placeholder for Phase 2 simulation integration */
export interface SimulationSummary {
  predictedChanges: string[];
  blastRadius: number;
  riskLevel: 'low' | 'medium' | 'high';
  simulatorId: string;
  durationMs: number;
}

/** Sink interface for decision records (mirrors EventSink pattern) */
export interface DecisionSink {
  write(record: GovernanceDecisionRecord): void;
  flush?(): void;
}
