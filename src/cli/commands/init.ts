// CLI command: agentguard init — scaffold new governance extensions.
//
// Generates boilerplate for extension types:
//   invariant          Custom invariant pack
//   policy-pack        Custom policy pack (YAML)
//   adapter            Custom execution adapter
//   renderer           Custom governance renderer
//   replay-processor   Custom replay processor

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from '../args.js';
import { bold, color, dim } from '../colors.js';

const EXTENSION_TYPES = [
  'invariant',
  'policy-pack',
  'adapter',
  'renderer',
  'replay-processor',
] as const;

type ExtensionType = (typeof EXTENSION_TYPES)[number];

interface ScaffoldFile {
  path: string;
  content: string;
}

/**
 * Main init command handler.
 */
export async function init(args: string[]): Promise<number> {
  const parsed = parseArgs(args, {
    string: ['--extension', '--name', '--dir'],
    alias: { '-e': '--extension', '-n': '--name', '-d': '--dir' },
  });

  const extensionType = (parsed.flags.extension as string) ?? parsed.positional[0];
  const name = parsed.flags.name as string | undefined;
  const dir = parsed.flags.dir as string | undefined;

  if (!extensionType) {
    printInitHelp();
    return 1;
  }

  if (!isValidExtensionType(extensionType)) {
    console.error(`\n  ${color('Error', 'red')}: Unknown extension type "${extensionType}".`);
    console.error(`  Valid types: ${EXTENSION_TYPES.join(', ')}\n`);
    return 1;
  }

  const extensionName = name ?? `my-${extensionType}`;
  const targetDir = resolve(dir ?? extensionName);

  if (existsSync(targetDir)) {
    console.error(`\n  ${color('Error', 'red')}: Directory "${targetDir}" already exists.`);
    console.error(`  Choose a different name with --name or a different path with --dir.\n`);
    return 1;
  }

  const files = generateScaffold(extensionType, extensionName);

  mkdirSync(targetDir, { recursive: true });

  const srcDir = join(targetDir, 'src');
  const testDir = join(targetDir, 'tests');
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(testDir, { recursive: true });

  for (const file of files) {
    const fullPath = join(targetDir, file.path);
    writeFileSync(fullPath, file.content, 'utf8');
  }

  console.log(
    `\n  ${color('✓', 'green')} Scaffolded ${bold(extensionType)} extension: ${bold(extensionName)}\n`
  );
  console.log(`  ${bold('Files created:')}`);
  for (const file of files) {
    console.log(`    ${dim(file.path)}`);
  }
  console.log(`\n  ${bold('Next steps:')}`);
  console.log(`    cd ${extensionName}`);
  console.log(`    npm install`);
  console.log(`    # Edit src/index.ts to implement your extension`);
  console.log(`    agentguard plugin install .\n`);

  return 0;
}

function isValidExtensionType(type: string): type is ExtensionType {
  return (EXTENSION_TYPES as readonly string[]).includes(type);
}

function generateScaffold(type: ExtensionType, name: string): ScaffoldFile[] {
  const id = `agentguard-${name}`;

  switch (type) {
    case 'invariant':
      return scaffoldInvariant(id, name);
    case 'policy-pack':
      return scaffoldPolicyPack(id, name);
    case 'adapter':
      return scaffoldAdapter(id, name);
    case 'renderer':
      return scaffoldRenderer(id, name);
    case 'replay-processor':
      return scaffoldReplayProcessor(id, name);
  }
}

// ---------------------------------------------------------------------------
// Scaffold generators
// ---------------------------------------------------------------------------

