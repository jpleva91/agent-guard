/**
 * Generates a self-contained HTML timeline viewer for governance sessions.
 *
 * The timeline renders governance events chronologically with:
 * - Color-coded event kinds (governance, lifecycle, safety, reference monitor)
 * - Action lifecycle grouping (propose → evaluate → execute → emit)
 * - Filtering by event kind via checkboxes
 * - Expandable event details
 * - Session summary header
 * - Escalation state indicators
 */

import type { ReplaySession, ReplayAction } from '@red-codes/kernel';
import type { DomainEvent } from '@red-codes/core';

export interface TimelineOptions {
  /** Filter to only denied actions */
  deniedOnly?: boolean;
  /** Filter events by kind */
  filterKind?: string;
}

/** Map event kinds to visual categories for color-coding. */
const EVENT_CATEGORIES: Record<string, string> = {
  PolicyDenied: 'governance',
  UnauthorizedAction: 'governance',
  InvariantViolation: 'governance',
  RunStarted: 'lifecycle',
  RunEnded: 'lifecycle',
  CheckpointReached: 'lifecycle',
  StateChanged: 'lifecycle',
  BlastRadiusExceeded: 'safety',
  MergeGuardFailure: 'safety',
  EvidencePackGenerated: 'safety',
  ActionRequested: 'reference',
  ActionAllowed: 'reference',
  ActionDenied: 'reference',
  ActionEscalated: 'reference',
  ActionExecuted: 'reference',
  ActionFailed: 'reference',
  DecisionRecorded: 'decision',
  SimulationCompleted: 'decision',
  TokenOptimizationApplied: 'lifecycle',
  HeartbeatEmitted: 'lifecycle',
  HeartbeatMissed: 'safety',
  AgentUnresponsive: 'safety',
};

