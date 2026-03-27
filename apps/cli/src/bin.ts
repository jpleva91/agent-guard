#!/usr/bin/env node

// AgentGuard CLI — Run AI agents without fear

// Injected by esbuild at build time via define
declare const AGENTGUARD_VERSION: string;

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
  learn: {
    name: 'aguard learn',
    description: 'Analyze denial patterns and suggest policy improvements',
    usage: 'aguard learn [flags]',
    flags: [
      { flag: '--write-rules', description: 'Write safety hints to .claude/rules/' },
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
      { flag: '--db-path <path>', description: 'SQLite database path' },
      { flag: '--json', description: 'Output as JSON' },
    ],
    examples: ['aguard learn', 'aguard learn --write-rules', 'aguard learn --json'],
  },
  adoption: {
    name: 'aguard adoption',
    description: 'Show how much of your agent activity is protected',
    usage: 'aguard adoption [flags]',
    flags: [
      { flag: '--session <path>', description: 'Path to Claude session JSONL file' },
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
      { flag: '--db-path <path>', description: 'SQLite database path' },
      { flag: '--json', description: 'Output as JSON' },
    ],
    examples: [
      'aguard adoption',
      'aguard adoption --session ~/.claude/projects/foo/session.jsonl',
      'aguard adoption --json',
    ],
  },
  analytics: {
    name: 'aguard analytics',
    description: 'Analyze blocked action patterns across safety sessions',
    usage: 'aguard analytics [flags]',
    flags: [
      { flag: '--format, -f <format>', description: 'Output format: terminal, json, markdown' },
      { flag: '--json', description: 'Output as JSON' },
      { flag: '--markdown, --md', description: 'Output as Markdown' },
      { flag: '--dir, -d <path>', description: 'Base directory for event data' },
      { flag: '--min-cluster <n>', description: 'Minimum cluster size (default: 2)' },
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
    ],
    examples: [
      'aguard analytics',
      'aguard analytics --json',
      'aguard analytics --markdown',
      'aguard analytics --min-cluster 3',
    ],
  },
  guard: {
    name: 'aguard guard',
    description: 'Start the safety runtime — prevent dangerous agent actions',
    usage: 'aguard guard [flags]',
    flags: [
      {
        flag: '--policy, -p <file>',
        description: 'Policy file (YAML or JSON). Repeatable for composition.',
      },
      { flag: '--dry-run', description: 'Evaluate without executing actions' },
      { flag: '--verbose, -v', description: 'Show detailed output' },
      { flag: '--trace, -t', description: 'Show policy evaluation traces inline' },
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
      { flag: '--no-open', description: 'Do not auto-open session viewer in browser after run' },
      {
        flag: '--manifest <file>',
        description: 'RunManifest YAML file for declarative session configuration',
      },
      {
        flag: '--agent-name <name>',
        description: 'Agent identity for this session (or set AGENTGUARD_AGENT_NAME env var)',
      },
    ],
    examples: [
      'aguard guard',
      'aguard guard --policy agentguard.yaml',
      'aguard guard --policy base.yaml --policy overrides.yaml',
      'aguard guard --manifest session.yaml',
      'aguard guard --agent-name "claude-opus"',
      'aguard guard --dry-run',
      'echo \'{"tool":"Bash","command":"rm -rf /"}\' | aguard guard',
    ],
  },
  inspect: {
    name: 'aguard inspect',
    description: 'Inspect the action graph and decision records for a run',
    usage: 'aguard inspect [runId]',
    flags: [
      { flag: '--list', description: 'List all recorded runs' },
      { flag: '--last', description: 'Inspect the most recent run' },
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
    ],
    examples: [
      'aguard inspect --list',
      'aguard inspect --last',
      'aguard inspect --last --store sqlite',
      'aguard inspect run_1234567890_abc',
    ],
  },
  events: {
    name: 'aguard events',
    description: 'Show the raw event stream for a run',
    usage: 'aguard events <runId>',
    flags: [
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
    ],
    examples: ['aguard events --last', 'aguard events run_1234567890_abc'],
  },
  replay: {
    name: 'aguard replay',
    description: 'Replay an agent session timeline',
    usage: 'aguard replay [session-id] [flags]',
    flags: [
      { flag: '--last, -l', description: 'Replay the most recent session' },
      { flag: '--step, -s', description: 'Step through events one at a time' },
      { flag: '--stats', description: 'Show session statistics only' },
      { flag: '--ui', description: 'Open interactive HTML timeline viewer in browser' },
      { flag: '--denied-only', description: 'Show only denied actions (with --ui)' },
      { flag: '--output, -o <file>', description: 'Output HTML file path (with --ui)' },
      { flag: '--no-open', description: 'Do not open browser automatically (with --ui)' },
      { flag: '--run <runId>', description: 'Replay a specific run (with --ui)' },
      { flag: '--filter <kind>', description: 'Filter events by kind' },
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
    ],
    examples: [
      'aguard replay',
      'aguard replay --last',
      'aguard replay --last --step',
      'aguard replay --last --ui',
      'aguard replay --last --ui --denied-only',
    ],
  },
  export: {
    name: 'aguard export',
    description: 'Export a safety session to a portable JSONL file',
    usage: 'aguard export <runId> [flags]',
    flags: [
      { flag: '--output, -o <file>', description: 'Output file path' },
      { flag: '--last', description: 'Export the most recent run' },
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
    ],
    examples: [
      'aguard export run_1234567890_abc',
      'aguard export --last',
      'aguard export --last -o session.jsonl',
      'aguard export --last --store sqlite',
    ],
  },
  import: {
    name: 'aguard import',
    description: 'Import a safety session from a portable JSONL file',
    usage: 'aguard import <file> [flags]',
    flags: [
      { flag: '--as <runId>', description: 'Import as a different run ID' },
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
    ],
    examples: [
      'aguard import session.jsonl',
      'aguard import ./exports/run.agentguard.jsonl --as custom_run_id',
      'aguard import session.jsonl --store sqlite',
    ],
  },
  migrate: {
    name: 'aguard migrate',
    description: 'Bulk-import JSONL event/decision files into SQLite',
    usage: 'aguard migrate [flags]',
    flags: [
      {
        flag: '--dir, -d <path>',
        description: 'Base directory for JSONL data (default: .agentguard)',
      },
      { flag: '--dry-run', description: 'Preview what would be imported without writing' },
      { flag: '--verbose', description: 'Show per-file import details' },
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
    ],
    examples: [
      'aguard migrate',
      'aguard migrate --dry-run',
      'aguard migrate --verbose',
      'aguard migrate --dir .agentguard --db-path ./local.db',
    ],
  },
  'ci-check': {
    name: 'aguard ci-check',
    description: 'CI safety check — verify no dangerous actions in a session',
    usage: 'aguard ci-check <session-file> [flags]',
    flags: [
      { flag: '--fail-on-violation', description: 'Exit 1 if invariant violations found' },
      { flag: '--fail-on-denial', description: 'Exit 1 if any actions were denied' },
      { flag: '--json', description: 'Output result as JSON' },
      { flag: '--last', description: 'Use the most recent local run' },
      { flag: '--post-evidence', description: 'Post evidence report as PR comment' },
      { flag: '--pr, -n <number>', description: 'Target PR number (auto-detected if omitted)' },
      { flag: '--artifact-url <url>', description: 'Link to full session artifact' },
      { flag: '--base-dir, -d <dir>', description: 'Base directory for event storage' },
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
      {
        flag: '--db-path <path>',
        description: 'SQLite database path (default: ~/.agentguard/agentguard.db)',
      },
    ],
    examples: [
      'aguard ci-check session.agentguard.jsonl --fail-on-violation',
      'aguard ci-check --last --fail-on-denial --json',
      'aguard ci-check --last --store sqlite --fail-on-violation',
      'aguard ci-check --last --post-evidence --pr 42',
    ],
  },
  policy: {
    name: 'aguard policy',
    description: 'Policy management tools (validate, suggest, verify)',
    usage: 'aguard policy <command> [options]',
    flags: [],
    examples: [
      'aguard policy validate agentguard.yaml',
      'aguard policy validate my-policy.json --json',
      'aguard policy validate agentguard.yaml --strict',
      'aguard policy validate agentguard.yaml --verify',
      'aguard policy suggest',
      'aguard policy suggest --yaml',
      'aguard policy suggest --json',
      'aguard policy verify agentguard.yaml',
      'aguard policy verify my-policy.yaml --json',
    ],
  },
  simulate: {
    name: 'aguard simulate',
    description: 'Simulate an action and display predicted impact without executing',
    usage: 'aguard simulate <action-json> [flags]',
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
      'aguard simulate \'{"tool":"Bash","command":"git push origin main"}\'',
      'aguard simulate --action file.write --target .env',
      'aguard simulate --action git.push --branch main --json',
      'aguard simulate --action file.write --target .env --policy agentguard.yaml',
      'aguard simulate --plan plan.json --policy agentguard.yaml',
    ],
  },
  diff: {
    name: 'aguard diff',
    description: 'Compare two safety sessions side-by-side',
    usage: 'aguard diff <runId-A> <runId-B> [flags]',
    flags: [
      { flag: '--json', description: 'Output as JSON' },
      { flag: '--last', description: 'Compare the two most recent runs' },
      { flag: '--dir, -d <path>', description: 'Base directory for event data' },
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
    ],
    examples: [
      'aguard diff run_abc123 run_def456',
      'aguard diff --last',
      'aguard diff --last --json',
      'aguard diff --last --store sqlite',
    ],
  },
  init: {
    name: 'aguard init',
    description: 'Scaffold a new AgentGuard extension',
    usage: 'aguard init --extension <type> [--name <name>] [--dir <path>]',
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
      'aguard init --extension renderer --name json-renderer',
      'aguard init invariant --name vendor-guard',
      'aguard init policy-pack --name strict-policy',
    ],
  },
  traces: {
    name: 'aguard traces',
    description: 'Display policy evaluation traces for a run',
    usage: 'aguard traces [runId] [flags]',
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
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
    ],
    examples: [
      'aguard traces --last',
      'aguard traces --last --summary',
      'aguard traces --last --action git',
      'aguard traces --last --decision deny',
      'aguard traces --last --json',
      'aguard traces run_1234567890_abc',
    ],
  },
  status: {
    name: 'aguard status',
    description: 'Check AgentGuard safety readiness (hooks, policy, directories)',
    usage: 'aguard status [flags]',
    flags: [
      { flag: '--quiet, -q', description: 'Machine-readable output (exit 0 if ready, 1 if not)' },
    ],
    examples: ['aguard status', 'aguard status --quiet'],
  },
  'evidence-pr': {
    name: 'aguard evidence-pr',
    description: 'Attach safety evidence report to a pull request',
    usage: 'aguard evidence-pr [pr-number] [flags]',
    flags: [
      { flag: '--pr, -n <number>', description: 'PR number (auto-detected if omitted)' },
      { flag: '--run, -r <runId>', description: 'Use events from a specific run' },
      { flag: '--last', description: 'Use events from the most recent run only' },
      { flag: '--dry-run', description: 'Print markdown without posting to GitHub' },
      {
        flag: '--store <backend>',
        description: 'Storage backend (sqlite)',
      },
      { flag: '--db-path <path>', description: 'Path to SQLite database file' },
    ],
    examples: [
      'aguard evidence-pr',
      'aguard evidence-pr --pr 42',
      'aguard evidence-pr --last --dry-run',
      'aguard evidence-pr --run run_1234567890_abc',
      'aguard evidence-pr --last --store sqlite',
    ],
  },
  'audit-verify': {
    name: 'aguard audit-verify',
    description: 'Verify tamper-resistant audit chain integrity and generate enforcement report',
    usage: 'aguard audit-verify [runId] [flags]',
    flags: [
      { flag: '--last', description: 'Verify the most recent chained audit trail' },
      { flag: '--list', description: 'List all chained audit trails' },
      { flag: '--report', description: 'Generate full enforcement audit report' },
      { flag: '--json', description: 'Output as JSON' },
    ],
    examples: [
      'aguard audit-verify --last',
      'aguard audit-verify --list',
      'aguard audit-verify --last --report',
      'aguard audit-verify --last --report --json',
      'aguard audit-verify run_1234567890_abc',
    ],
  },
  'auto-setup': {
    name: 'aguard auto-setup',
    description: 'Auto-detect AgentGuard in project and configure Claude Code hooks',
    usage: 'aguard auto-setup [flags]',
    flags: [
      { flag: '--quiet, -q', description: 'Machine-readable output (no banner)' },
      { flag: '--dry-run', description: 'Detect without installing' },
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
      { flag: '--db-path <path>', description: 'SQLite database path' },
    ],
    examples: [
      'aguard auto-setup',
      'aguard auto-setup --dry-run',
      'aguard auto-setup --store sqlite',
      'aguard auto-setup --quiet',
    ],
  },
  config: {
    name: 'aguard config',
    description: 'Manage AgentGuard configuration (show, get, set)',
    usage: 'aguard config <subcommand> [options]',
    flags: [
      { flag: '--json', description: 'Output as JSON (for show subcommand)' },
      { flag: '--global, -g', description: 'Target user-level config (for set subcommand)' },
    ],
    examples: [
      'aguard config show',
      'aguard config show --json',
      'aguard config get storage',
      'aguard config set storage sqlite',
      'aguard config set autoSetup false --global',
      'aguard config path',
      'aguard config keys',
    ],
  },
  trust: {
    name: 'aguard trust',
    description: 'Trust a project-local policy file after risk review',
    usage: 'aguard trust <policy-file> [flags]',
    flags: [{ flag: '--yes, -y', description: 'Skip confirmation prompt' }],
    examples: ['aguard trust agentguard.yaml', 'aguard trust .agentguard/policy.yaml --yes'],
  },
  cloud: {
    name: 'aguard cloud',
    description:
      'Manage AgentGuard Cloud connection and query data (connect, status, disconnect, events, runs, summary)',
    usage: 'aguard cloud <command> [options]',
    flags: [
      {
        flag: '--endpoint <url>',
        description: 'Cloud endpoint URL (default: https://telemetry.agentguard.dev)',
      },
      { flag: '--limit <n>', description: 'Number of results to return (events/runs)' },
      { flag: '--session <id>', description: 'Filter events by session ID' },
      { flag: '--agent <name>', description: 'Filter by agent ID (events/runs)' },
      { flag: '--type <type>', description: 'Filter events by event type' },
      { flag: '--status <status>', description: 'Filter runs by status' },
    ],
    examples: [
      'aguard cloud connect ag_live_abc123def456xyz',
      'aguard cloud connect ag_test_key1234567890 --endpoint https://custom.example.com',
      'aguard cloud status',
      'aguard cloud disconnect',
      'aguard cloud events',
      'aguard cloud events --limit 50 --agent claude',
      'aguard cloud runs --status completed',
      'aguard cloud summary',
    ],
  },
  'session-viewer': {
    name: 'aguard session-viewer',
    description: 'Generate an interactive HTML visualization of an agent session',
    usage: 'aguard session-viewer [runId] [flags]',
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
      { flag: '--store <backend>', description: 'Storage backend (sqlite)' },
      { flag: '--db-path <path>', description: 'SQLite database path' },
    ],
    examples: [
      'aguard session-viewer --last',
      'aguard session-viewer --last --live',
      'aguard session-viewer --last --share',
      'aguard session-viewer run_1234567890_abc',
      'aguard session-viewer --last --merge-recent 100',
      'aguard session-viewer --last --output report.html',
      'aguard session-viewer --last --no-open',
    ],
  },
};

