// CLI command: agentguard init — scaffold new governance extensions or policy templates.
//
// Generates boilerplate for extension types:
//   invariant          Custom invariant pack
//   policy-pack        Custom policy pack (YAML)
//   adapter            Custom execution adapter
//   renderer           Custom governance renderer
//   replay-processor   Custom replay processor
//
// Or scaffold a policy template:
//   --template strict       Maximum guardrails
//   --template permissive   Default-allow with safety nets
//   --template ci-only      Read-only CI pipeline mode
//   --template development  Balanced for active development

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../args.js';
import { bold, color, dim } from '../colors.js';

const EXTENSION_TYPES = [
  'invariant',
  'policy-pack',
  'adapter',
  'renderer',
  'replay-processor',
  'simulator',
] as const;

type ExtensionType = (typeof EXTENSION_TYPES)[number];

const TEMPLATE_NAMES = ['strict', 'permissive', 'ci-only', 'development'] as const;

type TemplateName = (typeof TEMPLATE_NAMES)[number];

interface ScaffoldFile {
  path: string;
  content: string;
}

/**
 * Main init command handler.
 */
export async function init(args: string[]): Promise<number> {
  const parsed = parseArgs(args, {
    string: ['--extension', '--name', '--dir', '--template', '--tiers'],
    boolean: ['--force'],
    alias: { '-e': '--extension', '-n': '--name', '-d': '--dir', '-t': '--template' },
  });

  const templateName = parsed.flags.template as string | undefined;

  // Template mode: scaffold an agentguard.yaml from a built-in template
  if (templateName) {
    return initTemplate(templateName, parsed.flags.dir as string | undefined);
  }

  const extensionType = (parsed.flags.extension as string) ?? parsed.positional[0];
  const name = parsed.flags.name as string | undefined;
  const dir = parsed.flags.dir as string | undefined;

  // Firestore setup mode
  if (extensionType === 'firestore') {
    return initFirestore(dir);
  }

  // Swarm scaffolding mode
  if (extensionType === 'swarm') {
    return initSwarm(parsed);
  }

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

  if (!/^[a-z0-9][a-z0-9-]*$/.test(extensionName)) {
    console.error(`\n  ${color('Error', 'red')}: Invalid extension name "${extensionName}".`);
    console.error(`  Names must match /^[a-z0-9][a-z0-9-]*$/ to be safe for code generation.\n`);
    return 1;
  }

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

  console.log(`    cd ${dir ?? extensionName}`);

  console.log(`    npm install`);
  console.log(`    # Edit src/index.ts to implement your extension`);
  console.log(`    agentguard plugin install .\n`);

  return 0;
}

function isValidTemplateName(name: string): name is TemplateName {
  return (TEMPLATE_NAMES as readonly string[]).includes(name);
}

/**
 * Resolve the templates directory. Uses the bundled templates/ directory
 * relative to the project root (works both in dev and dist builds).
 */
function resolveTemplatesDir(): string {
  // Walk up from this file to find the project root (where templates/ lives)
  const thisFile = fileURLToPath(import.meta.url);
  let dir = dirname(thisFile);
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'templates');
    if (existsSync(candidate)) {
      return candidate;
    }
    dir = dirname(dir);
  }
  return join(dirname(thisFile), '..', '..', '..', 'templates');
}

/**
 * Scaffold an agentguard.yaml from a built-in policy template.
 */
