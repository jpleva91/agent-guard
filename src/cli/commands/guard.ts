// CLI command: agentguard guard — start the governed action runtime.
// Reads stdin for action proposals (JSON), evaluates them, writes results to stdout.
// Uses the renderer plugin system for all human-facing output.
// Supports policy composition: multiple --policy flags merged with precedence.

import { createKernel } from '../../kernel/kernel.js';
import type { KernelConfig } from '../../kernel/kernel.js';
import { createLiveRegistry } from '../../adapters/registry.js';
import { createTelemetryDecisionSink } from '../../telemetry/runtimeLogger.js';
import { loadPolicyDefs, loadComposedPolicies, describeComposition } from '../policy-resolver.js';
import { createSimulatorRegistry } from '../../kernel/simulation/registry.js';
import { createGitSimulator } from '../../kernel/simulation/git-simulator.js';
import { createFilesystemSimulator } from '../../kernel/simulation/filesystem-simulator.js';
import { createPackageSimulator } from '../../kernel/simulation/package-simulator.js';
import type { RawAgentAction } from '../../kernel/aab.js';
import { generateSeed, createSeededRng } from '../../core/rng.js';
import { simpleHash } from '../../core/hash.js';
import { createRendererRegistry } from '../../renderers/registry.js';
import type { RendererRegistry } from '../../renderers/registry.js';
import { createTuiRenderer } from '../../renderers/tui-renderer.js';
import { createEvent, POLICY_COMPOSED, POLICY_TRACE_RECORDED } from '../../events/schema.js';

import { createStorageBundle } from '../../storage/factory.js';
import type { StorageConfig } from '../../storage/types.js';
import type { PolicyTracePayload } from '../../renderers/types.js';

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
}

export async function guard(_args: string[], options: GuardOptions = {}): Promise<number> {
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
    simulators.register(createPackageSimulator());
  }

  // Create seeded RNG — seed is stored in session metadata for deterministic replay
  const seed = generateSeed();
  const rng = createSeededRng(seed);

  // Generate run ID using seeded RNG so both sinks share it
  const runId = `run_${Date.now()}_${simpleHash(rng.random().toString())}`;

  // Create sinks — use storage bundle if configured, otherwise default JSONL
  const storeConfig = options.store ?? { backend: 'jsonl' as const };
  const storage = await createStorageBundle(storeConfig);
  const eventSink = storage.createEventSink(runId);
  const decisionSink = storage.createDecisionSink(runId);
  const telemetrySink = createTelemetryDecisionSink();

  // Build kernel config
  const kernelConfig: KernelConfig = {
    runId,
    rng,
    policyDefs,
    dryRun: options.dryRun ?? false,
    adapters: options.dryRun ? undefined : createLiveRegistry(),
    sinks: [eventSink],
    decisionSinks: [decisionSink, telemetrySink],
    simulators: simulators.all().length > 0 ? simulators : undefined,
  };

  const kernel = createKernel(kernelConfig);

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

  // Notify renderers: run started
  const simCount = simulators.all().length;
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

  return processStdin(kernel, renderers, storage);
}

async function processStdin(
  kernel: ReturnType<typeof createKernel>,
  renderers: RendererRegistry,
  storage: { close(): void }
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

    const shutdown = () => {
      kernel.shutdown();
      renderers.notifyRunEnded({
        runId: kernel.getRunId(),
        totalActions,
        allowed: allowedCount,
        denied: deniedCount,
        violations: violationCount,
        durationMs: Date.now() - startTime,
      });
      renderers.disposeAll();
      storage.close();
    };

    process.stdin.on('end', () => {
      shutdown();
      resolvePromise(0);
    });

    process.on('SIGINT', () => {
      shutdown();
      process.stderr.write('\n  \x1b[33mAgentGuard stopped.\x1b[0m\n\n');
      resolvePromise(0);
    });
  });
}
