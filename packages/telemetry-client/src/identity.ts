// Identity management — Ed25519 keypair generation and persistence.

import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import type { TelemetryIdentity, TelemetryMode } from './types.js';

const DEFAULT_IDENTITY_PATH = join(homedir(), '.agentguard', 'telemetry.json');

/** Generate a new Ed25519 identity with a fresh install_id */
export function generateIdentity(mode: TelemetryMode = 'anonymous'): TelemetryIdentity {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return {
    install_id: randomUUID(),
    public_key: publicKey,
    private_key: privateKey,
    mode,
  };
}

/** Load identity from disk. Returns null if not found or invalid. */
export function loadIdentity(path?: string): TelemetryIdentity | null {
  const filePath = path ?? DEFAULT_IDENTITY_PATH;
  try {
    const raw = readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw) as TelemetryIdentity;
    if (!data.install_id || !data.public_key || !data.private_key) return null;
    return data;
  } catch {
    return null;
  }
}

/** Save identity to disk */
export function saveIdentity(identity: TelemetryIdentity, path?: string): void {
  const filePath = path ?? DEFAULT_IDENTITY_PATH;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(identity, null, 2), { mode: 0o600 });
  } catch (err) {
    process.stderr.write(`[agentguard] Warning: failed to save telemetry identity: ${err}\n`);
  }
}

/** Delete identity from disk */
export function deleteIdentity(path?: string): void {
  const filePath = path ?? DEFAULT_IDENTITY_PATH;
  try {
    unlinkSync(filePath);
  } catch {
    // Ignore if file doesn't exist
  }
}

/** Resolve the effective telemetry mode */
export function resolveMode(identity?: TelemetryIdentity | null): TelemetryMode {
  const envMode = process.env.AGENTGUARD_TELEMETRY;
  if (envMode === 'off' || envMode === 'anonymous' || envMode === 'verified') {
    return envMode;
  }
  if (identity) {
    return identity.mode;
  }
  return 'off';
}

/** Get the default identity file path */
export function getDefaultIdentityPath(): string {
  return DEFAULT_IDENTITY_PATH;
}
