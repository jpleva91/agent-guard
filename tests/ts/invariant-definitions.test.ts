// Tests for invariant definitions and checker — TypeScript version
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_INVARIANTS,
  SENSITIVE_FILE_PATTERNS,
  CREDENTIAL_PATH_PATTERNS,
  CREDENTIAL_BASENAME_PATTERNS,
  isCredentialPath,
} from '../../src/invariants/definitions.js';
import type { SystemState } from '../../src/invariants/definitions.js';
import { checkAllInvariants, buildSystemState } from '../../src/invariants/checker.js';
import { resetEventCounter } from '../../src/events/schema.js';

beforeEach(() => {
  resetEventCounter();
});

function findInvariant(id: string) {
  const inv = DEFAULT_INVARIANTS.find((i) => i.id === id);
  if (!inv) throw new Error(`Invariant ${id} not found`);
  return inv;
}

describe('no-secret-exposure', () => {
  const inv = findInvariant('no-secret-exposure');

  it('holds when no sensitive files are modified', () => {
    const result = inv.check({ modifiedFiles: ['src/index.ts', 'README.md'] });
    expect(result.holds).toBe(true);
  });

  it('fails when .env file is modified', () => {
    const result = inv.check({ modifiedFiles: ['.env'] });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('.env');
  });

  it('fails for credentials files', () => {
    const result = inv.check({ modifiedFiles: ['config/credentials.json'] });
    expect(result.holds).toBe(false);
  });

  it('fails for key files', () => {
    const result = inv.check({ modifiedFiles: ['ssl/server.pem'] });
    expect(result.holds).toBe(false);
  });

  it('detects case-insensitive matches', () => {
    const result = inv.check({ modifiedFiles: ['SECRET_CONFIG.yaml'] });
    expect(result.holds).toBe(false);
  });

  it('holds when modifiedFiles is empty', () => {
    const result = inv.check({});
    expect(result.holds).toBe(true);
  });

  it('fails for .npmrc file', () => {
    const result = inv.check({ modifiedFiles: ['.npmrc'] });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('.npmrc');
  });

  it('fails for SSH key id_rsa', () => {
    const result = inv.check({ modifiedFiles: ['~/.ssh/id_rsa'] });
    expect(result.holds).toBe(false);
  });

  it('fails for SSH key id_ed25519', () => {
    const result = inv.check({ modifiedFiles: ['~/.ssh/id_ed25519'] });
    expect(result.holds).toBe(false);
  });

  it('fails for secrets.yaml', () => {
    const result = inv.check({ modifiedFiles: ['config/secrets.yaml'] });
    expect(result.holds).toBe(false);
  });

  it('fails for vault.json', () => {
    const result = inv.check({ modifiedFiles: ['vault.json'] });
    expect(result.holds).toBe(false);
  });

  it('fails for keystore files', () => {
    const result = inv.check({ modifiedFiles: ['app.keystore'] });
    expect(result.holds).toBe(false);
  });

  it('fails for .netrc', () => {
    const result = inv.check({ modifiedFiles: ['.netrc'] });
    expect(result.holds).toBe(false);
  });

  it('fails for .p12 certificate', () => {
    const result = inv.check({ modifiedFiles: ['cert.p12'] });
    expect(result.holds).toBe(false);
  });
});

describe('SENSITIVE_FILE_PATTERNS export', () => {
  it('is an array with expanded patterns', () => {
    expect(Array.isArray(SENSITIVE_FILE_PATTERNS)).toBe(true);
    expect(SENSITIVE_FILE_PATTERNS.length).toBeGreaterThan(6);
  });

  it('includes new patterns', () => {
    expect(SENSITIVE_FILE_PATTERNS).toContain('.npmrc');
    expect(SENSITIVE_FILE_PATTERNS).toContain('id_rsa');
    expect(SENSITIVE_FILE_PATTERNS).toContain('secrets.yaml');
    expect(SENSITIVE_FILE_PATTERNS).toContain('vault.json');
  });
});

describe('protected-branch', () => {
  const inv = findInvariant('protected-branch');

  it('holds when not pushing to protected branch', () => {
    const result = inv.check({ targetBranch: 'feature', directPush: true });
    expect(result.holds).toBe(true);
  });

  it('fails on direct push to main', () => {
    const result = inv.check({ targetBranch: 'main', directPush: true });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('main');
  });

  it('fails on direct push to master', () => {
    const result = inv.check({ targetBranch: 'master', directPush: true });
    expect(result.holds).toBe(false);
  });

  it('holds when pushing to main without directPush', () => {
    const result = inv.check({ targetBranch: 'main', directPush: false });
    expect(result.holds).toBe(true);
  });

  it('respects custom protected branches', () => {
    const result = inv.check({
      targetBranch: 'production',
      directPush: true,
      protectedBranches: ['production', 'staging'],
    });
    expect(result.holds).toBe(false);
  });
});

