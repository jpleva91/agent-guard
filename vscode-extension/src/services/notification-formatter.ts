// Pure notification formatting utilities — no VS Code dependency.
// Formats governance events into human-readable notification messages
// and maps event kinds to notification severity levels.

import type { GovernanceEvent } from './event-reader';

/** Event kinds that can trigger notifications */
export const NOTIFICATION_EVENT_KINDS = [
  'PolicyDenied',
  'InvariantViolation',
  'BlastRadiusExceeded',
  'ActionEscalated',
] as const;

export type NotificationEventKind = (typeof NOTIFICATION_EVENT_KINDS)[number];

/** VS Code notification severity */
export type NotificationLevel = 'information' | 'warning' | 'error';

/** Default severity mapping for each event kind */
export const DEFAULT_SEVERITY: Record<NotificationEventKind, NotificationLevel> = {
  PolicyDenied: 'warning',
  InvariantViolation: 'error',
  BlastRadiusExceeded: 'error',
  ActionEscalated: 'information',
};

/**
 * Check if an event kind should trigger a notification.
 */
export function isNotificationEvent(kind: string): kind is NotificationEventKind {
  return (NOTIFICATION_EVENT_KINDS as readonly string[]).includes(kind);
}

/**
 * Resolve the notification severity for an event kind,
 * applying user overrides on top of defaults.
 */
export function resolveSeverity(
  kind: NotificationEventKind,
  overrides: Record<string, string> = {}
): NotificationLevel {
  const override = overrides[kind];
  if (override === 'information' || override === 'warning' || override === 'error') {
    return override;
  }
  return DEFAULT_SEVERITY[kind];
}

/**
 * Format a human-readable notification message from a governance event.
 */
export function formatNotificationMessage(event: GovernanceEvent): string {
  const kind = event.kind;
  const metadata =
    typeof event.metadata === 'object' && event.metadata !== null
      ? (event.metadata as Record<string, unknown>)
      : {};

  switch (kind) {
    case 'PolicyDenied': {
      const rule = metadata.rule ?? metadata.reason ?? 'unknown rule';
      const action = metadata.actionType ?? metadata.action ?? 'action';
      return `AgentGuard: Policy denied ${action} — ${rule}`;
    }
    case 'InvariantViolation': {
      const invariant = metadata.invariant ?? metadata.name ?? 'unknown';
      const detail = metadata.message ?? metadata.reason ?? '';
      return detail
        ? `AgentGuard: Invariant violation [${invariant}] — ${detail}`
        : `AgentGuard: Invariant violation [${invariant}]`;
    }
    case 'BlastRadiusExceeded': {
      const score = metadata.score ?? metadata.blastRadius ?? '?';
      const threshold = metadata.threshold ?? metadata.limit ?? '?';
      return `AgentGuard: Blast radius exceeded (${score}/${threshold})`;
    }
    case 'ActionEscalated': {
      const level = metadata.escalationLevel ?? metadata.level ?? '?';
      const action = metadata.actionType ?? metadata.action ?? 'action';
      return `AgentGuard: ${action} escalated to level ${level}`;
    }
    default:
      return `AgentGuard: ${kind} event detected`;
  }
}