function scaffoldInvariant(id: string, name: string): ScaffoldFile[] {
  return [
    {
      path: 'package.json',
      content:
        JSON.stringify(
          {
            name: id,
            version: '0.1.0',
            description: `Custom invariant pack for AgentGuard`,
            type: 'module',
            main: 'src/index.js',
            scripts: {
              build: 'tsc',
              test: 'node --test tests/',
            },
            agentguard: {
              id,
              name,
              version: '0.1.0',
              type: 'policy-pack',
              apiVersion: '^1.0.0',
              description: `Custom invariant pack: ${name}`,
            },
          },
          null,
          2
        ) + '\n',
    },
    {
      path: 'tsconfig.json',
      content:
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'bundler',
              outDir: 'dist',
              declaration: true,
              strict: true,
              verbatimModuleSyntax: true,
            },
            include: ['src'],
          },
          null,
          2
        ) + '\n',
    },
    {
      path: 'src/index.ts',
      content: `// Custom invariant pack for AgentGuard
//
// Invariants are system-level checks that verify conditions hold before an
// action is allowed to execute. Each invariant has a check function that
// receives the current SystemState and returns whether the invariant holds.
//
// See: https://github.com/jpleva91/agent-guard#invariants

export interface InvariantCheckResult {
  holds: boolean;
  expected: string;
  actual: string;
}

export interface SystemState {
  modifiedFiles?: string[];
  targetBranch?: string;
  directPush?: boolean;
  forcePush?: boolean;
  isPush?: boolean;
  testsPass?: boolean;
  filesAffected?: number;
  blastRadiusLimit?: number;
  protectedBranches?: string[];
  simulatedBlastRadius?: number;
  simulatedRiskLevel?: string;
  currentTarget?: string;
  currentCommand?: string;
}

export interface AgentGuardInvariant {
  id: string;
  name: string;
  description: string;
  severity: number;
  check: (state: SystemState) => InvariantCheckResult;
}

// --- Your custom invariants ---

export const invariants: AgentGuardInvariant[] = [
  {
    id: '${id}-example',
    name: 'Example Invariant',
    description: 'Prevents modifications to files in the vendor/ directory',
    severity: 3,
    check(state) {
      const vendorFiles = (state.modifiedFiles ?? []).filter((f) =>
        f.startsWith('vendor/')
      );
      return {
        holds: vendorFiles.length === 0,
        expected: 'No vendor/ files modified',
        actual:
          vendorFiles.length === 0
            ? 'No vendor/ files modified'
            : \`\${vendorFiles.length} vendor/ file(s) modified: \${vendorFiles.join(', ')}\`,
      };
    },
  },
];
`,
    },
    {
      path: 'tests/invariant.test.ts',
      content: `import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { invariants } from '../src/index.js';

describe('${name} invariants', () => {
  const inv = invariants[0];

  it('should hold when no vendor files are modified', () => {
    const result = inv.check({ modifiedFiles: ['src/app.ts'] });
    assert.strictEqual(result.holds, true);
  });

  it('should fail when vendor files are modified', () => {
    const result = inv.check({ modifiedFiles: ['vendor/lib.js'] });
    assert.strictEqual(result.holds, false);
  });
});
`,
    },
    {
      path: 'README.md',
      content: `# ${name}

Custom invariant pack for AgentGuard.

## Usage

\`\`\`bash
agentguard plugin install .
\`\`\`

## Invariants

| ID | Description | Severity |
|----|-------------|----------|
| ${id}-example | Prevents modifications to vendor/ files | 3 |
`,
    },
  ];
}

function scaffoldPolicyPack(id: string, name: string): ScaffoldFile[] {
  return [
    {
      path: 'package.json',
      content:
        JSON.stringify(
          {
            name: id,
            version: '0.1.0',
            description: `Custom policy pack for AgentGuard`,
            agentguard: {
              id,
              name,
              version: '0.1.0',
              type: 'policy-pack',
              apiVersion: '^1.0.0',
              description: `Custom policy pack: ${name}`,
            },
          },
          null,
          2
        ) + '\n',
    },
    {
      path: 'agentguard-pack.yaml',
      content: `# ${name} — AgentGuard Policy Pack
#
# Reference this pack in your agentguard.yaml via:
#   extends:
#     - ./${name}
#
# Rules are evaluated in order. Deny rules take precedence over allow rules.

id: "${id}"
name: "${name}"
description: "Custom policy pack"
severity: 3

rules:
  # Deny force-push to any branch
  - action: "git.push"
    effect: deny
    conditions:
      branches: ["*"]
    reason: "Force push is not allowed"

  # Allow file reads in any scope
  - action: "file.read"
    effect: allow

  # Allow test execution
  - action:
      - "test.run"
      - "test.run.unit"
      - "test.run.integration"
    effect: allow

  # Deny deploy without test pass
  - action: "deploy.trigger"
    effect: deny
    conditions:
      requireTests: true
    reason: "Tests must pass before deployment"
`,
    },
    {
      path: 'README.md',
      content: `# ${name}

Custom policy pack for AgentGuard.

## Usage

Add to your \`agentguard.yaml\`:

\`\`\`yaml
extends:
  - ./${name}
\`\`\`

Or install as a plugin:

\`\`\`bash
agentguard plugin install .
\`\`\`

## Rules

| Action | Effect | Reason |
|--------|--------|--------|
| git.push | deny | Force push is not allowed |
| file.read | allow | — |
| test.* | allow | — |
| deploy.trigger | deny | Tests must pass before deployment |
`,
    },
  ];
}

