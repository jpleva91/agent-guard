// Evidence summary generator — aggregates governance events into a PR-ready report.
// Pure domain logic. No Node.js I/O, no side effects.

import type { DomainEvent } from '@red-codes/core';

/** Aggregated governance metrics from a session's events. */
export interface EvidenceSummary {
  readonly totalEvents: number;
  readonly actionsAllowed: number;
  readonly actionsDenied: number;
  readonly policyDenials: number;
  readonly invariantViolations: number;
  readonly escalations: number;
  readonly blastRadiusExceeded: number;
  readonly evidencePacksGenerated: number;
  readonly maxEscalationLevel: string;
  readonly actionTypeBreakdown: Record<string, { allowed: number; denied: number }>;
  readonly denialReasons: string[];
  readonly violationDetails: string[];
  readonly runIds: string[];
}

/** Options for formatting the evidence markdown report. */
export interface EvidenceMarkdownOptions {
  /** URL to the full session artifact (e.g., GitHub Actions artifact link). */
  readonly artifactUrl?: string;
}

const GOVERNANCE_KINDS = new Set([
  'ActionRequested',
  'ActionAllowed',
  'ActionDenied',
  'ActionEscalated',
  'ActionExecuted',
  'ActionFailed',
  'PolicyDenied',
  'InvariantViolation',
  'BlastRadiusExceeded',
  'EvidencePackGenerated',
  'DecisionRecorded',
  'SimulationCompleted',
]);

const ESCALATION_ORDER: Record<string, number> = {
  NORMAL: 0,
  ELEVATED: 1,
  HIGH: 2,
  LOCKDOWN: 3,
};

/**
 * Aggregate raw governance events into a structured summary.
 * Only counts governance-related events in the metrics.
 */
export function aggregateEvents(events: DomainEvent[]): EvidenceSummary {
  let actionsAllowed = 0;
  let actionsDenied = 0;
  let policyDenials = 0;
  let invariantViolations = 0;
  let escalations = 0;
  let blastRadiusExceeded = 0;
  let evidencePacksGenerated = 0;
  let maxEscalationOrdinal = 0;
  const actionTypeBreakdown: Record<string, { allowed: number; denied: number }> = {};
  const denialReasons: string[] = [];
  const violationDetails: string[] = [];
  const runIds = new Set<string>();

  const governanceEvents = events.filter((e) => GOVERNANCE_KINDS.has(e.kind));

  for (const event of events) {
    // Track runIds from RunStarted events
    if (event.kind === 'RunStarted' && event.runId) {
      runIds.add(event.runId as string);
    }

    switch (event.kind) {
      case 'ActionAllowed': {
        actionsAllowed++;
        const actionType = (event.actionType as string) || 'unknown';
        if (!actionTypeBreakdown[actionType]) {
          actionTypeBreakdown[actionType] = { allowed: 0, denied: 0 };
        }
        actionTypeBreakdown[actionType].allowed++;
        break;
      }
      case 'ActionDenied': {
        actionsDenied++;
        const actionType = (event.actionType as string) || 'unknown';
        if (!actionTypeBreakdown[actionType]) {
          actionTypeBreakdown[actionType] = { allowed: 0, denied: 0 };
        }
        actionTypeBreakdown[actionType].denied++;
        const reason = (event.reason as string) || 'no reason provided';
        denialReasons.push(`${actionType}: ${reason}`);
        break;
      }
      case 'PolicyDenied': {
        policyDenials++;
        const action = (event.action as string) || 'unknown';
        const reason = (event.reason as string) || 'no reason provided';
        denialReasons.push(`Policy denied ${action}: ${reason}`);
        break;
      }
      case 'InvariantViolation': {
        invariantViolations++;
        const invariant = (event.invariant as string) || 'unknown';
        const expected = (event.expected as string) || '';
        const actual = (event.actual as string) || '';
        violationDetails.push(`${invariant}: expected ${expected}, got ${actual}`);
        break;
      }
      case 'ActionEscalated': {
        escalations++;
        break;
      }
      case 'BlastRadiusExceeded': {
        blastRadiusExceeded++;
        break;
      }
      case 'EvidencePackGenerated': {
        evidencePacksGenerated++;
        break;
      }
      case 'StateChanged': {
        const to = (event.to as string) || '';
        const ordinal = ESCALATION_ORDER[to] ?? 0;
        if (ordinal > maxEscalationOrdinal) {
          maxEscalationOrdinal = ordinal;
        }
        break;
      }
    }
  }

  const escalationNames = Object.entries(ESCALATION_ORDER);
  const maxEscalationLevel =
    escalationNames.find(([, v]) => v === maxEscalationOrdinal)?.[0] ?? 'NORMAL';

  return {
    totalEvents: governanceEvents.length,
    actionsAllowed,
    actionsDenied,
    policyDenials,
    invariantViolations,
    escalations,
    blastRadiusExceeded,
    evidencePacksGenerated,
    maxEscalationLevel,
    actionTypeBreakdown,
    denialReasons,
    violationDetails,
    runIds: [...runIds],
  };
}

