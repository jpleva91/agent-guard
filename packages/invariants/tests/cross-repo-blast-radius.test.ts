import { describe, it, expect } from 'vitest';
import { DEFAULT_INVARIANTS } from '@red-codes/invariants';

function findInvariant(id: string) {
  const inv = DEFAULT_INVARIANTS.find((i) => i.id === id);
  if (!inv) throw new Error(`Invariant ${id} not found`);
  return inv;
}

describe('cross-repo-blast-radius', () => {
  const inv = findInvariant('cross-repo-blast-radius');

  it('holds when no files have been written this session', () => {
    const result = inv.check({});
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('No files written');
  });

  it('holds when sessionWrittenFiles is empty', () => {
    const result = inv.check({ sessionWrittenFiles: [] });
    expect(result.holds).toBe(true);
  });

  it('holds when file count is within the default limit (50)', () => {
    const files = Array.from({ length: 49 }, (_, i) => `/repo-a/src/file${i}.ts`);
    const result = inv.check({ sessionWrittenFiles: files });
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('49');
  });

  it('holds at exactly the default limit (50)', () => {
    const files = Array.from({ length: 50 }, (_, i) => `/repo-a/src/file${i}.ts`);
    const result = inv.check({ sessionWrittenFiles: files });
    expect(result.holds).toBe(true);
  });

  it('fails when file count exceeds the default limit (50)', () => {
    const files = Array.from({ length: 51 }, (_, i) => `/repo-a/src/file${i}.ts`);
    const result = inv.check({ sessionWrittenFiles: files });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('51');
    expect(result.expected).toContain('50');
  });

  it('fails for the multi-repo scenario described in issue #1415 (4 repos, 15 files each)', () => {
    const repos = ['agent-guard', 'agentguard-analytics', 'agentguard-cloud', 'shellforge'];
    const files = repos.flatMap((repo) =>
      Array.from({ length: 15 }, (_, i) => `/workspace/${repo}/src/file${i}.ts`)
    );
    // 4 repos × 15 files = 60 files — exceeds default limit of 50
    expect(files.length).toBe(60);
    const result = inv.check({ sessionWrittenFiles: files });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('60');
  });

  it('respects a custom crossRepoBlastRadiusLimit', () => {
    const files = Array.from({ length: 30 }, (_, i) => `/repo-a/src/file${i}.ts`);
    const result = inv.check({ sessionWrittenFiles: files, crossRepoBlastRadiusLimit: 25 });
    expect(result.holds).toBe(false);
    expect(result.expected).toContain('25');
  });

  it('holds with custom limit when under threshold', () => {
    const files = Array.from({ length: 10 }, (_, i) => `/repo-a/src/file${i}.ts`);
    const result = inv.check({ sessionWrittenFiles: files, crossRepoBlastRadiusLimit: 25 });
    expect(result.holds).toBe(true);
  });

  it('has severity 4', () => {
    expect(inv.severity).toBe(4);
  });
});