function scaffoldAdapter(id: string, name: string): ScaffoldFile[] {
  return [
    {
      path: 'package.json',
      content:
        JSON.stringify(
          {
            name: id,
            version: '0.1.0',
            description: `Custom execution adapter for AgentGuard`,
            type: 'module',
            main: 'src/index.js',
            scripts: {
              build: 'tsc',
              test: 'node --test tests/',
            },
            agentguard: {
              id,
              name,
              version: '0.1.0',
              type: 'renderer',
              apiVersion: '^1.0.0',
              description: `Custom adapter: ${name}`,
              capabilities: ['process:spawn'],
            },
          },
          null,
          2
        ) + '\n',
    },
    {
      path: 'tsconfig.json',
      content:
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'bundler',
              outDir: 'dist',
              declaration: true,
              strict: true,
              verbatimModuleSyntax: true,
            },
            include: ['src'],
          },
          null,
          2
        ) + '\n',
    },
    {
      path: 'src/index.ts',
      content: `// Custom execution adapter for AgentGuard
//
// Adapters translate authorized CanonicalAction objects into real operations.
// They are registered by action class (e.g., 'file', 'shell', 'git') and
// invoked by the kernel after an action passes policy + invariant checks.
//
// See: https://github.com/jpleva91/agent-guard#adapters

export interface CanonicalAction {
  id: string;
  type: string;
  class: string;
  target: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type AdapterHandler = (action: CanonicalAction) => Promise<unknown> | unknown;

/**
 * Example adapter that handles a custom action class.
 *
 * Register this with the adapter registry:
 *   registry.register('custom', customAdapter);
 */
export const customAdapter: AdapterHandler = async (action) => {
  switch (action.type) {
    case 'custom.execute': {
      // Implement your custom execution logic here
      return { executed: true, target: action.target, timestamp: Date.now() };
    }
    default:
      throw new Error(\`Unsupported action type: \${action.type}\`);
  }
};
`,
    },
    {
      path: 'tests/adapter.test.ts',
      content: `import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { customAdapter } from '../src/index.js';

describe('${name} adapter', () => {
  it('should handle custom.execute actions', async () => {
    const action = {
      id: 'test-1',
      type: 'custom.execute',
      class: 'custom',
      target: '/tmp/test',
      timestamp: Date.now(),
    };
    const result = await customAdapter(action) as { executed: boolean };
    assert.strictEqual(result.executed, true);
  });

  it('should reject unsupported action types', async () => {
    const action = {
      id: 'test-2',
      type: 'custom.unknown',
      class: 'custom',
      target: '/tmp/test',
      timestamp: Date.now(),
    };
    await assert.rejects(() => Promise.resolve(customAdapter(action)));
  });
});
`,
    },
    {
      path: 'README.md',
      content: `# ${name}

Custom execution adapter for AgentGuard.

## Usage

\`\`\`typescript
import { customAdapter } from '${id}';

registry.register('custom', customAdapter);
\`\`\`

## Supported Actions

| Type | Description |
|------|-------------|
| custom.execute | Execute a custom operation |
`,
    },
  ];
}

