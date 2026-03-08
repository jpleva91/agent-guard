#!/usr/bin/env node

// BugMon CLI — cache bugs by actually hitting bugs

import { watch } from './commands/adapter.js';
import { loadBugDex, saveBugDex } from '../ecosystem/storage.js';
import { getAllMonsters } from '../core/matcher.js';
import { renderBugDex, renderStats, renderParty } from './renderer.js';
import { formatHelp } from './args.js';

interface CommandHelp {
  name: string;
  description: string;
  usage: string;
  flags?: Array<{ flag: string; description: string }>;
  examples?: string[];
}

const args = process.argv.slice(2);
const command = args[0];
const wantsHelp = args.includes('--help') || args.includes('-h');

const COMMANDS: Record<string, CommandHelp> = {
  watch: {
    name: 'bugmon watch',
    description: 'Wrap a command and catch BugMon from errors',
    usage: 'bugmon watch [flags] -- <command> [args...]',
    flags: [
      { flag: '--cache, -c', description: 'Interactive mode — battle and cache BugMon' },
      { flag: '--open, -o', description: 'Open the browser game on encounter' },
      { flag: '--walk, -w', description: 'Auto-walk syncs movement to browser game' },
    ],
    examples: [
      'bugmon watch -- npm test',
      'bugmon watch --cache -- npm run dev',
      'bugmon watch -c -w -- node server.js',
    ],
  },
  demo: {
    name: 'bugmon demo',
    description: 'Run a demo BugMon encounter',
    usage: 'bugmon demo [scenario]',
    flags: [],
    examples: ['bugmon demo', 'bugmon demo null-error', 'bugmon demo syntax-error'],
  },
  init: {
    name: 'bugmon init',
    description: 'Install git hooks for evolution tracking',
    usage: 'bugmon init [flags]',
    flags: [{ flag: '--force, -f', description: 'Overwrite existing hooks' }],
    examples: ['bugmon init', 'bugmon init --force'],
  },
  resolve: {
    name: 'bugmon resolve',
    description: 'Mark encounters as resolved and earn XP',
    usage: 'bugmon resolve [flags]',
    flags: [
      { flag: '--last', description: 'Resolve the most recent encounter (default)' },
      { flag: '--all', description: 'Resolve all unresolved encounters' },
    ],
    examples: ['bugmon resolve', 'bugmon resolve --all'],
  },
  scan: {
    name: 'bugmon scan',
    description: 'Scan files for bugs using linters/compilers',
    usage: 'bugmon scan [path]',
    flags: [],
    examples: ['bugmon scan', 'bugmon scan ./src'],
  },
  replay: {
    name: 'bugmon replay',
    description: 'Replay a debugging session timeline (flight recorder)',
    usage: 'bugmon replay [session-id] [flags]',
    flags: [
      { flag: '--last, -l', description: 'Replay the most recent session' },
      { flag: '--step, -s', description: 'Step through events one at a time' },
      { flag: '--stats', description: 'Show session statistics only' },
      { flag: '--filter <kind>', description: 'Filter events by kind (e.g. ErrorObserved)' },
    ],
    examples: [
      'bugmon replay',
      'bugmon replay --last',
      'bugmon replay 1709913600-a3f2',
      'bugmon replay --last --step',
    ],
  },
  sync: {
    name: 'bugmon sync',
    description: 'Start WebSocket sync server (bridges CLI and browser game)',
    usage: 'bugmon sync',
    flags: [],
    examples: ['bugmon sync'],
  },
};

