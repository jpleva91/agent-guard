import { describe, it, expect } from 'vitest';
import { parseSessionToolCalls, correlateWithGovernance } from '@red-codes/storage';

// ---------------------------------------------------------------------------
// parseSessionToolCalls
// ---------------------------------------------------------------------------

describe('parseSessionToolCalls', () => {
  it('extracts tool_use entries from JSONL lines', () => {
    const lines = [
      JSON.stringify({ type: 'tool_use', name: 'Bash', timestamp: 1000 }),
      JSON.stringify({ type: 'tool_use', name: 'Read', timestamp: 2000 }),
      JSON.stringify({ type: 'tool_use', name: 'Write', timestamp: 3000 }),
    ];

    const result = parseSessionToolCalls(lines);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ tool: 'Bash', timestamp: 1000 });
    expect(result[1]).toMatchObject({ tool: 'Read', timestamp: 2000 });
    expect(result[2]).toMatchObject({ tool: 'Write', timestamp: 3000 });
  });

  it('skips non-tool_use entries', () => {
    const lines = [
      JSON.stringify({ type: 'text', content: 'Hello world' }),
      JSON.stringify({ type: 'tool_use', name: 'Bash', timestamp: 1000 }),
      JSON.stringify({ type: 'tool_result', tool_use_id: 'id_1', content: 'done' }),
    ];

    const result = parseSessionToolCalls(lines);

    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe('Bash');
  });

  it('handles malformed lines gracefully', () => {
    const lines = [
      'not-valid-json',
      JSON.stringify({ type: 'tool_use', name: 'Bash', timestamp: 1000 }),
      '{broken',
      '',
    ];

    const result = parseSessionToolCalls(lines);

    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe('Bash');
  });

  it('returns empty array for no tool_use entries', () => {
    const lines = [
      JSON.stringify({ type: 'text', content: 'Hello' }),
      JSON.stringify({ type: 'tool_result', content: 'result' }),
    ];

    const result = parseSessionToolCalls(lines);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(parseSessionToolCalls([])).toHaveLength(0);
  });

  it('skips tool_use entries without a name field', () => {
    const lines = [
      JSON.stringify({ type: 'tool_use', id: 'no_name' }),
      JSON.stringify({ type: 'tool_use', name: 'Bash', timestamp: 1000 }),
    ];

    const result = parseSessionToolCalls(lines);
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe('Bash');
  });

  it('parses string timestamps', () => {
    const ts = '2025-01-01T00:00:00.000Z';
    const lines = [JSON.stringify({ type: 'tool_use', name: 'Bash', timestamp: ts })];

    const result = parseSessionToolCalls(lines);
    expect(result[0].timestamp).toBe(new Date(ts).getTime());
  });

  it('extracts session_id when present', () => {
    const lines = [
      JSON.stringify({ type: 'tool_use', name: 'Bash', timestamp: 1000, session_id: 'sess_abc' }),
    ];

    const result = parseSessionToolCalls(lines);
    expect(result[0].sessionId).toBe('sess_abc');
  });
});

// ---------------------------------------------------------------------------
// correlateWithGovernance
// ---------------------------------------------------------------------------