function scaffoldRenderer(id: string, name: string): ScaffoldFile[] {
  return [
    {
      path: 'package.json',
      content:
        JSON.stringify(
          {
            name: id,
            version: '0.1.0',
            description: `Custom governance renderer for AgentGuard`,
            type: 'module',
            main: 'src/index.js',
            scripts: {
              build: 'tsc',
              test: 'node --test tests/',
            },
            agentguard: {
              id,
              name,
              version: '0.1.0',
              type: 'renderer',
              apiVersion: '^1.0.0',
              description: `Custom renderer: ${name}`,
              capabilities: ['filesystem:write'],
            },
          },
          null,
          2
        ) + '\n',
    },
    {
      path: 'tsconfig.json',
      content:
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'bundler',
              outDir: 'dist',
              declaration: true,
              strict: true,
              verbatimModuleSyntax: true,
            },
            include: ['src'],
          },
          null,
          2
        ) + '\n',
    },
    {
      path: 'src/index.ts',
      content: `// Custom governance renderer for AgentGuard
//
// Renderers consume kernel results and produce output (terminal, file, JSON, etc.).
// They receive lifecycle callbacks as actions flow through the governance kernel.
// Multiple renderers can be active simultaneously.
//
// See: https://github.com/jpleva91/agent-guard#renderers

export interface RendererConfig {
  readonly runId: string;
  readonly policyName?: string;
  readonly invariantCount?: number;
  readonly verbose?: boolean;
  readonly dryRun?: boolean;
  readonly simulatorCount?: number;
}

export interface RunSummary {
  readonly runId: string;
  readonly totalActions: number;
  readonly allowed: number;
  readonly denied: number;
  readonly violations: number;
  readonly durationMs: number;
}

export interface GovernanceRenderer {
  readonly id: string;
  readonly name: string;
  onRunStarted?(config: RendererConfig): void;
  onActionResult?(result: unknown): void;
  onRunEnded?(summary: RunSummary): void;
  dispose?(): void;
}

/** JSON file renderer — writes governance results to a JSON file. */
export function createJsonRenderer(outputPath: string): GovernanceRenderer {
  const actions: unknown[] = [];

  return {
    id: '${id}',
    name: '${name}',

    onRunStarted(config) {
      console.log(\`[\${this.name}] Run started: \${config.runId}\`);
    },

    onActionResult(result) {
      actions.push(result);
    },

    onRunEnded(summary) {
      const report = {
        runId: summary.runId,
        totalActions: summary.totalActions,
        allowed: summary.allowed,
        denied: summary.denied,
        violations: summary.violations,
        durationMs: summary.durationMs,
        actions,
      };
      // In a real implementation, write to outputPath using fs.writeFileSync
      console.log(\`[\${this.name}] Report: \${outputPath}\`);
      console.log(JSON.stringify(report, null, 2));
    },

    dispose() {
      actions.length = 0;
    },
  };
}
`,
    },
    {
      path: 'tests/renderer.test.ts',
      content: `import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createJsonRenderer } from '../src/index.js';

describe('${name} renderer', () => {
  it('should create a renderer with correct id and name', () => {
    const renderer = createJsonRenderer('/tmp/report.json');
    assert.strictEqual(renderer.id, '${id}');
    assert.strictEqual(renderer.name, '${name}');
  });

  it('should accept action results', () => {
    const renderer = createJsonRenderer('/tmp/report.json');
    assert.doesNotThrow(() => renderer.onActionResult?.({ type: 'test' }));
  });
});
`,
    },
    {
      path: 'README.md',
      content: `# ${name}

Custom governance renderer for AgentGuard.

## Usage

\`\`\`bash
agentguard plugin install .
\`\`\`

## Features

- Outputs governance results as JSON
- Captures all action results during a run
- Produces a summary report at run end
`,
    },
  ];
}

