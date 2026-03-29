// Tests for the no-self-approve-pr invariant
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_INVARIANTS } from '@red-codes/invariants';
import type { SystemState } from '@red-codes/invariants';
import { resetEventCounter } from '@red-codes/events';

beforeEach(() => {
  resetEventCounter();
});

function findInvariant(id: string) {
  const inv = DEFAULT_INVARIANTS.find((i) => i.id === id);
  if (!inv) throw new Error(`Invariant ${id} not found`);
  return inv;
}

function baseState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    modifiedFiles: [],
    targetBranch: '',
    directPush: false,
    forcePush: false,
    isPush: false,
    filesAffected: 0,
    blastRadiusLimit: 20,
    protectedBranches: ['main', 'master'],
    currentTarget: '',
    currentCommand: '',
    currentActionType: '',
    fileContentDiff: '',
    ...overrides,
  };
}

describe('no-self-approve-pr invariant', () => {
  const invariant = findInvariant('no-self-approve-pr');

  it('is defined with severity 5', () => {
    expect(invariant.id).toBe('no-self-approve-pr');
    expect(invariant.severity).toBe(5);
  });

  // ── Skip conditions ───────────────────────────────────────────────────────

  it('passes for unrelated action types', () => {
    const result = invariant.check(
      baseState({ currentActionType: 'file.write', agentGitHubUser: 'bot-agent' })
    );
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('skipped');
  });

  it('passes for git.push (not a PR action)', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'git.push',
        prAuthors: ['bot-agent'],
        agentGitHubUser: 'bot-agent',
      })
    );
    expect(result.holds).toBe(true);
  });

  it('passes for github.pr.review without --approve flag', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'github.pr.review',
        currentCommand: 'gh pr review 123 --request-changes --body "needs work"',
        prAuthors: ['bot-agent'],
        agentGitHubUser: 'bot-agent',
      })
    );
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('not an approval');
  });

  it('passes for github.pr.review comment (no --approve)', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'github.pr.review',
        currentCommand: 'gh pr review 123 --comment --body "LGTM structure"',
        prAuthors: ['bot-agent'],
        agentGitHubUser: 'bot-agent',
      })
    );
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('not an approval');
  });

  // ── Fail-open conditions ──────────────────────────────────────────────────

  it('fails open when agentGitHubUser is not set', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'github.pr.merge',
        currentCommand: 'gh pr merge 42',
        prAuthors: ['bot-agent'],
        agentGitHubUser: undefined,
      })
    );
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('not available');
  });

  it('fails open when prAuthors is empty', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'github.pr.merge',
        currentCommand: 'gh pr merge 42',
        prAuthors: [],
        agentGitHubUser: 'bot-agent',
      })
    );
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('not available');
  });

  it('fails open when prAuthors is undefined', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'github.pr.merge',
        currentCommand: 'gh pr merge 42',
        prAuthors: undefined,
        agentGitHubUser: 'bot-agent',
      })
    );
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('not available');
  });

  // ── Core violations ───────────────────────────────────────────────────────

  it('blocks self-merge: agent merging its own PR', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'github.pr.merge',
        currentCommand: 'gh pr merge 42',
        prAuthors: ['kernel-bot'],
        agentGitHubUser: 'kernel-bot',
      })
    );
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Self-approval detected');
    expect(result.actual).toContain('@kernel-bot');
  });

  it('blocks self-approve: agent approving its own PR via gh pr review --approve', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'github.pr.review',
        currentCommand: 'gh pr review 123 --approve',
        prAuthors: ['kernel-bot'],
        agentGitHubUser: 'kernel-bot',
      })
    );
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Self-approval detected');
  });

  // ── Safe conditions ───────────────────────────────────────────────────────

  it('allows merge when agent is not the PR author', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'github.pr.merge',
        currentCommand: 'gh pr merge 42',
        prAuthors: ['other-agent'],
        agentGitHubUser: 'reviewer-bot',
      })
    );
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('not the PR author');
  });

  it('allows approve when agent is not the PR author', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'github.pr.review',
        currentCommand: 'gh pr review 123 --approve',
        prAuthors: ['feature-bot'],
        agentGitHubUser: 'reviewer-bot',
      })
    );
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('not the PR author');
  });

  // ── Case-insensitive comparison ───────────────────────────────────────────

  it('is case-insensitive when comparing usernames', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'github.pr.merge',
        currentCommand: 'gh pr merge 99',
        prAuthors: ['KernelBot'],
        agentGitHubUser: 'kernelbot',
      })
    );
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Self-approval');
  });

  it('is case-insensitive when agent has uppercase username', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'github.pr.merge',
        currentCommand: 'gh pr merge 99',
        prAuthors: ['kernelbot'],
        agentGitHubUser: 'KernelBot',
      })
    );
    expect(result.holds).toBe(false);
  });

  // ── Co-author / multiple authors ──────────────────────────────────────────

  it('blocks merge when agent is one of multiple PR authors', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'github.pr.merge',
        currentCommand: 'gh pr merge 77',
        prAuthors: ['human-dev', 'kernel-bot', 'another-agent'],
        agentGitHubUser: 'kernel-bot',
      })
    );
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Self-approval detected');
  });

  it('allows merge when agent is not among multiple PR authors', () => {
    const result = invariant.check(
      baseState({
        currentActionType: 'github.pr.merge',
        currentCommand: 'gh pr merge 77',
        prAuthors: ['human-dev', 'other-bot'],
        agentGitHubUser: 'reviewer-bot',
      })
    );
    expect(result.holds).toBe(true);
  });
});
