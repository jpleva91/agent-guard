#!/usr/bin/env node

// AgentGuard CLI — Runtime governance for AI coding agents

import { formatHelp } from './args.js';
import { resolveStorageConfig } from '../storage/factory.js';

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
  analytics: {
    name: 'agentguard analytics',
    description: 'Analyze violation patterns across governance sessions',
    usage: 'agentguard analytics [flags]',
    flags: [
      { flag: '--format, -f <format>', description: 'Output format: terminal, json, markdown' },
      { flag: '--json', description: 'Output as JSON' },
      { flag: '--markdown, --md', description: 'Output as Markdown' },
      { flag: '--dir, -d <path>', description: 'Base directory for event data' },
      { flag: '--min-cluster <n>', description: 'Minimum cluster size (default: 2)' },
      { flag: '--store <backend>', description: 'Storage backend: jsonl (default) or sqlite' },
    ],
    examples: [
      'agentguard analytics',
      'agentguard analytics --json',
      'agentguard analytics --markdown',
      'agentguard analytics --min-cluster 3',
    ],
  },
  guard: {
    name: 'agentguard guard',
    description: 'Start the governed action runtime — enforce policies and invariants',
    usage: 'agentguard guard [flags]',
    flags: [
      {
        flag: '--policy, -p <file>',
        description: 'Policy file (YAML or JSON). Repeatable for composition.',
      },
      { flag: '--dry-run', description: 'Evaluate without executing actions' },
      { flag: '--verbose, -v', description: 'Show detailed output' },
      { flag: '--store <backend>', description: 'Storage backend: jsonl (default) or sqlite' },
    ],
    examples: [
      'agentguard guard',
      'agentguard guard --policy agentguard.yaml',
      'agentguard guard --policy base.yaml --policy overrides.yaml',
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
      { flag: '--store <backend>', description: 'Storage backend: jsonl (default) or sqlite' },
    ],
    examples: [
      'agentguard inspect --list',
      'agentguard inspect --last',
      'agentguard inspect --last --store sqlite',
      'agentguard inspect run_1234567890_abc',
    ],
  },
  events: {
    name: 'agentguard events',
    description: 'Show the raw event stream for a run',
    usage: 'agentguard events <runId>',
    flags: [
      { flag: '--store <backend>', description: 'Storage backend: jsonl (default) or sqlite' },
    ],
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
      { flag: '--store <backend>', description: 'Storage backend: jsonl (default) or sqlite' },
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
      { flag: '--store <backend>', description: 'Storage backend: jsonl (default) or sqlite' },
    ],
    examples: [
      'agentguard export run_1234567890_abc',
      'agentguard export --last',
      'agentguard export --last -o session.jsonl',
      'agentguard export --last --store sqlite',
    ],
  },
  import: {
    name: 'agentguard import',
    description: 'Import a governance session from a portable JSONL file',
    usage: 'agentguard import <file> [flags]',
    flags: [
      { flag: '--as <runId>', description: 'Import as a different run ID' },
      { flag: '--store <backend>', description: 'Storage backend: jsonl (default) or sqlite' },
    ],
    examples: [
      'agentguard import session.jsonl',
      'agentguard import ./exports/run.agentguard.jsonl --as custom_run_id',
      'agentguard import session.jsonl --store sqlite',
    ],
  },
  'ci-check': {
    name: 'agentguard ci-check',
    description: 'CI governance verification — check a session for violations',
    usage: 'agentguard ci-check <session-file> [flags]',
    flags: [
      { flag: '--fail-on-violation', description: 'Exit 1 if invariant violations found' },
      { flag: '--fail-on-denial', description: 'Exit 1 if any actions were denied' },
      { flag: '--json', description: 'Output result as JSON' },
      { flag: '--last', description: 'Use the most recent local run' },
      { flag: '--base-dir, -d <dir>', description: 'Base directory for event storage' },
      { flag: '--store <backend>', description: 'Storage backend: jsonl (default) or sqlite' },
    ],
    examples: [
      'agentguard ci-check session.agentguard.jsonl --fail-on-violation',
      'agentguard ci-check --last --fail-on-denial --json',
      'agentguard ci-check --last --store sqlite --fail-on-violation',
    ],
  },
  policy: {
    name: 'agentguard policy',
    description: 'Policy management tools (validate, etc.)',
    usage: 'agentguard policy <command> [options]',
    flags: [],
    examples: [
      'agentguard policy validate agentguard.yaml',
      'agentguard policy validate my-policy.json --json',
      'agentguard policy validate agentguard.yaml --strict',
    ],
  },
  simulate: {
    name: 'agentguard simulate',
    description: 'Simulate an action and display predicted impact without executing',
    usage: 'agentguard simulate <action-json> [flags]',
    flags: [
      { flag: '--action <type>', description: 'Action type (e.g., file.write, git.push)' },
      { flag: '--target <path>', description: 'Target file or resource path' },
      { flag: '--command <cmd>', description: 'Shell command (for shell.exec actions)' },
      { flag: '--branch <name>', description: 'Git branch name' },
      { flag: '--policy <file>', description: 'Policy file (YAML/JSON) to evaluate against' },
      { flag: '--json', description: 'Output raw result as JSON' },
    ],
    examples: [
      'agentguard simulate \'{"tool":"Bash","command":"git push origin main"}\'',
      'agentguard simulate --action file.write --target .env',
      'agentguard simulate --action git.push --branch main --json',
      'agentguard simulate --action file.write --target .env --policy agentguard.yaml',
    ],
  },
  init: {
    name: 'agentguard init',
    description: 'Scaffold a new governance extension',
    usage: 'agentguard init --extension <type> [--name <name>] [--dir <path>]',
    flags: [
      {
        flag: '--extension, -e <type>',
        description: 'Extension type: invariant, policy-pack, adapter, renderer, replay-processor',
      },
      { flag: '--name, -n <name>', description: 'Extension name (default: my-<type>)' },
      { flag: '--dir, -d <path>', description: 'Output directory (default: ./<name>)' },
    ],
    examples: [
      'agentguard init --extension renderer --name json-renderer',
      'agentguard init invariant --name vendor-guard',
      'agentguard init policy-pack --name strict-policy',
    ],
  },
};