describe('correlateWithGovernance', () => {
  it('marks tool calls as governed when matching governance event exists within window', () => {
    const toolCalls = [{ tool: 'Bash', timestamp: 1000 }];
    const govEvents = [{ kind: 'ActionRequested', timestamp: 1200 }]; // 200ms after — within 5000ms

    const result = correlateWithGovernance(toolCalls, govEvents);

    expect(result.governedActions).toBe(1);
    expect(result.ungoverned).toBe(0);
  });

  it('marks tool calls as ungoverned when no governance event exists', () => {
    const toolCalls = [{ tool: 'Bash', timestamp: 1000 }];
    const govEvents: Array<{ kind: string; timestamp?: number }> = [];

    const result = correlateWithGovernance(toolCalls, govEvents);

    expect(result.governedActions).toBe(0);
    expect(result.ungoverned).toBe(1);
  });

  it('marks tool calls as ungoverned when governance event is outside window', () => {
    const toolCalls = [{ tool: 'Bash', timestamp: 1000 }];
    const govEvents = [{ kind: 'ActionRequested', timestamp: 10000 }]; // 9000ms after — outside default 5000ms

    const result = correlateWithGovernance(toolCalls, govEvents);

    expect(result.governedActions).toBe(0);
    expect(result.ungoverned).toBe(1);
  });

  it('respects custom windowMs option', () => {
    const toolCalls = [{ tool: 'Bash', timestamp: 1000 }];
    const govEvents = [{ kind: 'ActionRequested', timestamp: 2500 }]; // 1500ms after

    // With 1000ms window — outside
    const narrow = correlateWithGovernance(toolCalls, govEvents, { windowMs: 1000 });
    expect(narrow.governedActions).toBe(0);

    // With 2000ms window — inside
    const wide = correlateWithGovernance(toolCalls, govEvents, { windowMs: 2000 });
    expect(wide.governedActions).toBe(1);
  });

  it('computes correct adoption percentage', () => {
    const toolCalls = [
      { tool: 'Bash', timestamp: 1000 },
      { tool: 'Read', timestamp: 5000 },
      { tool: 'Write', timestamp: 9000 },
      { tool: 'Glob', timestamp: 20000 }, // far from any event
    ];
    const govEvents = [
      { kind: 'ActionRequested', timestamp: 1100 }, // governs Bash
      { kind: 'ActionAllowed', timestamp: 5100 }, // governs Read
      { kind: 'ActionDenied', timestamp: 9100 }, // governs Write
      // Glob has no matching event
    ];

    const result = correlateWithGovernance(toolCalls, govEvents);

    expect(result.totalToolCalls).toBe(4);
    expect(result.governedActions).toBe(3);
    expect(result.ungoverned).toBe(1);
    expect(result.adoptionPct).toBeCloseTo(75, 5);
  });

  it('groups by tool name in byTool', () => {
    const toolCalls = [
      { tool: 'Bash', timestamp: 1000 },
      { tool: 'Bash', timestamp: 2000 },
      { tool: 'Read', timestamp: 10000 },
    ];
    const govEvents = [
      { kind: 'ActionRequested', timestamp: 1100 }, // governs Bash at 1000
      { kind: 'ActionAllowed', timestamp: 2100 }, // governs Bash at 2000
      // Read at 10000 has no governance event
    ];

    const result = correlateWithGovernance(toolCalls, govEvents);

    expect(result.byTool['Bash']).toEqual({ total: 2, governed: 2 });
    expect(result.byTool['Read']).toEqual({ total: 1, governed: 0 });
  });

  it('returns 0 adoption percentage when there are no tool calls', () => {
    const result = correlateWithGovernance([], []);
    expect(result.adoptionPct).toBe(0);
    expect(result.totalToolCalls).toBe(0);
    expect(result.governedActions).toBe(0);
    expect(result.ungoverned).toBe(0);
  });

  it('only considers ActionRequested, ActionAllowed, ActionDenied kinds', () => {
    const toolCalls = [{ tool: 'Bash', timestamp: 1000 }];
    const govEvents = [
      { kind: 'RunStarted', timestamp: 1100 }, // irrelevant kind
      { kind: 'PolicyDenied', timestamp: 1200 }, // irrelevant kind
    ];

    const result = correlateWithGovernance(toolCalls, govEvents);

    expect(result.governedActions).toBe(0);
  });

  it('accepts governance events without timestamps gracefully', () => {
    const toolCalls = [{ tool: 'Bash', timestamp: 1000 }];
    const govEvents = [{ kind: 'ActionRequested' }]; // no timestamp

    const result = correlateWithGovernance(toolCalls, govEvents);

    // Event without timestamp cannot be correlated — should be ungoverned
    expect(result.governedActions).toBe(0);
    expect(result.ungoverned).toBe(1);
  });
});
