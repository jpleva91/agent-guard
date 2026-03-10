#!/usr/bin/env node

// AgentGuard CLI — Runtime governance for AI coding agents

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
  guard: {
    name: 'agentguard guard',
    description: 'Start the governed action runtime — enforce policies and invariants',
    usage: 'agentguard guard [flags]',
    flags: [
      { flag: '--policy, -p <file>', description: 'Policy file (YAML or JSON)' },
      { flag: '--dry-run', description: 'Evaluate without executing actions' },
      { flag: '--verbose, -v', description: 'Show detailed output' },
    ],
    examples: [
      'agentguard guard',
      'agentguard guard --policy agentguard.yaml',
      'agentguard guard --dry-run',
      'echo \'{"tool":"Bash","command":"rm -rf /"}\' | agentguard guard',
    ],
  },
  inspect: {
    name: 'agentguard inspect',
    description: 'Inspect the action graph and decision records for a run',
    usage: 'agentguard inspect [runId]',
    flags: [
      { flag: '--list', description: 'List all recorded runs' },
      { flag: '--last', description: 'Inspect the most recent run' },
    ],
    examples: [
      'agentguard inspect --list',
      'agentguard inspect --last',
      'agentguard inspect run_1234567890_abc',
    ],
  },
  events: {
    name: 'agentguard events',
    description: 'Show the raw event stream for a run',
    usage: 'agentguard events <runId>',
    flags: [],
    examples: ['agentguard events --last', 'agentguard events run_1234567890_abc'],
  },
  replay: {
    name: 'agentguard replay',
    description: 'Replay a governance session timeline',
    usage: 'agentguard replay [session-id] [flags]',
    flags: [
      { flag: '--last, -l', description: 'Replay the most recent session' },
      { flag: '--step, -s', description: 'Step through events one at a time' },
      { flag: '--stats', description: 'Show session statistics only' },
      { flag: '--filter <kind>', description: 'Filter events by kind' },
    ],
    examples: ['agentguard replay', 'agentguard replay --last', 'agentguard replay --last --step'],
  },
  export: {
    name: 'agentguard export',
    description: 'Export a governance session to a portable JSONL file',
    usage: 'agentguard export <runId> [flags]',
    flags: [
      { flag: '--output, -o <file>', description: 'Output file path' },
      { flag: '--last', description: 'Export the most recent run' },
    ],
    examples: [
      'agentguard export run_1234567890_abc',
      'agentguard export --last',
      'agentguard export --last -o session.jsonl',
    ],
  },
  import: {
    name: 'agentguard import',
    description: 'Import a governance session from a portable JSONL file',
    usage: 'agentguard import <file> [flags]',
    flags: [{ flag: '--as <runId>', description: 'Import as a different run ID' }],
    examples: [
      'agentguard import session.jsonl',
      'agentguard import ./exports/run.agentguard.jsonl --as custom_run_id',
    ],
  },
};

async function main() {
  switch (command) {
    case 'guard': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.guard));
        break;
      }
      const flags = args.slice(1);
      const policyIdx = flags.findIndex((f) => f === '--policy' || f === '-p');
      const policyFile = policyIdx !== -1 ? flags[policyIdx + 1] : undefined;
      const dryRun = flags.includes('--dry-run');
      const verbose = flags.includes('--verbose') || flags.includes('-v');

      const { guard } = await import('./commands/guard.js');
      const code = await guard(args.slice(1), {
        policy: policyFile,
        dryRun,
        verbose,
        stdin: true,
      });
      process.exit(code);
      break;
    }

    case 'inspect': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.inspect));
        break;
      }
      const { inspect } = await import('./commands/inspect.js');
      await inspect(args.slice(1));
      break;
    }

    case 'events': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.events));
        break;
      }
      const { events } = await import('./commands/inspect.js');
      await events(args.slice(1));
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

    case 'export': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.export));
        break;
      }
      const { exportSession } = await import('./commands/export.js');
      await exportSession(args.slice(1));
      break;
    }

    case 'import': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.import));
        break;
      }
      const { importSession } = await import('./commands/import.js');
      await importSession(args.slice(1));
      break;
    }

    case 'plugin': {
      if (wantsHelp) {
        const { plugin: pluginCmd } = await import('./commands/plugin.js');
        await pluginCmd(['help']);
        break;
      }
      const { plugin: pluginCmd } = await import('./commands/plugin.js');
      const code = await pluginCmd(args.slice(1));
      process.exit(code);
      break;
    }

    case 'claude-init': {
      const { claudeInit } = await import('./commands/claude-init.js');
      await claudeInit(args.slice(1));
      break;
    }

    case 'claude-hook': {
      const { claudeHook } = await import('./commands/claude-hook.js');
      await claudeHook(args[1]); // 'pre' or 'post'
      break;
    }

    case '--version':
    case '-v': {
      const { readFileSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const { dirname, join } = await import('node:path');
      const __dir = dirname(fileURLToPath(import.meta.url));
      const pkg = JSON.parse(readFileSync(join(__dir, '..', '..', 'package.json'), 'utf8')) as {
        version: string;
      };
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
  \x1b[1mAgentGuard\x1b[0m — Runtime governance for AI coding agents

  \x1b[1mGovernance:\x1b[0m
    agentguard guard                          Start governed action runtime
    agentguard guard --policy <file>          Use a specific policy file (YAML/JSON)
    agentguard guard --dry-run                Evaluate without executing actions
    agentguard inspect [runId]                Inspect action graph and decisions
    agentguard events [runId]                 Show raw event stream for a run

  \x1b[1mPortability:\x1b[0m
    agentguard export <runId>                 Export a governance session to JSONL
    agentguard export --last                  Export the most recent run
    agentguard import <file>                  Import a governance session from JSONL

  \x1b[1mReplay:\x1b[0m
    agentguard replay                         List recorded sessions
    agentguard replay --last                  Replay most recent session
    agentguard replay --last --step           Step through events interactively

  \x1b[1mPlugins:\x1b[0m
    agentguard plugin list                    List installed plugins
    agentguard plugin install <path>          Install a plugin from a local path
    agentguard plugin remove <id>             Remove a plugin by ID
    agentguard plugin search [query]          Search for plugins on npm

  \x1b[1mIntegration:\x1b[0m
    agentguard claude-init                    Set up Claude Code hook integration
    agentguard claude-hook                    PreToolUse/PostToolUse hook handler (internal)

  \x1b[1mMeta:\x1b[0m
    agentguard --version                      Show version
    agentguard help                           Show this help
`);
}

function printUsage(error: string): void {
  console.error(`  Error: ${error}`);
  console.error('  Run "agentguard help" for usage info.');
}

main();
