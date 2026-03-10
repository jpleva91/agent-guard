/**
 * replay command — Replay execution events from a session.
 *
 * Supports two modes:
 * 1. Governance replay (--run <runId> or --last): Loads JSONL events from the
 *    AgentGuard event store and reconstructs action encounters using the replay engine.
 * 2. Execution log replay (default): Loads NDJSON execution event logs for raw
 *    event-level display.
 */

import type { Command } from 'commander';
import pino from 'pino';
import { createExecutionEventLog } from '../../core/execution-log/event-log.js';
import { loadReplaySession, listRunIds, getLatestRunId } from '../../kernel/replay-engine.js';
import type { ReplaySession, ReplayAction } from '../../kernel/replay-engine.js';

export function registerReplayCommand(program: Command): void {
  program
    .command('replay')
    .description('Replay execution events from a session log')
    .argument('[file]', 'NDJSON event log file to replay (legacy mode)')
    .option('-f, --from <eventId>', 'Start replay from this event ID')
    .option('--kind <kind>', 'Filter by event kind')
    .option('--actor <actor>', 'Filter by actor (human, agent, system)')
    .option('--limit <n>', 'Maximum events to display', '50')
    .option('-r, --run <runId>', 'Replay a governance run by ID')
    .option('-l, --last', 'Replay the most recent governance run')
    .option('--list-runs', 'List available governance runs')
    .option('--summary', 'Show session summary only')
    .option('--denied-only', 'Show only denied actions')
    .option('--base-dir <dir>', 'Base directory for event storage', '.agentguard')
    .action(
      async (
        file: string | undefined,
        options: {
          from?: string;
          kind?: string;
          actor?: string;
          limit: string;
          run?: string;
          last?: boolean;
          listRuns?: boolean;
          summary?: boolean;
          deniedOnly?: boolean;
          baseDir: string;
        }
      ) => {
        // --- Governance replay mode ---
        if (options.listRuns) {
          renderRunList(options.baseDir);
          return;
        }

        if (options.run || options.last) {
          const runId = options.run || getLatestRunId(options.baseDir);
          if (!runId) {
            console.error('\n  No governance runs found.');
            console.error('  Run "agentguard guard" first to generate events.\n');
            return;
          }

          const session = loadReplaySession(runId, { baseDir: options.baseDir });
          if (!session) {
            console.error(`\n  Run "${runId}" not found or has no events.\n`);
            return;
          }

          if (options.summary) {
            renderSessionSummary(session);
          } else {
            renderGovernanceReplay(session, { deniedOnly: options.deniedOnly });
          }
          return;
        }

        // --- Legacy execution log replay mode ---
        const targetFile = file || '.events.ndjson';
        const logger = pino({ name: 'agentguard-replay' });
        const fs = await import('node:fs');

        if (!fs.existsSync(targetFile)) {
          logger.error({ file: targetFile }, 'Event log file not found');
          console.error(`Event log file not found: ${targetFile}`);
          console.error('Run "agentguard guard" first to generate events.');
          return;
        }

        const log = createExecutionEventLog();
        const ndjson = fs.readFileSync(targetFile, 'utf-8');
        const loaded = log.fromNDJSON(ndjson);
        logger.info({ loaded }, 'Events loaded');

        let events = options.from ? log.replay(options.from) : log.replay();

        if (options.kind) {
          events = events.filter((e) => e.kind === options.kind);
        }
        if (options.actor) {
          events = events.filter((e) => e.actor === options.actor);
        }

        const limit = parseInt(options.limit, 10);
        const displayed = events.slice(0, limit);

        console.log(`\nReplaying ${displayed.length} of ${events.length} events:\n`);

        for (const event of displayed) {
          const time = new Date(event.timestamp).toISOString();
          const ctx = event.context.file ? ` (${event.context.file})` : '';
          const caused = event.causedBy ? ` <- ${event.causedBy}` : '';
          console.log(`  [${time}] ${event.actor}/${event.source} ${event.kind}${ctx}${caused}`);
          console.log(`    id: ${event.id}`);
          if (Object.keys(event.payload).length > 0) {
            console.log(`    payload: ${JSON.stringify(event.payload)}`);
          }
          console.log();
        }

        if (events.length > limit) {
          console.log(`  ... and ${events.length - limit} more events`);
        }
      }
    );
}

