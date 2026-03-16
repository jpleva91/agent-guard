import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { computeSHA256 } from './crypto-hash.js';

export interface TrustEntry {
  path: string;
  hash: string;
  trustedAt: string;
  trustedBy: 'user' | 'ci-override';
}

export interface TrustStore {
  version: 1;
  entries: Record<string, TrustEntry>;
}

const CURRENT_VERSION = 1;

function getTrustStorePath(): string {
  const base = process.env.AGENTGUARD_HOME ?? join(homedir(), '.agentguard');
  return join(base, 'trust.json');
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function canonicalPath(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return filePath;
  }
}

export function loadTrustStore(): TrustStore {
  const storePath = getTrustStorePath();
  if (!existsSync(storePath)) return { version: CURRENT_VERSION, entries: {} };
  try {
    const raw = JSON.parse(readFileSync(storePath, 'utf8')) as Record<string, unknown>;
    if (raw.version !== CURRENT_VERSION) {
      process.stderr.write(
        `Warning: Trust store version ${String(raw.version)} not recognized, treating as empty\n`
      );
      return { version: CURRENT_VERSION, entries: {} };
    }
    return { version: CURRENT_VERSION, entries: (raw.entries ?? {}) as Record<string, TrustEntry> };
  } catch {
    return { version: CURRENT_VERSION, entries: {} };
  }
}

export function saveTrustStore(store: TrustStore): void {
  const storePath = getTrustStorePath();
  ensureDir(storePath);
  writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export async function computeFileHash(filePath: string): Promise<string> {
  return computeSHA256(readFileSync(filePath));
}

export async function verifyTrust(
  filePath: string
): Promise<'trusted' | 'untrusted' | 'content_changed'> {
  const canonical = canonicalPath(filePath);
  const store = loadTrustStore();
  const entry = store.entries[canonical];
  if (!entry) return 'untrusted';
  const currentHash = await computeFileHash(filePath);
  return currentHash === entry.hash ? 'trusted' : 'content_changed';
}

export async function trustFile(filePath: string): Promise<TrustEntry> {
  const canonical = canonicalPath(filePath);
  const hash = await computeFileHash(filePath);
  const entry: TrustEntry = {
    path: canonical,
    hash,
    trustedAt: new Date().toISOString(),
    trustedBy: 'user',
  };
  const store = loadTrustStore();
  store.entries[canonical] = entry;
  saveTrustStore(store);
  return entry;
}

export function revokeTrust(filePath: string): void {
  const canonical = canonicalPath(filePath);
  const store = loadTrustStore();
  delete store.entries[canonical];
  saveTrustStore(store);
}

export function detectCiPlatform(): string | null {
  if (process.env.GITHUB_ACTIONS) return 'github-actions';
  if (process.env.GITLAB_CI) return 'gitlab-ci';
  if (process.env.JENKINS_URL) return 'jenkins';
  if (process.env.CIRCLECI) return 'circleci';
  if (process.env.TRAVIS) return 'travis';
  if (process.env.BUILDKITE) return 'buildkite';
  if (process.env.CODEBUILD_BUILD_ID) return 'aws-codebuild';
  if (process.env.TF_BUILD) return 'azure-devops';
  return null;
}

export function isCiTrustOverride(): boolean {
  return process.env.AGENTGUARD_TRUST_PROJECT_POLICY === '1' && detectCiPlatform() !== null;
}
