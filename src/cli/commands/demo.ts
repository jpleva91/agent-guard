/**
 * demo command — Spawn a sample bug for testing.
 *
 * Creates a synthetic BugDetected event to exercise
 * the full pipeline: detection → monster → encounter.
 */

import type { Command } from 'commander';
import pino from 'pino';
import { EventBus } from '../../core/event-bus.js';
import { BugEngine } from '../../core/bug-engine.js';
import { BugRegistry } from '../../core/bug-registry.js';
import type { BugEvent, EventMap } from '../../core/types.js';

const DEMO_BUGS: BugEvent[] = [
  {
    id: 'demo-1',
    type: 'TypeError',
    source: 'console',
    errorMessage: "TypeError: Cannot read properties of undefined (reading 'length')",
    timestamp: Date.now(),
    severity: 3,
    file: 'src/app.ts',
    line: 42,
  },
  {
    id: 'demo-2',
    type: 'TestFailure',
    source: 'test',
    errorMessage: 'FAIL src/utils.test.ts - Expected 42 to equal 43',
    timestamp: Date.now(),
    severity: 2,
    file: 'src/utils.test.ts',
    line: 15,
  },
  {
    id: 'demo-3',
    type: 'BuildError',
    source: 'build',
    errorMessage: 'error TS2322: Type "string" is not assignable to type "number"',
    timestamp: Date.now(),
    severity: 4,
    file: 'src/config.ts',
    line: 8,
  },
];

export function registerDemoCommand(program: Command): void {
  program
    .command('demo')
    .description('Spawn sample bugs for testing the encounter pipeline')
    .option('-n, --count <number>', 'Number of bugs to spawn', '1')
    .action((options: { count: string }) => {
      const logger = pino({ name: 'bugmon-demo' });
      const eventBus = new EventBus<EventMap>();
      const registry = new BugRegistry();
      const engine = new BugEngine(eventBus, registry);

      eventBus.on('MonsterSpawned', ({ monster, bug }) => {
        console.log(`\n  A wild ${monster.name} appeared!`);
        console.log(`  ─────────────────────────────`);
        console.log(`  Type:    ${monster.type}`);
        console.log(`  HP:      ${monster.hp}/${monster.maxHp}`);
        console.log(`  ATK:     ${monster.attack}`);
        console.log(`  DEF:     ${monster.defense}`);
        console.log(`  SPD:     ${monster.speed}`);
        console.log(`  Source:  ${bug.source} — ${bug.errorMessage.slice(0, 50)}`);
      });

      eventBus.on('MonsterDefeated', ({ monsterId, xp }) => {
        console.log(`\n  Monster #${monsterId} defeated! +${xp} XP`);
      });

      engine.start();

      const count = Math.min(parseInt(options.count, 10) || 1, DEMO_BUGS.length);

      for (let i = 0; i < count; i++) {
        const bug = DEMO_BUGS[i];
        logger.info({ type: bug.type }, 'Spawning demo bug');
        eventBus.emit('BugDetected', { bug });
      }

      // Auto-resolve after a moment
      console.log('\n  Resolving bugs...');
      for (let i = 0; i < count; i++) {
        engine.resolveBug(DEMO_BUGS[i].id);
      }

      console.log(`\n  Demo complete. ${count} bug(s) spawned and resolved.\n`);
    });
}
