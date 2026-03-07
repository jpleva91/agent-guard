#!/usr/bin/env node

// BugMon CLI — cache bugs by actually hitting bugs
//
// Usage:
//   bugmon watch -- <command>           Wrap a command and cache bugs (passive)
//   bugmon watch --cache -- <command>   Interactive mode — battle & cache BugMon
//   bugmon party                        View your party
//   bugmon dex                          View your BugDex
//   bugmon stats                        View your bug hunter stats
//   bugmon sync                         Start sync server (bridges CLI ↔ browser)
//   bugmon help                         Show help

import { watch } from './adapter.js';
import { loadBugDex } from '../../ecosystem/storage.js';
import { getAllMonsters } from '../matcher.js';
import { renderBugDex, renderStats, renderParty } from './renderer.js';

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'watch': {
    const dashDash = args.indexOf('--');
    if (dashDash === -1 || dashDash === args.length - 1) {
      printUsage('watch requires a command after --');
      process.exit(1);
    }

    // Parse flags before --
    const flags = args.slice(1, dashDash);
    const interactive = flags.includes('--cache') || flags.includes('--catch') || flags.includes('-c');
    const openBrowser = flags.includes('--open') || flags.includes('-o');

    const cmd = args[dashDash + 1];
    const cmdArgs = args.slice(dashDash + 2);

    if (interactive) {
      // Show starter info on first run
      const dex = loadBugDex();
      if (!dex.party || dex.party.length === 0) {
        process.stderr.write('\n  \x1b[1m\x1b[33mFirst time? You\'ll get a starter BugMon for your party!\x1b[0m\n');
        process.stderr.write('  \x1b[2mFix errors to cache the BugMon that appear.\x1b[0m\n\n');
      }
    }

    const code = await watch(cmd, cmdArgs, { interactive, openBrowser });
    process.exit(code);
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

  case 'scan': {
    const target = args[1] || '.';
    const { scan } = await import('./scan.js');
    await scan(target);
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

  \x1b[1mUsage:\x1b[0m
    bugmon watch -- <command>             Wrap a command (passive mode)
    bugmon watch --cache -- <command>     Interactive: battle & cache BugMon!
    bugmon watch --cache --open -- <cmd>  Same + offer to open in browser
    bugmon scan [path]                    Scan files for bugs (eslint/tsc)
    bugmon sync                           Start sync server (CLI ↔ browser)
    bugmon party                          View your BugMon party
    bugmon dex                            View your BugDex
    bugmon stats                          View your bug hunter stats
    bugmon help                           Show this help

  \x1b[1mExamples:\x1b[0m
    bugmon watch --cache -- npm run dev
    bugmon watch --cache -- node server.js
    bugmon watch -c -- npx tsc --noEmit
    bugmon watch -- npm test
    bugmon scan src/
    bugmon sync
    bugmon party
    bugmon dex

  \x1b[1mHow it works:\x1b[0m
    1. Run your dev command through bugmon watch
    2. When an error/exception hits, a wild BugMon appears
    3. In --cache mode, you battle it with your party lead
    4. Weaken it and cache it to add it to your team
    5. Fix the real bug to earn resolve XP
    6. Run "bugmon sync" to bridge your CLI and browser game

  \x1b[2mYou can also play the full game in the browser at the GitHub Pages site.\x1b[0m
`);
}

function printUsage(error) {
  console.error(`  Error: ${error}`);
  console.error('  Run "bugmon help" for usage info.');
}
