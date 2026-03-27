# Plugin API

AgentGuard supports extension through six plugin types: **renderers**, **replay processors**, **policy packs**, **invariants**, **adapters**, and **simulators**. Each type has a defined manifest contract, capability model, and integration point.

## Plugin Manifest

Every plugin must provide a `PluginManifest`. The manifest is validated at install time before the plugin is registered.

```typescript
interface PluginManifest {
  /** Unique identifier, e.g. "agentguard-renderer-json" */
  readonly id: string;
  /** Human-readable display name */
  readonly name: string;
  /** Plugin version (semver, e.g. "1.2.0") */
  readonly version: string;
  /** Brief description */
  readonly description?: string;
  /** Plugin type — one of the six supported types */
  readonly type: 'renderer' | 'replay-processor' | 'policy-pack' | 'invariant' | 'adapter' | 'simulator';
  /** Required AgentGuard API version (semver range, e.g. "^1.0.0") */
  readonly apiVersion: string;
  /** Capabilities this plugin requires at runtime */
  readonly capabilities?: readonly PluginCapability[];
  /** Other plugin IDs this plugin depends on */
  readonly dependencies?: readonly string[];
}
```

**Required fields:** `id`, `name`, `version`, `type`, `apiVersion`.

**Capabilities** are declared up-front. The sandbox grants only what is declared:

| Capability | Description |
|------------|-------------|
| `filesystem:read` | Read from the filesystem |
| `filesystem:write` | Write to the filesystem |
| `network` | Make outbound network requests |
| `process:spawn` | Spawn child processes |
| `events:emit` | Emit events onto the event bus |
| `events:subscribe` | Subscribe to events from the event bus |

## Plugin Registry API

`packages/plugins/src/registry.ts` — persists installed plugins to `.agentguard/plugins.json`.

| Method | Description |
|--------|-------------|
| `install(manifest, source)` | Validate and register a plugin. Returns `PluginValidationResult`. |
| `remove(pluginId)` | Remove a plugin. Returns `false` if another plugin depends on it. |
| `get(pluginId)` | Get an installed plugin by ID. |
| `has(pluginId)` | Check if a plugin is installed. |
| `enable(pluginId)` | Enable a plugin. Returns `false` if not found. |
| `disable(pluginId)` | Disable a plugin. Returns `false` if not found. |
| `list()` | Returns all installed plugins. |
| `listByType(type)` | Returns installed plugins filtered by type. |
| `save()` | Persist the registry to disk. |
| `reload()` | Reload the registry from disk. |

```typescript
import { createPluginRegistry } from '@red-codes/plugins';

const registry = createPluginRegistry({ storageDir: '.agentguard', hostVersion: '1.0.0' });

const result = registry.install(manifest, 'my-plugin');
if (!result.valid) {
  console.error(result.errors);
}
```

## Plugin Discovery

`packages/plugins/src/discovery.ts` — read-only search for available plugins. Discovery finds plugins but does not install them; use the registry for installation.

**npm registry search** — finds packages with the `agentguard-plugin` keyword:

```typescript
import { searchNpmPlugins } from '@red-codes/plugins';

const plugins = await searchNpmPlugins('renderer', { limit: 20 });
```

**Local directory search** — scans subdirectories for `package.json` files that include an `agentguard` field:

```json
// package.json
{
  "name": "my-agentguard-plugin",
  "agentguard": { "type": "renderer" }
}
```

```typescript
import { searchLocalPlugins } from '@red-codes/plugins';

const plugins = searchLocalPlugins({ directory: './plugins' });
```

## Plugin Sandbox

`packages/plugins/src/sandbox.ts` — runtime capability enforcement. Each plugin runs inside a sandbox created from its manifest. Undeclared capability access is recorded as a violation.

```typescript
import { createPluginSandbox } from '@red-codes/plugins';

const sandbox = createPluginSandbox(manifest);

if (sandbox.hasCapability('filesystem:read')) {
  // safe to proceed
}

const result = sandbox.execute(() => plugin.doWork());
if (!result.success) {
  console.error(result.error);
}
```

**Sandbox API:**

| Method | Description |
|--------|-------------|
| `hasCapability(cap)` | Returns `true` if the capability is declared |
| `getCapabilities()` | Returns all granted capabilities |
| `assertCapability(cap)` | Returns `true` and records a violation if not declared |
| `execute(fn)` | Run a callback with error isolation. Returns `{ success, value, error, durationMs }` |
| `executeAsync(fn)` | Async version of `execute` |
| `getViolations()` | Returns all recorded sandbox violations |

## Plugin Categories