/**
 * Format an evidence summary as PR-ready markdown.
 */
export function formatEvidenceMarkdown(
  summary: EvidenceSummary,
  options?: EvidenceMarkdownOptions
): string {
  const lines: string[] = [];

  lines.push('## Governance Evidence Report');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total governance events | ${summary.totalEvents} |`);
  lines.push(`| Actions allowed | ${summary.actionsAllowed} |`);
  lines.push(`| Actions denied | ${summary.actionsDenied} |`);
  lines.push(`| Policy denials | ${summary.policyDenials} |`);
  lines.push(`| Invariant violations | ${summary.invariantViolations} |`);
  lines.push(`| Escalations | ${summary.escalations} |`);
  lines.push(`| Blast radius exceeded | ${summary.blastRadiusExceeded} |`);
  lines.push(`| Escalation level | ${summary.maxEscalationLevel} |`);

  // Verdict line
  if (summary.actionsDenied === 0 && summary.invariantViolations === 0) {
    lines.push('');
    lines.push('**Verdict:** All actions passed governance checks.');
  } else {
    lines.push('');
    lines.push(
      `**Verdict:** ${summary.actionsDenied + summary.invariantViolations} governance issue(s) detected.`
    );
  }

  // Action type breakdown (if any)
  const actionTypes = Object.keys(summary.actionTypeBreakdown);
  if (actionTypes.length > 0) {
    lines.push('');
    lines.push('<details>');
    lines.push('<summary>Action type breakdown</summary>');
    lines.push('');
    lines.push('| Action Type | Allowed | Denied |');
    lines.push('|-------------|---------|--------|');
    for (const actionType of actionTypes.sort()) {
      const counts = summary.actionTypeBreakdown[actionType];
      lines.push(`| \`${actionType}\` | ${counts.allowed} | ${counts.denied} |`);
    }
    lines.push('');
    lines.push('</details>');
  }

  // Denial details (if any)
  if (summary.denialReasons.length > 0) {
    lines.push('');
    lines.push('<details>');
    lines.push('<summary>Denial details</summary>');
    lines.push('');
    for (const reason of summary.denialReasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
    lines.push('</details>');
  }

  // Violation details (if any)
  if (summary.violationDetails.length > 0) {
    lines.push('');
    lines.push('<details>');
    lines.push('<summary>Invariant violation details</summary>');
    lines.push('');
    for (const detail of summary.violationDetails) {
      lines.push(`- ${detail}`);
    }
    lines.push('');
    lines.push('</details>');
  }

  // Session info
  if (summary.runIds.length > 0) {
    lines.push('');
    lines.push(`*Sessions: ${summary.runIds.map((id) => `\`${id}\``).join(', ')}*`);
  }

  // Link to full session artifact
  if (options?.artifactUrl) {
    lines.push('');
    lines.push(`**Full session data:** [Download governance session](${options.artifactUrl})`);
  }

  lines.push('');
  lines.push(
    '*Generated by [AgentGuard](https://github.com/jpleva91/agent-guard) governance runtime.*'
  );

  return lines.join('\n');
}
