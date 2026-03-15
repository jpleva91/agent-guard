#!/usr/bin/env node

// AgentGuard CLI — Runtime governance for AI coding agents

import { formatHelp } from './args.js';
import { resolveStorageConfig } from '@red-codes/storage';

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
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
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
      { flag: '--trace, -t', description: 'Show policy evaluation traces inline' },
      { flag: '--store <backend>', description: 'Storage backend: jsonl (default) or sqlite' },
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
      { flag: '--no-open', description: 'Do not auto-open session viewer in browser after run' },
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
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
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
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
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
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
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
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
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
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
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
      { flag: '--post-evidence', description: 'Post evidence report as PR comment' },
      { flag: '--pr, -n <number>', description: 'Target PR number (auto-detected if omitted)' },
      { flag: '--artifact-url <url>', description: 'Link to full session artifact' },
      { flag: '--base-dir, -d <dir>', description: 'Base directory for event storage' },
      { flag: '--store <backend>', description: 'Storage backend: jsonl (default) or sqlite' },
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
    ],
    examples: [
      'agentguard ci-check session.agentguard.jsonl --fail-on-violation',
      'agentguard ci-check --last --fail-on-denial --json',
      'agentguard ci-check --last --store sqlite --fail-on-violation',
      'agentguard ci-check --last --post-evidence --pr 42',
    ],
  },
  policy: {
    name: 'agentguard policy',
    description: 'Policy management tools (validate, suggest, verify)',
    usage: 'agentguard policy <command> [options]',
    flags: [],
    examples: [
      'agentguard policy validate agentguard.yaml',
      'agentguard policy validate my-policy.json --json',
      'agentguard policy validate agentguard.yaml --strict',
      'agentguard policy validate agentguard.yaml --verify',
      'agentguard policy suggest',
      'agentguard policy suggest --yaml',
      'agentguard policy suggest --json',
      'agentguard policy verify agentguard.yaml',
      'agentguard policy verify my-policy.yaml --json',
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
      { flag: '--plan <file>', description: 'JSON file with an action plan (array of actions)' },
      { flag: '--policy <file>', description: 'Policy file (YAML/JSON) to evaluate against' },
      { flag: '--json', description: 'Output raw result as JSON' },
    ],
    examples: [
      'agentguard simulate \'{"tool":"Bash","command":"git push origin main"}\'',
      'agentguard simulate --action file.write --target .env',
      'agentguard simulate --action git.push --branch main --json',
      'agentguard simulate --action file.write --target .env --policy agentguard.yaml',
      'agentguard simulate --plan plan.json --policy agentguard.yaml',
    ],
  },
  diff: {
    name: 'agentguard diff',
    description: 'Compare two governance sessions side-by-side',
    usage: 'agentguard diff <runId-A> <runId-B> [flags]',
    flags: [
      { flag: '--json', description: 'Output as JSON' },
      { flag: '--last', description: 'Compare the two most recent runs' },
      { flag: '--dir, -d <path>', description: 'Base directory for event data' },
      { flag: '--store <backend>', description: 'Storage backend: jsonl (default) or sqlite' },
    ],
    examples: [
      'agentguard diff run_abc123 run_def456',
      'agentguard diff --last',
      'agentguard diff --last --json',
      'agentguard diff --last --store sqlite',
    ],
  },
  init: {
    name: 'agentguard init',
    description: 'Scaffold a new governance extension',
    usage: 'agentguard init --extension <type> [--name <name>] [--dir <path>]',
    flags: [
      {
        flag: '--extension, -e <type>',
        description:
          'Extension type: invariant, policy-pack, adapter, renderer, replay-processor, firestore',
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
  traces: {
    name: 'agentguard traces',
    description: 'Display policy evaluation traces for a governance run',
    usage: 'agentguard traces [runId] [flags]',
    flags: [
      { flag: '--last', description: 'Show traces for the most recent run' },
      { flag: '--list', description: 'List all recorded runs' },
      { flag: '--action, -a <type>', description: 'Filter by action type (e.g., git, file.write)' },
      {
        flag: '--decision, -d <allow|deny>',
        description: 'Filter by decision outcome',
      },
      { flag: '--summary, -s', description: 'Show summary statistics only' },
      { flag: '--json', description: 'Output as JSON' },
      { flag: '--store <backend>', description: 'Storage backend: jsonl (default) or sqlite' },
    ],
    examples: [
      'agentguard traces --last',
      'agentguard traces --last --summary',
      'agentguard traces --last --action git',
      'agentguard traces --last --decision deny',
      'agentguard traces --last --json',
      'agentguard traces run_1234567890_abc',
    ],
  },
  status: {
    name: 'agentguard status',
    description: 'Check AgentGuard governance readiness (hooks, policy, directories)',
    usage: 'agentguard status [flags]',
    flags: [
      { flag: '--quiet, -q', description: 'Machine-readable output (exit 0 if ready, 1 if not)' },
    ],
    examples: ['agentguard status', 'agentguard status --quiet'],
  },
  'evidence-pr': {
    name: 'agentguard evidence-pr',
    description: 'Attach governance evidence report to a pull request',
    usage: 'agentguard evidence-pr [pr-number] [flags]',
    flags: [
      { flag: '--pr, -n <number>', description: 'PR number (auto-detected if omitted)' },
      { flag: '--run, -r <runId>', description: 'Use events from a specific run' },
      { flag: '--last', description: 'Use events from the most recent run only' },
      { flag: '--dry-run', description: 'Print markdown without posting to GitHub' },
    ],
    examples: [
      'agentguard evidence-pr',
      'agentguard evidence-pr --pr 42',
      'agentguard evidence-pr --last --dry-run',
      'agentguard evidence-pr --run run_1234567890_abc',
    ],
  },
  'audit-verify': {
    name: 'agentguard audit-verify',
    description: 'Verify tamper-resistant audit chain integrity and generate enforcement report',
    usage: 'agentguard audit-verify [runId] [flags]',
    flags: [
      { flag: '--last', description: 'Verify the most recent chained audit trail' },
      { flag: '--list', description: 'List all chained audit trails' },
      { flag: '--report', description: 'Generate full enforcement audit report' },
      { flag: '--json', description: 'Output as JSON' },
    ],
    examples: [
      'agentguard audit-verify --last',
      'agentguard audit-verify --list',
      'agentguard audit-verify --last --report',
      'agentguard audit-verify --last --report --json',
      'agentguard audit-verify run_1234567890_abc',
    ],
  },
  'session-viewer': {
    name: 'agentguard session-viewer',
    description: 'Generate an interactive HTML visualization of a governance session',
    usage: 'agentguard session-viewer [runId] [flags]',
    flags: [
      { flag: '--last', description: 'Visualize the most recent run' },
      { flag: '--list', description: 'List available runs' },
      { flag: '--output, -o <file>', description: 'Output HTML file path' },
      { flag: '--no-open', description: 'Do not open in browser automatically' },
      {
        flag: '--live',
        description: 'Start a live server that polls for new events (no hard refresh)',
      },
      {
        flag: '--merge-recent <n>',
        description: 'Merge N most recent runs into one view (auto-detected for hook runs)',
      },
      { flag: '--share', description: 'Upload to server and get a shareable URL' },
      {
        flag: '--server <url>',
        description: 'Server URL (default: AGENTGUARD_SERVER_URL or localhost:3001)',
      },
      {
        flag: '--api-key <key>',
        description: 'API key for server auth (default: AGENTGUARD_API_KEY env)',
      },
      { flag: '--store <backend>', description: 'Storage backend: jsonl (default) or sqlite' },
      { flag: '--db-path <path>', description: 'SQLite database path' },
    ],
    examples: [
      'agentguard session-viewer --last',
      'agentguard session-viewer --last --live',
      'agentguard session-viewer --last --share',
      'agentguard session-viewer run_1234567890_abc',
      'agentguard session-viewer --last --merge-recent 100',
      'agentguard session-viewer --last --output report.html',
      'agentguard session-viewer --last --no-open',
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
      const trace = flags.includes('--trace') || flags.includes('-t');
      const noOpen = flags.includes('--no-open');

      const { guard } = await import('./commands/guard.js');
      const storageConfig = resolveStorageConfig(flags);
      const code = await guard(args.slice(1), {
        policy: policyFiles.length === 1 ? policyFiles[0] : undefined,
        policies: policyFiles.length > 1 ? policyFiles : undefined,
        dryRun,
        verbose,
        trace,
        stdin: true,
        store: storageConfig,
        noOpen,
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
      const planIdx = flags.indexOf('--plan');
      const simulatePlanPath = planIdx !== -1 ? flags[planIdx + 1] : undefined;
      const code = await simulateCmd(flags, {
        json: jsonOut,
        policy: simulatePolicy,
        plan: simulatePlanPath,
      });
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

    case 'diff': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.diff));
        break;
      }
      const { diff: diffCmd } = await import('./commands/diff.js');
      await diffCmd(args.slice(1), resolveStorageConfig(args.slice(1)));
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

    case 'evidence-pr': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS['evidence-pr']));
        break;
      }
      const { evidencePr } = await import('./commands/evidence-pr.js');
      const code = await evidencePr(args.slice(1));
      process.exit(code);
      break;
    }

    case 'traces': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.traces));
        break;
      }
      const { traces: tracesCmd } = await import('./commands/traces.js');
      const code = await tracesCmd(args.slice(1), resolveStorageConfig(args.slice(1)));
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

    case 'telemetry': {
      console.log(
        'Telemetry management is available in AgentGuard Cloud. Visit https://agentguard.dev'
      );
      break;
    }

    case 'status': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.status));
        break;
      }
      const { status: statusCmd } = await import('./commands/status.js');
      const code = await statusCmd(args.slice(1));
      process.exit(code);
      break;
    }

    case 'audit-verify': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS['audit-verify']));
        break;
      }
      const { auditVerify } = await import('./commands/audit-verify.js');
      const code = await auditVerify(args.slice(1));
      process.exit(code);
      break;
    }

    case 'session-viewer': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS['session-viewer']));
        break;
      }
      const { sessionViewer } = await import('./commands/session-viewer.js');
      const code = await sessionViewer(args.slice(1), resolveStorageConfig(args.slice(1)));
      process.exit(code);
      break;
    }

    case 'demo': {
      const { demo: demoCmd } = await import('./commands/demo.js');
      const code = await demoCmd();
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
      await claudeHook(args[1], args.slice(2)); // 'pre' or 'post', then remaining flags (e.g., --store sqlite)
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
    agentguard guard --trace                  Show policy evaluation traces inline
    agentguard inspect [runId]                Inspect action graph and decisions
    agentguard events [runId]                 Show raw event stream for a run
    agentguard analytics                      Analyze violation patterns across sessions

  \x1b[1mTraces:\x1b[0m
    agentguard traces --last                  Show policy traces for most recent run
    agentguard traces --last --summary        Show summary statistics only
    agentguard traces --last --action git     Filter traces by action type
    agentguard traces --last --decision deny  Filter traces by decision

  [1mComparison:[0m
    agentguard diff <runA> <runB>              Compare two governance sessions
    agentguard diff --last                     Compare the two most recent runs
    agentguard diff --last --json              Output comparison as JSON

  \x1b[1mSimulation:\x1b[0m
    agentguard simulate <action-json>          Simulate action and show predicted impact
    agentguard simulate --action <type>        Simulate by action type and flags
    agentguard simulate --plan <file>          Simulate an action plan (batch)
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
    agentguard policy validate ... --verify  Also verify against historical violations
    agentguard policy suggest                Suggest rules based on violation patterns
    agentguard policy suggest --yaml         Output suggestions as YAML rules
    agentguard policy suggest --json         Output suggestions as JSON
    agentguard policy verify <file>          Verify policy resolves historical violations
    agentguard policy verify ... --json      Output verification result as JSON

  \x1b[1mPlugins:\x1b[0m
    agentguard plugin list                    List installed plugins
    agentguard plugin install <path>          Install a plugin from a local path
    agentguard plugin remove <id>             Remove a plugin by ID
    agentguard plugin search [query]          Search for plugins on npm

  \x1b[1mVisualization:\x1b[0m
    agentguard session-viewer --last          Open session viewer in browser
    agentguard session-viewer <runId>         Visualize a specific run
    agentguard session-viewer --last -o f.html  Save to file without opening

  \x1b[1mAudit:\x1b[0m
    agentguard audit-verify --last            Verify audit chain integrity
    agentguard audit-verify --list            List chained audit trails
    agentguard audit-verify --last --report   Full enforcement audit report
    agentguard audit-verify ... --json        Output as JSON

  \x1b[1mEvidence:\x1b[0m
    agentguard evidence-pr                    Attach governance evidence to a PR
    agentguard evidence-pr --pr <number>      Post evidence to a specific PR
    agentguard evidence-pr --dry-run          Preview the evidence report

  \x1b[1mScaffolding:\x1b[0m
    agentguard init --extension <type>        Scaffold a new governance extension
    agentguard init --extension <type> -n X   Name the extension


  \x1b[1mCI/CD:\x1b[0m
    agentguard ci-check <session>             Verify governance session in CI
    agentguard ci-check --last                Check most recent run locally


  \x1b[1mIntegration:\x1b[0m
    agentguard claude-init                    Set up Claude Code hook integration
    agentguard claude-hook                    PreToolUse/PostToolUse hook handler (internal)
    agentguard status                         Check governance readiness (hooks, policy, dirs)
    agentguard status --quiet                 Machine-readable check (exit code only)
    agentguard demo                           See governance in action (interactive showcase)

  \x1b[1mMeta:\x1b[0m
    agentguard --version                      Show version
    agentguard help                           Show this help
`);
}

function printUsage(error: string): void {
  console.error(`  Error: ${error}`);
  console.error('  Run "agentguard help" for usage info.');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n  agentguard: fatal error — ${message}`);
  console.error('  Run "agentguard help" for usage info.\n');
  process.exit(1);
});