### 1. Renderers

Renderers receive lifecycle callbacks as actions flow through the kernel and produce output (terminal, file, dashboard, etc.).

**Integration point:** `packages/renderers/src/` — register with the `RendererRegistry`.

**Built-in renderers:**
| Renderer | Platform | Path |
|----------|----------|------|
| TUI renderer | CLI / terminal | `packages/renderers/src/tui-renderer.ts` |

**`GovernanceRenderer` interface** (all methods optional):

```typescript
interface GovernanceRenderer {
  readonly id: string;
  readonly name: string;

  onRunStarted?(config: RendererConfig): void;
  onActionResult?(result: KernelResult): void;
  onMonitorStatus?(decision: MonitorDecision): void;
  onSimulation?(simulation: SimulationResult): void;
  onDecisionRecord?(record: GovernanceDecisionRecord): void;
  onPolicyTrace?(trace: PolicyTracePayload): void;
  onRunEnded?(summary: RunSummary): void;
  dispose?(): void;
}
```

**`RendererRegistry` API:**

| Method | Description |
|--------|-------------|
| `register(renderer)` | Register a renderer. Throws if ID already exists. |
| `unregister(id)` | Unregister and call `dispose()` if defined. Returns `true` if found. |
| `get(id)` | Get a renderer by ID. |
| `list()` | List all registered renderer IDs. |
| `notifyRunStarted(config)` | Dispatch run-started to all renderers. |
| `notifyActionResult(result)` | Dispatch action result to all renderers. |
| `notifyPolicyTrace(trace)` | Dispatch policy trace to all renderers. |
| `notifyRunEnded(summary)` | Dispatch run-ended to all renderers. |
| `disposeAll()` | Dispose all renderers and clear the registry. |

**Implementing a custom renderer:**

```typescript
import type { GovernanceRenderer, RendererConfig, RunSummary } from '@red-codes/renderers';
import type { KernelResult } from '@red-codes/kernel';

export const myRenderer: GovernanceRenderer = {
  id: 'my-custom-renderer',
  name: 'My Custom Renderer',

  onRunStarted(config: RendererConfig) {
    console.log(`Run started: ${config.runId}`);
  },

  onActionResult(result: KernelResult) {
    const status = result.allowed ? '✅ ALLOW' : '❌ DENY';
    console.log(`${status} ${result.action} → ${result.target}`);
  },

  onRunEnded(summary: RunSummary) {
    console.log(`Run ended: ${summary.allowed} allowed, ${summary.denied} denied`);
  },
};
```

### 2. Policy Packs

Policy packs are YAML files that define governance rules — what actions are allowed, denied, or constrained.

**Integration point:** `packages/policy/src/pack-loader.ts` — loaded via `pack: <id>` in policy files or the CLI `--policy` flag.

**Shipped policy packs** (`policies/`):
| Pack | Description |
|------|-------------|
| `essentials` | Core safety — secrets, force push, protected branches, credentials |
| `ci-safe` | CI-safe rules for automated agents |
| `engineering-standards` | Code quality and engineering best practices |
| `enterprise` | Enterprise governance with strict controls |
| `hipaa` | HIPAA-compliant rules for healthcare environments |
| `open-source` | Rules for open-source project maintainers |
| `soc2` | SOC 2-aligned governance rules |
| `strict` | Maximum enforcement for high-risk environments |

**Policy pack format:**

```yaml
id: my-pack
name: My Policy Pack
description: Custom governance rules for my team
severity: 3

invariants:
  no-secret-exposure: enforce
  no-force-push: enforce

rules:
  - action: git.push
    effect: deny
    branches: [main, master]
    reason: Direct push to protected branch blocked

  - action: file.write
    effect: deny
    target: "**/.env*"
    reason: Secrets files must not be modified

  - action: file.write
    effect: allow
    scope:
      include: ["src/**", "tests/**"]
```

**Using a pack in a policy file:**

```yaml
# agentguard.yaml
pack: essentials

rules:
  - action: file.write
    effect: allow
    scope:
      include: ["docs/**"]
```

### 3. Invariant Plugins

Invariant plugins add custom safety checks evaluated before every action. AgentGuard ships 24 built-in invariants; plugins extend this with domain-specific checks.

**Integration point:** `packages/invariants/src/` — implement the `AgentGuardInvariant` interface.

**Example: `invariant-data-protection` plugin** (`packages/invariant-data-protection/`):

This plugin adds PII detection, secret scanning (entropy-based), and log exposure invariants. It follows the same shape as built-in invariants.

**`AgentGuardInvariant` interface:**