describe('blast-radius-limit', () => {
  const inv = findInvariant('blast-radius-limit');

  it('holds when files affected is within limit', () => {
    const result = inv.check({ filesAffected: 5 });
    expect(result.holds).toBe(true);
  });

  it('fails when files affected exceeds default limit (20)', () => {
    const result = inv.check({ filesAffected: 25 });
    expect(result.holds).toBe(false);
  });

  it('respects custom limit', () => {
    const result = inv.check({ filesAffected: 8, blastRadiusLimit: 5 });
    expect(result.holds).toBe(false);
  });

  it('prefers simulated blast radius over static count', () => {
    const result = inv.check({
      filesAffected: 5,
      simulatedBlastRadius: 25,
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('simulated');
  });

  it('uses static count when no simulation available', () => {
    const result = inv.check({ filesAffected: 3 });
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('static');
  });

  it('defaults to 0 files when nothing specified', () => {
    const result = inv.check({});
    expect(result.holds).toBe(true);
  });
});

describe('test-before-push', () => {
  const inv = findInvariant('test-before-push');

  it('holds when not a push operation', () => {
    const result = inv.check({ isPush: false });
    expect(result.holds).toBe(true);
  });

  it('holds when tests pass before push', () => {
    const result = inv.check({ isPush: true, testsPass: true });
    expect(result.holds).toBe(true);
  });

  it('fails when pushing without tests passing', () => {
    const result = inv.check({ isPush: true, testsPass: false });
    expect(result.holds).toBe(false);
  });

  it('fails when tests status is undefined during push', () => {
    const result = inv.check({ isPush: true });
    expect(result.holds).toBe(false);
  });
});

describe('no-force-push', () => {
  const inv = findInvariant('no-force-push');

  it('holds for normal push', () => {
    const result = inv.check({ forcePush: false });
    expect(result.holds).toBe(true);
  });

  it('fails for force push', () => {
    const result = inv.check({ forcePush: true });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Force push');
  });

  it('holds when forcePush is not set', () => {
    const result = inv.check({});
    expect(result.holds).toBe(true);
  });
});

describe('no-skill-modification', () => {
  const inv = findInvariant('no-skill-modification');

  it('holds when target is outside .claude/skills/', () => {
    const result = inv.check({ currentTarget: 'src/index.ts' });
    expect(result.holds).toBe(true);
  });

  it('fails when currentTarget is a skill file', () => {
    const result = inv.check({ currentTarget: '.claude/skills/my-skill/SKILL.md' });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('target');
  });

  it('fails when currentTarget is nested in skills directory', () => {
    const result = inv.check({ currentTarget: '.claude/skills/ui-ux-pro-max/data/landing.csv' });
    expect(result.holds).toBe(false);
  });

  it('fails when currentCommand references .claude/skills/', () => {
    const result = inv.check({ currentCommand: 'rm -rf .claude/skills/old-skill' });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('command');
  });

  it('fails when modifiedFiles includes skill files', () => {
    const result = inv.check({
      modifiedFiles: ['src/index.ts', '.claude/skills/my-skill/SKILL.md'],
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('modified');
  });

  it('handles Windows backslash paths', () => {
    const result = inv.check({ currentTarget: '.claude\\skills\\my-skill\\SKILL.md' });
    expect(result.holds).toBe(false);
  });

  it('holds with empty state', () => {
    const result = inv.check({});
    expect(result.holds).toBe(true);
  });

  it('holds when .claude path does not include skills', () => {
    const result = inv.check({ currentTarget: '.claude/settings.json' });
    expect(result.holds).toBe(true);
  });
});

describe('no-scheduled-task-modification', () => {
  const inv = findInvariant('no-scheduled-task-modification');

  it('holds when target is outside .claude/scheduled-tasks/', () => {
    const result = inv.check({ currentTarget: 'src/index.ts' });
    expect(result.holds).toBe(true);
  });

  it('fails when currentTarget is a scheduled task file', () => {
    const result = inv.check({
      currentTarget: '.claude/scheduled-tasks/daily-sync/SKILL.md',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('target');
  });

  it('fails when currentTarget is nested in scheduled-tasks directory', () => {
    const result = inv.check({
      currentTarget: '.claude/scheduled-tasks/check-inbox/config.json',
    });
    expect(result.holds).toBe(false);
  });

  it('fails when currentCommand references .claude/scheduled-tasks/', () => {
    const result = inv.check({
      currentCommand: 'rm -rf .claude/scheduled-tasks/old-task',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('command');
  });

  it('fails when modifiedFiles includes scheduled task files', () => {
    const result = inv.check({
      modifiedFiles: ['src/index.ts', '.claude/scheduled-tasks/daily-sync/SKILL.md'],
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('modified');
  });

  it('handles Windows backslash paths', () => {
    const result = inv.check({
      currentTarget: '.claude\\scheduled-tasks\\daily-sync\\SKILL.md',
    });
    expect(result.holds).toBe(false);
  });

  it('holds with empty state', () => {
    const result = inv.check({});
    expect(result.holds).toBe(true);
  });

  it('holds when .claude path does not include scheduled-tasks', () => {
    const result = inv.check({ currentTarget: '.claude/settings.json' });
    expect(result.holds).toBe(true);
  });

  it('holds when path contains "scheduled" but not "scheduled-tasks/"', () => {
    const result = inv.check({ currentTarget: 'src/scheduled-handler.ts' });
    expect(result.holds).toBe(true);
  });

  it('detects all three violation vectors simultaneously', () => {
    const result = inv.check({
      currentTarget: '.claude/scheduled-tasks/task-a/SKILL.md',
      currentCommand: 'cat .claude/scheduled-tasks/task-b/SKILL.md',
      modifiedFiles: ['.claude/scheduled-tasks/task-c/SKILL.md'],
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('target');
    expect(result.actual).toContain('command');
    expect(result.actual).toContain('modified');
  });

  it('has severity 5 (highest — DENY intervention)', () => {
    expect(inv.severity).toBe(5);
  });
});

describe('isCredentialPath', () => {
  it('detects SSH key paths', () => {
    expect(isCredentialPath('/home/user/.ssh/id_rsa')).toBe(true);
    expect(isCredentialPath('/home/user/.ssh/id_ed25519')).toBe(true);
    expect(isCredentialPath('/home/user/.ssh/authorized_keys')).toBe(true);
    expect(isCredentialPath('/home/user/.ssh/config')).toBe(true);
  });

  it('detects AWS credential paths', () => {
    expect(isCredentialPath('/home/user/.aws/credentials')).toBe(true);
    expect(isCredentialPath('/home/user/.aws/config')).toBe(true);
  });

  it('detects Google Cloud paths', () => {
    expect(isCredentialPath('/home/user/.config/gcloud/credentials.json')).toBe(true);
  });

  it('detects Azure paths', () => {
    expect(isCredentialPath('/home/user/.azure/credentials')).toBe(true);
  });

  it('detects Docker config', () => {
    expect(isCredentialPath('/home/user/.docker/config.json')).toBe(true);
  });

  it('detects .npmrc at any depth', () => {
    expect(isCredentialPath('.npmrc')).toBe(true);
    expect(isCredentialPath('/home/user/.npmrc')).toBe(true);
  });

  it('detects .pypirc', () => {
    expect(isCredentialPath('/home/user/.pypirc')).toBe(true);
  });

  it('detects .netrc and .curlrc', () => {
    expect(isCredentialPath('/home/user/.netrc')).toBe(true);
    expect(isCredentialPath('/home/user/.curlrc')).toBe(true);
  });

  it('detects .env files at any depth', () => {
    expect(isCredentialPath('.env')).toBe(true);
    expect(isCredentialPath('.env.local')).toBe(true);
    expect(isCredentialPath('.env.production')).toBe(true);
    expect(isCredentialPath('config/.env')).toBe(true);
    expect(isCredentialPath('apps/web/.env.staging')).toBe(true);
  });

  it('handles Windows backslash paths', () => {
    expect(isCredentialPath('C:\\Users\\user\\.ssh\\id_rsa')).toBe(true);
    expect(isCredentialPath('C:\\Users\\user\\.aws\\credentials')).toBe(true);
    expect(isCredentialPath('C:\\Users\\user\\.docker\\config.json')).toBe(true);
  });

  it('returns false for safe paths', () => {
    expect(isCredentialPath('src/index.ts')).toBe(false);
    expect(isCredentialPath('README.md')).toBe(false);
    expect(isCredentialPath('package.json')).toBe(false);
    expect(isCredentialPath('.eslintrc.json')).toBe(false);
  });

  it('returns false for paths that partially match but are not credential files', () => {
    expect(isCredentialPath('docs/ssh-guide.md')).toBe(false);
    expect(isCredentialPath('src/aws-client.ts')).toBe(false);
    // .env-like but not .env pattern
    expect(isCredentialPath('environment.ts')).toBe(false);
  });
});

describe('CREDENTIAL_PATH_PATTERNS export', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(CREDENTIAL_PATH_PATTERNS)).toBe(true);
    expect(CREDENTIAL_PATH_PATTERNS.length).toBeGreaterThan(0);
  });
});

describe('CREDENTIAL_BASENAME_PATTERNS export', () => {
  it('includes key credential basenames', () => {
    expect(CREDENTIAL_BASENAME_PATTERNS).toContain('.npmrc');
    expect(CREDENTIAL_BASENAME_PATTERNS).toContain('.pypirc');
    expect(CREDENTIAL_BASENAME_PATTERNS).toContain('.netrc');
    expect(CREDENTIAL_BASENAME_PATTERNS).toContain('.curlrc');
  });
});

describe('no-credential-file-creation', () => {
  const inv = findInvariant('no-credential-file-creation');

  it('has severity 5', () => {
    expect(inv.severity).toBe(5);
  });

  it('fails when file.write targets SSH key', () => {
    const result = inv.check({
      currentTarget: '/home/user/.ssh/id_rsa',
      currentActionType: 'file.write',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('.ssh/id_rsa');
  });

  it('fails when file.write targets .env file', () => {
    const result = inv.check({
      currentTarget: '.env',
      currentActionType: 'file.write',
    });
    expect(result.holds).toBe(false);
  });

  it('fails when file.write targets .env.local', () => {
    const result = inv.check({
      currentTarget: '.env.local',
      currentActionType: 'file.write',
    });
    expect(result.holds).toBe(false);
  });

  it('fails when file.move targets AWS credentials', () => {
    const result = inv.check({
      currentTarget: '/home/user/.aws/credentials',
      currentActionType: 'file.move',
    });
    expect(result.holds).toBe(false);
  });

  it('fails when file.write targets .npmrc', () => {
    const result = inv.check({
      currentTarget: '/home/user/.npmrc',
      currentActionType: 'file.write',
    });
    expect(result.holds).toBe(false);
  });

  it('fails when file.write targets Docker config', () => {
    const result = inv.check({
      currentTarget: '/home/user/.docker/config.json',
      currentActionType: 'file.write',
    });
    expect(result.holds).toBe(false);
  });

  it('fails when file.write targets Google Cloud credentials', () => {
    const result = inv.check({
      currentTarget: '/home/user/.config/gcloud/application_default_credentials.json',
      currentActionType: 'file.write',
    });
    expect(result.holds).toBe(false);
  });

  it('fails when file.write targets Azure credentials', () => {
    const result = inv.check({
      currentTarget: '/home/user/.azure/accessTokens.json',
      currentActionType: 'file.write',
    });
    expect(result.holds).toBe(false);
  });

  it('holds when file.read targets credential file (reads are allowed)', () => {
    const result = inv.check({
      currentTarget: '/home/user/.ssh/id_rsa',
      currentActionType: 'file.read',
    });
    expect(result.holds).toBe(true);
  });

  it('holds when file.delete targets credential file (deletion not blocked)', () => {
    const result = inv.check({
      currentTarget: '/home/user/.ssh/id_rsa',
      currentActionType: 'file.delete',
    });
    expect(result.holds).toBe(true);
  });

  it('holds when file.write targets a safe path', () => {
    const result = inv.check({
      currentTarget: 'src/index.ts',
      currentActionType: 'file.write',
    });
    expect(result.holds).toBe(true);
  });

  it('holds with empty state', () => {
    const result = inv.check({});
    expect(result.holds).toBe(true);
  });

  it('still checks credential path when actionType is not set (conservative)', () => {
    const result = inv.check({
      currentTarget: '/home/user/.ssh/id_rsa',
    });
    expect(result.holds).toBe(false);
  });

  it('handles Windows backslash paths', () => {
    const result = inv.check({
      currentTarget: 'C:\\Users\\user\\.ssh\\id_rsa',
      currentActionType: 'file.write',
    });
    expect(result.holds).toBe(false);
  });
});

describe('lockfile-integrity', () => {
  const inv = findInvariant('lockfile-integrity');

  it('holds when no manifest changed', () => {
    const result = inv.check({ modifiedFiles: ['src/index.ts'] });
    expect(result.holds).toBe(true);
  });

  it('holds when package.json and package-lock.json both changed', () => {
    const result = inv.check({
      modifiedFiles: ['package.json', 'package-lock.json'],
    });
    expect(result.holds).toBe(true);
  });

  it('fails when package.json changed without lockfile', () => {
    const result = inv.check({ modifiedFiles: ['package.json'] });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('without lockfile');
  });

  it('holds when package.json changed with yarn.lock', () => {
    const result = inv.check({
      modifiedFiles: ['package.json', 'yarn.lock'],
    });
    expect(result.holds).toBe(true);
  });

  it('holds when package.json changed with pnpm-lock.yaml', () => {
    const result = inv.check({
      modifiedFiles: ['package.json', 'pnpm-lock.yaml'],
    });
    expect(result.holds).toBe(true);
  });

  it('handles nested package.json paths', () => {
    const result = inv.check({
      modifiedFiles: ['packages/core/package.json', 'packages/core/package-lock.json'],
    });
    expect(result.holds).toBe(true);
  });

  it('fails for nested package.json without lockfile', () => {
    const result = inv.check({
      modifiedFiles: ['packages/core/package.json'],
    });
    expect(result.holds).toBe(false);
  });
});

describe('checkAllInvariants', () => {
  it('returns allHold true when all invariants pass', () => {
    const state: SystemState = {
      modifiedFiles: ['src/index.ts'],
      filesAffected: 1,
    };
    const { allHold, violations, events } = checkAllInvariants(DEFAULT_INVARIANTS, state);
    expect(allHold).toBe(true);
    expect(violations).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('returns violations and events when invariants fail', () => {
    const state: SystemState = {
      modifiedFiles: ['.env'],
      forcePush: true,
    };
    const { allHold, violations, events } = checkAllInvariants(DEFAULT_INVARIANTS, state);
    expect(allHold).toBe(false);
    expect(violations.length).toBeGreaterThan(0);
    expect(events.length).toBe(violations.length);
    expect(events[0].kind).toBe('InvariantViolation');
  });

  it('generates INVARIANT_VIOLATION events with metadata', () => {
    const state: SystemState = {
      modifiedFiles: ['.env'],
    };
    const { events } = checkAllInvariants(DEFAULT_INVARIANTS, state);
    const secretEvent = events.find(
      (e) => (e as Record<string, unknown>).invariant === 'no-secret-exposure'
    );
    expect(secretEvent).toBeDefined();
    const evt = secretEvent as unknown as Record<string, unknown>;
    expect((evt.metadata as Record<string, unknown>).severity).toBe(5);
  });
});

describe('buildSystemState', () => {
  it('returns defaults for empty context', () => {
    const state = buildSystemState({});
    expect(state.modifiedFiles).toEqual([]);
    expect(state.targetBranch).toBe('');
    expect(state.directPush).toBe(false);
    expect(state.forcePush).toBe(false);
    expect(state.isPush).toBe(false);
    expect(state.filesAffected).toBe(0);
    expect(state.blastRadiusLimit).toBe(20);
    expect(state.protectedBranches).toEqual(['main', 'master']);
    expect(state.currentTarget).toBe('');
    expect(state.currentCommand).toBe('');
    expect(state.currentActionType).toBe('');
  });

  it('populates from context values', () => {
    const state = buildSystemState({
      modifiedFiles: ['a.ts', 'b.ts'],
      targetBranch: 'main',
      directPush: true,
      forcePush: true,
      isPush: true,
      testsPass: true,
      filesAffected: 5,
      blastRadiusLimit: 10,
      protectedBranches: ['production'],
      currentTarget: 'src/index.ts',
      currentCommand: 'npm test',
      currentActionType: 'file.write',
    });
    expect(state.modifiedFiles).toEqual(['a.ts', 'b.ts']);
    expect(state.targetBranch).toBe('main');
    expect(state.directPush).toBe(true);
    expect(state.filesAffected).toBe(5);
    expect(state.currentTarget).toBe('src/index.ts');
    expect(state.currentCommand).toBe('npm test');
    expect(state.currentActionType).toBe('file.write');
  });

  it('computes filesAffected from modifiedFiles when not specified', () => {
    const state = buildSystemState({
      modifiedFiles: ['a.ts', 'b.ts', 'c.ts'],
    });
    expect(state.filesAffected).toBe(3);
  });
});
