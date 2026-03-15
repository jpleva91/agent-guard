// Enforcement Audit Report — generates a structured summary of runtime
// enforcement activity from governance decision records and events.
// Answers: "What was attempted, what was blocked, and can we prove it?"

import type { GovernanceDecisionRecord, DomainEvent } from '@red-codes/core';

/** Summary of enforcement activity for a governance session */
export interface EnforcementAuditReport {
  /** Report format version */
  schemaVersion: '1.0.0';
  /** Session/run identifier */
  runId: string;
  /** When the report was generated */
  generatedAt: string;
  /** Time range of the audited session */
  timeRange: {
    first: number;
    last: number;
    durationMs: number;
  };
  /** Overall enforcement statistics */
  summary: {
    totalActions: number;
    allowed: number;
    denied: number;
    denialRate: number;
    totalViolations: number;
    uniqueViolationTypes: number;
    peakEscalationLevel: number;
    destructiveActionsBlocked: number;
    chainIntegrityVerified: boolean;
  };
  /** Breakdown by action type */
  actionBreakdown: Record<
    string,
    {
      total: number;
      allowed: number;
      denied: number;
    }
  >;
  /** All denial records with full context */
  denials: Array<{
    timestamp: number;
    actionType: string;
    target: string;
    agent: string;
    reason: string;
    intervention: string | null;
    violations: Array<{
      invariantId: string;
      name: string;
      severity: number;
    }>;
    policyMatched: string | null;
    destructive: boolean;
  }>;
  /** Invariant violation summary */
  invariantSummary: Record<
    string,
    {
      name: string;
      count: number;
      maxSeverity: number;
    }
  >;
  /** Escalation timeline */
  escalationTimeline: Array<{
    timestamp: number;
    fromLevel: number;
    toLevel: number;
    trigger: string;
  }>;
  /** Provenance — where enforcement decisions came from */
  enforcementSources: {
    policyDenials: number;
    invariantDenials: number;
    simulationDenials: number;
  };
}

/**
 * Generate an enforcement audit report from decision records and events.
 */
export function generateEnforcementAudit(params: {
  runId: string;
  decisions: GovernanceDecisionRecord[];
  events?: DomainEvent[];
  chainVerified?: boolean;
}): EnforcementAuditReport {
  const { runId, decisions, events = [], chainVerified = false } = params;

  // Time range
  const timestamps = decisions.map((d) => d.timestamp);
  const eventTimestamps = events.map((e) => e.timestamp);
  const allTimestamps = [...timestamps, ...eventTimestamps].filter(Boolean);
  const first = allTimestamps.length > 0 ? Math.min(...allTimestamps) : 0;
  const last = allTimestamps.length > 0 ? Math.max(...allTimestamps) : 0;

  // Counts
  const allowed = decisions.filter((d) => d.outcome === 'allow');
  const denied = decisions.filter((d) => d.outcome === 'deny');
  const destructiveBlocked = denied.filter((d) => d.action.destructive);

  // All violations across all decisions
  const allViolations = decisions.flatMap((d) => d.invariants.violations);
  const uniqueViolationTypes = new Set(allViolations.map((v) => v.invariantId));

  // Peak escalation
  const peakEscalation = Math.max(0, ...decisions.map((d) => d.monitor.escalationLevel));

  // Action breakdown
  const actionBreakdown: Record<string, { total: number; allowed: number; denied: number }> = {};
  for (const d of decisions) {
    const type = d.action.type;
    if (!actionBreakdown[type]) {
      actionBreakdown[type] = { total: 0, allowed: 0, denied: 0 };
    }
    actionBreakdown[type].total++;
    if (d.outcome === 'allow') actionBreakdown[type].allowed++;
    else actionBreakdown[type].denied++;
  }

  // Denial details
  const denials = denied.map((d) => ({
    timestamp: d.timestamp,
    actionType: d.action.type,
    target: d.action.target,
    agent: d.action.agent,
    reason: d.reason,
    intervention: d.intervention,
    violations: d.invariants.violations.map((v) => ({
      invariantId: v.invariantId,
      name: v.name,
      severity: v.severity,
    })),
    policyMatched: d.policy.matchedPolicyId,
    destructive: d.action.destructive,
  }));

  // Invariant summary
  const invariantSummary: Record<string, { name: string; count: number; maxSeverity: number }> = {};
  for (const v of allViolations) {
    if (!invariantSummary[v.invariantId]) {
      invariantSummary[v.invariantId] = { name: v.name, count: 0, maxSeverity: 0 };
    }
    invariantSummary[v.invariantId].count++;
    if (v.severity > invariantSummary[v.invariantId].maxSeverity) {
      invariantSummary[v.invariantId].maxSeverity = v.severity;
    }
  }

  // Escalation timeline from events
  const escalationTimeline = events
    .filter((e) => e.kind === 'StateChanged')
    .map((e) => ({
      timestamp: e.timestamp,
      fromLevel: (e as Record<string, unknown>).from as number,
      toLevel: (e as Record<string, unknown>).to as number,
      trigger: ((e as Record<string, unknown>).trigger as string) || 'threshold',
    }));

  // Enforcement sources
  let policyDenials = 0;
  let invariantDenials = 0;
  let simulationDenials = 0;
  for (const d of denied) {
    if (d.invariants.violations.length > 0) invariantDenials++;
    if (d.policy.matchedPolicyId) policyDenials++;
    if (d.simulation && d.simulation.riskLevel === 'high') simulationDenials++;
  }

  return {
    schemaVersion: '1.0.0',
    runId,
    generatedAt: new Date().toISOString(),
    timeRange: {
      first,
      last,
      durationMs: last - first,
    },
    summary: {
      totalActions: decisions.length,
      allowed: allowed.length,
      denied: denied.length,
      denialRate: decisions.length > 0 ? denied.length / decisions.length : 0,
      totalViolations: allViolations.length,
      uniqueViolationTypes: uniqueViolationTypes.size,
      peakEscalationLevel: peakEscalation,
      destructiveActionsBlocked: destructiveBlocked.length,
      chainIntegrityVerified: chainVerified,
    },
    actionBreakdown,
    denials,
    invariantSummary,
    escalationTimeline,
    enforcementSources: {
      policyDenials,
      invariantDenials,
      simulationDenials,
    },
  };
}