function scaffoldReplayProcessor(id: string, name: string): ScaffoldFile[] {
  return [
    {
      path: 'package.json',
      content:
        JSON.stringify(
          {
            name: id,
            version: '0.1.0',
            description: `Custom replay processor for AgentGuard`,
            type: 'module',
            main: 'src/index.js',
            scripts: {
              build: 'tsc',
              test: 'node --test tests/',
            },
            agentguard: {
              id,
              name,
              version: '0.1.0',
              type: 'replay-processor',
              apiVersion: '^1.0.0',
              description: `Custom replay processor: ${name}`,
            },
          },
          null,
          2
        ) + '\n',
    },
    {
      path: 'tsconfig.json',
      content:
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'bundler',
              outDir: 'dist',
              declaration: true,
              strict: true,
              verbatimModuleSyntax: true,
            },
            include: ['src'],
          },
          null,
          2
        ) + '\n',
    },
    {
      path: 'src/index.ts',
      content: `// Custom replay processor for AgentGuard
//
// Replay processors observe governance session replays and produce analytics.
// They receive lifecycle callbacks (session start/end, events, actions) and
// can accumulate results for downstream consumption.
//
// Processors are read-only observers — they must NOT mutate the session data.
//
// See: https://github.com/jpleva91/agent-guard#replay-processors

export interface ReplayProcessor {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  onSessionStart?(session: unknown): void | Promise<void>;
  onEvent?(event: unknown): void | Promise<void>;
  onAction?(action: ReplayAction): void | Promise<void>;
  onSessionEnd?(session: unknown): void | Promise<void>;
  getResults?(): Record<string, unknown>;
}

export interface ReplayAction {
  id: string;
  type: string;
  target: string;
  allowed: boolean;
  reason?: string;
}

/** Denial counter processor — counts denied actions during replay. */
export function createDenialCounter(): ReplayProcessor {
  let totalActions = 0;
  let deniedActions = 0;
  const denialReasons = new Map<string, number>();

  return {
    id: '${id}',
    name: '${name}',
    description: 'Counts denied actions and groups by reason',

    onAction(action) {
      totalActions++;
      if (!action.allowed) {
        deniedActions++;
        const reason = action.reason ?? 'unknown';
        denialReasons.set(reason, (denialReasons.get(reason) ?? 0) + 1);
      }
    },

    getResults() {
      return {
        totalActions,
        deniedActions,
        denialRate: totalActions > 0 ? deniedActions / totalActions : 0,
        denialReasons: Object.fromEntries(denialReasons),
      };
    },
  };
}
`,
    },
    {
      path: 'tests/processor.test.ts',
      content: `import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDenialCounter } from '../src/index.js';

describe('${name} replay processor', () => {
  it('should count denied actions', () => {
    const processor = createDenialCounter();
    processor.onAction?.({ id: '1', type: 'file.write', target: '/a', allowed: true });
    processor.onAction?.({ id: '2', type: 'git.push', target: 'main', allowed: false, reason: 'policy' });
    processor.onAction?.({ id: '3', type: 'git.push', target: 'main', allowed: false, reason: 'policy' });

    const results = processor.getResults?.() as Record<string, unknown>;
    assert.strictEqual(results.totalActions, 3);
    assert.strictEqual(results.deniedActions, 2);
  });

  it('should group denials by reason', () => {
    const processor = createDenialCounter();
    processor.onAction?.({ id: '1', type: 'a', target: '/', allowed: false, reason: 'policy' });
    processor.onAction?.({ id: '2', type: 'b', target: '/', allowed: false, reason: 'invariant' });

    const results = processor.getResults?.() as Record<string, unknown>;
    const reasons = results.denialReasons as Record<string, number>;
    assert.strictEqual(reasons.policy, 1);
    assert.strictEqual(reasons.invariant, 1);
  });
});
`,
    },
    {
      path: 'README.md',
      content: `# ${name}

Custom replay processor for AgentGuard.

## Usage

\`\`\`bash
agentguard plugin install .
\`\`\`

## Features

- Counts denied vs allowed actions during session replay
- Groups denial reasons for pattern analysis
- Calculates denial rate metrics
`,
    },
  ];
}

function printInitHelp(): void {
  console.log(`
  ${bold('agentguard init')} — Scaffold a new governance extension

  ${bold('Usage:')}
    agentguard init --extension <type> [--name <name>] [--dir <path>]
    agentguard init <type> [--name <name>] [--dir <path>]

  ${bold('Extension types:')}
    invariant          Custom invariant pack
    policy-pack        Custom policy pack (YAML rules)
    adapter            Custom execution adapter
    renderer           Custom governance renderer
    replay-processor   Custom replay processor

  ${bold('Flags:')}
    --extension, -e    Extension type (required)
    --name, -n         Extension name (default: my-<type>)
    --dir, -d          Output directory (default: ./<name>)

  ${bold('Examples:')}
    agentguard init --extension renderer --name json-renderer
    agentguard init invariant --name vendor-guard
    agentguard init policy-pack --name strict-policy
    agentguard init adapter --name docker-adapter
    agentguard init replay-processor --name denial-counter
`);
}