function categorize(kind: string): string {
  return EVENT_CATEGORIES[kind] ?? 'other';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTimestamp(ts: number, baseTs: number): string {
  const delta = ts - baseTs;
  if (delta < 0) return '00:00.000';
  const totalMs = Math.floor(delta);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function buildActionHtml(action: ReplayAction, baseTs: number, index: number): string {
  const statusClass = action.allowed ? (action.succeeded ? 'allowed' : 'failed') : 'denied';
  const statusLabel = action.allowed
    ? action.succeeded
      ? 'ALLOWED'
      : action.executed
        ? 'FAILED'
        : 'DRY-RUN'
    : 'DENIED';

  const time = formatTimestamp(action.requestedEvent.timestamp, baseTs);
  const target = escapeHtml(action.target || '(none)');
  const actionType = escapeHtml(action.actionType);

  const governanceHtml = action.governanceEvents
    .map((g) => {
      const reason = (g.reason as string) || (g.invariant as string) || (g.policy as string) || '';
      return `<div class="violation">${escapeHtml(g.kind)}${reason ? ` — ${escapeHtml(String(reason))}` : ''}</div>`;
    })
    .join('');

  const decisionReason = action.decisionEvent ? (action.decisionEvent.reason as string) || '' : '';

  const simHtml = action.simulationEvent
    ? `<div class="sim-badge">risk=${escapeHtml(String((action.simulationEvent.riskLevel as string) || '?'))} blast=${(action.simulationEvent.blastRadius as number) ?? '?'}</div>`
    : '';

  // Build lifecycle steps
  const steps: string[] = [];
  steps.push(`<span class="step step-requested" title="Requested at ${time}">PROPOSE</span>`);
  if (action.decisionEvent) {
    const cat = categorize(action.decisionEvent.kind);
    steps.push(
      `<span class="step step-${cat}" title="${escapeHtml(action.decisionEvent.kind)}">EVALUATE</span>`
    );
  }
  if (action.executionEvent) {
    const cat = action.succeeded ? 'allowed' : 'failed';
    steps.push(`<span class="step step-${cat}">EXECUTE</span>`);
  }
  steps.push(`<span class="step step-emit">EMIT</span>`);

  return `<div class="action action-${statusClass}" data-index="${index}" data-kind="${actionType}" data-status="${statusClass}">
  <div class="action-header" onclick="toggleDetail(${index})">
    <span class="action-time">${time}</span>
    <span class="action-badge badge-${statusClass}">${statusLabel}</span>
    <span class="action-type">${actionType}</span>
    <span class="action-target">${target}</span>
    <span class="action-expand" id="expand-${index}">&#9654;</span>
  </div>
  <div class="action-lifecycle">${steps.join('<span class="arrow">→</span>')}</div>
  <div class="action-detail" id="detail-${index}" style="display:none;">
    ${decisionReason ? `<div class="detail-row"><strong>Reason:</strong> ${escapeHtml(decisionReason)}</div>` : ''}
    ${simHtml}
    ${governanceHtml}
    <div class="detail-row dim">Events in group: ${action.governanceEvents.length + (action.decisionEvent ? 1 : 0) + (action.executionEvent ? 1 : 0) + (action.simulationEvent ? 1 : 0) + 1}</div>
  </div>
</div>`;
}

export function generateTimelineHtml(
  session: ReplaySession,
  events: readonly DomainEvent[],
  options: TimelineOptions = {}
): string {
  const s = session.summary;
  const baseTs = events.length > 0 ? events[0].timestamp : 0;

  let actions = [...session.actions];
  if (options.deniedOnly) {
    actions = actions.filter((a) => !a.allowed);
  }

  // Collect unique action types for filter
  const actionTypeSet = new Set<string>();
  for (const a of actions) {
    actionTypeSet.add(a.actionType);
  }
  const actionTypes = [...actionTypeSet].sort();

  // Build filter checkboxes HTML
  const filterHtml = actionTypes
    .map(
      (t) =>
        `<label class="filter-label"><input type="checkbox" checked onchange="applyFilters()" data-action-type="${escapeHtml(t)}"> ${escapeHtml(t)}</label>`
    )
    .join('\n');

  const statusFilterHtml = ['allowed', 'denied', 'failed']
    .map(
      (s) =>
        `<label class="filter-label"><input type="checkbox" checked onchange="applyFilters()" data-status="${s}"> ${s.toUpperCase()}</label>`
    )
    .join('\n');

  // Build action timeline HTML
  const actionsHtml = actions.map((a, i) => buildActionHtml(a, baseTs, i)).join('\n');

  // Duration formatting
  const durationSec = Math.floor(s.durationMs / 1000);
  const durationMin = Math.floor(durationSec / 60);
  const durationStr = durationMin > 0 ? `${durationMin}m ${durationSec % 60}s` : `${durationSec}s`;

  // Event kind distribution for the summary chart
  const kindCounts: Record<string, number> = {};
  for (const e of events) {
    kindCounts[e.kind] = (kindCounts[e.kind] || 0) + 1;
  }
  const topKinds = Object.entries(kindCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const maxKindCount = topKinds.length > 0 ? topKinds[0][1] : 1;

  const kindBarsHtml = topKinds
    .map(([kind, count]) => {
      const pct = Math.round((count / maxKindCount) * 100);
      const cat = categorize(kind);
      return `<div class="bar-row"><span class="bar-label">${escapeHtml(kind)}</span><div class="bar-track"><div class="bar-fill bar-${cat}" style="width:${pct}%"></div></div><span class="bar-count">${count}</span></div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AgentGuard Timeline — ${escapeHtml(session.runId)}</title>
<style>
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --dim: #8b949e;
    --green: #3fb950;
    --red: #f85149;
    --yellow: #d29922;
    --blue: #58a6ff;
    --purple: #bc8cff;
    --orange: #f0883e;
    --cyan: #39d2c0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
    line-height: 1.5;
  }
  .container { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
  h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
  .run-id { color: var(--dim); font-size: 12px; margin-bottom: 20px; }

  /* Summary cards */
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    text-align: center;
  }
  .card-value { font-size: 24px; font-weight: 700; }
  .card-label { color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .card-green .card-value { color: var(--green); }
  .card-red .card-value { color: var(--red); }
  .card-yellow .card-value { color: var(--yellow); }
  .card-blue .card-value { color: var(--blue); }

  /* Event distribution */
  .distribution { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 24px; }
  .distribution h2 { font-size: 14px; margin-bottom: 12px; color: var(--dim); }
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .bar-label { width: 180px; text-align: right; font-size: 11px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { flex: 1; height: 14px; background: var(--bg); border-radius: 3px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
  .bar-count { width: 40px; text-align: right; font-size: 11px; color: var(--dim); }
  .bar-governance { background: var(--red); }
  .bar-lifecycle { background: var(--blue); }
  .bar-safety { background: var(--orange); }
  .bar-reference { background: var(--purple); }
  .bar-decision { background: var(--cyan); }
  .bar-other { background: var(--dim); }

  /* Filters */
  .filters { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; }
  .filters h3 { font-size: 12px; color: var(--dim); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  .filter-group { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 8px; }
  .filter-label { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text); cursor: pointer; }
  .filter-label input { cursor: pointer; }

  /* Timeline */
  .timeline { position: relative; padding-left: 2px; }
  .action {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 8px;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .action:hover { border-color: var(--blue); }
  .action-denied { border-left: 3px solid var(--red); }
  .action-allowed { border-left: 3px solid var(--green); }
  .action-failed { border-left: 3px solid var(--yellow); }
  .action-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    cursor: pointer;
    user-select: none;
  }
  .action-header:hover { background: rgba(255,255,255,0.02); }
  .action-time { font-size: 11px; color: var(--dim); min-width: 80px; }
  .action-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .badge-allowed { background: rgba(63,185,80,0.15); color: var(--green); }
  .badge-denied { background: rgba(248,81,73,0.15); color: var(--red); }
  .badge-failed { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .action-type { font-weight: 600; }
  .action-target { color: var(--dim); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .action-expand { color: var(--dim); font-size: 10px; transition: transform 0.2s; }
  .action-expand.open { transform: rotate(90deg); }

  .action-lifecycle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px 8px;
    font-size: 10px;
  }
  .step {
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .step-requested { background: rgba(88,166,255,0.15); color: var(--blue); }
  .step-reference { background: rgba(188,140,255,0.15); color: var(--purple); }
  .step-allowed { background: rgba(63,185,80,0.15); color: var(--green); }
  .step-failed { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .step-emit { background: rgba(57,210,192,0.15); color: var(--cyan); }
  .arrow { color: var(--dim); font-size: 10px; }

  .action-detail { padding: 8px 14px 12px; border-top: 1px solid var(--border); }
  .detail-row { margin-bottom: 4px; font-size: 12px; }
  .dim { color: var(--dim); }
  .violation {
    background: rgba(248,81,73,0.1);
    border-left: 2px solid var(--red);
    padding: 4px 8px;
    margin: 4px 0;
    font-size: 12px;
    color: var(--red);
  }
  .sim-badge {
    font-size: 11px;
    color: var(--orange);
    margin: 4px 0;
  }

  /* Scrubber */
  .scrubber { margin-bottom: 16px; }
  .scrubber input[type="range"] {
    width: 100%;
    accent-color: var(--blue);
  }
  .scrubber-label { display: flex; justify-content: space-between; font-size: 11px; color: var(--dim); }

  /* Footer */
  .footer { text-align: center; color: var(--dim); font-size: 11px; margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border); }
</style>
</head>
<body>
<div class="container">
  <h1>AgentGuard Timeline Viewer</h1>
  <div class="run-id">Run: ${escapeHtml(session.runId)} &middot; ${s.totalActions} actions &middot; ${events.length} events &middot; ${durationStr}</div>

  <div class="summary">
    <div class="card card-blue">
      <div class="card-value">${s.totalActions}</div>
      <div class="card-label">Actions</div>
    </div>
    <div class="card card-green">
      <div class="card-value">${s.allowed}</div>
      <div class="card-label">Allowed</div>
    </div>
    <div class="card card-red">
      <div class="card-value">${s.denied}</div>
      <div class="card-label">Denied</div>
    </div>
    <div class="card card-yellow">
      <div class="card-value">${s.violations}</div>
      <div class="card-label">Violations</div>
    </div>
    <div class="card">
      <div class="card-value">${s.escalations}</div>
      <div class="card-label">Escalations</div>
    </div>
    <div class="card">
      <div class="card-value">${s.simulationsRun}</div>
      <div class="card-label">Simulations</div>
    </div>
  </div>

  <div class="distribution">
    <h2>Event Distribution</h2>
    ${kindBarsHtml}
  </div>

  <div class="scrubber">
    <input type="range" min="0" max="${Math.max(actions.length - 1, 0)}" value="${Math.max(actions.length - 1, 0)}" id="scrubber" oninput="scrubTo(this.value)">
    <div class="scrubber-label">
      <span>Start</span>
      <span id="scrubber-pos">${actions.length} / ${actions.length} actions</span>
      <span>End</span>
    </div>
  </div>

  <div class="filters">
    <h3>Filter by Action Type</h3>
    <div class="filter-group" id="type-filters">
      ${filterHtml}
    </div>
    <h3>Filter by Status</h3>
    <div class="filter-group" id="status-filters">
      ${statusFilterHtml}
    </div>
  </div>

  <div class="timeline" id="timeline">
    ${actionsHtml}
  </div>

  <div class="footer">
    Generated by AgentGuard &middot; ${new Date().toISOString().slice(0, 19)}Z
  </div>
</div>

<script>
function toggleDetail(index) {
  const detail = document.getElementById('detail-' + index);
  const expand = document.getElementById('expand-' + index);
  if (!detail) return;
  const visible = detail.style.display !== 'none';
  detail.style.display = visible ? 'none' : 'block';
  if (expand) expand.classList.toggle('open', !visible);
}

function applyFilters() {
  const typeChecks = document.querySelectorAll('#type-filters input[type=checkbox]');
  const statusChecks = document.querySelectorAll('#status-filters input[type=checkbox]');
  const allowedTypes = new Set();
  const allowedStatuses = new Set();
  typeChecks.forEach(function(cb) { if (cb.checked) allowedTypes.add(cb.dataset.actionType); });
  statusChecks.forEach(function(cb) { if (cb.checked) allowedStatuses.add(cb.dataset.status); });
  const actions = document.querySelectorAll('.action');
  actions.forEach(function(el) {
    const kind = el.dataset.kind;
    const status = el.dataset.status;
    el.style.display = (allowedTypes.has(kind) && allowedStatuses.has(status)) ? '' : 'none';
  });
}

function scrubTo(value) {
  const actions = document.querySelectorAll('.action');
  const n = parseInt(value, 10) + 1;
  document.getElementById('scrubber-pos').textContent = n + ' / ' + actions.length + ' actions';
  actions.forEach(function(el, i) {
    el.style.opacity = i <= parseInt(value, 10) ? '1' : '0.2';
  });
}
</script>
</body>
</html>`;
}
