// Adoption analytics — cross-reference Claude session tool calls with AgentGuard governance events.
// Measures what percentage of agent tool calls actually go through governance.

export interface ToolCallRecord {
  tool: string;
  timestamp: number;
  sessionId?: string;
}

export interface CorrelationResult {
  totalToolCalls: number;
  governedActions: number;
  ungoverned: number;
  adoptionPct: number;
  byTool: Record<string, { total: number; governed: number }>;
}

/**
 * Parse Claude session JSONL lines and extract tool_use entries.
 * Each line is a JSON object; look for `type: "tool_use"` and extract `name` as `tool`.
 * Handles malformed lines gracefully (skips them).
 */
export function parseSessionToolCalls(lines: string[]): ToolCallRecord[] {
  const records: ToolCallRecord[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      // Malformed line — skip
      continue;
    }

    if (!obj || typeof obj !== 'object') continue;

    const rec = obj as Record<string, unknown>;

    if (rec['type'] !== 'tool_use') continue;
    if (typeof rec['name'] !== 'string') continue;

    const tool = rec['name'];
    const timestamp =
      typeof rec['timestamp'] === 'number'
        ? rec['timestamp']
        : typeof rec['timestamp'] === 'string'
          ? new Date(rec['timestamp']).getTime()
          : Date.now();

    const sessionId = typeof rec['session_id'] === 'string' ? rec['session_id'] : undefined;

    records.push({ tool, timestamp, sessionId });
  }

  return records;
}

/**
 * Cross-reference tool calls with governance events to compute adoption metrics.
 *
 * A tool call is "governed" if there is a matching governance event of kind
 * `ActionRequested`, `ActionAllowed`, or `ActionDenied` within the time window
 * (default: 5000ms before or after the tool call timestamp).
 */
export function correlateWithGovernance(
  toolCalls: ToolCallRecord[],
  govEvents: Array<{ kind: string; actionType?: string; timestamp?: number }>,
  options?: { windowMs?: number },
): CorrelationResult {
  const windowMs = options?.windowMs ?? 5000;

  // Pre-filter governance events to only the relevant kinds
  const relevantEvents = govEvents.filter(
    (e) =>
      e.kind === 'ActionRequested' || e.kind === 'ActionAllowed' || e.kind === 'ActionDenied',
  );

  const byTool: Record<string, { total: number; governed: number }> = {};
  let governedActions = 0;

  for (const call of toolCalls) {
    // Initialise byTool entry
    if (!byTool[call.tool]) {
      byTool[call.tool] = { total: 0, governed: 0 };
    }
    byTool[call.tool].total++;

    // Check if any governance event falls within the window
    const isGoverned = relevantEvents.some((evt) => {
      if (evt.timestamp === undefined || evt.timestamp === null) return false;
      const diff = Math.abs(evt.timestamp - call.timestamp);
      return diff <= windowMs;
    });

    if (isGoverned) {
      governedActions++;
      byTool[call.tool].governed++;
    }
  }

  const totalToolCalls = toolCalls.length;
  const ungoverned = totalToolCalls - governedActions;
  const adoptionPct = totalToolCalls > 0 ? (governedActions / totalToolCalls) * 100 : 0;

  return {
    totalToolCalls,
    governedActions,
    ungoverned,
    adoptionPct,
    byTool,
  };
}
