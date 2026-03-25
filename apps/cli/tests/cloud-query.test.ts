// Tests for cloud events/runs/summary subcommands (not-connected error path)
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}));

import { cloud } from '../src/commands/cloud.js';
import { existsSync } from 'node:fs';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

describe('cloud events — not connected', () => {
  it('returns 1 when not connected', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await cloud(['events']);
    expect(code).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Not connected to AgentGuard Cloud')
    );
  });

  it('suggests running connect command', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await cloud(['events']);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('aguard cloud connect')
    );
  });
});

describe('cloud runs — not connected', () => {
  it('returns 1 when not connected', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await cloud(['runs']);
    expect(code).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Not connected to AgentGuard Cloud')
    );
  });

  it('suggests running connect command', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await cloud(['runs']);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('aguard cloud connect')
    );
  });
});

describe('cloud summary — not connected', () => {
  it('returns 1 when not connected', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await cloud(['summary']);
    expect(code).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Not connected to AgentGuard Cloud')
    );
  });

  it('suggests running connect command', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await cloud(['summary']);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('aguard cloud connect')
    );
  });
});

describe('cloud help includes new subcommands', () => {
  it('help text mentions events subcommand', async () => {
    const code = await cloud(['help']);
    expect(code).toBe(0);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('cloud events'));
  });

  it('help text mentions runs subcommand', async () => {
    const code = await cloud(['help']);
    expect(code).toBe(0);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('cloud runs'));
  });

  it('help text mentions summary subcommand', async () => {
    const code = await cloud(['help']);
    expect(code).toBe(0);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('cloud summary'));
  });
});