async function main() {
  switch (command) {
    case 'analytics': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.analytics));
        break;
      }
      const { analytics: analyticsCmd } = await import('./commands/analytics.js');
      const code = await analyticsCmd(args.slice(1), resolveStorageConfig(args.slice(1)));
      process.exit(code);
      break;
    }

    case 'guard': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.guard));
        break;
      }
      const flags = args.slice(1);

      // Collect all --policy/-p flags (repeatable for composition)
      const policyFiles: string[] = [];
      for (let i = 0; i < flags.length; i++) {
        if ((flags[i] === '--policy' || flags[i] === '-p') && flags[i + 1]) {
          policyFiles.push(flags[i + 1]);
          i++; // skip the value
        }
      }

      const dryRun = flags.includes('--dry-run');
      const verbose = flags.includes('--verbose') || flags.includes('-v');

      const { guard } = await import('./commands/guard.js');
      const storageConfig = resolveStorageConfig(flags);
      const code = await guard(args.slice(1), {
        policy: policyFiles.length === 1 ? policyFiles[0] : undefined,
        policies: policyFiles.length > 1 ? policyFiles : undefined,
        dryRun,
        verbose,
        stdin: true,
        store: storageConfig,
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
      await inspect(args.slice(1), resolveStorageConfig(args.slice(1)));
      break;
    }

    case 'events': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.events));
        break;
      }
      const { events } = await import('./commands/inspect.js');
      await events(args.slice(1), resolveStorageConfig(args.slice(1)));
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
      await exportSession(args.slice(1), resolveStorageConfig(args.slice(1)));
      break;
    }

    case 'import': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.import));
        break;
      }
      const { importSession } = await import('./commands/import.js');
      await importSession(args.slice(1), resolveStorageConfig(args.slice(1)));
      break;
    }

    case 'ci-check': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS['ci-check']));
        break;
      }
      const { ciCheck } = await import('./commands/ci-check.js');
      const code = await ciCheck(args.slice(1), resolveStorageConfig(args.slice(1)));
      process.exit(code);
      break;
    }

    case 'simulate': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.simulate));
        break;
      }
      const { simulate: simulateCmd } = await import('./commands/simulate.js');
      const flags = args.slice(1);
      const jsonOut = flags.includes('--json');
      const policyIdx = flags.findIndex((f) => f === '--policy' || f === '-p');
      const simulatePolicy = policyIdx !== -1 ? flags[policyIdx + 1] : undefined;
      const code = await simulateCmd(flags, { json: jsonOut, policy: simulatePolicy });
      process.exit(code);
      break;
    }

    case 'policy': {
      if (wantsHelp) {
        const { policy: policyCmd } = await import('./commands/policy.js');
        await policyCmd(['help']);
        break;
      }
      const { policy: policyCmd } = await import('./commands/policy.js');
      const code = await policyCmd(args.slice(1));
      process.exit(code);
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

    case 'init': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.init));
        break;
      }
      const { init: initCmd } = await import('./commands/init.js');
      const code = await initCmd(args.slice(1));
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
    agentguard guard --policy a --policy b    Compose multiple policies with precedence
    agentguard guard --dry-run                Evaluate without executing actions
    agentguard inspect [runId]                Inspect action graph and decisions
    agentguard events [runId]                 Show raw event stream for a run
    agentguard analytics                      Analyze violation patterns across sessions

  \x1b[1mSimulation:\x1b[0m
    agentguard simulate <action-json>          Simulate action and show predicted impact
    agentguard simulate --action <type>        Simulate by action type and flags
    agentguard simulate ... --policy <file>    Evaluate against policy (non-zero on deny)
    agentguard simulate ... --json             Output raw JSON result

  \x1b[1mPortability:\x1b[0m
    agentguard export <runId>                 Export a governance session to JSONL
    agentguard export --last                  Export the most recent run
    agentguard import <file>                  Import a governance session from JSONL

  \x1b[1mReplay:\x1b[0m
    agentguard replay                         List recorded sessions
    agentguard replay --last                  Replay most recent session
    agentguard replay --last --step           Step through events interactively

  \x1b[1mPolicy:\x1b[0m
    agentguard policy validate <file>        Validate a policy file (YAML/JSON)
    agentguard policy validate ... --strict  Include best-practice checks
    agentguard policy validate ... --json    Output as JSON

  \x1b[1mPlugins:\x1b[0m
    agentguard plugin list                    List installed plugins
    agentguard plugin install <path>          Install a plugin from a local path
    agentguard plugin remove <id>             Remove a plugin by ID
    agentguard plugin search [query]          Search for plugins on npm

  \x1b[1mScaffolding:\x1b[0m
    agentguard init --extension <type>        Scaffold a new governance extension
    agentguard init --extension <type> -n X   Name the extension

  \x1b[1mCI/CD:\x1b[0m
    agentguard ci-check <session>             Verify governance session in CI
    agentguard ci-check --last                Check most recent run locally

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
