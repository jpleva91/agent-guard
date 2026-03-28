import { describe, it, expect } from 'vitest';
import { DEFAULT_INVARIANTS } from '../src/definitions.js';

const invariant = DEFAULT_INVARIANTS.find((i) => i.id === 'commit-scope-guard')!;

describe('commit-scope-guard invariant', () => {
  it('skips when not a git.commit action', () => {
    const result = invariant.check({ currentActionType: 'file.write' });
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('skipped');
  });

  it('skips when currentActionType is undefined', () => {
    const result = invariant.check({});
    expect(result.holds).toBe(true);
  });

  it('holds when all staged files are in session write log', () => {
    const result = invariant.check({
      currentActionType: 'git.commit',
      stagedFiles: ['src/foo.ts', 'src/bar.ts'],
      sessionWrittenFiles: ['src/foo.ts', 'src/bar.ts'],
    });
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('2 staged file(s) match');
  });

  it('holds when session wrote more files than staged', () => {
    const result = invariant.check({
      currentActionType: 'git.commit',
      stagedFiles: ['src/foo.ts'],
      sessionWrittenFiles: ['src/foo.ts', 'src/bar.ts', 'README.md'],
    });
    expect(result.holds).toBe(true);
  });

  it('fails when unexpected staged files found', () => {
    const result = invariant.check({
      currentActionType: 'git.commit',
      stagedFiles: ['src/foo.ts', 'README.md', 'package.json'],
      sessionWrittenFiles: ['src/foo.ts'],
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('2 unexpected staged file(s)');
    expect(result.actual).toContain('README.md');
    expect(result.actual).toContain('package.json');
  });

  it('allows (fail-open) when no session write log available', () => {
    const result = invariant.check({
      currentActionType: 'git.commit',
      stagedFiles: ['src/foo.ts'],
      sessionWrittenFiles: [],
    });
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('fail-open');
  });

  it('allows (fail-open) when sessionWrittenFiles is undefined', () => {
    const result = invariant.check({
      currentActionType: 'git.commit',
      stagedFiles: ['src/foo.ts'],
    });
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('fail-open');
  });

  it('holds when stagedFiles is empty', () => {
    const result = invariant.check({
      currentActionType: 'git.commit',
      stagedFiles: [],
      sessionWrittenFiles: ['src/foo.ts'],
    });
    expect(result.holds).toBe(true);
  });

  it('holds when stagedFiles is undefined (fail-open)', () => {
    const result = invariant.check({
      currentActionType: 'git.commit',
    });
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('No staged files');
  });

  it('allows (fail-open) with many staged files but no write log', () => {
    const staged = Array.from({ length: 10 }, (_, i) => `file${i}.ts`);
    const result = invariant.check({
      currentActionType: 'git.commit',
      stagedFiles: staged,
      sessionWrittenFiles: [],
    });
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('fail-open');
  });

  it('truncates unexpected list to 5 with count suffix', () => {
    const staged = Array.from({ length: 8 }, (_, i) => `file${i}.ts`);
    const result = invariant.check({
      currentActionType: 'git.commit',
      stagedFiles: staged,
      sessionWrittenFiles: ['file0.ts'],
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('7 unexpected');
    expect(result.actual).toContain('(+2 more)');
  });
});
