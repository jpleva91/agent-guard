import type {
  AdapterRegistry,
  DomainEvent,
  EventKind,
  EventSink,
  RunManifest,
} from '@red-codes/core';
import type { LoadedPolicy } from '@red-codes/policy';
import type {
  KernelResult,
  PauseHandler,
  SnapshotProvider,
  ModifyHandler,
} from '@red-codes/kernel';
import type { DecisionSink } from '@red-codes/kernel';

/**
 * SDK configuration for creating a governance SDK instance.
 */
export interface SDKConfig {
  /** Policy definitions to load. If omitted, runs in fail-open mode. */
  readonly policies?: LoadedPolicy[];
  /** When true, the kernel evaluates but does not execute actions. */
  readonly dryRun?: boolean;
  /** Custom adapter registry. If omitted, a dry-run registry is used when dryRun=true. */
  readonly adapters?: AdapterRegistry;
  /** Event sinks for persistence (e.g., JSONL, SQLite). */
  readonly sinks?: EventSink[];
  /** Decision sinks for persisting governance decision records. */
  readonly decisionSinks?: DecisionSink[];
  /** Run manifest declaring capability scope for the session. */
  readonly manifest?: RunManifest;
  /** Callback for PAUSE interventions. If omitted, PAUSE auto-denies. */
  readonly pauseHandler?: PauseHandler;
  /** Snapshot provider for ROLLBACK support. */
  readonly snapshotProvider?: SnapshotProvider;
  /** Callback for MODIFY interventions. If omitted, MODIFY auto-denies. */
  readonly modifyHandler?: ModifyHandler;
  /** Default-deny mode. When true, actions without a matching allow rule are denied. Default: true. */
  readonly defaultDeny?: boolean;
  /** Invariant IDs to disable. */
  readonly disabledInvariants?: string[];
}

/**
 * Event handler callback type.
 */
export type EventHandler = (event: DomainEvent) => void;

/**
 * A governed session wraps the kernel with session lifecycle management.
 */
export interface GovernedSession {
  /** Unique session/run identifier */
  readonly id: string;
  /** Propose an action for governance evaluation and optional execution. */
  propose(action: RawActionInput): Promise<KernelResult>;
  /** Subscribe to governance events. Returns an unsubscribe function. */
  on(kind: EventKind, handler: EventHandler): () => void;
  /** Subscribe to all governance events. Returns an unsubscribe function. */
  onAny(handler: EventHandler): () => void;
  /** Get the full action log for this session. */
  getActionLog(): KernelResult[];
  /** Get total event count for this session. */
  getEventCount(): number;
  /** Get the run manifest if one was configured. */
  getManifest(): RunManifest | null;
  /** End the session and release resources. */
  end(): void;
}

/**
 * Input for proposing an action. Simplified from RawAgentAction — callers
 * provide the fields they know and the SDK handles normalization.
 */
export interface RawActionInput {
  /** Tool name (e.g., 'Bash', 'Write', 'Edit') */
  readonly tool?: string;
  /** Shell command (for Bash tool) */
  readonly command?: string;
  /** File path (for file operations) */
  readonly file?: string;
  /** File content (for write operations) */
  readonly content?: string;
  /** Git branch */
  readonly branch?: string;
  /** Agent identifier */
  readonly agent?: string;
  /** Additional metadata */
  readonly [key: string]: unknown;
}

/**
 * The main AgentGuard SDK interface.
 */
export interface GovernanceSDK {
  /** Create a new governed session with the SDK's configuration. */
  createSession(overrides?: Partial<SDKConfig>): GovernedSession;
  /** One-shot evaluation: create a temporary session, evaluate a single action, return the result. */
  evaluate(action: RawActionInput): Promise<KernelResult>;
}
