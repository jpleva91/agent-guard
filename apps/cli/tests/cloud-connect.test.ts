// Tests for cloud connect subcommand — flag parsing, validation, and provision flow
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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

describe('cloud connect — direct key mode', () => {
  it('saves valid API key to .env', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await cloud(['connect', 'ag_test1234567890abcdef']);
    expect(code).toBe(0);
    expect(writeFileSync).toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Connected to AgentGuard Cloud'),
    );
  });

  it('rejects key without ag_ prefix', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await cloud(['connect', 'invalid_key_12345678']);
    expect(code).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('ag_'),
    );
  });

  it('rejects key shorter than 20 chars', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await cloud(['connect', 'ag_short']);
    expect(code).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('20 characters'),
    );
  });

  it('accepts --api as endpoint alias', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await cloud([
      'connect',
      'ag_test1234567890abcdef',
      '--api',
      'https://custom.example.com',
    ]);
    expect(code).toBe(0);
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('https://custom.example.com'),
      expect.any(Object),
    );
  });

  it('accepts --endpoint flag', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await cloud([
      'connect',
      'ag_test1234567890abcdef',
      '--endpoint',
      'https://custom.example.com',
    ]);
    expect(code).toBe(0);
  });
});

describe('cloud connect — unknown flags', () => {
  it('rejects unknown flags with clear error', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await cloud(['connect', '--bogus']);
    expect(code).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Unknown flag: --bogus'),
    );
  });

  it('rejects --foo flag', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await cloud(['connect', '--foo', 'bar']);
    expect(code).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Unknown flag: --foo'),
    );
  });
});

describe('cloud connect — tenant provisioning', () => {
  it('errors when --tenant given without auth key', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await cloud([
      'connect',
      '--tenant',
      '00000000-0000-0000-0000-000000000001',
      '--api',
      'https://example.com',
    ]);
    expect(code).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('No API key found'),
    );
  });

  it('uses existing .env key when --key not provided', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      'AGENTGUARD_API_KEY=ag_existing1234567890ab\nAGENTGUARD_TELEMETRY_URL=https://old.example.com\n',
    );

    // Mock fetch — provision endpoint returns a new key
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          apiKey: 'ag_newkey1234567890abcdef',
          tenantName: 'TestCorp',
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const code = await cloud([
      'connect',
      '--tenant',
      '00000000-0000-0000-0000-000000000001',
      '--api',
      'https://example.com',
    ]);
    expect(code).toBe(0);

    // Verify fetch was called with the existing key
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/v1/cli/provision-key',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-API-Key': 'ag_existing1234567890ab',
        }),
      }),
    );

    // Verify new key was saved
    expect(writeFileSync).toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('TestCorp'),
    );

    vi.unstubAllGlobals();
  });

  it('uses --key flag for auth when provided', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          apiKey: 'ag_newkey1234567890abcdef',
          tenantName: 'TestCorp',
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const code = await cloud([
      'connect',
      '--tenant',
      '00000000-0000-0000-0000-000000000001',
      '--api',
      'https://example.com',
      '--key',
      'ag_authkey1234567890abcdef',
    ]);
    expect(code).toBe(0);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/v1/cli/provision-key',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'ag_authkey1234567890abcdef',
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('handles server error gracefully', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const code = await cloud([
      'connect',
      '--tenant',
      '00000000-0000-0000-0000-000000000001',
      '--key',
      'ag_authkey1234567890abcdef',
    ]);
    expect(code).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('403'),
    );

    vi.unstubAllGlobals();
  });
});

describe('cloud connect — no args', () => {
  it('shows usage when no key or tenant given', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const code = await cloud(['connect']);
    expect(code).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('--tenant'),
    );
  });
});
