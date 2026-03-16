// CLI command: agentguard guard — start the governed action runtime.
// Reads stdin for action proposals (JSON), evaluates them, writes results to stdout.
// Uses the renderer plugin system for all human-facing output.
// Supports policy composition: multiple --policy flags merged with precedence.

import { createKernel } from '@red-codes/kernel';
import type { KernelConfig } from '@red-codes/kernel';
import { createLiveRegistry } from '@red-codes/adapters';
import { loadPolicyDefs, loadComposedPolicies, describeComposition } from '../policy-resolver.js';
import { createSimulatorRegistry } from '@red-codes/kernel';
import { createGitSimulator } from '@red-codes/kernel';
import { createFilesystemSimulator } from '@red-codes/kernel';
import { createPackageSimulator } from '@red-codes/kernel';
import { createDependencyGraphSimulator } from '@red-codes/kernel';
import type { RawAgentAction } from '@red-codes/kernel';
import { generateSeed, createSeededRng } from '@red-codes/core';
import { simpleHash } from '@red-codes/core';
import { createPluginRegistry, loadSimulatorPlugins } from '@red-codes/plugins';
import { createRendererRegistry } from '@red-codes/renderers';
import type { RendererRegistry } from '@red-codes/renderers';
import { createTuiRenderer } from '@red-codes/renderers';
import { createEvent, POLICY_COMPOSED, POLICY_TRACE_RECORDED } from '@red-codes/events';

import { createStorageBundle } from '@red-codes/storage';
import type { StorageBundle } from '@red-codes/storage';
import type { StorageConfig } from '@red-codes/storage';
import type { PolicyTracePayload } from '@red-codes/renderers';
import { createCloudSinks } from '@red-codes/telemetry';
import type { CloudSinkBundle } from '@red-codes/telemetry';
import { loadIdentity, resolveMode } from '@red-codes/telemetry-client';

export interface GuardOptions {
  /** Single policy path (backwards compatible) */
  policy?: string;
  /** Multiple policy paths for composition */
  policies?: string[];
  dryRun?: boolean;
  verbose?: boolean;
  trace?: boolean;
  stdin?: boolean;
  simulate?: boolean;
  /** Optional pre-configured renderer registry (for custom renderers) */
  renderers?: RendererRegistry;
  /** Storage backend config */
  store?: StorageConfig;
  /** Skip auto-opening session viewer in browser after run */
  noOpen?: boolean;
}

