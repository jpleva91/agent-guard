// Tests for config CLI command
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}));

vi.mock('../src/policy-resolver.js', () => ({
  findDefaultPolicy: vi.fn(() => null),
}));

import {
  config,
  resolveConfig,
  loadConfigFile,
  saveConfigFile,
  getConfigValue,
  setConfigValue,
} from '../src/commands/config.js';
import type { AgentGuardConfig } from '../src/commands/config.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('resolveConfig', () => {
  it('returns defaults when no config files exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const cfg = resolveConfig('/mock-cwd');
    expect(cfg.storage).toBe('sqlite');
    expect(cfg.autoSetup).toBe(true);
    expect(cfg.viewer?.autoOpen).toBe(true);
  });

  it('merges user-level config over defaults', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      return String(p).includes(join('/mock-home', '.agentguard', 'config.yaml'));
    });
    vi.mocked(readFileSync).mockReturnValue('storage: sqlite\nautoSetup: false\n');

    const cfg = resolveConfig('/mock-cwd');
    expect(cfg.storage).toBe('sqlite');
    expect(cfg.autoSetup).toBe(false);
    // Default still applies for unset fields
    expect(cfg.viewer?.autoOpen).toBe(true);
  });

  it('project config overrides user config', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes(join('/mock-home', '.agentguard'))) {
        return 'storage: sqlite\n';
      }
      if (path.includes('.agentguard')) {
        return 'storage: sqlite\n';
      }
      return '';
    });

    const cfg = resolveConfig('/mock-cwd');
    expect(cfg.storage).toBe('sqlite');
  });
});

describe('loadConfigFile', () => {
  it('returns null when file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(loadConfigFile('/nonexistent/config.yaml')).toBeNull();
  });

  it('parses simple YAML key-value pairs', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('storage: sqlite\nautoSetup: true\n');

    const cfg = loadConfigFile('/test/config.yaml');
    expect(cfg?.storage).toBe('sqlite');
    expect(cfg?.autoSetup).toBe(true);
  });

  it('parses nested YAML sections', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('viewer:\n  autoOpen: false\n');

    const cfg = loadConfigFile('/test/config.yaml');
    expect(cfg?.viewer?.autoOpen).toBe(false);
  });

  it('ignores comments and blank lines', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('# Comment\n\nstorage: sqlite\n');

    const cfg = loadConfigFile('/test/config.yaml');
    expect(cfg?.storage).toBe('sqlite');
  });

  it('returns null for empty file', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('');

    expect(loadConfigFile('/test/config.yaml')).toBeNull();
  });
});

describe('saveConfigFile', () => {
  it('creates directory if missing and writes YAML', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const cfg: AgentGuardConfig = { storage: 'sqlite', autoSetup: true };
    saveConfigFile('/test/.agentguard/config.yaml', cfg);

    expect(mkdirSync).toHaveBeenCalledWith('/test/.agentguard', { recursive: true });
    expect(writeFileSync).toHaveBeenCalledWith(
      '/test/.agentguard/config.yaml',
      expect.stringContaining('storage: sqlite'),
      'utf8'
    );
  });

  it('serializes nested objects', () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const cfg: AgentGuardConfig = { viewer: { autoOpen: false } };
    saveConfigFile('/test/config.yaml', cfg);

    const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(written).toContain('viewer:');
    expect(written).toContain('  autoOpen: false');
  });
});

describe('getConfigValue', () => {
  it('gets top-level value', () => {
    const cfg: AgentGuardConfig = { storage: 'sqlite' };
    expect(getConfigValue(cfg, 'storage')).toBe('sqlite');
  });

  it('gets nested value with dot notation', () => {
    const cfg: AgentGuardConfig = { viewer: { autoOpen: true } };
    expect(getConfigValue(cfg, 'viewer.autoOpen')).toBe(true);
  });

  it('returns undefined for missing key', () => {
    const cfg: AgentGuardConfig = {};
    expect(getConfigValue(cfg, 'nonexistent')).toBeUndefined();
  });
});

describe('setConfigValue', () => {
  it('sets top-level value', () => {
    const cfg: AgentGuardConfig = {};
    setConfigValue(cfg, 'storage', 'sqlite');
    expect(cfg.storage).toBe('sqlite');
  });

  it('sets nested value creating intermediate objects', () => {
    const cfg: AgentGuardConfig = {};
    setConfigValue(cfg, 'viewer.autoOpen', 'false');
    expect(cfg.viewer?.autoOpen).toBe(false);
  });

  it('coerces boolean strings', () => {
    const cfg: AgentGuardConfig = {};
    setConfigValue(cfg, 'autoSetup', 'true');
    expect(cfg.autoSetup).toBe(true);
  });
});

describe('config command', () => {
  it('config show returns 0', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await config(['show']);
    expect(code).toBe(0);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Configuration'));
  });

  it('config show --json outputs JSON', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await config(['show', '--json']);
    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalled();
    const output = vi.mocked(console.log).mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.storage).toBe('sqlite');
  });

  it('config get returns value', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await config(['get', 'storage']);
    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith('sqlite');
  });

  it('config get rejects unknown key', async () => {
    const code = await config(['get', 'nonexistent']);
    expect(code).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Unknown key'));
  });

  it('config set writes value to project config', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await config(['set', 'storage', 'sqlite']);
    expect(code).toBe(0);
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(join('.agentguard', 'config.yaml')),
      expect.stringContaining('storage: sqlite'),
      'utf8'
    );
  });

  it('config set --global writes to user config', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await config(['set', 'storage', 'sqlite', '--global']);
    expect(code).toBe(0);
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(join('/mock-home', '.agentguard', 'config.yaml')),
      expect.any(String),
      'utf8'
    );
  });

  it('config set rejects invalid storage value', async () => {
    const code = await config(['set', 'storage', 'invalid']);
    expect(code).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Invalid storage'));
  });

  it('config set rejects unknown key', async () => {
    const code = await config(['set', 'badkey', 'value']);
    expect(code).toBe(1);
  });

  it('config keys lists available keys', async () => {
    const code = await config(['keys']);
    expect(code).toBe(0);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('storage'));
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('autoSetup'));
  });

  it('config path shows file locations', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await config(['path']);
    expect(code).toBe(0);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('config.yaml'));
  });

  it('config help shows usage', async () => {
    const code = await config(['help']);
    expect(code).toBe(0);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('agentguard config'));
  });

  it('config without subcommand shows help', async () => {
    const code = await config([]);
    expect(code).toBe(0);
  });

  it('unknown subcommand returns error', async () => {
    const code = await config(['badcmd']);
    expect(code).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Unknown subcommand')
    );
  });
});
