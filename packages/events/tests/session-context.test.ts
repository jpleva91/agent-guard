import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEvent,
  resetEventCounter,
  createInMemoryStore,
  ACTION_EXECUTED,
  ACTION_DENIED,
  ACTION_ALLOWED,
  TEST_COMPLETED,
  DEPLOY_COMPLETED,
  COMMIT_CREATED,
  FILE_SAVED,
  INVARIANT_VIOLATION,
} from '@red-codes/events';
import {
  projectSessionContext,
  projectSessionContextFromStore,
  createSessionContextTracker,
} from '../src/session-context.js';

describe('session-context', () => {
  beforeEach(() => {
    resetEventCounter();
  });

  describe('projectSessionContext', () => {
    it('returns empty context for no events', () => {
      const ctx = projectSessionContext([]);
      expect(ctx.modifiedFiles.size).toBe(0);
      expect(ctx.deletedFiles.size).toBe(0);
      expect(ctx.testState.ran).toBe(false);
      expect(ctx.testState.lastResult).toBeNull();
      expect(ctx.deployState.triggered).toBe(false);
      expect(ctx.gitState.commits).toHaveLength(0);
      expect(ctx.gitState.pushed).toBe(false);
      expect(ctx.actionCount).toBe(0);
      expect(ctx.denialCount).toBe(0);
      expect(ctx.violationCount).toBe(0);
      expect(ctx.lastUpdated).toBe(0);
    });

    it('tracks file writes from ActionExecuted events', () => {
      const events = [
        createEvent(ACTION_EXECUTED, {
          actionType: 'file.write',
          target: 'src/index.ts',
          result: 'ok',
        }),
        createEvent(ACTION_EXECUTED, {
          actionType: 'file.write',
          target: 'src/utils.ts',
          result: 'ok',
        }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.modifiedFiles.size).toBe(2);
      expect(ctx.modifiedFiles.has('src/index.ts')).toBe(true);
      expect(ctx.modifiedFiles.has('src/utils.ts')).toBe(true);
      expect(ctx.actionCount).toBe(2);
    });

    it('tracks file deletes and removes from modified set', () => {
      const events = [
        createEvent(ACTION_EXECUTED, {
          actionType: 'file.write',
          target: 'src/temp.ts',
          result: 'ok',
        }),
        createEvent(ACTION_EXECUTED, {
          actionType: 'file.delete',
          target: 'src/temp.ts',
          result: 'ok',
        }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.modifiedFiles.has('src/temp.ts')).toBe(false);
      expect(ctx.deletedFiles.has('src/temp.ts')).toBe(true);
    });

    it('re-writing a deleted file moves it back to modified', () => {
      const events = [
        createEvent(ACTION_EXECUTED, {
          actionType: 'file.delete',
          target: 'src/revived.ts',
          result: 'ok',
        }),
        createEvent(ACTION_EXECUTED, {
          actionType: 'file.write',
          target: 'src/revived.ts',
          result: 'ok',
        }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.modifiedFiles.has('src/revived.ts')).toBe(true);
      expect(ctx.deletedFiles.has('src/revived.ts')).toBe(false);
    });

    it('tracks test results cumulatively', () => {
      const events = [
        createEvent(TEST_COMPLETED, {
          result: 'pass',
          suite: 'unit',
          passed: 10,
          failed: 0,
          total: 10,
        }),
        createEvent(TEST_COMPLETED, {
          result: 'fail',
          suite: 'integration',
          passed: 5,
          failed: 2,
          total: 7,
        }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.testState.ran).toBe(true);
      expect(ctx.testState.lastResult).toBe('fail');
      expect(ctx.testState.passed).toBe(15);
      expect(ctx.testState.failed).toBe(2);
      expect(ctx.testState.total).toBe(17);
      expect(ctx.testState.suites).toEqual(['unit', 'integration']);
    });

    it('does not duplicate suite names', () => {
      const events = [
        createEvent(TEST_COMPLETED, {
          result: 'pass',
          suite: 'unit',
          passed: 5,
          failed: 0,
          total: 5,
        }),
        createEvent(TEST_COMPLETED, {
          result: 'pass',
          suite: 'unit',
          passed: 3,
          failed: 0,
          total: 3,
        }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.testState.suites).toEqual(['unit']);
    });

    it('tracks deploy state', () => {
      const events = [
        createEvent(DEPLOY_COMPLETED, {
          result: 'success',
          environment: 'staging',
        }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.deployState.triggered).toBe(true);
      expect(ctx.deployState.lastResult).toBe('success');
      expect(ctx.deployState.environment).toBe('staging');
    });

    it('tracks git commits from CommitCreated events', () => {
      const events = [
        createEvent(COMMIT_CREATED, { hash: 'abc123' }),
        createEvent(COMMIT_CREATED, { hash: 'def456', message: 'fix: bug' }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.gitState.commits).toEqual(['abc123', 'def456']);
    });

    it('tracks git push from ActionExecuted', () => {
      const events = [
        createEvent(ACTION_EXECUTED, {
          actionType: 'git.push',
          target: 'origin/main',
          result: 'ok',
        }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.gitState.pushed).toBe(true);
    });

    it('tracks branch creation and checkout', () => {
      const events = [
        createEvent(ACTION_EXECUTED, {
          actionType: 'git.branch.create',
          target: 'feature/new',
          result: 'ok',
        }),
        createEvent(ACTION_EXECUTED, {
          actionType: 'git.checkout',
          target: 'feature/new',
          result: 'ok',
        }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.gitState.branchesCreated).toEqual(['feature/new']);
      expect(ctx.gitState.branchesCheckedOut).toEqual(['feature/new']);
    });

    it('deduplicates branch creation', () => {
      const events = [
        createEvent(ACTION_EXECUTED, {
          actionType: 'git.branch.create',
          target: 'feature/x',
          result: 'ok',
        }),
        createEvent(ACTION_EXECUTED, {
          actionType: 'git.branch.create',
          target: 'feature/x',
          result: 'ok',
        }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.gitState.branchesCreated).toEqual(['feature/x']);
    });

    it('tracks denials and violations', () => {
      const events = [
        createEvent(ACTION_DENIED, {
          actionType: 'file.write',
          target: 'secrets.env',
          reason: 'protected path',
        }),
        createEvent(ACTION_DENIED, {
          actionType: 'git.push',
          target: 'main',
          reason: 'protected branch',
        }),
        createEvent(INVARIANT_VIOLATION, {
          invariant: 'no-force-push',
          expected: 'no force push',
          actual: 'force push detected',
        }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.denialCount).toBe(2);
      expect(ctx.violationCount).toBe(1);
    });

    it('tracks FileSaved events as modified files', () => {
      const events = [
        createEvent(FILE_SAVED, { file: 'src/app.ts' }),
        createEvent(FILE_SAVED, { file: 'src/config.ts' }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.modifiedFiles.has('src/app.ts')).toBe(true);
      expect(ctx.modifiedFiles.has('src/config.ts')).toBe(true);
    });

    it('tracks ActionAllowed as action count', () => {
      const events = [
        createEvent(ACTION_ALLOWED, {
          actionType: 'file.read',
          target: 'src/index.ts',
          capability: 'default',
        }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.actionCount).toBe(1);
    });

    it('sets lastUpdated to most recent event timestamp', () => {
      const events = [
        createEvent(FILE_SAVED, { file: 'a.ts' }),
        createEvent(FILE_SAVED, { file: 'b.ts' }),
      ];

      const ctx = projectSessionContext(events);
      expect(ctx.lastUpdated).toBeGreaterThan(0);
      expect(ctx.lastUpdated).toBe(events[events.length - 1].timestamp);
    });
  });

  describe('projectSessionContextFromStore', () => {
    it('projects context from an event store', () => {
      const store = createInMemoryStore();
      store.append(
        createEvent(ACTION_EXECUTED, {
          actionType: 'file.write',
          target: 'src/main.ts',
          result: 'ok',
        })
      );
      store.append(createEvent(TEST_COMPLETED, { result: 'pass' }));

      const ctx = projectSessionContextFromStore(store);
      expect(ctx.modifiedFiles.has('src/main.ts')).toBe(true);
      expect(ctx.testState.ran).toBe(true);
      expect(ctx.actionCount).toBe(1);
    });
  });

  describe('createSessionContextTracker', () => {
    it('starts with empty context', () => {
      const tracker = createSessionContextTracker();
      const ctx = tracker.snapshot();
      expect(ctx.actionCount).toBe(0);
      expect(ctx.modifiedFiles.size).toBe(0);
    });

    it('incrementally applies events', () => {
      const tracker = createSessionContextTracker();

      tracker.apply(
        createEvent(ACTION_EXECUTED, {
          actionType: 'file.write',
          target: 'src/index.ts',
          result: 'ok',
        })
      );
      expect(tracker.snapshot().modifiedFiles.size).toBe(1);

      tracker.apply(
        createEvent(TEST_COMPLETED, { result: 'pass', passed: 5, failed: 0, total: 5 })
      );
      const ctx = tracker.snapshot();
      expect(ctx.testState.ran).toBe(true);
      expect(ctx.testState.passed).toBe(5);
      expect(ctx.actionCount).toBe(1);
    });

    it('returns independent snapshots', () => {
      const tracker = createSessionContextTracker();
      tracker.apply(
        createEvent(ACTION_EXECUTED, {
          actionType: 'file.write',
          target: 'a.ts',
          result: 'ok',
        })
      );

      const snap1 = tracker.snapshot();

      tracker.apply(
        createEvent(ACTION_EXECUTED, {
          actionType: 'file.write',
          target: 'b.ts',
          result: 'ok',
        })
      );

      const snap2 = tracker.snapshot();

      expect(snap1.modifiedFiles.size).toBe(1);
      expect(snap2.modifiedFiles.size).toBe(2);
    });

    it('produces same result as batch projection', () => {
      const events = [
        createEvent(ACTION_EXECUTED, {
          actionType: 'file.write',
          target: 'src/a.ts',
          result: 'ok',
        }),
        createEvent(ACTION_DENIED, {
          actionType: 'git.push',
          target: 'main',
          reason: 'denied',
        }),
        createEvent(TEST_COMPLETED, { result: 'pass', passed: 3, failed: 0, total: 3 }),
        createEvent(COMMIT_CREATED, { hash: 'abc' }),
      ];

      const batchCtx = projectSessionContext(events);

      const tracker = createSessionContextTracker();
      for (const event of events) {
        tracker.apply(event);
      }
      const incrementalCtx = tracker.snapshot();

      expect(incrementalCtx.actionCount).toBe(batchCtx.actionCount);
      expect(incrementalCtx.denialCount).toBe(batchCtx.denialCount);
      expect(incrementalCtx.modifiedFiles.size).toBe(batchCtx.modifiedFiles.size);
      expect(incrementalCtx.testState.passed).toBe(batchCtx.testState.passed);
      expect(incrementalCtx.gitState.commits).toEqual(batchCtx.gitState.commits);
    });
  });
});