// ---------------------------------------------------------------------------
// Governance replay rendering
// ---------------------------------------------------------------------------

function renderRunList(baseDir: string): void {
  const runIds = listRunIds(baseDir);
  if (runIds.length === 0) {
    console.error('\n  No governance runs found.');
    console.error('  Run "agentguard guard" first to generate events.\n');
    return;
  }

  console.log('\n  Available governance runs:\n');
  for (const id of runIds.slice(0, 20)) {
    console.log(`    ${id}`);
  }
  if (runIds.length > 20) {
    console.log(`    ... and ${runIds.length - 20} more`);
  }
  console.log('\n  Usage: agentguard replay --run <runId>\n');
}

function renderSessionSummary(session: ReplaySession): void {
  const s = session.summary;
  console.log(`\n  Governance Session Summary`);
  console.log(`  Run: ${session.runId}`);
  console.log(`  Events: ${session.events.length}`);
  console.log(`  Duration: ${formatDuration(s.durationMs)}`);
  console.log('');
  console.log(`  Actions:     ${s.totalActions}`);
  console.log(`  Allowed:     ${s.allowed}`);
  console.log(`  Denied:      ${s.denied}`);
  console.log(`  Executed:    ${s.executed}`);
  console.log(`  Failed:      ${s.failed}`);
  console.log(`  Violations:  ${s.violations}`);
  console.log(`  Escalations: ${s.escalations}`);
  console.log(`  Simulations: ${s.simulationsRun}`);

  if (Object.keys(s.actionTypes).length > 0) {
    console.log('\n  Action types:');
    const sorted = Object.entries(s.actionTypes).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sorted) {
      console.log(`    ${type.padEnd(24)} ${count}`);
    }
  }

  if (s.denialReasons.length > 0) {
    console.log('\n  Denial reasons:');
    for (const reason of s.denialReasons) {
      console.log(`    - ${truncate(reason, 70)}`);
    }
  }

  console.log('');
}

interface GovernanceReplayOptions {
  deniedOnly?: boolean;
}

function renderGovernanceReplay(
  session: ReplaySession,
  options: GovernanceReplayOptions = {}
): void {
  let actions = session.actions;
  if (options.deniedOnly) {
    actions = actions.filter((a) => !a.allowed);
  }

  console.log(`\n  Governance Replay — ${session.runId}`);
  console.log(`  ${session.events.length} events, ${session.actions.length} actions`);
  console.log('');

  if (actions.length === 0) {
    console.log('  No actions to display.\n');
    return;
  }

  for (const action of actions) {
    renderAction(action);
  }

  renderSessionSummary(session);
}

function renderAction(action: ReplayAction): void {
  const icon = action.allowed ? (action.succeeded ? '+' : '!') : 'x';
  const status = action.allowed
    ? action.succeeded
      ? 'ALLOWED+EXECUTED'
      : action.executed
        ? 'ALLOWED+FAILED'
        : 'ALLOWED (dry-run)'
    : 'DENIED';

  const time = new Date(action.requestedEvent.timestamp).toISOString().slice(11, 19);
  console.log(`  [${time}] ${icon} ${action.actionType} -> ${action.target || '(none)'}`);
  console.log(`           Status: ${status}`);

  if (action.decisionEvent) {
    const reason = (action.decisionEvent.reason as string) || '';
    if (reason) {
      console.log(`           Reason: ${truncate(reason, 60)}`);
    }
  }

  if (action.simulationEvent) {
    const risk = (action.simulationEvent.riskLevel as string) || 'unknown';
    const blast = (action.simulationEvent.blastRadius as number) ?? '?';
    console.log(`           Simulation: risk=${risk}, blast=${blast}`);
  }

  for (const gov of action.governanceEvents) {
    const detail =
      (gov.reason as string) || (gov.invariant as string) || (gov.policy as string) || '';
    console.log(`           Violation: ${gov.kind}${detail ? ` — ${truncate(detail, 50)}` : ''}`);
  }

  console.log('');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds % 60}s`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}
