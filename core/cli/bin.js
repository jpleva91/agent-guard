#!/usr/bin/env node

// BugMon CLI — cache bugs by actually hitting bugs
//
// Usage:
//   bugmon watch -- <command>           Wrap a command and cache bugs (passive)
//   bugmon watch --cache -- <command>   Interactive mode — battle & cache BugMon
//   bugmon demo [scenario]              Try a demo encounter
//   bugmon init                         Install git hooks for evolution tracking
//   bugmon resolve [--last | --all]     Mark bugs as resolved, earn XP
//   bugmon party                        View your party
//   bugmon dex                          View your BugDex
//   bugmon stats                        View your bug hunter stats
//   bugmon heal                         Restore party HP
//   bugmon replay [session-id]          Replay a debugging session timeline
//   bugmon sync                         Start sync server (bridges CLI ↔ browser)
//   bugmon claude-init                   Set up Claude Code integration
//   bugmon help                         Show help

import { watch } from './adapter.js';
import { loadBugDex, saveBugDex } from '../../ecosystem/storage.js';
import { getAllMonsters } from '../matcher.js';
import { renderBugDex, renderStats, renderParty } from './renderer.js';
import { formatHelp } from './args.js';

const args = process.argv.slice(2);
const command = args[0];
const wantsHelp = args.includes('--help') || args.includes('-h');

// Per-command help definitions
const COMMANDS = {
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
      'bugmon replay --last --stats',
    ],
  },
  sources: {
    name: 'bugmon sources',
    description: 'List registered event sources and their status',
    usage: 'bugmon sources',
    flags: [],
    examples: ['bugmon sources'],
  },
  sync: {
    name: 'bugmon sync',
    description: 'Start WebSocket sync server (bridges CLI and browser game)',
    usage: 'bugmon sync',
    flags: [],
    examples: ['bugmon sync'],
  },
};

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

    // Parse flags before --
    const flags = args.slice(1, dashDash);
    const interactive =
      flags.includes('--cache') || flags.includes('--catch') || flags.includes('-c');
    const openBrowser = flags.includes('--open') || flags.includes('-o');
    const walk = flags.includes('--walk') || flags.includes('-w');

    const cmd = args[dashDash + 1];
    const cmdArgs = args.slice(dashDash + 2);

    if (interactive) {
      // Show starter info on first run
      const dex = loadBugDex();
      if (!dex.party || dex.party.length === 0) {
        process.stderr.write(
          "\n  \x1b[1m\x1b[33mFirst time? You'll get a starter BugMon for your party!\x1b[0m\n"
        );
        process.stderr.write('  \x1b[2mFix errors to cache the BugMon that appear.\x1b[0m\n\n');
      }
    }

    const code = await watch(cmd, cmdArgs, { interactive, openBrowser, walk });
    process.exit(code);
  }

  case 'demo': {
    if (wantsHelp) {
      console.log(formatHelp(COMMANDS.demo));
      break;
    }
    const { demo } = await import('./demo.js');
    await demo(args[1]);
    break;
  }

  case 'init': {
    if (wantsHelp) {
      console.log(formatHelp(COMMANDS.init));
      break;
    }
    const flags = args.slice(1);
    const force = flags.includes('--force') || flags.includes('-f');
    const { init } = await import('./init.js');
    await init({ force });
    break;
  }

  case 'resolve': {
    if (wantsHelp) {
      console.log(formatHelp(COMMANDS.resolve));
      break;
    }
    const { resolve } = await import('./resolve.js');
    await resolve(args.slice(1));
    break;
  }

  case 'heal': {
    const data = loadBugDex();
    if (!data.party || data.party.length === 0) {
      process.stderr.write('\n  \x1b[2mNo BugMon in your party to heal.\x1b[0m\n\n');
      break;
    }
    let healed = 0;
    for (const mon of data.party) {
      if ((mon.currentHP ?? mon.hp) < mon.hp) {
        mon.currentHP = mon.hp;
        healed++;
      }
    }
    saveBugDex(data);
    if (healed > 0) {
      process.stderr.write(
        `\n  \x1b[32m\x1b[1mYour party has been fully healed!\x1b[0m (${healed} BugMon restored)\n\n`
      );
    } else {
      process.stderr.write('\n  \x1b[2mYour party is already at full health.\x1b[0m\n\n');
    }
    break;
  }

  case 'party': {
    const data = loadBugDex();
    renderParty(data.party || []);
    break;
  }

  case 'dex': {
    const data = loadBugDex();
    const monsters = getAllMonsters();
    renderBugDex(data, monsters);
    break;
  }

  case 'stats': {
    const data = loadBugDex();
    renderStats(data.stats);
    break;
  }

  case 'sync': {
    if (wantsHelp) {
      console.log(formatHelp(COMMANDS.sync));
      break;
    }
    const { startSyncServer } = await import('./sync-server.js');
    try {
      const { port, clients, stop } = await startSyncServer();
      console.log('');
      console.log('  \x1b[1m\x1b[32m⚡ BugMon Sync Server\x1b[0m');
      console.log(`  Listening on \x1b[36mws://localhost:${port}\x1b[0m`);
      console.log('');
      console.log('  Open the BugMon browser game — it will auto-connect.');
      console.log('  Your CLI party, BugDex, and storage sync in real-time.');
      console.log('');
      console.log('  \x1b[2mPress Ctrl+C to stop.\x1b[0m');
      console.log('');

      process.on('SIGINT', () => {
        console.log('\n  \x1b[33mSync server stopped.\x1b[0m\n');
        stop();
        process.exit(0);
      });
    } catch (err) {
      console.error(`  \x1b[31mError:\x1b[0m ${err.message}`);
      process.exit(1);
    }
    break;
  }

  case 'replay': {
    if (wantsHelp) {
      console.log(formatHelp(COMMANDS.replay));
      break;
    }
    const { replay } = await import('./replay.js');
    await replay(args.slice(1));
    break;
  }

  case 'scan': {
    if (wantsHelp) {
      console.log(formatHelp(COMMANDS.scan));
      break;
    }
    const target = args[1] || '.';
    const { scan } = await import('./scan.js');
    await scan(target);
    break;
  }

  case 'sources': {
    if (wantsHelp) { console.log(formatHelp(COMMANDS.sources)); break; }
    const { SourceRegistry } = await import('../../domain/source-registry.js');
    const { EventBus } = await import('../../domain/event-bus.js');
    const { ingest } = await import('../../domain/ingestion/pipeline.js');
    const { createWatchSource } = await import('../sources/watch-source.js');
    const { createScanSource } = await import('../sources/scan-source.js');
    const { createClaudeHookSource } = await import('../sources/claude-hook-source.js');

    const registry = new SourceRegistry({ eventBus: new EventBus(), ingest });
    registry.register(createWatchSource({ command: 'echo' }));
    registry.register(createScanSource());
    registry.register(createClaudeHookSource());

    console.log('\n  \x1b[1mRegistered Event Sources\x1b[0m\n');
    for (const src of registry.list()) {
      const status = src.running ? '\x1b[32mrunning\x1b[0m' : '\x1b[2mstopped\x1b[0m';
      const desc = src.meta?.description ? ` — ${src.meta.description}` : '';
      console.log(`  ${src.name} [${status}]${desc}`);
    }
    console.log('');
    break;
  }

  // TODO(roadmap/phase-2): Add 'guard' command — evaluate agent actions against policies
  // TODO(roadmap/phase-2): Add 'audit' command — review governance event history

  case 'claude-init': {
    const { claudeInit } = await import('./claude-init.js');
    await claudeInit(args.slice(1));
    break;
  }

  case 'claude-hook': {
    const { claudeHook } = await import('./claude-hook.js');
    await claudeHook();
    break;
  }

  case '--version':
  case '-v': {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const __dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dir, '..', '..', 'package.json'), 'utf8'));
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

