// Denial pattern learning — analyze ACTION_DENIED events across sessions to detect
// frustrated agent loops and suggest policy improvements.
// Inspired by RTK's correction learning: identify patterns, classify resolutions, suggest fixes.

export type DenialResolution = 'retried_differently' | 'session_abandoned' | 'escalation_granted';

export interface DenialEvent {
  actionType: string;
  reason: string;
  timestamp: number;
  runId: string;
  target?: string;
  policyRule?: string;
  invariant?: string;
}

export interface DenialPattern {
  actionType: string;
  reason: string;
  occurrences: number;
  resolution: DenialResolution;
  confidence: number;
  sessions: string[];
  suggestion?: string;
}

export interface PolicySuggestion {
  type: 'allow_rule' | 'scope_expansion' | 'threshold_adjustment' | 'working_as_intended';
  description: string;
  actionType: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Pattern grouping
// ---------------------------------------------------------------------------

/**
 * Group denial events by composite key: actionType + reason.
 * Returns a Map of `${actionType}::${reason}` → events.
 */
export function groupDenialsByPattern(events: DenialEvent[]): Map<string, DenialEvent[]> {
  const groups = new Map<string, DenialEvent[]>();

  for (const event of events) {
    const key = `${event.actionType}::${event.reason}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(key, [event]);
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Resolution classification
// ---------------------------------------------------------------------------

/**
 * Classify what happened after a set of denial events in a session.
 *
 * - `escalation_granted`: an ActionEscalated event followed the denial in the same session
 * - `retried_differently`: after denial, a different action of same type succeeded in same session
 * - `session_abandoned`: denial was the last meaningful action (or near end of session)
 */
export function classifyResolution(
  events: DenialEvent[],
  allEvents: Array<{ kind: string; actionType?: string; timestamp?: number; runId?: string }>
): DenialResolution {
  if (events.length === 0) return 'session_abandoned';

  // Collect all run IDs that experienced this denial
  const runIds = new Set(events.map((e) => e.runId));

  // Check for escalation_granted: ActionEscalated follows a denial in any of these sessions
  for (const runId of runIds) {
    const sessionDenials = events.filter((e) => e.runId === runId);
    if (sessionDenials.length === 0) continue;

    const firstDenialTs = Math.min(...sessionDenials.map((e) => e.timestamp));

    const hasEscalation = allEvents.some(
      (e) =>
        e.kind === 'ActionEscalated' &&
        e.runId === runId &&
        e.timestamp !== undefined &&
        e.timestamp > firstDenialTs
    );

    if (hasEscalation) return 'escalation_granted';
  }

  // Check for retried_differently: ActionAllowed event for same actionType after the denial
  const deniedActionType = events[0]!.actionType;

  for (const runId of runIds) {
    const sessionDenials = events.filter((e) => e.runId === runId);
    if (sessionDenials.length === 0) continue;

    const lastDenialTs = Math.max(...sessionDenials.map((e) => e.timestamp));

    const hasSuccessAfter = allEvents.some(
      (e) =>
        e.kind === 'ActionAllowed' &&
        e.runId === runId &&
        e.actionType === deniedActionType &&
        e.timestamp !== undefined &&
        e.timestamp > lastDenialTs
    );

    if (hasSuccessAfter) return 'retried_differently';
  }

  // Default: session was abandoned (denial was final or near-final action)
  return 'session_abandoned';
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

/**
 * Score how confident we are that this pattern is a real recurring problem.
 *
 * High (0.8+): 3+ occurrences across 2+ distinct sessions (consistent frustration loop)
 * Medium (0.5–0.79): 2+ occurrences or single multi-denial session
 * Low (< 0.5): single occurrence or insufficient data
 */
export function scoreDenialConfidence(events: DenialEvent[]): number {
  if (events.length === 0) return 0;

  const distinctSessions = new Set(events.map((e) => e.runId)).size;
  const occurrences = events.length;

  if (occurrences >= 3 && distinctSessions >= 2) {
    // Strong signal: repeated across multiple sessions
    // Scale up toward 1.0 with more occurrences/sessions
    const occurrenceBonus = Math.min((occurrences - 3) * 0.02, 0.15);
    const sessionBonus = Math.min((distinctSessions - 2) * 0.02, 0.05);
    return Math.min(0.8 + occurrenceBonus + sessionBonus, 1.0);
  }

  if (occurrences >= 2 || (occurrences >= 1 && distinctSessions >= 1)) {
    // Moderate signal: seen more than once, or single session with one denial
    const base = occurrences >= 2 ? 0.55 : 0.35;
    const sessionBonus = distinctSessions >= 2 ? 0.1 : 0;
    return base + sessionBonus;
  }

  // Single occurrence
  return 0.2;
}

// ---------------------------------------------------------------------------
// Policy suggestions
// ---------------------------------------------------------------------------

/**
 * Generate actionable policy suggestions based on identified denial patterns.
 *
 * Rules:
 * - `retried_differently` with high confidence → suggest `allow_rule`
 * - `session_abandoned` with any confidence → suggest `scope_expansion` or `working_as_intended`
 * - `escalation_granted` → suggest `threshold_adjustment`
 * - Low-confidence patterns (≤ 0.5) → no suggestion
 * - Only returns suggestions with confidence > 0.5
 */
export function suggestPolicyChanges(patterns: DenialPattern[]): PolicySuggestion[] {
  const suggestions: PolicySuggestion[] = [];

  for (const pattern of patterns) {
    // Skip low-confidence patterns
    if (pattern.confidence <= 0.5) continue;

    switch (pattern.resolution) {
      case 'retried_differently': {
        suggestions.push({
          type: 'allow_rule',
          description:
            `Agents consistently retry \`${pattern.actionType}\` after denial for "${pattern.reason}". ` +
            `Consider adding a scoped allow rule or refining the deny condition to permit legitimate uses.`,
          actionType: pattern.actionType,
          confidence: pattern.confidence,
        });
        break;
      }

      case 'session_abandoned': {
        // High confidence abandoned sessions indicate overly aggressive policy
        if (pattern.confidence >= 0.7) {
          suggestions.push({
            type: 'scope_expansion',
            description:
              `Sessions consistently end after \`${pattern.actionType}\` is denied for "${pattern.reason}". ` +
              `This may indicate the policy is too restrictive — consider expanding the allowed scope or adjusting thresholds.`,
            actionType: pattern.actionType,
            confidence: pattern.confidence,
          });
        } else {
          suggestions.push({
            type: 'working_as_intended',
            description:
              `\`${pattern.actionType}\` denied for "${pattern.reason}" appears to be working as intended — ` +
              `sessions end cleanly without frustrated retries.`,
            actionType: pattern.actionType,
            confidence: pattern.confidence,
          });
        }
        break;
      }

      case 'escalation_granted': {
        suggestions.push({
          type: 'threshold_adjustment',
          description:
            `\`${pattern.actionType}\` denials for "${pattern.reason}" frequently result in escalation. ` +
            `Consider adjusting the escalation threshold or pre-authorizing this action under specific conditions.`,
          actionType: pattern.actionType,
          confidence: pattern.confidence,
        });
        break;
      }
    }
  }

  // Sort by confidence descending so most actionable suggestions appear first
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

// ---------------------------------------------------------------------------
// High-level analysis pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full denial learning pipeline on a set of raw denial events.
 *
 * Returns identified patterns with resolutions, confidence scores, and suggestions.
 */
export function analyzeDenialPatterns(
  denialEvents: DenialEvent[],
  allEvents: Array<{ kind: string; actionType?: string; timestamp?: number; runId?: string }>
): { patterns: DenialPattern[]; suggestions: PolicySuggestion[] } {
  const grouped = groupDenialsByPattern(denialEvents);
  const patterns: DenialPattern[] = [];

  for (const [, events] of grouped) {
    if (events.length === 0) continue;

    const first = events[0]!;
    const resolution = classifyResolution(events, allEvents);
    const confidence = scoreDenialConfidence(events);
    const sessions = [...new Set(events.map((e) => e.runId))];

    patterns.push({
      actionType: first.actionType,
      reason: first.reason,
      occurrences: events.length,
      resolution,
      confidence,
      sessions,
    });
  }

  // Sort patterns by occurrences descending
  patterns.sort((a, b) => b.occurrences - a.occurrences);

  const suggestions = suggestPolicyChanges(patterns);

  return { patterns, suggestions };
}
