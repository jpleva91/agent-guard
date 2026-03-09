/**
 * replay command — Replay execution events from a session.
 *
 * Reconstructs the execution event sequence from a given point,
 * showing the causal chain of actions, failures, and governance events.
 */

import type { Command } from 'commander';
import pino from 'pino';
import { createExecutionEventLog } from '../../core/execution-log/event-log.js';

export function registerReplayCommand(program: Command): void {
  program
    .command('replay')
    .description('Replay execution events from a session log')
    .argument('[file]', 'NDJSON event log file to replay', '.events.ndjson')
    .option('-f, --from <eventId>', 'Start replay from this event ID')
    .option('--kind <kind>', 'Filter by event kind')
    .option('--actor <actor>', 'Filter by actor (human, agent, system)')
    .option('--limit <n>', 'Maximum events to display', '50')
    .action(
      async (
        file: string,
        options: {
          from?: string;
          kind?: string;
          actor?: string;
          limit: string;
        }
      ) => {
        const logger = pino({ name: 'agentguard-replay' });
        const fs = await import('node:fs');

        if (!fs.existsSync(file)) {
          logger.error({ file }, 'Event log file not found');
          console.error(`Event log file not found: ${file}`);
          console.error('Run "agentguard guard" first to generate events.');
          return;
        }

        const log = createExecutionEventLog();
        const ndjson = fs.readFileSync(file, 'utf-8');
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