function initTemplate(templateName: string, targetDir?: string): number {
  if (!isValidTemplateName(templateName)) {
    console.error(`\n  ${color('Error', 'red')}: Unknown template "${templateName}".`);
    console.error(`  Available templates: ${TEMPLATE_NAMES.join(', ')}\n`);
    return 1;
  }

  const templatesDir = resolveTemplatesDir();
  const templatePath = join(templatesDir, `${templateName}.yaml`);

  if (!existsSync(templatePath)) {
    console.error(`\n  ${color('Error', 'red')}: Template file not found: ${templatePath}`);
    console.error(`  Ensure the templates/ directory is present in the AgentGuard installation.\n`);
    return 1;
  }

  const outputDir = resolve(targetDir ?? '.');
  const outputPath = join(outputDir, 'agentguard.yaml');

  if (existsSync(outputPath)) {
    console.error(`\n  ${color('Error', 'red')}: ${outputPath} already exists.`);
    console.error(`  Remove or rename the existing file before scaffolding a template.\n`);
    return 1;
  }

  const content = readFileSync(templatePath, 'utf8');
  writeFileSync(outputPath, content, 'utf8');

  console.log(`\n  ${color('✓', 'green')} Scaffolded ${bold(templateName)} policy template\n`);
  console.log(`  ${bold('File created:')}`);
  console.log(`    ${dim(outputPath)}\n`);
  console.log(`  ${bold('Next steps:')}`);
  console.log(`    # Review and customize the policy rules`);
  console.log(`    agentguard guard --policy agentguard.yaml --dry-run\n`);

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
    case 'simulator':
      return scaffoldSimulator(id, name);
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
              type: 'invariant',
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
  formatPass?: boolean;
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
    requireTests: true
    reason: "Tests must pass before deployment"

  # Deny commit without format check
  - action: "git.commit"
    effect: deny
    requireFormat: true
    reason: "Formatting must pass before committing"
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
              type: 'adapter',
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

function scaffoldSimulator(id: string, name: string): ScaffoldFile[] {
  return [
    {
      path: 'package.json',
      content:
        JSON.stringify(
          {
            name: id,
            version: '0.1.0',
            description: `Custom action simulator for AgentGuard`,
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
              type: 'simulator',
              apiVersion: '^1.0.0',
              description: `Custom simulator: ${name}`,
              capabilities: ['filesystem:read'],
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
      content: `// Custom action simulator for AgentGuard
//
// Simulators predict the impact of an action BEFORE it executes. They are
// invoked by the governance kernel during the evaluate phase to produce
// structured impact forecasts used by predictive policy rules.
//
// Each simulator:
// 1. Declares which action types it supports via \`supports()\`
// 2. Returns a \`SimulationResult\` with predicted changes, blast radius, and risk
// 3. Is registered with the SimulatorRegistry at startup
//
// See: https://github.com/AgentGuardHQ/agent-guard#simulators

/** Normalized action intent passed to the simulator */
export interface NormalizedIntent {
  action: string;
  target?: string;
  agent?: string;
  destructive?: boolean;
  command?: string;
  filesAffected?: number;
  metadata?: Record<string, unknown>;
}

/** Result of simulating an action before execution */
export interface SimulationResult {
  /** Human-readable list of predicted changes */
  predictedChanges: string[];
  /** Estimated number of files/entities affected */
  blastRadius: number;
  /** Overall risk assessment */
  riskLevel: 'low' | 'medium' | 'high';
  /** Simulator-specific details */
  details: Record<string, unknown>;
  /** Which simulator produced this result */
  simulatorId: string;
  /** How long the simulation took (ms) */
  durationMs: number;
}

/** An action simulator predicts the impact of an action before execution */
export interface ActionSimulator {
  /** Unique simulator identifier */
  readonly id: string;
  /** Check if this simulator can handle the given intent */
  supports(intent: NormalizedIntent): boolean;
  /** Simulate the action and predict its impact */
  simulate(intent: NormalizedIntent, context: Record<string, unknown>): Promise<SimulationResult>;
}

// --- Supported action types for this simulator ---

const SUPPORTED_ACTIONS = new Set([
  // Add the action types this simulator handles, e.g.:
  // 'shell.exec',
  // 'deploy.trigger',
]);

/**
 * Factory function — the plugin entry point.
 *
 * AgentGuard calls \`createSimulator()\` when loading your plugin.
 * Return an object that implements the ActionSimulator interface.
 */
export function createSimulator(): ActionSimulator {
  return {
    id: '${id}',

    supports(intent: NormalizedIntent): boolean {
      return SUPPORTED_ACTIONS.has(intent.action);
    },

    async simulate(intent: NormalizedIntent): Promise<SimulationResult> {
      const start = Date.now();
      const target = intent.target ?? '';

      // TODO: Implement your simulation logic here.
      // Analyze the intent and predict what would happen if this action executes.

      return {
        predictedChanges: [\`Simulated: \${intent.action} on \${target}\`],
        blastRadius: 1,
        riskLevel: 'low',
        details: {
          target,
          action: intent.action,
        },
        simulatorId: '${id}',
        durationMs: Date.now() - start,
      };
    },
  };
}
`,
    },
    {
      path: 'tests/simulator.test.ts',
      content: `import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulator } from '../src/index.js';

describe('${name} simulator', () => {
  const simulator = createSimulator();

  it('should have a valid id', () => {
    assert.strictEqual(simulator.id, '${id}');
  });

  it('should report supported actions', () => {
    // Update this test when you add supported actions
    const result = simulator.supports({ action: 'file.read' });
    assert.strictEqual(typeof result, 'boolean');
  });

  it('should return a valid SimulationResult', async () => {
    const result = await simulator.simulate(
      { action: 'test.action', target: '/tmp/test' },
      {}
    );
    assert.strictEqual(typeof result.blastRadius, 'number');
    assert.ok(Array.isArray(result.predictedChanges));
    assert.ok(['low', 'medium', 'high'].includes(result.riskLevel));
    assert.strictEqual(result.simulatorId, '${id}');
    assert.strictEqual(typeof result.durationMs, 'number');
  });
});
`,
    },
    {
      path: 'README.md',
      content: `# ${name}

Custom action simulator for AgentGuard.

## Overview

This simulator predicts the impact of actions before they execute,
enabling predictive governance decisions based on estimated blast radius
and risk level.

## Usage

\`\`\`bash
# Install as an AgentGuard plugin
agentguard plugin install .

# The simulator is automatically loaded when running the guard
agentguard guard --policy agentguard.yaml
\`\`\`

## How It Works

1. The governance kernel calls \`supports(intent)\` to check if this simulator handles the action
2. If supported, \`simulate(intent, context)\` predicts the impact
3. The result feeds into the impact forecast and predictive policy rules

## Simulator Interface

| Method | Description |
|--------|-------------|
| \`supports(intent)\` | Returns true if this simulator handles the action type |
| \`simulate(intent, context)\` | Returns predicted changes, blast radius, and risk level |

## Development

\`\`\`bash
npm install
npm run build
npm test
\`\`\`
`,
    },
  ];
}

/**
 * Scaffold Firestore backend configuration: security rules, env example, and setup guide.
 */
function initFirestore(targetDir?: string): number {
  const outputDir = resolve(targetDir ?? '.');

  // --- firestore.rules ---
  const rulesPath = join(outputDir, 'firestore.rules');
  if (existsSync(rulesPath)) {
    console.error(`\n  ${color('Error', 'red')}: ${rulesPath} already exists.`);
    console.error(`  Remove or rename the existing file before running init firestore.\n`);
    return 1;
  }

  const rulesContent = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // AgentGuard governance events — append-only for authenticated service accounts
    match /events/{eventId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.resource.data.keys().hasAll(['id', 'run_id', 'kind', 'timestamp', 'data']);
      allow update, delete: if false; // Immutable audit trail
    }

    // AgentGuard governance decisions — append-only
    match /decisions/{decisionId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.resource.data.keys().hasAll(['record_id', 'run_id', 'outcome', 'timestamp', 'data']);
      allow update, delete: if false; // Immutable audit trail
    }

    // Deny everything else by default
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
`;

  // --- .env.example ---
  const envPath = join(outputDir, '.env.firestore.example');
  const envContent = `# AgentGuard Firestore Configuration
# Copy to .env and fill in your values.

# Required: GCP project ID
GCLOUD_PROJECT=your-project-id

# Required for local dev / CI (not needed on GCP compute):
# Path to a service account key with roles/datastore.user
GOOGLE_APPLICATION_CREDENTIALS=/path/to/agentguard-sa.json

# Tell AgentGuard to use Firestore
AGENTGUARD_STORE=firestore
`;

  writeFileSync(rulesPath, rulesContent, 'utf8');
  writeFileSync(envPath, envContent, 'utf8');

  console.log(`\n  ${color('✓', 'green')} Scaffolded ${bold('Firestore')} backend configuration\n`);
  console.log(`  ${bold('Files created:')}`);
  console.log(`    ${dim('firestore.rules')}    — Deploy to Firestore to lock down access`);
  console.log(`    ${dim('.env.firestore.example')} — Copy to .env with your GCP project ID\n`);

  console.log(`  ${bold('Setup (GCP):')}`);
  console.log(`    ${dim('# 1. Create a service account with minimal permissions')}`);
  console.log(`    gcloud iam service-accounts create agentguard-writer \\`);
  console.log(`      --display-name="AgentGuard Event Writer"`);
  console.log();
  console.log(`    ${dim('# 2. Grant only datastore.user (read/write docs, no admin)')}`);
  console.log(`    gcloud projects add-iam-policy-binding $GCLOUD_PROJECT \\`);
  console.log(
    `      --member="serviceAccount:agentguard-writer@$GCLOUD_PROJECT.iam.gserviceaccount.com" \\`
  );
  console.log(`      --role="roles/datastore.user"`);
  console.log();
  console.log(`    ${dim('# 3. Generate a key (never commit this)')}`);
  console.log(`    gcloud iam service-accounts keys create agentguard-sa.json \\`);
  console.log(`      --iam-account=agentguard-writer@$GCLOUD_PROJECT.iam.gserviceaccount.com`);
  console.log();
  console.log(`    ${dim('# 4. Deploy security rules')}`);
  console.log(`    firebase deploy --only firestore:rules`);
  console.log();
  console.log(`    ${dim('# 5. Run AgentGuard with Firestore')}`);
  console.log(`    agentguard guard --store firestore --policy agentguard.yaml\n`);

  return 0;
}

/**
 * Scaffold the agent swarm: copy skill templates, render config, and output
 * scheduled task definitions for registration.
 */
async function initSwarm(parsed: ReturnType<typeof parseArgs>): Promise<number> {
  const dir = parsed.flags.dir as string | undefined;
  const force = parsed.flags.force === true || parsed.flags.force === 'true';
  const tiersFlag = parsed.flags.tiers as string | undefined;
  const tiers = tiersFlag ? tiersFlag.split(',').map((t) => t.trim()) : undefined;
  const projectRoot = resolve(dir ?? '.');

  let scaffoldFn: typeof import('@red-codes/swarm').scaffold;
  try {
    const swarmModule = await import('@red-codes/swarm');
    scaffoldFn = swarmModule.scaffold;
  } catch {
    console.error(`\n  ${color('Error', 'red')}: @red-codes/swarm package not found.`);
    console.error(`  Install it with: pnpm add @red-codes/swarm\n`);
    return 1;
  }

  const result = scaffoldFn({ projectRoot, force, tiers });

  console.log(
    `\n  ${color('✓', 'green')} Swarm initialized (${bold(String(result.agents.length))} agents, ${bold(String(result.skillsWritten + result.skillsSkipped))} skills)\n`
  );

  if (result.configWritten) {
    console.log(
      `  ${dim('Created')} agentguard-swarm.yaml ${dim('(customize schedules, paths, labels)')}`
    );
  }

  console.log(
    `  ${dim('Skills written:')} ${result.skillsWritten}  ${dim('Skipped (existing):')} ${result.skillsSkipped}\n`
  );

  // Print agent table
  console.log(
    `  ${bold('Agent')}${' '.repeat(28)}${bold('Tier')}${' '.repeat(8)}${bold('Schedule')}`
  );
  console.log(`  ${'─'.repeat(65)}`);
  for (const agent of result.agents) {
    const name = agent.name.padEnd(33);
    const tier = agent.tier.padEnd(12);
    console.log(`  ${name}${tier}${agent.cron}`);
  }

  console.log(`\n  ${bold('Next steps:')}`);
  console.log(`    ${dim('# Register scheduled tasks (run inside Claude Code):')}`);
  console.log(
    `    ${dim('# The agent prompts are in .claude/skills/ — use them with the scheduled tasks API')}`
  );
  console.log(
    `    ${dim('# Or use the register-swarm-tasks skill to auto-register all agents')}\n`
  );

  // Write a register-swarm-tasks skill
  const registerSkillPath = join(projectRoot, '.claude', 'skills', 'register-swarm-tasks.md');
  if (!existsSync(registerSkillPath) || force) {
    const registerContent = buildRegisterSkill(result);
    mkdirSync(join(projectRoot, '.claude', 'skills'), { recursive: true });
    writeFileSync(registerSkillPath, registerContent, 'utf8');
    console.log(`  ${dim('Created')} .claude/skills/register-swarm-tasks.md\n`);
  }

  return 0;
}

function buildRegisterSkill(result: {
  agents: ReadonlyArray<{
    id: string;
    name: string;
    tier: string;
    cron: string;
    description: string;
    prompt: string;
  }>;
}): string {
  const lines = [
    '# Skill: Register Swarm Tasks',
    '',
    'Register all swarm agents as scheduled tasks. Run this once after `agentguard init swarm`.',
    '',
    '## Autonomy Directive',
    '',
    'This skill runs interactively. Confirm with the user before creating tasks.',
    '',
    '## Steps',
    '',
    '### 1. Create Scheduled Tasks',
    '',
    'Use the `mcp__scheduled-tasks__create_scheduled_task` tool to register each agent:',
    '',
  ];

  for (const agent of result.agents) {
    lines.push(`#### ${agent.name}`);
    lines.push('');
    lines.push(`- **Task ID**: \`${agent.id}\``);
    lines.push(`- **Cron**: \`${agent.cron}\``);
    lines.push(`- **Description**: ${agent.description}`);
    lines.push(`- **Prompt**: Use the content from the \`${agent.id}\` prompt template`);
    lines.push('');
  }

  lines.push('### 2. Verify');
  lines.push('');
  lines.push(
    'After creating all tasks, use `mcp__scheduled-tasks__list_scheduled_tasks` to verify they are registered.'
  );
  lines.push('');

  return lines.join('\n');
}

function printInitHelp(): void {
  console.log(`
  ${bold('agentguard init')} — Scaffold a new governance extension, policy template, or agent swarm

  ${bold('Usage:')}
    agentguard init --extension <type> [--name <name>] [--dir <path>]
    agentguard init --template <name> [--dir <path>]
    agentguard init <type> [--name <name>] [--dir <path>]

  ${bold('Extension types:')}
    invariant          Custom invariant pack
    policy-pack        Custom policy pack (YAML rules)
    adapter            Custom execution adapter
    renderer           Custom governance renderer
    replay-processor   Custom replay processor
    simulator          Custom action simulator

  ${bold('Agent swarm:')}
    swarm              Scaffold the full agent swarm (skills, config, task definitions)

  ${bold('Storage backends:')}
    firestore          Set up Firestore backend (security rules + credentials guide)

  ${bold('Policy templates:')}
    strict             Maximum guardrails — deny all destructive ops
    permissive         Default-allow with safety nets for dangerous ops
    ci-only            Read-only CI pipeline mode — build and test only
    development        Balanced guardrails for active development

  ${bold('Flags:')}
    --extension, -e    Extension type
    --template, -t     Policy template name (creates agentguard.yaml)
    --name, -n         Extension name (default: my-<type>)
    --dir, -d          Output directory (default: ./<name> or . for templates)
    --tiers            Comma-separated tiers for swarm (core,governance,ops,quality,marketing)
    --force            Overwrite existing skill files during swarm init

  ${bold('Examples:')}
    agentguard init --template strict
    agentguard init --template development --dir ./my-project
    agentguard init --extension renderer --name json-renderer
    agentguard init invariant --name vendor-guard
    agentguard init policy-pack --name strict-policy
    agentguard init simulator --name docker-build
    agentguard init firestore
    agentguard init swarm
    agentguard init swarm --tiers core,governance
    agentguard init swarm --force
`);
}