async function main() {
  switch (command) {
    case 'learn': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.learn));
        break;
      }
      const { learn: learnCmd } = await import('./commands/learn.js');
      const code = await learnCmd(args.slice(1));
      process.exit(code);
      break;
    }

    case 'adoption': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.adoption));
        break;
      }
      const { adoption: adoptionCmd } = await import('./commands/adoption.js');
      const code = await adoptionCmd(args.slice(1));
      process.exit(code);
      break;
    }

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

    case 'team-report': {
      const { teamReportCommand } = await import('./commands/team-report.js');
      const code = await teamReportCommand(args.slice(1), resolveStorageConfig(args.slice(1)));
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

      // Parse --manifest flag
      let manifestPath: string | undefined;
      const manifestIdx = flags.indexOf('--manifest');
      if (manifestIdx !== -1 && flags[manifestIdx + 1]) {
        manifestPath = flags[manifestIdx + 1];
      }

      // Parse --agent-name flag
      let agentName: string | undefined;
      const agentNameIdx = flags.indexOf('--agent-name');
      if (agentNameIdx !== -1 && flags[agentNameIdx + 1]) {
        agentName = flags[agentNameIdx + 1];
      }

      const { guard } = await import('./commands/guard.js');
      const storageConfig = resolveStorageConfig(flags);
      const code = await guard(args.slice(1), {
        policy: policyFiles.length === 1 ? policyFiles[0] : undefined,
        policies: policyFiles.length > 1 ? policyFiles : undefined,
        manifest: manifestPath,
        dryRun,
        verbose,
        trace,
        stdin: true,
        store: storageConfig,
        noOpen,
        agentName,
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

    case 'migrate': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.migrate));
        break;
      }
      const { migrate: migrateCmd } = await import('./commands/migrate.js');
      const code = await migrateCmd(args.slice(1), resolveStorageConfig(args.slice(1)));
      process.exit(code);
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
      const code = await evidencePr(args.slice(1), resolveStorageConfig(args.slice(1)));
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
      const sub = args[1];
      const {
        loadIdentity: load,
        saveIdentity: save,
        generateIdentity: gen,
        resolveMode: resolve,
      } = await import('@red-codes/telemetry-client');
      if (sub === 'on') {
        const verified = args.includes('--verified');
        let identity = load();
        if (!identity) {
          identity = gen(verified ? 'verified' : 'anonymous');
        }
        identity = { ...identity, mode: verified ? 'verified' : 'anonymous', noticed: true };
        save(identity);
        console.log(`Telemetry ${verified ? 'verified' : 'anonymous'} mode enabled.`);
      } else if (sub === 'off') {
        const identity = load();
        if (identity) {
          save({ ...identity, mode: 'off' });
        }
        console.log('Telemetry disabled.');
      } else if (sub === 'status') {
        const identity = load();
        const mode = resolve(identity);
        console.log(`Mode: ${mode}`);
        console.log(`Install ID: ${identity?.install_id ?? 'none'}`);
        console.log(`Enrolled: ${identity?.enrollment_token ? 'yes' : 'no'}`);
        console.log(`Server: ${identity?.server_url ?? 'default'}`);
      } else {
        console.log('Usage: aguard telemetry [on|off|status]');
        console.log('  on            Enable anonymous telemetry');
        console.log('  on --verified Enable verified telemetry');
        console.log('  off           Disable telemetry');
        console.log('  status        Show current telemetry settings');
      }
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

    case 'trust': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS.trust));
        break;
      }
      const { trust: trustCmd } = await import('./commands/trust.js');
      const code = await trustCmd(args.slice(1));
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

    case 'copilot-init': {
      const { copilotInit } = await import('./commands/copilot-init.js');
      await copilotInit(args.slice(1));
      break;
    }

    case 'copilot-hook': {
      const { copilotHook } = await import('./commands/copilot-hook.js');
      await copilotHook(args[1], args.slice(2)); // 'pre' or 'post', then remaining flags
      break;
    }

    case 'codex-init': {
      const { codexInit } = await import('./commands/codex-init.js');
      await codexInit(args.slice(1));
      break;
    }

    case 'codex-hook': {
      const { codexHook } = await import('./commands/codex-hook.js');
      await codexHook(args[1], args.slice(2)); // 'pre' or 'post', then remaining flags
      break;
    }

    case 'gemini-init': {
      const { geminiInit } = await import('./commands/gemini-init.js');
      await geminiInit(args.slice(1));
      break;
    }

    case 'gemini-hook': {
      const { geminiHook } = await import('./commands/gemini-hook.js');
      await geminiHook(args[1], args.slice(2)); // 'pre' or 'post', then remaining flags
      break;
    }

    case 'auto-setup': {
      if (wantsHelp) {
        console.log(formatHelp(COMMANDS['auto-setup']));
        break;
      }
      const { autoSetup } = await import('./commands/auto-setup.js');
      await autoSetup(args.slice(1));
      break;
    }

    case 'config': {
      const { config: configCmd } = await import('./commands/config.js');
      if (wantsHelp) {
        await configCmd(['help']);
        break;
      }
      const code = await configCmd(args.slice(1));
      process.exit(code);
      break;
    }

    case 'cloud': {
      const sub = args[1];
      if (sub === 'login') {
        const { cloudLogin } = await import('./commands/cloud-login.js');
        const code = await cloudLogin(args.slice(2));
        process.exit(code);
        break;
      }
      const { cloud: cloudCmd } = await import('./commands/cloud.js');
      if (wantsHelp) {
        await cloudCmd(['help']);
        break;
      }
      const code = await cloudCmd(args.slice(1));
      process.exit(code);
      break;
    }

    case '--version':
    case '-v': {
      console.log(`agentguard v${AGENTGUARD_VERSION}`);
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
  \x1b[1mAgentGuard\x1b[0m — Run AI agents without fear

  \x1b[1mSafety:\x1b[0m
    aguard guard                          Start the safety runtime
    aguard guard --policy <file>          Use a specific policy file (YAML/JSON)
    aguard guard --policy a --policy b    Compose multiple policies with precedence
    aguard guard --dry-run                Evaluate without executing actions
    aguard guard --trace                  Show policy evaluation traces inline
    aguard inspect [runId]                Inspect action graph and decisions
    aguard events [runId]                 Show raw event stream for a run
    aguard analytics                      Analyze blocked action patterns across sessions
    aguard team-report                    Team-level governance observability across agents
    aguard adoption                       Show how much agent activity is protected
    aguard learn                          Analyze denial patterns and suggest policy improvements

  \x1b[1mTraces:\x1b[0m
    aguard traces --last                  Show policy traces for most recent run
    aguard traces --last --summary        Show summary statistics only
    aguard traces --last --action git     Filter traces by action type
    aguard traces --last --decision deny  Filter traces by decision

  [1mComparison:[0m
    aguard diff <runA> <runB>              Compare two safety sessions
    aguard diff --last                     Compare the two most recent runs
    aguard diff --last --json              Output comparison as JSON

  \x1b[1mSimulation:\x1b[0m
    aguard simulate <action-json>          Simulate action and show predicted impact
    aguard simulate --action <type>        Simulate by action type and flags
    aguard simulate --plan <file>          Simulate an action plan (batch)
    aguard simulate ... --policy <file>    Evaluate against policy (non-zero on deny)
    aguard simulate ... --json             Output raw JSON result

  \x1b[1mPortability:\x1b[0m
    aguard export <runId>                 Export a safety session to JSONL
    aguard export --last                  Export the most recent run
    aguard import <file>                  Import a safety session from JSONL
    aguard migrate                        Bulk-import JSONL files into SQLite
    aguard migrate --dry-run              Preview migration without writing

  \x1b[1mReplay:\x1b[0m
    aguard replay                         List recorded sessions
    aguard replay --last                  Replay most recent session
    aguard replay --last --step           Step through events interactively
    aguard replay --last --ui             Open interactive timeline viewer in browser

  \x1b[1mPolicy:\x1b[0m
    aguard policy validate <file>        Validate a policy file (YAML/JSON)
    aguard policy validate ... --strict  Include best-practice checks
    aguard policy validate ... --json    Output as JSON
    aguard policy validate ... --verify  Also verify against historical violations
    aguard policy suggest                Suggest rules based on violation patterns
    aguard policy suggest --yaml         Output suggestions as YAML rules
    aguard policy suggest --json         Output suggestions as JSON
    aguard policy verify <file>          Verify policy resolves historical violations
    aguard policy verify ... --json      Output verification result as JSON

  \x1b[1mPlugins:\x1b[0m
    aguard plugin list                    List installed plugins
    aguard plugin install <path>          Install a plugin from a local path
    aguard plugin remove <id>             Remove a plugin by ID
    aguard plugin search [query]          Search for plugins on npm

  \x1b[1mVisualization:\x1b[0m
    aguard session-viewer --last          Open session viewer in browser
    aguard session-viewer <runId>         Visualize a specific run
    aguard session-viewer --last -o f.html  Save to file without opening

  \x1b[1mAudit:\x1b[0m
    aguard audit-verify --last            Verify audit chain integrity
    aguard audit-verify --list            List chained audit trails
    aguard audit-verify --last --report   Full enforcement audit report
    aguard audit-verify ... --json        Output as JSON

  \x1b[1mEvidence:\x1b[0m
    aguard evidence-pr                    Attach safety evidence to a PR
    aguard evidence-pr --pr <number>      Post evidence to a specific PR
    aguard evidence-pr --dry-run          Preview the evidence report

  \x1b[1mScaffolding:\x1b[0m
    aguard init --extension <type>        Scaffold a new AgentGuard extension
    aguard init --extension <type> -n X   Name the extension


  \x1b[1mCI/CD:\x1b[0m
    aguard ci-check <session>             Verify agent session safety in CI
    aguard ci-check --last                Check most recent run locally


  \x1b[1mIntegration:\x1b[0m
    aguard claude-init                    Set up Claude Code hook integration
    aguard copilot-init                   Set up Copilot CLI hook integration
    aguard copilot-init --global          Install hooks globally (~/.copilot/hooks/)
    aguard auto-setup                     Auto-detect and configure hooks
    aguard auto-setup --dry-run           Detect without installing
    aguard claude-hook                    Claude Code hook handler (internal)
    aguard copilot-hook                   Copilot CLI hook handler (internal)
    aguard status                         Check safety readiness (hooks, policy, dirs)
    aguard status --quiet                 Machine-readable check (exit code only)
    aguard demo                           See AgentGuard in action (interactive showcase)

  \x1b[1mConfiguration:\x1b[0m
    aguard config show                    Display resolved configuration
    aguard config get <key>               Get a specific config value
    aguard config set <key> <value>       Set a project-level config value
    aguard config set <key> <value> -g    Set a user-level config value
    aguard config path                    Show config file locations
    aguard config keys                    List available config keys

  \x1b[1mCloud:\x1b[0m
    aguard cloud connect <api-key>        Connect to AgentGuard Cloud
    aguard cloud connect ... --endpoint   Use a custom cloud endpoint
    aguard cloud status                   Show cloud connection status
    aguard cloud disconnect               Remove cloud connection
    aguard cloud events                   Query agent events from cloud
    aguard cloud runs                     Query agent runs from cloud
    aguard cloud summary                  Show cloud analytics summary

  \x1b[1mMeta:\x1b[0m
    aguard --version                      Show version
    aguard help                           Show this help
`);
}

function printUsage(error: string): void {
  console.error(`  Error: ${error}`);
  console.error('  Run "aguard help" for usage info.');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n  aguard: fatal error — ${message}`);
  console.error('  Run "aguard help" for usage info.\n');
  process.exit(1);
});
