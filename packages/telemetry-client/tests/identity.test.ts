import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateIdentity,
  loadIdentity,
  saveIdentity,
  deleteIdentity,
  resolveMode,
} from '../src/identity.js';

describe('generateIdentity', () => {
  it('generates a valid identity with Ed25519 keypair', () => {
    const identity = generateIdentity();
    expect(identity.install_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(identity.public_key).toContain('-----BEGIN PUBLIC KEY-----');
    expect(identity.private_key).toContain('-----BEGIN PRIVATE KEY-----');
    expect(identity.mode).toBe('anonymous');
  });

  it('respects the provided mode', () => {
    const identity = generateIdentity('verified');
    expect(identity.mode).toBe('verified');
  });

  it('generates unique install_ids', () => {
    const a = generateIdentity();
    const b = generateIdentity();
    expect(a.install_id).not.toBe(b.install_id);
  });
});

describe('save/load/delete identity', () => {
  let tempDir: string;
  let identityPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ag-test-'));
    identityPath = join(tempDir, 'telemetry.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('save and load roundtrip', () => {
    const identity = generateIdentity('verified');
    saveIdentity(identity, identityPath);

    const loaded = loadIdentity(identityPath);
    expect(loaded).not.toBeNull();
    expect(loaded!.install_id).toBe(identity.install_id);
    expect(loaded!.public_key).toBe(identity.public_key);
    expect(loaded!.private_key).toBe(identity.private_key);
    expect(loaded!.mode).toBe('verified');
  });

  it('loadIdentity returns null for missing file', () => {
    const result = loadIdentity(join(tempDir, 'nonexistent.json'));
    expect(result).toBeNull();
  });

  it('loadIdentity returns null for invalid JSON', () => {
    const path = join(tempDir, 'bad.json');
    require('node:fs').writeFileSync(path, 'not json');
    const result = loadIdentity(path);
    expect(result).toBeNull();
  });

  it('deleteIdentity removes the file', () => {
    const identity = generateIdentity();
    saveIdentity(identity, identityPath);
    expect(existsSync(identityPath)).toBe(true);

    deleteIdentity(identityPath);
    expect(existsSync(identityPath)).toBe(false);
  });

  it('deleteIdentity is safe for missing files', () => {
    expect(() => deleteIdentity(join(tempDir, 'nope.json'))).not.toThrow();
  });

  it('saveIdentity creates parent directories', () => {
    const nestedPath = join(tempDir, 'a', 'b', 'c', 'identity.json');
    const identity = generateIdentity();
    saveIdentity(identity, nestedPath);
    expect(existsSync(nestedPath)).toBe(true);
  });

  it('sets restrictive file permissions', () => {
    const identity = generateIdentity();
    saveIdentity(identity, identityPath);
    const stats = require('node:fs').statSync(identityPath);
    // 0o600 = owner read/write only
    expect(stats.mode & 0o777).toBe(0o600);
  });
});

describe('resolveMode', () => {
  const originalEnv = process.env.AGENTGUARD_TELEMETRY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENTGUARD_TELEMETRY;
    } else {
      process.env.AGENTGUARD_TELEMETRY = originalEnv;
    }
  });

  it('defaults to off when no identity and no env', () => {
    delete process.env.AGENTGUARD_TELEMETRY;
    expect(resolveMode(null)).toBe('off');
  });

  it('uses env var when set', () => {
    process.env.AGENTGUARD_TELEMETRY = 'anonymous';
    expect(resolveMode(null)).toBe('anonymous');
  });

  it('env var overrides identity mode', () => {
    process.env.AGENTGUARD_TELEMETRY = 'verified';
    const identity = generateIdentity('anonymous');
    expect(resolveMode(identity)).toBe('verified');
  });

  it('falls back to identity mode', () => {
    delete process.env.AGENTGUARD_TELEMETRY;
    const identity = generateIdentity('verified');
    expect(resolveMode(identity)).toBe('verified');
  });

  it('ignores invalid env values', () => {
    process.env.AGENTGUARD_TELEMETRY = 'invalid';
    const identity = generateIdentity('anonymous');
    expect(resolveMode(identity)).toBe('anonymous');
  });
});