```typescript
interface AgentGuardInvariant {
  readonly id: string;
  readonly description: string;
  check(state: SystemState): InvariantCheckResult;
}

interface InvariantCheckResult {
  readonly passed: boolean;
  readonly reason?: string;
}
```

**Plugin manifest for an invariant:**

```typescript
const manifest: PluginManifest = {
  id: 'agentguard-invariant-pii-check',
  name: 'PII Detection Invariant',
  version: '1.0.0',
  type: 'invariant',
  apiVersion: '^1.0.0',
  capabilities: ['filesystem:read'],
};
```

### 4. Simulators

Simulator plugins add pre-execution impact forecasting for custom action types. The kernel runs simulators before executing an action to produce a predicted blast radius and risk level.

**Integration point:** `packages/plugins/src/simulator-loader.ts` — loaded from the plugin registry via `loadSimulatorPlugins()`.

**`ActionSimulator` contract:**

```typescript
interface SimulatorPlugin {
  readonly id: string;

  /** Return true if this simulator handles the given action */
  supports(intent: { action: string; target?: string }): boolean;

  /** Predict the impact of an action without executing it */
  simulate(
    intent: { action: string; target?: string },
    context: Record<string, unknown>
  ): Promise<{
    predictedChanges: string[];
    blastRadius: number;
    riskLevel: 'low' | 'medium' | 'high';
    details: Record<string, unknown>;
    simulatorId: string;
    durationMs: number;
  }>;
}
```

**Plugin module export contract:**

```typescript
// my-simulator-plugin/index.ts
export function createSimulator(): SimulatorPlugin {
  return {
    id: 'my-custom-simulator',

    supports(intent) {
      return intent.action === 'deploy.trigger';
    },

    async simulate(intent, context) {
      return {
        predictedChanges: [`deploy ${intent.target}`],
        blastRadius: 0.6,
        riskLevel: 'medium',
        details: { environment: context.env },
        simulatorId: 'my-custom-simulator',
        durationMs: 1,
      };
    },
  };
}
```

**Loading simulator plugins:**

```typescript
import { loadSimulatorPlugins } from '@red-codes/plugins';
import { createPluginRegistry } from '@red-codes/plugins';
import { simulatorRegistry } from '@red-codes/kernel';

const pluginRegistry = createPluginRegistry();
await loadSimulatorPlugins(pluginRegistry, (sim) => simulatorRegistry.register(sim));
```

**Plugin manifest for a simulator:**

```typescript
const manifest: PluginManifest = {
  id: 'my-custom-simulator',
  name: 'Deploy Simulator',
  version: '1.0.0',
  type: 'simulator',
  apiVersion: '^1.0.0',
};
```

### 5. Adapters

Adapter plugins add execution handlers for custom action classes. Built-in adapters cover `file`, `shell`, `git`, `npm`, `http`, `deploy`, `infra`, and `mcp` actions.

**Integration point:** `packages/adapters/src/registry.ts` — register via `AdapterRegistry`.

**Plugin manifest for an adapter:**

```typescript
const manifest: PluginManifest = {
  id: 'agentguard-adapter-jira',
  name: 'Jira Adapter',
  version: '1.0.0',
  type: 'adapter',
  apiVersion: '^1.0.0',
  capabilities: ['network'],
};
```

### 6. Replay Processors

Replay processors transform persisted event streams for analysis, visualization, or testing.

**Integration point:** `packages/kernel/src/replay-processor.ts` — implement the `ReplayProcessor` interface.

**Scaffold a replay processor:**

```bash
agentguard init replay-processor
```

**Planned community processors:**
| Processor | Description |
|-----------|-------------|
| Session summarizer | Aggregate session events into a report |
| Error pattern detector | Identify recurring violation patterns |
| Governance auditor | Extract and format decisions for compliance review |

## Extension Guidelines

1. **Declare capabilities up-front.** Every capability used at runtime must be declared in the manifest. The sandbox denies undeclared access and records a violation.

2. **Export `createSimulator` for simulator plugins.** The simulator loader expects a named `createSimulator` export. Other plugin types integrate via their respective registries.

3. **Schema compliance.** Plugins must conform to existing event, policy, and manifest schemas. Manifests are validated before registration.

4. **Deterministic behavior.** Policy packs, invariants, and replay processors must be deterministic. Given the same input they must produce the same output.

5. **Independent operation.** Each plugin must work in isolation. Removing a plugin must not break the core system or other plugins.

6. **Publish with keyword.** Publish npm packages with the `agentguard-plugin` keyword so `agentguard plugin search` can discover them.