export async function guard(_args: string[], options: GuardOptions = {}): Promise<number> {
  // Buffer stdin immediately — async setup below can cause a race where piped
  // input arrives (and EOF fires) before processStdin() attaches 'data' handlers.
  // resume() switches stdin to flowing mode so Node.js buffers chunks in memory.
  if (!process.stdin.isTTY) {
    process.stdin.resume();
  }

  // Resolve policies — use composition if multiple paths provided
  const explicitPaths = options.policies ?? (options.policy ? [options.policy] : undefined);
  const useComposition = explicitPaths && explicitPaths.length > 1;

  let policyDefs: unknown[];
  let policyName: string;

  if (useComposition || explicitPaths) {
    const composition = loadComposedPolicies(explicitPaths);
    policyDefs = composition.policies;
    policyName = describeComposition(composition);
  } else {
    policyDefs = loadPolicyDefs(options.policy);
    policyName = options.policy || 'default (no file)';
  }

  // Build simulator registry (enabled by default)
  const simulators = createSimulatorRegistry();
  if (options.simulate !== false) {
    simulators.register(createGitSimulator());
    simulators.register(createFilesystemSimulator());
    simulators.register(createDependencyGraphSimulator());
    simulators.register(createPackageSimulator());

    // Load community simulator plugins from the plugin registry
    try {
      const pluginRegistry = createPluginRegistry();
      await loadSimulatorPlugins(pluginRegistry, (sim) => simulators.register(sim));
    } catch {
      // Plugin loading failures are non-fatal — built-in simulators still work
    }
  }

  // Create seeded RNG — seed is stored in session metadata for deterministic replay
  const seed = generateSeed();
  const rng = createSeededRng(seed);

  // Generate run ID using seeded RNG so both sinks share it
  const runId = `run_${Date.now()}_${simpleHash(rng.random().toString())}`;

  // Create sinks — use storage bundle
  const storeConfig = options.store ?? { backend: 'sqlite' as const };
  const storage = await createStorageBundle(storeConfig);
  const eventSink = storage.createEventSink(runId);
  const decisionSink = storage.createDecisionSink(runId);

  // Cloud telemetry — anonymous by default
  const identity = loadIdentity();
  const telemetryMode = resolveMode(identity);
  const apiKey = process.env.AGENTGUARD_API_KEY ?? identity?.enrollment_token;
  const cloudSinks = await createCloudSinks({
    mode: telemetryMode,
    serverUrl:
      process.env.AGENTGUARD_TELEMETRY_URL ??
      identity?.server_url ??
      'https://agentguard-cloud.vercel.app',
    runId,
    agentId: 'cli',
    installId: identity?.install_id,
    apiKey,
  });

  // First-run telemetry notice
  if (!identity || !identity.noticed) {
    try {
      process.stderr.write(
        '\n  \x1b[2mAgentGuard sends anonymous usage data to help improve the product.\n' +
          '  Run `agentguard telemetry off` to disable.\x1b[0m\n\n'
      );
      const { saveIdentity: save, generateIdentity: gen } =
        await import('@red-codes/telemetry-client');
      const updated = identity ?? gen('anonymous');
      save({ ...updated, noticed: true });
    } catch {
      // Non-fatal
    }
  }

  // Build kernel config
  const kernelConfig: KernelConfig = {
    runId,
    rng,
    policyDefs,
    dryRun: options.dryRun ?? false,
    adapters: options.dryRun ? undefined : createLiveRegistry(),
    sinks: [eventSink, cloudSinks.eventSink],
    decisionSinks: [decisionSink, cloudSinks.decisionSink],
    simulators: simulators.all().length > 0 ? simulators : undefined,
  };

  const kernel = createKernel(kernelConfig);
  cloudSinks.registerRun();

  // Emit PolicyComposed event when multiple policies are composed
  if (useComposition) {
    const composition = loadComposedPolicies(explicitPaths);
    const composedEvent = createEvent(POLICY_COMPOSED, {
      policyCount: composition.policies.length,
      totalRules: composition.policies.reduce((sum, p) => sum + p.rules.length, 0),
      sources: composition.sources.map((s) => ({
        path: s.path,
        layer: s.layer,
        policyId: s.policy.id,
        ruleCount: s.policy.rules.length,
      })),
      layers: composition.layers,
    });
    eventSink.write(composedEvent);
  }

  // Set up renderer registry — use provided registry or create default with TUI
  const renderers = options.renderers ?? createRendererRegistry();
  if (!options.renderers) {
    renderers.register(createTuiRenderer({ verbose: options.verbose, trace: options.trace }));
  }

  // Record session start in the sessions table (SQLite only)
  const simCount = simulators.all().length;
  if (storage.sessions) {
    storage.sessions.start(runId, 'guard', {
      policyFile: policyName,
      dryRun: options.dryRun,
      storageBackend: storeConfig.backend,
      simulatorCount: simCount,
    });
  }

  // Notify renderers: run started
  renderers.notifyRunStarted({
    runId,
    policyName,
    invariantCount: 6,
    verbose: options.verbose,
    dryRun: options.dryRun,
    simulatorCount: simCount,
    trace: options.trace,
  });

  if (!options.stdin) {
    // Interactive mode prompt
    process.stderr.write(
      `  ${'\x1b[2m'}Listening for actions on stdin (JSON per line)...${'\x1b[0m'}\n`
    );
    process.stderr.write(`  ${'\x1b[2m'}Press Ctrl+C to stop.${'\x1b[0m'}\n\n`);
  }

  return processStdin(kernel, renderers, storage, cloudSinks, {
    noOpen: options.noOpen,
    storeConfig,
  });
}

