#!/usr/bin/env node

// AgentGuard CLI — Deterministic runtime guardrails for AI-assisted software systems
// BugMon Mode — Gamified interface that visualizes system failures as monsters

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

// Detect whether invoked as `bugmon` or `agentguard`
const binName = process.argv[1]?.endsWith('bugmon') ? 'bugmon' : 'agentguard';

// TODO(roadmap): Phase 2 — Add 'agentguard guard' and 'agentguard audit' CLI governance commands
// TODO(roadmap): Phase 4 — Add 'agentguard replay <run-id>' CLI replay command
// TODO(roadmap): Phase 8 — Editor integrations (VS Code extension, JetBrains plugin, Claude Code deep integration)
// TODO(roadmap): TS Migration — Integrate TS CLI as primary CLI entry point

const COMMANDS: Record<string, CommandHelp> = {
  // === AgentGuard Core Commands ===
  watch: {
    name: `${binName} watch`,
    description: 'Wrap a command and monitor for errors and policy violations',
    usage: `${binName} watch [flags] -- <command> [args...]`,
    flags: [
      { flag: '--cache, -c', description: 'Interactive mode — battle and cache BugMon' },
      { flag: '--open, -o', description: 'Open the browser game on encounter' },
      { flag: '--walk, -w', description: 'Auto-walk syncs movement to browser game' },
    ],
    examples: [
      `${binName} watch -- npm test`,
      `${binName} watch --cache -- npm run dev`,
      `${binName} watch -c -w -- node server.js`,
    ],
  },
  scan: {
    name: `${binName} scan`,
    description: 'Scan files for bugs using linters/compilers',
    usage: `${binName} scan [path]`,
    flags: [],
    examples: [`${binName} scan`, `${binName} scan ./src`],
  },
  replay: {
    name: `${binName} replay`,
    description: 'Replay a debugging session timeline (flight recorder)',
    usage: `${binName} replay [session-id] [flags]`,
    flags: [
      { flag: '--last, -l', description: 'Replay the most recent session' },
      { flag: '--step, -s', description: 'Step through events one at a time' },
      { flag: '--stats', description: 'Show session statistics only' },
      { flag: '--filter <kind>', description: 'Filter events by kind (e.g. ErrorObserved)' },
    ],
    examples: [
      `${binName} replay`,
      `${binName} replay --last`,
      `${binName} replay 1709913600-a3f2`,
      `${binName} replay --last --step`,
    ],
  },
  init: {
    name: `${binName} init`,
    description: 'Install git hooks for evolution tracking',
    usage: `${binName} init [flags]`,
    flags: [{ flag: '--force, -f', description: 'Overwrite existing hooks' }],
    examples: [`${binName} init`, `${binName} init --force`],
  },
  sync: {
    name: `${binName} sync`,
    description: 'Start WebSocket sync server (bridges CLI and browser game)',
    usage: `${binName} sync`,
    flags: [],
    examples: [`${binName} sync`],
  },

  // === BugMon Mode Commands ===
  play: {
    name: `${binName} play`,
    description: 'Launch BugMon mode — gamified debugging interface',
    usage: `${binName} play [scenario]`,
    flags: [],
    examples: [`${binName} play`, `${binName} play null-error`, `${binName} play syntax-error`],
  },
  demo: {
    name: `${binName} demo`,
    description: 'Run a demo BugMon encounter',
    usage: `${binName} demo [scenario]`,
    flags: [],
    examples: [`${binName} demo`, `${binName} demo null-error`, `${binName} demo syntax-error`],
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
        console.log('  \x1b[1m\x1b[32m⚡ AgentGuard Sync Server\x1b[0m');
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

    // BugMon Mode — `agentguard play` launches the gamified interface
    case 'play': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.play));
        break;
      }
      // `play` is an alias for `demo` — launches BugMon mode
      const scenario = args[1];
      const { demo } = await import('./commands/demo-runner.js');
      await demo(scenario);
      break;
    }

    case 'demo': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.demo));
        break;
      }
      const scenario = args[1];
      const { demo } = await import('./commands/demo-runner.js');
      await demo(scenario);
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
      console.log(`agentguard v${pkg.version}`);
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
  \x1b[1mAgentGuard\x1b[0m — Deterministic runtime guardrails for AI-assisted software systems

  \x1b[1mGuard:\x1b[0m
    ${binName} watch -- <command>             Monitor a command for errors and violations
    ${binName} watch --cache -- <command>     Interactive: battle & cache BugMon!
    ${binName} scan [path]                    Scan files for bugs (eslint/tsc)
    ${binName} replay                         Replay a debugging session

  \x1b[1mBugMon Mode:\x1b[0m
    ${binName} play [scenario]               Launch BugMon — gamified debugging
    ${binName} demo [scenario]               Run a demo encounter
    ${binName} party                         View your BugMon party
    ${binName} dex                           View your Bug Grimoire
    ${binName} heal                          Restore your party to full HP
    ${binName} stats                         View your bug hunter stats

  \x1b[1mReplay:\x1b[0m
    ${binName} replay                        List recorded sessions
    ${binName} replay --last                 Replay most recent session
    ${binName} replay <session-id> --step    Step through events interactively

  \x1b[1mTools:\x1b[0m
    ${binName} init                          Install git hooks for evolution tracking
    ${binName} resolve                       Mark encounters as resolved (+XP)
    ${binName} sync                          Start sync server (CLI <-> browser)
    ${binName} claude-init                   Set up Claude Code integration
    ${binName} help                          Show this help
`);
}

function printUsage(error: string): void {
  console.error(`  Error: ${error}`);
  console.error(`  Run "${binName} help" for usage info.`);
}

main();
