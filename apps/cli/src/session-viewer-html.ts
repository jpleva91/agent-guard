// Session viewer HTML generator — produces a self-contained HTML file for
// interactive governance session visualization in a browser.

import type { ReplaySession } from '@red-codes/kernel';
import type { EvidenceSummary } from './evidence-summary.js';
import type { GovernanceDecisionRecord } from '@red-codes/core';
import type { DomainEvent } from '@red-codes/core';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeJsonEmbed(data: unknown): string {
  // JSON.stringify then escape </ sequences to prevent script tag injection.
  return JSON.stringify(data).replace(/<\//g, '<\\/');
}

function formatTs(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds % 60}s`;
}

export interface SessionHtmlOptions {
  /** Base URL of the live server (e.g. "http://localhost:4821"). When set, the page polls for new events. */
  liveEndpoint?: string;
}

export function generateSessionHtml(
  session: ReplaySession,
  summary: EvidenceSummary,
  decisions: GovernanceDecisionRecord[],
  events: readonly DomainEvent[],
  options?: SessionHtmlOptions
): string {
  const runId = escapeHtml(session.runId);
  const startTime = session.startEvent ? formatTs(session.startEvent.timestamp) : 'N/A';
  const duration = formatDuration(session.summary.durationMs);

  const liveEndpoint = options?.liveEndpoint;

  // Serialize all data for client-side rendering
  const embeddedData = safeJsonEmbed({
    session: {
      runId: session.runId,
      actions: session.actions,
      summary: session.summary,
      startEvent: session.startEvent,
      endEvent: session.endEvent,
    },
    summary,
    decisions,
    events,
    liveEndpoint: liveEndpoint || null,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentGuard Session — ${runId}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            bg: '#0F172A',
            surface: '#1E293B',
            'surface-light': '#334155',
            cta: '#22C55E',
            'cta-dark': '#16A34A',
            text: '#F8FAFC',
            muted: '#94A3B8',
            danger: '#EF4444',
            warning: '#F59E0B',
            info: '#3B82F6',
          },
          fontFamily: {
            mono: ['JetBrains Mono', 'monospace'],
            sans: ['IBM Plex Sans', 'sans-serif'],
          },
        },
      },
    };
  <\/script>
  <style>
    body {
      font-family: 'IBM Plex Sans', sans-serif;
      background: #0F172A;
      color: #F8FAFC;
      margin: 0;
    }
    code, pre, .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }
    .card {
      background: #1E293B;
      border-radius: 0.75rem;
      padding: 1.5rem;
      border: 1px solid #334155;
    }
    .card-sm {
      background: #1E293B;
      border-radius: 0.5rem;
      padding: 1rem;
      border: 1px solid #334155;
    }
    .badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-allowed { background: rgba(34,197,94,0.15); color: #22C55E; }
    .badge-denied { background: rgba(239,68,68,0.15); color: #EF4444; }
    .badge-escalated { background: rgba(245,158,11,0.15); color: #F59E0B; }
    .badge-executed { background: rgba(59,130,246,0.15); color: #3B82F6; }
    .badge-failed { background: rgba(239,68,68,0.15); color: #EF4444; }

    .timeline-dot {
      width: 12px; height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot-allowed { background: #22C55E; }
    .dot-denied { background: #EF4444; }
    .dot-escalated { background: #F59E0B; }

    .timeline-line {
      width: 2px;
      background: #334155;
      position: absolute;
      left: 5px;
      top: 12px;
      bottom: -1rem;
    }

    details summary { cursor: pointer; }
    details summary::-webkit-details-marker { display: none; }

    .escalation-step {
      flex: 1;
      text-align: center;
      padding: 0.5rem;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      font-weight: 600;
      opacity: 0.3;
      transition: opacity 0.3s;
    }
    .escalation-step.active { opacity: 1; }
    .escalation-NORMAL { background: rgba(34,197,94,0.2); color: #22C55E; }
    .escalation-ELEVATED { background: rgba(245,158,11,0.2); color: #F59E0B; }
    .escalation-HIGH { background: rgba(249,115,22,0.2); color: #F97316; }
    .escalation-LOCKDOWN { background: rgba(239,68,68,0.2); color: #EF4444; }

    .event-row:hover { background: #334155; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @media (max-width: 768px) {
      .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
    }
  </style>
</head>
<body class="bg-bg text-text min-h-screen">
  <div id="app" style="max-width:1200px; margin:0 auto; padding:2rem 1rem;">
    <!-- Header -->
    <header style="margin-bottom:2rem;">
      <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.5rem;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <h1 style="font-size:1.5rem; font-weight:700; margin:0;">AgentGuard Session Viewer</h1>
        <span id="live-badge" style="display:none; margin-left:auto; padding:0.25rem 0.75rem; border-radius:9999px; font-size:0.75rem; font-weight:600; background:rgba(34,197,94,0.15); color:#22C55E; animation:pulse 2s infinite;">LIVE</span>
      </div>
      <div class="font-mono" style="font-size:0.875rem; color:#94A3B8;">
        <span style="color:#F8FAFC; font-weight:500;">${runId}</span>
        <span style="margin:0 0.5rem;">&middot;</span>
        ${escapeHtml(startTime)}
        <span style="margin:0 0.5rem;">&middot;</span>
        Duration: ${escapeHtml(duration)}
      </div>
    </header>

    <!-- Summary Cards -->
    <section style="margin-bottom:2rem;">
      <div class="summary-grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:1rem;">
        <div class="card-sm" style="text-align:center;">
          <div style="font-size:2rem; font-weight:700;">${session.summary.totalActions}</div>
          <div style="color:#94A3B8; font-size:0.875rem;">Total Actions</div>
        </div>
        <div class="card-sm" style="text-align:center;">
          <div style="font-size:2rem; font-weight:700; color:#22C55E;">${session.summary.allowed}</div>
          <div style="color:#94A3B8; font-size:0.875rem;">Allowed</div>
        </div>
        <div class="card-sm" style="text-align:center;">
          <div style="font-size:2rem; font-weight:700; color:#EF4444;">${session.summary.denied}</div>
          <div style="color:#94A3B8; font-size:0.875rem;">Denied</div>
        </div>
        <div class="card-sm" style="text-align:center;">
          <div style="font-size:2rem; font-weight:700; color:#EF4444;">${summary.invariantViolations}</div>
          <div style="color:#94A3B8; font-size:0.875rem;">Violations</div>
        </div>
        <div class="card-sm" style="text-align:center;">
          <div style="font-size:2rem; font-weight:700; color:#F59E0B;">${summary.escalations}</div>
          <div style="color:#94A3B8; font-size:0.875rem;">Escalations</div>
        </div>
        <div class="card-sm" style="text-align:center;">
          <div style="font-size:2rem; font-weight:700; color:${summary.maxEscalationLevel === 'NORMAL' ? '#22C55E' : summary.maxEscalationLevel === 'ELEVATED' ? '#F59E0B' : '#EF4444'};">${escapeHtml(summary.maxEscalationLevel)}</div>
          <div style="color:#94A3B8; font-size:0.875rem;">Max Escalation</div>
        </div>
      </div>
    </section>

    <!-- Escalation Progression -->
    <section class="card" style="margin-bottom:2rem;" id="escalation-section">
      <h2 style="font-size:1.125rem; font-weight:600; margin:0 0 1rem;">Escalation Progression</h2>
      <div id="escalation-bar" style="display:flex; gap:0.5rem;"></div>
    </section>

    <!-- Action Timeline -->
    <section class="card" style="margin-bottom:2rem;">
      <h2 style="font-size:1.125rem; font-weight:600; margin:0 0 1rem;">Action Timeline</h2>
      <div id="action-timeline"></div>
    </section>

    <!-- Invariant Violations -->
    <section class="card" style="margin-bottom:2rem;" id="violations-section">
      <h2 style="font-size:1.125rem; font-weight:600; margin:0 0 1rem;">Invariant Violations</h2>
      <div id="violations-list"></div>
    </section>

    <!-- Action Type Breakdown -->
    <section class="card" style="margin-bottom:2rem;">
      <h2 style="font-size:1.125rem; font-weight:600; margin:0 0 1rem;">Action Type Breakdown</h2>
      <div id="action-breakdown"></div>
    </section>

    <!-- Raw Event Stream -->
    <section class="card" style="margin-bottom:2rem;">
      <details>
        <summary style="font-size:1.125rem; font-weight:600; display:flex; align-items:center; gap:0.5rem;">
          <span id="event-toggle-icon" style="transition:transform 0.2s;">&#9654;</span>
          Raw Event Stream
          <span style="font-size:0.75rem; color:#94A3B8; font-weight:400;" id="event-count"></span>
        </summary>
        <div id="event-stream" style="margin-top:1rem; max-height:600px; overflow-y:auto;"></div>
      </details>
    </section>

    <!-- Footer -->
    <footer style="text-align:center; color:#94A3B8; font-size:0.75rem; padding:1rem 0;">
      Generated by AgentGuard &middot; ${escapeHtml(startTime)}
    </footer>
  </div>

  <script>
    const DATA = ${embeddedData};

    // ---- Helpers ----
    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function relTime(ts) {
      const start = DATA.session.startEvent ? DATA.session.startEvent.timestamp : 0;
      const ms = ts - start;
      if (ms < 1000) return ms + 'ms';
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      if (m === 0) return s + 's';
      return m + 'm ' + (s % 60) + 's';
    }
    function prettyJson(obj) {
      return JSON.stringify(obj, null, 2);
    }

    // ---- Escalation Progression ----
    (function() {
      const levels = ['NORMAL', 'ELEVATED', 'HIGH', 'LOCKDOWN'];
      const maxLevel = DATA.summary.maxEscalationLevel || 'NORMAL';
      const maxIdx = levels.indexOf(maxLevel);
      const bar = document.getElementById('escalation-bar');
      levels.forEach(function(level, i) {
        const step = document.createElement('div');
        step.className = 'escalation-step escalation-' + level + (i <= maxIdx ? ' active' : '');
        step.textContent = level;
        bar.appendChild(step);
      });
      if (maxIdx <= 0 && DATA.summary.escalations === 0) {
        document.getElementById('escalation-section').style.display = 'none';
      }
    })();

    // ---- Action Timeline ----
    (function() {
      const container = document.getElementById('action-timeline');
      const actions = DATA.session.actions;
      if (!actions || actions.length === 0) {
        container.innerHTML = '<div style="color:#94A3B8;">No actions recorded in this session.</div>';
        return;
      }
      actions.forEach(function(action, idx) {
        const dotClass = !action.allowed ? 'dot-denied' : action.escalationEvent ? 'dot-escalated' : 'dot-allowed';
        const statusBadge = !action.allowed
          ? '<span class="badge badge-denied">DENIED</span>'
          : action.executed
            ? (action.succeeded
              ? '<span class="badge badge-allowed">EXECUTED</span>'
              : '<span class="badge badge-failed">FAILED</span>')
            : '<span class="badge badge-executed">ALLOWED</span>';

        const ts = action.requestedEvent ? relTime(action.requestedEvent.timestamp) : '';

        // Find matching decision record
        const decision = DATA.decisions.find(function(d) {
          return d.action && d.action.type === action.actionType && d.action.target === action.target;
        });

        let detailHtml = '';
        if (decision) {
          detailHtml = '<div class="card-sm" style="margin-top:0.75rem; font-size:0.8125rem;">';
          detailHtml += '<div style="display:grid; grid-template-columns:auto 1fr; gap:0.25rem 1rem;">';
          detailHtml += '<span style="color:#94A3B8;">Outcome:</span><span>' + esc(decision.outcome) + '</span>';
          if (decision.reason) detailHtml += '<span style="color:#94A3B8;">Reason:</span><span>' + esc(decision.reason) + '</span>';
          if (decision.intervention) detailHtml += '<span style="color:#94A3B8;">Intervention:</span><span>' + esc(decision.intervention) + '</span>';
          if (decision.policy && decision.policy.matchedPolicyName) {
            detailHtml += '<span style="color:#94A3B8;">Policy:</span><span>' + esc(decision.policy.matchedPolicyName) + '</span>';
          }
          if (decision.invariants && !decision.invariants.allHold) {
            const viols = decision.invariants.violations || [];
            detailHtml += '<span style="color:#94A3B8;">Invariants:</span><span style="color:#EF4444;">' +
              viols.map(function(v) { return esc(v.name) + ' (severity ' + v.severity + ')'; }).join(', ') + '</span>';
          }
          if (decision.simulation) {
            const sim = decision.simulation;
            detailHtml += '<span style="color:#94A3B8;">Simulation:</span><span>risk=' + esc(String(sim.riskLevel || 'unknown')) + ', blast=' + esc(String(sim.blastRadius || '?')) + '</span>';
          }
          if (decision.execution) {
            const ex = decision.execution;
            if (ex.executed) {
              detailHtml += '<span style="color:#94A3B8;">Execution:</span><span>' + (ex.success ? 'Success' : 'Failed') + (ex.durationMs != null ? ' (' + ex.durationMs + 'ms)' : '') + '</span>';
              if (ex.error) detailHtml += '<span style="color:#94A3B8;">Error:</span><span style="color:#EF4444;">' + esc(ex.error) + '</span>';
            }
          }
          if (decision.monitor) {
            const levels = ['NORMAL', 'ELEVATED', 'HIGH', 'LOCKDOWN'];
            detailHtml += '<span style="color:#94A3B8;">Monitor:</span><span>' + esc(levels[decision.monitor.escalationLevel] || String(decision.monitor.escalationLevel)) + ' (evals: ' + decision.monitor.totalEvaluations + ', denials: ' + decision.monitor.totalDenials + ')</span>';
          }
          detailHtml += '</div></div>';
        }

        // Governance events
        let govHtml = '';
        if (action.governanceEvents && action.governanceEvents.length > 0) {
          govHtml = '<div style="margin-top:0.5rem;">';
          action.governanceEvents.forEach(function(g) {
            const detail = g.reason || g.invariant || g.policy || '';
            govHtml += '<div style="font-size:0.8125rem; color:#F59E0B; padding:0.125rem 0;">&#9888; ' + esc(g.kind) + (detail ? ' — ' + esc(String(detail)) : '') + '</div>';
          });
          govHtml += '</div>';
        }

        const entryDiv = document.createElement('div');
        entryDiv.style.cssText = 'position:relative; padding-left:2rem; padding-bottom:1rem;';
        entryDiv.innerHTML =
          (idx < actions.length - 1 ? '<div class="timeline-line"></div>' : '') +
          '<div class="timeline-dot ' + dotClass + '" style="position:absolute; left:0; top:4px;"></div>' +
          '<details>' +
            '<summary style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">' +
              '<span class="font-mono" style="font-size:0.75rem; color:#94A3B8; min-width:4rem;">' + esc(ts) + '</span>' +
              '<span style="font-weight:500;">' + esc(action.actionType) + '</span>' +
              '<span style="color:#94A3B8; font-size:0.875rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:400px;">' + esc(action.target || '') + '</span>' +
              statusBadge +
            '</summary>' +
            govHtml +
            detailHtml +
          '</details>';
        container.appendChild(entryDiv);
      });
    })();

    // ---- Invariant Violations ----
    (function() {
      const container = document.getElementById('violations-list');
      const violationEvents = DATA.events.filter(function(e) { return e.kind === 'InvariantViolation'; });
      if (violationEvents.length === 0) {
        document.getElementById('violations-section').style.display = 'none';
        return;
      }
      violationEvents.forEach(function(v) {
        const div = document.createElement('div');
        div.className = 'card-sm';
        div.style.marginBottom = '0.5rem';
        div.innerHTML =
          '<div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">' +
            '<span style="color:#EF4444; font-weight:600;">&#9888; ' + esc(v.invariant || 'Unknown') + '</span>' +
            (v.severity != null ? '<span class="badge badge-denied">severity ' + esc(String(v.severity)) + '</span>' : '') +
          '</div>' +
          '<div style="font-size:0.8125rem; color:#94A3B8;">' +
            (v.expected ? 'Expected: ' + esc(String(v.expected)) : '') +
            (v.actual ? ' &middot; Actual: ' + esc(String(v.actual)) : '') +
          '</div>';
        container.appendChild(div);
      });
    })();

    // ---- Action Type Breakdown ----
    (function() {
      const container = document.getElementById('action-breakdown');
      const breakdown = DATA.summary.actionTypeBreakdown || {};
      const types = Object.keys(breakdown).sort();
      if (types.length === 0) {
        container.innerHTML = '<div style="color:#94A3B8;">No action types recorded.</div>';
        return;
      }
      let html = '<table style="width:100%; border-collapse:collapse; font-size:0.875rem;">';
      html += '<thead><tr style="border-bottom:1px solid #334155;">' +
        '<th style="text-align:left; padding:0.5rem; color:#94A3B8;">Action Type</th>' +
        '<th style="text-align:right; padding:0.5rem; color:#22C55E;">Allowed</th>' +
        '<th style="text-align:right; padding:0.5rem; color:#EF4444;">Denied</th>' +
        '</tr></thead><tbody>';
      types.forEach(function(t) {
        const c = breakdown[t];
        html += '<tr style="border-bottom:1px solid #1E293B;">' +
          '<td class="font-mono" style="padding:0.5rem;">' + esc(t) + '</td>' +
          '<td style="text-align:right; padding:0.5rem; color:#22C55E;">' + c.allowed + '</td>' +
          '<td style="text-align:right; padding:0.5rem; color:#EF4444;">' + c.denied + '</td>' +
          '</tr>';
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    })();

    // ---- Raw Event Stream (lazy-loaded) ----
    (function() {
      const container = document.getElementById('event-stream');
      const countEl = document.getElementById('event-count');
      const toggleIcon = document.getElementById('event-toggle-icon');
      const allEvents = DATA.events || [];
      countEl.textContent = '(' + allEvents.length + ' events)';

      const BATCH_SIZE = 100;
      let shown = 0;

      // Rotate toggle icon on open/close
      container.parentElement.addEventListener('toggle', function() {
        toggleIcon.style.transform = this.open ? 'rotate(90deg)' : '';
        if (this.open && shown === 0) renderBatch();
      });

      function renderBatch() {
        const end = Math.min(shown + BATCH_SIZE, allEvents.length);
        for (let i = shown; i < end; i++) {
          const ev = allEvents[i];
          const row = document.createElement('details');
          row.className = 'event-row';
          row.style.cssText = 'padding:0.375rem 0.5rem; border-bottom:1px solid #1E293B; font-size:0.8125rem; border-radius:0.25rem;';
          const kindColor = ev.kind.includes('Denied') || ev.kind.includes('Violation') || ev.kind.includes('Failed')
            ? '#EF4444'
            : ev.kind.includes('Allowed') || ev.kind.includes('Executed')
              ? '#22C55E'
              : ev.kind.includes('Escalat')
                ? '#F59E0B'
                : '#94A3B8';
          row.innerHTML =
            '<summary class="font-mono" style="display:flex; gap:1rem; align-items:center;">' +
              '<span style="color:#94A3B8; min-width:4rem;">' + esc(String(i + 1)) + '</span>' +
              '<span style="color:' + kindColor + '; font-weight:500; min-width:14rem;">' + esc(ev.kind) + '</span>' +
              '<span style="color:#94A3B8; font-size:0.75rem;">' + esc(new Date(ev.timestamp).toISOString().slice(11, 23)) + '</span>' +
            '</summary>' +
            '<pre class="font-mono" style="margin:0.5rem 0 0.5rem 5rem; padding:0.75rem; background:#0F172A; border-radius:0.375rem; font-size:0.75rem; overflow-x:auto; white-space:pre-wrap; word-break:break-all;">' + esc(prettyJson(ev)) + '</pre>';
          container.appendChild(row);
        }
        shown = end;
        // Show "load more" button if needed
        const existingBtn = container.querySelector('.load-more-btn');
        if (existingBtn) existingBtn.remove();
        if (shown < allEvents.length) {
          const btn = document.createElement('button');
          btn.className = 'load-more-btn';
          btn.style.cssText = 'display:block; margin:0.75rem auto; padding:0.5rem 1.5rem; background:#334155; color:#F8FAFC; border:1px solid #475569; border-radius:0.375rem; cursor:pointer; font-size:0.8125rem;';
          btn.textContent = 'Load more (' + (allEvents.length - shown) + ' remaining)';
          btn.onclick = renderBatch;
          container.appendChild(btn);
        }
      }
    })();

    // ---- Live polling (soft-refresh) ----
    // When DATA.liveEndpoint is set, polls the server for new events/decisions
    // and incrementally appends them to the DOM without a hard refresh.
    // All rendered strings pass through esc() to prevent injection.
    (function() {
      if (!DATA.liveEndpoint) return;

      var liveBadge = document.getElementById('live-badge');
      liveBadge.style.display = 'inline-block';

      var POLL_MS = 3000;
      var lastTimestamp = DATA.events.length > 0
        ? DATA.events[DATA.events.length - 1].timestamp
        : (DATA.session.startEvent ? DATA.session.startEvent.timestamp : 0);
      var lastDecisionTimestamp = DATA.decisions.length > 0
        ? DATA.decisions[DATA.decisions.length - 1].timestamp
        : 0;

      // References to containers for incremental appends
      var timelineContainer = document.getElementById('action-timeline');
      var eventStreamContainer = document.getElementById('event-stream');
      var eventCountEl = document.getElementById('event-count');
      var violationsContainer = document.getElementById('violations-list');
      var violationsSection = document.getElementById('violations-section');

      // Track whether the raw stream details panel is open
      var eventStreamDetails = eventStreamContainer ? eventStreamContainer.parentElement : null;
      var streamIsOpen = eventStreamDetails && eventStreamDetails.open;
      if (eventStreamDetails) {
        eventStreamDetails.addEventListener('toggle', function() {
          streamIsOpen = this.open;
        });
      }

      function updateSummaryCards(s) {
        var cards = document.querySelectorAll('.summary-grid .card-sm');
        if (cards.length >= 6) {
          cards[0].querySelector('div').textContent = String(s.totalActions);
          cards[1].querySelector('div').textContent = String(s.allowed);
          cards[2].querySelector('div').textContent = String(s.denied);
          cards[3].querySelector('div').textContent = String(s.invariantViolations);
          cards[4].querySelector('div').textContent = String(s.escalations);
          var maxEl = cards[5].querySelector('div');
          maxEl.textContent = s.maxEscalationLevel;
          maxEl.style.color = s.maxEscalationLevel === 'NORMAL' ? '#22C55E'
            : s.maxEscalationLevel === 'ELEVATED' ? '#F59E0B' : '#EF4444';
        }
      }

      function appendTimelineAction(action) {
        var dotClass = !action.allowed ? 'dot-denied' : action.escalationEvent ? 'dot-escalated' : 'dot-allowed';
        var statusText = !action.allowed ? 'DENIED'
          : action.executed ? (action.succeeded ? 'EXECUTED' : 'FAILED') : 'ALLOWED';
        var statusClass = !action.allowed ? 'badge-denied'
          : action.executed ? (action.succeeded ? 'badge-allowed' : 'badge-failed') : 'badge-executed';
        var ts = action.requestedEvent ? relTime(action.requestedEvent.timestamp) : '';

        // Add timeline-line to previous last entry
        var entries = timelineContainer.children;
        if (entries.length > 0) {
          var prev = entries[entries.length - 1];
          if (!prev.querySelector('.timeline-line')) {
            var line = document.createElement('div');
            line.className = 'timeline-line';
            prev.insertBefore(line, prev.firstChild);
          }
        }

        var entryDiv = document.createElement('div');
        entryDiv.style.cssText = 'position:relative; padding-left:2rem; padding-bottom:1rem;';

        var dot = document.createElement('div');
        dot.className = 'timeline-dot ' + dotClass;
        dot.style.cssText = 'position:absolute; left:0; top:4px;';
        entryDiv.appendChild(dot);

        var details = document.createElement('details');
        var summary = document.createElement('summary');
        summary.style.cssText = 'display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;';

        var tsSpan = document.createElement('span');
        tsSpan.className = 'font-mono';
        tsSpan.style.cssText = 'font-size:0.75rem; color:#94A3B8; min-width:4rem;';
        tsSpan.textContent = ts;
        summary.appendChild(tsSpan);

        var typeSpan = document.createElement('span');
        typeSpan.style.fontWeight = '500';
        typeSpan.textContent = action.actionType;
        summary.appendChild(typeSpan);

        var targetSpan = document.createElement('span');
        targetSpan.style.cssText = 'color:#94A3B8; font-size:0.875rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:400px;';
        targetSpan.textContent = action.target || '';
        summary.appendChild(targetSpan);

        var badge = document.createElement('span');
        badge.className = 'badge ' + statusClass;
        badge.textContent = statusText;
        summary.appendChild(badge);

        details.appendChild(summary);
        entryDiv.appendChild(details);
        timelineContainer.appendChild(entryDiv);
      }

      function appendEventRow(ev, idx) {
        var kindColor = ev.kind.includes('Denied') || ev.kind.includes('Violation') || ev.kind.includes('Failed')
          ? '#EF4444'
          : ev.kind.includes('Allowed') || ev.kind.includes('Executed')
            ? '#22C55E'
            : ev.kind.includes('Escalat')
              ? '#F59E0B'
              : '#94A3B8';

        var row = document.createElement('details');
        row.className = 'event-row';
        row.style.cssText = 'padding:0.375rem 0.5rem; border-bottom:1px solid #1E293B; font-size:0.8125rem; border-radius:0.25rem;';

        var summary = document.createElement('summary');
        summary.className = 'font-mono';
        summary.style.cssText = 'display:flex; gap:1rem; align-items:center;';

        var numSpan = document.createElement('span');
        numSpan.style.cssText = 'color:#94A3B8; min-width:4rem;';
        numSpan.textContent = String(idx + 1);
        summary.appendChild(numSpan);

        var kindSpan = document.createElement('span');
        kindSpan.style.cssText = 'color:' + kindColor + '; font-weight:500; min-width:14rem;';
        kindSpan.textContent = ev.kind;
        summary.appendChild(kindSpan);

        var timeSpan = document.createElement('span');
        timeSpan.style.cssText = 'color:#94A3B8; font-size:0.75rem;';
        timeSpan.textContent = new Date(ev.timestamp).toISOString().slice(11, 23);
        summary.appendChild(timeSpan);

        row.appendChild(summary);

        var pre = document.createElement('pre');
        pre.className = 'font-mono';
        pre.style.cssText = 'margin:0.5rem 0 0.5rem 5rem; padding:0.75rem; background:#0F172A; border-radius:0.375rem; font-size:0.75rem; overflow-x:auto; white-space:pre-wrap; word-break:break-all;';
        pre.textContent = prettyJson(ev);
        row.appendChild(pre);

        var loadMoreBtn = eventStreamContainer.querySelector('.load-more-btn');
        if (loadMoreBtn) {
          eventStreamContainer.insertBefore(row, loadMoreBtn);
        } else {
          eventStreamContainer.appendChild(row);
        }
      }

      function appendViolation(v) {
        violationsSection.style.display = '';
        var div = document.createElement('div');
        div.className = 'card-sm';
        div.style.marginBottom = '0.5rem';

        var header = document.createElement('div');
        header.style.cssText = 'display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;';
        var nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'color:#EF4444; font-weight:600;';
        nameSpan.textContent = '\u26A0 ' + (v.invariant || 'Unknown');
        header.appendChild(nameSpan);
        if (v.severity != null) {
          var sevBadge = document.createElement('span');
          sevBadge.className = 'badge badge-denied';
          sevBadge.textContent = 'severity ' + String(v.severity);
          header.appendChild(sevBadge);
        }
        div.appendChild(header);

        var detail = document.createElement('div');
        detail.style.cssText = 'font-size:0.8125rem; color:#94A3B8;';
        var parts = [];
        if (v.expected) parts.push('Expected: ' + String(v.expected));
        if (v.actual) parts.push('Actual: ' + String(v.actual));
        detail.textContent = parts.join(' \u00B7 ');
        div.appendChild(detail);

        violationsContainer.appendChild(div);
      }

      function poll() {
        fetch(DATA.liveEndpoint + '/api/poll?afterEvent=' + lastTimestamp + '&afterDecision=' + lastDecisionTimestamp)
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (!data) return;

            // Update summary cards
            if (data.summary) {
              updateSummaryCards(data.summary);
            }

            // Append new events
            var newEvents = data.events || [];
            if (newEvents.length > 0) {
              var baseIdx = DATA.events.length;
              for (var i = 0; i < newEvents.length; i++) {
                var ev = newEvents[i];
                DATA.events.push(ev);

                // Append to raw event stream if it has been opened
                if (streamIsOpen) {
                  appendEventRow(ev, baseIdx + i);
                }

                if (ev.kind === 'InvariantViolation') {
                  appendViolation(ev);
                }
              }
              lastTimestamp = newEvents[newEvents.length - 1].timestamp;
              eventCountEl.textContent = '(' + DATA.events.length + ' events)';
            }

            // Append new actions to timeline
            var newActions = data.actions || [];
            for (var j = 0; j < newActions.length; j++) {
              DATA.session.actions.push(newActions[j]);
              appendTimelineAction(newActions[j]);
            }

            // Update decisions
            var newDecisions = data.decisions || [];
            if (newDecisions.length > 0) {
              for (var k = 0; k < newDecisions.length; k++) {
                DATA.decisions.push(newDecisions[k]);
              }
              lastDecisionTimestamp = newDecisions[newDecisions.length - 1].timestamp;
            }

            liveBadge.style.display = 'inline-block';
            liveBadge.style.background = 'rgba(34,197,94,0.15)';
            liveBadge.style.color = '#22C55E';
            liveBadge.textContent = 'LIVE';
          })
          .catch(function() {
            liveBadge.style.background = 'rgba(245,158,11,0.15)';
            liveBadge.style.color = '#F59E0B';
            liveBadge.textContent = 'RECONNECTING';
          });
      }

      setInterval(poll, POLL_MS);
      setTimeout(poll, 500);
    })();
  <\/script>
</body>
</html>`;
}