async function processStdin(
  kernel: ReturnType<typeof createKernel>,
  renderers: RendererRegistry,
  storage: StorageBundle,
  cloudSinks: CloudSinkBundle,
  viewerOpts: { noOpen?: boolean; storeConfig: StorageConfig }
): Promise<number> {
  const startTime = Date.now();
  let totalActions = 0;
  let allowedCount = 0;
  let deniedCount = 0;
  let violationCount = 0;

  return new Promise((resolvePromise) => {
    let buffer = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const rawAction = JSON.parse(trimmed) as RawAgentAction;
          const result = await kernel.propose(rawAction);

          totalActions++;
          if (result.allowed) allowedCount++;
          else deniedCount++;
          violationCount += result.decision.violations.length;

          // Dispatch to all registered renderers
          renderers.notifyActionResult(result);

          // Dispatch policy trace events for real-time visualization
          for (const event of result.events) {
            if (event.kind === POLICY_TRACE_RECORDED) {
              renderers.notifyPolicyTrace(event as unknown as PolicyTracePayload);
            }
          }

          if (result.decisionRecord) {
            renderers.notifyDecisionRecord(result.decisionRecord);
          }

          // Write machine-readable result to stdout
          const output = {
            allowed: result.allowed,
            executed: result.executed,
            action: result.decision.intent.action,
            target: result.decision.intent.target,
            reason: result.decision.decision.reason,
            violations: result.decision.violations.map((v) => v.name),
            runId: result.runId,
            decisionRecordId: result.decisionRecord?.recordId,
          };
          process.stdout.write(JSON.stringify(output) + '\n');
        } catch (err) {
          process.stderr.write(
            `  \x1b[31mError:\x1b[0m Invalid JSON input: ${(err as Error).message}\n`
          );
        }
      }
    });

    const shutdown = async () => {
      kernel.shutdown();

      // Record session end in the sessions table (SQLite only)
      if (storage.sessions) {
        storage.sessions.end(kernel.getRunId(), {
          totalActions,
          allowed: allowedCount,
          denied: deniedCount,
          violations: violationCount,
          durationMs: Date.now() - startTime,
        });
      }

      renderers.notifyRunEnded({
        runId: kernel.getRunId(),
        totalActions,
        allowed: allowedCount,
        denied: deniedCount,
        violations: violationCount,
        durationMs: Date.now() - startTime,
      });
      renderers.disposeAll();
      await cloudSinks.flush();
      cloudSinks.stop();
      storage.close();
    };

    process.stdin.on('end', async () => {
      await shutdown();
      await openSessionViewer(viewerOpts);
      resolvePromise(0);
    });

    process.on('SIGINT', async () => {
      await shutdown();
      process.stderr.write('\n  \x1b[33mAgentGuard stopped.\x1b[0m\n\n');
      await openSessionViewer(viewerOpts);
      resolvePromise(0);
    });
  });
}

async function openSessionViewer(opts: {
  noOpen?: boolean;
  storeConfig: StorageConfig;
}): Promise<void> {
  if (opts.noOpen) return;
  try {
    const { sessionViewer } = await import('./session-viewer.js');
    const viewerArgs = ['--last'];
    if (opts.storeConfig.backend === 'sqlite') {
      viewerArgs.push('--store', 'sqlite');
      if (opts.storeConfig.dbPath) {
        viewerArgs.push('--db-path', opts.storeConfig.dbPath);
      }
    }
    await sessionViewer(viewerArgs, opts.storeConfig);
  } catch (err) {
    // Non-fatal — session viewer is best-effort
    process.stderr.write(
      `  \x1b[2mSession viewer: ${err instanceof Error ? err.message : String(err)}\x1b[0m\n`
    );
  }
}