/**
 * Format an enforcement audit report as human-readable text.
 */
export function formatEnforcementAudit(report: EnforcementAuditReport): string {
  const lines: string[] = [];
  const s = report.summary;

  lines.push('');
  lines.push('  Enforcement Audit Report');
  lines.push('  ========================');
  lines.push(`  Run:       ${report.runId}`);
  lines.push(`  Generated: ${report.generatedAt}`);
  if (report.timeRange.durationMs > 0) {
    const durSec = (report.timeRange.durationMs / 1000).toFixed(1);
    lines.push(`  Duration:  ${durSec}s`);
  }
  lines.push('');

  // Summary
  lines.push('  Summary');
  lines.push('  -------');
  lines.push(`  Total actions:          ${s.totalActions}`);
  lines.push(`  Allowed:                ${s.allowed}`);
  lines.push(`  Denied:                 ${s.denied}`);
  lines.push(`  Denial rate:            ${(s.denialRate * 100).toFixed(1)}%`);
  lines.push(`  Violations:             ${s.totalViolations} (${s.uniqueViolationTypes} types)`);
  lines.push(`  Destructive blocked:    ${s.destructiveActionsBlocked}`);
  lines.push(`  Peak escalation:        ${s.peakEscalationLevel}`);
  lines.push(`  Chain integrity:        ${s.chainIntegrityVerified ? 'VERIFIED' : 'NOT VERIFIED'}`);
  lines.push('');

  // Action breakdown
  const actionTypes = Object.keys(report.actionBreakdown);
  if (actionTypes.length > 0) {
    lines.push('  Action Breakdown');
    lines.push('  ----------------');
    for (const type of actionTypes.sort()) {
      const b = report.actionBreakdown[type];
      lines.push(`  ${type.padEnd(20)} ${b.allowed} allowed, ${b.denied} denied`);
    }
    lines.push('');
  }

  // Denials
  if (report.denials.length > 0) {
    lines.push('  Denials');
    lines.push('  -------');
    for (const d of report.denials) {
      const ts = new Date(d.timestamp).toISOString();
      const flag = d.destructive ? ' [DESTRUCTIVE]' : '';
      lines.push(`  ${ts} ${d.actionType} → ${d.target}${flag}`);
      lines.push(`    Reason: ${d.reason}`);
      if (d.violations.length > 0) {
        const names = d.violations.map((v) => `${v.name} (sev:${v.severity})`).join(', ');
        lines.push(`    Violations: ${names}`);
      }
    }
    lines.push('');
  }

  // Enforcement sources
  const src = report.enforcementSources;
  lines.push('  Enforcement Sources');
  lines.push('  -------------------');
  lines.push(`  Policy denials:      ${src.policyDenials}`);
  lines.push(`  Invariant denials:   ${src.invariantDenials}`);
  lines.push(`  Simulation denials:  ${src.simulationDenials}`);
  lines.push('');

  return lines.join('\n');
}
