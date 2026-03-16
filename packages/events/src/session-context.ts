// Session-aware context tracking — cumulative state projected from the event stream.
// Enables policies like "deny push if no tests have been run this session"
// or "require review after modifying more than 10 files."
// No DOM, no Node.js APIs — pure domain logic.

import type { DomainEvent, EventStore } from '@red-codes/core';

// ---------------------------------------------------------------------------
// Session Context Types
// ---------------------------------------------------------------------------

/** Cumulative test state within a session */
export interface TestState {
  readonly ran: boolean;
  readonly lastResult: 'pass' | 'fail' | null;
  readonly passed: number;
  readonly failed: number;
  readonly total: number;
  readonly suites: readonly string[];
}

/** Cumulative deploy state within a session */
export interface DeployState {
  readonly triggered: boolean;
  readonly lastResult: string | null;
  readonly environment: string | null;
}

/** Cumulative git state within a session */
export interface GitState {
  readonly commits: readonly string[];
  readonly pushed: boolean;
  readonly branchesCreated: readonly string[];
  readonly branchesCheckedOut: readonly string[];
}

/** Session-aware context — cumulative state projected from domain events */
export interface SessionContext {
  readonly modifiedFiles: ReadonlySet<string>;
  readonly deletedFiles: ReadonlySet<string>;
  readonly testState: TestState;
  readonly deployState: DeployState;
  readonly gitState: GitState;
  readonly actionCount: number;
  readonly denialCount: number;
  readonly violationCount: number;
  readonly lastUpdated: number;
}

/** Incremental session context tracker */
export interface SessionContextTracker {
  apply(event: DomainEvent): void;
  snapshot(): SessionContext;
}

// ---------------------------------------------------------------------------
// Internal Mutable State
// ---------------------------------------------------------------------------

interface MutableTestState {
  ran: boolean;
  lastResult: 'pass' | 'fail' | null;
  passed: number;
  failed: number;
  total: number;
  suites: string[];
}

interface MutableDeployState {
  triggered: boolean;
  lastResult: string | null;
  environment: string | null;
}

interface MutableGitState {
  commits: string[];
  pushed: boolean;
  branchesCreated: string[];
  branchesCheckedOut: string[];
}

interface MutableSessionContext {
  modifiedFiles: Set<string>;
  deletedFiles: Set<string>;
  testState: MutableTestState;
  deployState: MutableDeployState;
  gitState: MutableGitState;
  actionCount: number;
  denialCount: number;
  violationCount: number;
  lastUpdated: number;
}

// ---------------------------------------------------------------------------
// Factory & Helpers
// ---------------------------------------------------------------------------

const createMutableContext = (): MutableSessionContext => ({
  modifiedFiles: new Set(),
  deletedFiles: new Set(),
  testState: { ran: false, lastResult: null, passed: 0, failed: 0, total: 0, suites: [] },
  deployState: { triggered: false, lastResult: null, environment: null },
  gitState: { commits: [], pushed: false, branchesCreated: [], branchesCheckedOut: [] },
  actionCount: 0,
  denialCount: 0,
  violationCount: 0,
  lastUpdated: 0,
});

const freeze = (ctx: MutableSessionContext): SessionContext => ({
  modifiedFiles: new Set(ctx.modifiedFiles),
  deletedFiles: new Set(ctx.deletedFiles),
  testState: { ...ctx.testState, suites: [...ctx.testState.suites] },
  deployState: { ...ctx.deployState },
  gitState: {
    ...ctx.gitState,
    commits: [...ctx.gitState.commits],
    branchesCreated: [...ctx.gitState.branchesCreated],
    branchesCheckedOut: [...ctx.gitState.branchesCheckedOut],
  },
  actionCount: ctx.actionCount,
  denialCount: ctx.denialCount,
  violationCount: ctx.violationCount,
  lastUpdated: ctx.lastUpdated,
});

// ---------------------------------------------------------------------------
// Event Application
// ---------------------------------------------------------------------------

const applyEventToContext = (ctx: MutableSessionContext, event: DomainEvent): void => {
  ctx.lastUpdated = event.timestamp;

  switch (event.kind) {
    case 'ActionExecuted': {
      ctx.actionCount++;
      const actionType = event.actionType as string | undefined;
      const target = event.target as string | undefined;

      if (actionType === 'file.write' && target) {
        ctx.modifiedFiles.add(target);
        ctx.deletedFiles.delete(target);
      } else if (actionType === 'file.delete' && target) {
        ctx.deletedFiles.add(target);
        ctx.modifiedFiles.delete(target);
      } else if (actionType === 'git.push') {
        ctx.gitState.pushed = true;
      } else if (actionType === 'git.branch.create' && target) {
        if (!ctx.gitState.branchesCreated.includes(target)) {
          ctx.gitState.branchesCreated.push(target);
        }
      } else if (actionType === 'git.checkout' && target) {
        ctx.gitState.branchesCheckedOut.push(target);
      }
      break;
    }

    case 'ActionAllowed':
      ctx.actionCount++;
      break;

    case 'ActionDenied':
      ctx.denialCount++;
      break;

    case 'InvariantViolation':
      ctx.violationCount++;
      break;

    case 'TestCompleted': {
      ctx.testState.ran = true;
      const result = event.result as string | undefined;
      ctx.testState.lastResult = result === 'pass' ? 'pass' : 'fail';
      const passed = event.passed as number | undefined;
      const failed = event.failed as number | undefined;
      const total = event.total as number | undefined;
      if (passed !== undefined) ctx.testState.passed += passed;
      if (failed !== undefined) ctx.testState.failed += failed;
      if (total !== undefined) ctx.testState.total += total;
      const suite = event.suite as string | undefined;
      if (suite && !ctx.testState.suites.includes(suite)) {
        ctx.testState.suites.push(suite);
      }
      break;
    }

    case 'DeployCompleted': {
      ctx.deployState.triggered = true;
      ctx.deployState.lastResult = (event.result as string) ?? null;
      ctx.deployState.environment = (event.environment as string) ?? null;
      break;
    }

    case 'CommitCreated': {
      const hash = event.hash as string | undefined;
      if (hash) {
        ctx.gitState.commits.push(hash);
      }
      break;
    }

    case 'FileSaved': {
      const file = event.file as string | undefined;
      if (file) {
        ctx.modifiedFiles.add(file);
      }
      break;
    }

    default:
      break;
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Project a SessionContext from an array of DomainEvents.
 * Events are processed in order to build cumulative state.
 */
export const projectSessionContext = (events: readonly DomainEvent[]): SessionContext => {
  const ctx = createMutableContext();
  for (const event of events) {
    applyEventToContext(ctx, event);
  }
  return freeze(ctx);
};

/**
 * Project a SessionContext from an EventStore.
 * Replays all events in the store to build cumulative state.
 */
export const projectSessionContextFromStore = (store: EventStore): SessionContext => {
  return projectSessionContext(store.replay());
};

/**
 * Create an incremental session context tracker.
 * Call `apply(event)` for each new event, and `snapshot()` to get the current state.
 * This is more efficient than re-projecting from the full event stream on every query.
 */
export const createSessionContextTracker = (): SessionContextTracker => {
  const ctx = createMutableContext();
  return {
    apply(event: DomainEvent): void {
      applyEventToContext(ctx, event);
    },
    snapshot(): SessionContext {
      return freeze(ctx);
    },
  };
};
