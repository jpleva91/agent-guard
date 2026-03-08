/**
 * status command — Display current BugMon state.
 *
 * Shows active bugs, player stats, and defeated count.
 */

import type { Command } from 'commander';
import type { BugRegistry } from '../../core/bug-registry.js';

export function registerStatusCommand(program: Command, registry: BugRegistry): void {
  program
    .command('status')
    .description('Show current BugMon status')
    .action(() => {
      const active = registry.getActive();
      const total = registry.totalCount();
      const resolved = total - registry.activeCount();

      console.log('\n  BugMon Status');
      console.log('  ─────────────');
      console.log(`  Active bugs:   ${active.length}`);
      console.log(`  Resolved:      ${resolved}`);
      console.log(`  Total seen:    ${total}`);

      if (active.length > 0) {
        console.log('\n  Active Bugs:');
        for (const bug of active) {
          console.log(`    [${bug.severity}] ${bug.type}: ${bug.errorMessage.slice(0, 60)}`);
        }
      }

      console.log('');
    });
}
