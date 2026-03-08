/**
 * watch command — Start all watchers and log events.
 *
 * Main developer workflow: monitors console, tests, and builds
 * for errors and converts them to BugMon encounters.
 */

import type { Command } from 'commander';
import pino from 'pino';
import { EventBus } from '../../core/event-bus.js';
import { BugEngine } from '../../core/bug-engine.js';
import { BugRegistry } from '../../core/bug-registry.js';
import { ConsoleWatcher } from '../../watchers/console-watcher.js';
import { TestWatcher } from '../../watchers/test-watcher.js';
import { BuildWatcher } from '../../watchers/build-watcher.js';
import type { EventMap } from '../../core/types.js';

export function registerWatchCommand(program: Command): void {
  program
    .command('watch')
    .description('Start watching for bugs in your development environment')
    .option('-t, --test-dir <dir>', 'Test directory to watch', './tests')
    .option('-b, --build-dir <dir>', 'Build output directory to watch', './dist')
    .action((options: { testDir: string; buildDir: string }) => {
      const logger = pino({ name: 'bugmon' });
      const eventBus = new EventBus<EventMap>();
      const registry = new BugRegistry();
      const engine = new BugEngine(eventBus, registry);

      // Log all events
      eventBus.on('BugDetected', ({ bug }) => {
        logger.info({ bugId: bug.id, type: bug.type, severity: bug.severity }, 'Bug detected!');
      });

      eventBus.on('MonsterSpawned', ({ monster, bug }) => {
        logger.info(
          { monster: monster.name, hp: monster.maxHp, bugType: bug.type },
          'Monster spawned!'
        );
      });

      eventBus.on('MonsterDefeated', ({ monsterId, xp }) => {
        logger.info({ monsterId, xp }, 'Monster defeated!');
      });

      // Start systems
      engine.start();

      const consoleWatcher = new ConsoleWatcher(eventBus);
      const testWatcher = new TestWatcher(eventBus, { testDir: options.testDir });
      const buildWatcher = new BuildWatcher(eventBus, { buildDir: options.buildDir });

      consoleWatcher.start();
      testWatcher.start();
      buildWatcher.start();

      logger.info('BugMon watchers started. Listening for bugs...');

      // Graceful shutdown
      const shutdown = () => {
        logger.info('Shutting down...');
        consoleWatcher.stop();
        testWatcher.stop();
        buildWatcher.stop();
        engine.stop();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });
}