async function main() {
  switch (command) {
    case 'watch': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.watch));
        break;
      }
      const dashDash = args.indexOf('--');
      if (dashDash === -1 || dashDash === args.length - 1) {
        printUsage('watch requires a command after --');
        process.exit(1);
      }

      const flags = args.slice(1, dashDash);
      const interactive =
        flags.includes('--cache') || flags.includes('--catch') || flags.includes('-c');
      const openBrowser = flags.includes('--open') || flags.includes('-o');
      const walk = flags.includes('--walk') || flags.includes('-w');

      const cmd = args[dashDash + 1];
      const cmdArgs = args.slice(dashDash + 2);

      if (interactive) {
        const dex = loadBugDex() as Record<string, unknown>;
        const party = dex.party as unknown[] | undefined;
        if (!party || party.length === 0) {
          process.stderr.write(
            "\n  \x1b[1m\x1b[33mFirst time? You'll get a starter BugMon for your party!\x1b[0m\n",
          );
          process.stderr.write('  \x1b[2mFix errors to cache the BugMon that appear.\x1b[0m\n\n');
        }
      }

      const code = await watch(cmd, cmdArgs, { interactive, openBrowser, walk });
      process.exit(code);
      break;
    }

    case 'init': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.init));
        break;
      }
      const flags = args.slice(1);
      const force = flags.includes('--force') || flags.includes('-f');
      const { init } = await import('./commands/init.js');
      await init({ force });
      break;
    }

    case 'resolve': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.resolve));
        break;
      }
      const { resolve } = await import('./commands/resolve.js');
      await resolve(args.slice(1));
      break;
    }

    case 'heal': {
      const data = loadBugDex() as Record<string, unknown>;
      const party = data.party as Array<{ currentHP?: number; hp: number }> | undefined;
      if (!party || party.length === 0) {
        process.stderr.write('\n  \x1b[2mNo BugMon in your party to heal.\x1b[0m\n\n');
        break;
      }
      let healed = 0;
      for (const mon of party) {
        if ((mon.currentHP ?? mon.hp) < mon.hp) {
          mon.currentHP = mon.hp;
          healed++;
        }
      }
      saveBugDex(data as Parameters<typeof saveBugDex>[0]);
      if (healed > 0) {
        process.stderr.write(
          `\n  \x1b[32m\x1b[1mYour party has been fully healed!\x1b[0m (${healed} BugMon restored)\n\n`,
        );
      } else {
        process.stderr.write('\n  \x1b[2mYour party is already at full health.\x1b[0m\n\n');
      }
      break;
    }

    case 'party': {
      const data = loadBugDex() as Record<string, unknown>;
      renderParty((data.party as Parameters<typeof renderParty>[0]) || []);
      break;
    }

    case 'dex': {
      const data = loadBugDex() as Record<string, unknown>;
      const monsters = getAllMonsters();
      renderBugDex(data as Parameters<typeof renderBugDex>[0], monsters);
      break;
    }

    case 'stats': {
      const data = loadBugDex() as Record<string, unknown>;
      renderStats(data.stats as Parameters<typeof renderStats>[0]);
      break;
    }

    case 'sync': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.sync));
        break;
      }
      const { startSyncServer } = await import('../cli/sync-server.js');
      try {
        const { port, stop } = await startSyncServer();
        console.log('');
        console.log('  \x1b[1m\x1b[32m⚡ BugMon Sync Server\x1b[0m');
        console.log(`  Listening on \x1b[36mws://localhost:${port}\x1b[0m`);
        console.log('');
        console.log('  Open the BugMon browser game — it will auto-connect.');
        console.log('  \x1b[2mPress Ctrl+C to stop.\x1b[0m');
        console.log('');

        process.on('SIGINT', () => {
          console.log('\n  \x1b[33mSync server stopped.\x1b[0m\n');
          stop();
          process.exit(0);
        });
      } catch (err) {
        console.error(`  \x1b[31mError:\x1b[0m ${(err as Error).message}`);
        process.exit(1);
      }
      break;
    }

    case 'replay': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.replay));
        break;
      }
      const { replay } = await import('../cli/replay.js');
      await replay(args.slice(1));
      break;
    }

    case 'scan': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.scan));
        break;
      }
      const target = args[1] || '.';
      const { scan } = await import('./commands/scan.js');
      await scan(target);
      break;
    }

    case 'claude-init': {
      const { claudeInit } = await import('./commands/claude-init.js');
      await claudeInit(args.slice(1));
      break;
    }

    case 'claude-hook': {
      const { claudeHook } = await import('./commands/claude-hook.js');
      await claudeHook();
      break;
    }

    case '--version':
    case '-v': {
      const { readFileSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const { dirname, join } = await import('node:path');
      const __dir = dirname(fileURLToPath(import.meta.url));
      const pkg = JSON.parse(
        readFileSync(join(__dir, '..', '..', 'package.json'), 'utf8'),
      ) as { version: string };
      console.log(`bugmon v${pkg.version}`);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;

    default:
      printUsage(`Unknown command: ${command}`);
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
  \x1b[1mBugMon\x1b[0m — Cache bugs by hitting bugs

  \x1b[1mPlay:\x1b[0m
    bugmon watch -- <command>             Wrap a command (passive mode)
    bugmon watch --cache -- <command>     Interactive: battle & cache BugMon!
    bugmon demo [scenario]               Try a demo encounter instantly

  \x1b[1mProgress:\x1b[0m
    bugmon resolve                       Mark last encounter as resolved (+XP)
    bugmon resolve --all                 Resolve all unresolved encounters
    bugmon heal                          Restore your party to full HP
    bugmon party                         View your BugMon party
    bugmon dex                           View your BugDex
    bugmon stats                         View your bug hunter stats

  \x1b[1mReplay:\x1b[0m
    bugmon replay                        List recorded sessions
    bugmon replay --last                 Replay most recent session
    bugmon replay <session-id> --step    Step through events interactively

  \x1b[1mTools:\x1b[0m
    bugmon init                          Install git hooks for evolution tracking
    bugmon scan [path]                   Scan files for bugs (eslint/tsc)
    bugmon sync                          Start sync server (CLI ↔ browser)
    bugmon claude-init                   Set up Claude Code integration
    bugmon help                          Show this help
`);
}

function printUsage(error: string): void {
  console.error(`  Error: ${error}`);
  console.error('  Run "bugmon help" for usage info.');
}

main();