function printHelp() {
  console.log(`
  \x1b[1mBugMon\x1b[0m — Cache bugs by hitting bugs

  Every error is a wild BugMon encounter.
  Battle them, cache them, build your party.

  \x1b[1mPlay:\x1b[0m
    bugmon watch -- <command>             Wrap a command (passive mode)
    bugmon watch --cache -- <command>     Interactive: battle & cache BugMon!
    bugmon watch --cache --walk -- <cmd>  Same + auto-walk syncs to browser
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
    bugmon replay <session-id> --stats   View session statistics

  \x1b[1mTools:\x1b[0m
    bugmon init                          Install git hooks for evolution tracking
    bugmon scan [path]                   Scan files for bugs (eslint/tsc)
    bugmon sources                       List registered event sources
    bugmon sync                          Start sync server (CLI ↔ browser)
    bugmon claude-init                   Set up Claude Code integration
    bugmon help                          Show this help

  \x1b[1mExamples:\x1b[0m
    bugmon demo                          Quick demo with a random error
    bugmon watch --cache -- npm run dev  Battle bugs during development
    bugmon watch -c -- node server.js    Same, shorter flags
    bugmon watch -- npm test             Passive monitoring
    bugmon resolve                       Mark last bug as fixed
    bugmon init                          Set up evolution tracking

  \x1b[1mHow it works:\x1b[0m
    1. Run your dev command through bugmon watch
    2. When an error/exception hits, a wild BugMon appears
    3. In --cache mode, you battle it with your party lead
    4. Weaken it and cache it to add it to your team
    5. Fix the real bug, then run "bugmon resolve" to earn XP
    6. Run "bugmon sync" to bridge your CLI and browser game

  \x1b[2mYou can also play the full game in the browser at the GitHub Pages site.\x1b[0m
`);
}

function printUsage(error) {
  console.error(`  Error: ${error}`);
  console.error('  Run "bugmon help" for usage info.');
}
