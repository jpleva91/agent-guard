#!/usr/bin/env node
/**
 * postinstall script — downloads the prebuilt Go kernel binary for the current platform.
 * Falls back gracefully to the TypeScript kernel if download fails.
 *
 * Binary naming: agentguard-{os}-{arch}[.exe]
 * Download source: GitHub releases for AgentGuardHQ/agentguard
 */

import { createWriteStream, chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { get } from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(__dirname, '..', 'dist', 'go-bin');
const REPO = 'AgentGuardHQ/agentguard';

function getPlatformSuffix() {
  const platform = process.platform;
  const arch = process.arch;

  const osMap = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
  const archMap = { x64: 'amd64', arm64: 'arm64' };

  const os = osMap[platform];
  const goarch = archMap[arch];

  if (!os || !goarch) return null;

  const ext = platform === 'win32' ? '.exe' : '';
  return `${os}-${goarch}${ext}`;
}

function getVersion() {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return `v${pkg.version}`;
  } catch {
    return null;
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (url, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const file = createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

async function main() {
  // Skip in CI unless explicitly requested
  if (process.env.CI && !process.env.AGENTGUARD_INSTALL_GO) {
    console.log('[agentguard] Skipping Go kernel download in CI (set AGENTGUARD_INSTALL_GO=1 to override)');
    return;
  }

  // Allow users to opt out
  if (process.env.AGENTGUARD_SKIP_GO === '1') {
    console.log('[agentguard] Skipping Go kernel download (AGENTGUARD_SKIP_GO=1)');
    return;
  }

  const suffix = getPlatformSuffix();
  if (!suffix) {
    console.log(`[agentguard] No prebuilt Go kernel for ${process.platform}/${process.arch}, using TypeScript kernel`);
    return;
  }

  const version = getVersion();
  if (!version) {
    console.log('[agentguard] Could not determine version, skipping Go kernel download');
    return;
  }

  const binaryName = `agentguard-${suffix}`;
  const url = `https://github.com/${REPO}/releases/download/${version}/${binaryName}`;
  const dest = join(BIN_DIR, process.platform === 'win32' ? 'agentguard-go.exe' : 'agentguard-go');

  if (existsSync(dest)) {
    console.log('[agentguard] Go kernel binary already exists');
    return;
  }

  console.log(`[agentguard] Downloading Go kernel (${suffix})...`);

  try {
    mkdirSync(BIN_DIR, { recursive: true });
    await download(url, dest);
    if (process.platform !== 'win32') {
      chmodSync(dest, 0o755);
    }
    console.log(`[agentguard] Go kernel installed (${suffix}) — ~100x faster hook evaluation`);
  } catch (err) {
    console.log(`[agentguard] Go kernel download failed (${err.message}), using TypeScript kernel`);
    // Non-fatal — TypeScript kernel works fine, just slower
  }
}

main();
