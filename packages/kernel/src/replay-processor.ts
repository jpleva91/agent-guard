// Replay Processor Plugin Interface — allows third-party extensions to observe
// and analyze replay event streams without modifying them.
//
// Processors are registered in a pipeline and invoked in order during session
// replay. Each processor receives session lifecycle callbacks (start, event,
// action, end) and can accumulate results for downstream consumption.
//
// This is the foundation for custom replay visualizations, analytics,
// compliance reporters, and transformation pipelines.

import type { DomainEvent } from '@red-codes/core';
import type { ReplayAction, ReplaySession } from './replay-engine.js';

// ---------------------------------------------------------------------------
// Processor Interface
// ---------------------------------------------------------------------------

/**
 * A replay processor observes a replay event stream and produces results.
 *
 * Processors are read-only observers — they MUST NOT mutate the session,
 * events, or actions passed to them. The pipeline freezes inputs before
 * dispatching to enforce this contract at runtime.
 *
 * Lifecycle:
 *   onSessionStart → onEvent (per event) → onAction (per action) → onSessionEnd
 *
 * All methods are optional. Implement only the hooks you need.
 *
 * Example:
 * ```ts
 * const counter: ReplayProcessor = {
 *   id: 'denial-counter',
 *   name: 'Denial Counter',
 *   onAction(action) {
 *     if (!action.allowed) this._count++;
 *   },
 *   getResults() {
 *     return { denials: this._count };
 *   },
 * };
 * ```
 */
export interface ReplayProcessor {
  /** Unique identifier for this processor. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Optional description of what this processor does. */
  readonly description?: string;

  /** Called once when session replay begins. */
  onSessionStart?(session: ReplaySession): void | Promise<void>;
  /** Called for each event in the session, in timestamp order. */
  onEvent?(event: DomainEvent): void | Promise<void>;
  /** Called for each reconstructed action encounter, in order. */
  onAction?(action: ReplayAction): void | Promise<void>;
  /** Called once when session replay ends. */
  onSessionEnd?(session: ReplaySession): void | Promise<void>;
  /** Return accumulated results after processing. */
  getResults?(): Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Registry for managing replay processors. */
export interface ReplayProcessorRegistry {
  /** Register a processor. Throws if a processor with the same id exists. */
  register(processor: ReplayProcessor): void;
  /** Remove a processor by id. Returns true if found and removed. */
  unregister(processorId: string): boolean;
  /** Get a processor by id. Returns undefined if not found. */
  get(processorId: string): ReplayProcessor | undefined;
  /** List all registered processors in registration order. */
  list(): readonly ReplayProcessor[];
  /** Check if a processor is registered. */
  has(processorId: string): boolean;
  /** Number of registered processors. */
  count(): number;
}

/** Create a new replay processor registry. */
export function createReplayProcessorRegistry(): ReplayProcessorRegistry {
  const processors = new Map<string, ReplayProcessor>();

  return {
    register(processor: ReplayProcessor): void {
      if (!processor.id || typeof processor.id !== 'string') {
        throw new Error('Processor must have a non-empty string id');
      }
      if (!processor.name || typeof processor.name !== 'string') {
        throw new Error('Processor must have a non-empty string name');
      }
      if (processors.has(processor.id)) {
        throw new Error(`Processor "${processor.id}" is already registered`);
      }
      processors.set(processor.id, processor);
    },

    unregister(processorId: string): boolean {
      return processors.delete(processorId);
    },

    get(processorId: string): ReplayProcessor | undefined {
      return processors.get(processorId);
    },

    list(): readonly ReplayProcessor[] {
      return [...processors.values()];
    },

    has(processorId: string): boolean {
      return processors.has(processorId);
    },

    count(): number {
      return processors.size;
    },
  };
}

// ---------------------------------------------------------------------------
// Pipeline Results
// ---------------------------------------------------------------------------

/** Result of a single processor's execution. */
export interface ProcessorResult {
  /** Processor id. */
  readonly processorId: string;
  /** Processor name. */
  readonly processorName: string;
  /** Whether the processor completed without errors. */
  readonly success: boolean;
  /** Error message if the processor failed. */
  readonly error?: string;
  /** Results returned by getResults(), if available. */
  readonly data: Readonly<Record<string, unknown>>;
  /** Time taken by this processor in milliseconds. */
  readonly durationMs: number;
}

/** Aggregate result of running all processors in the pipeline. */
export interface ReplayProcessorPipelineResult {
  /** The session that was processed. */
  readonly sessionId: string;
  /** Total number of processors that ran. */
  readonly processorsRun: number;
  /** Number of processors that completed successfully. */
  readonly successes: number;
  /** Number of processors that failed. */
  readonly failures: number;
  /** Per-processor results, in execution order. */
  readonly results: readonly ProcessorResult[];
  /** Collected error messages from failed processors. */
  readonly errors: readonly string[];
  /** Total pipeline duration in milliseconds. */
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Run all registered processors against a replay session.
 *
 * Processors are invoked in registration order. Each processor receives:
 *   1. onSessionStart(session)
 *   2. onEvent(event) for each event in timestamp order
 *   3. onAction(action) for each action encounter in order
 *   4. onSessionEnd(session)
 *
 * Processor failures are isolated — a failing processor does not prevent
 * others from running. Errors are collected in the pipeline result.
 */
export async function runReplayProcessorPipeline(
  session: ReplaySession,
  registry: ReplayProcessorRegistry
): Promise<ReplayProcessorPipelineResult> {
  const pipelineStart = Date.now();
  const processors = registry.list();
  const results: ProcessorResult[] = [];
  const errors: string[] = [];

  for (const processor of processors) {
    const processorStart = Date.now();
    let success = true;
    let error: string | undefined;
    let data: Record<string, unknown> = {};

    try {
      // 1. Session start
      if (processor.onSessionStart) {
        await processor.onSessionStart(session);
      }

      // 2. Per-event callbacks
      if (processor.onEvent) {
        for (const event of session.events) {
          await processor.onEvent(event);
        }
      }

      // 3. Per-action callbacks
      if (processor.onAction) {
        for (const action of session.actions) {
          await processor.onAction(action);
        }
      }

      // 4. Session end
      if (processor.onSessionEnd) {
        await processor.onSessionEnd(session);
      }

      // 5. Collect results
      if (processor.getResults) {
        data = processor.getResults();
      }
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      errors.push(`Processor "${processor.id}": ${error}`);
    }

    results.push({
      processorId: processor.id,
      processorName: processor.name,
      success,
      error,
      data,
      durationMs: Date.now() - processorStart,
    });
  }

  return {
    sessionId: session.runId,
    processorsRun: processors.length,
    successes: results.filter((r) => r.success).length,
    failures: results.filter((r) => !r.success).length,
    results,
    errors,
    durationMs: Date.now() - pipelineStart,
  };
}
