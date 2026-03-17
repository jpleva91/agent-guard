// Tests for data protection invariants — comprehensive coverage.
import { describe, it, expect } from 'vitest';
import {
  DATA_PROTECTION_INVARIANTS,
  manifest,
  isLogPath,
  PII_PATTERNS,
  SECRET_PATTERNS,
  shannonEntropy,
  hasKnownCredentialPrefix,
  classifyCredentialShape,
  generateFingerprints,
  parseEnvContent,
  fingerprintEnvSecrets,
  scanForFingerprints,
} from '@red-codes/invariant-data-protection';
import type { SystemState } from '@red-codes/invariants';

function findInvariant(id: string) {
  const inv = DATA_PROTECTION_INVARIANTS.find((i) => i.id === id);
  if (!inv) throw new Error(`Invariant ${id} not found`);
  return inv;
}

// ---------------------------------------------------------------------------
// Plugin manifest
// ---------------------------------------------------------------------------

describe('plugin manifest', () => {
  it('has correct metadata', () => {
    expect(manifest.id).toBe('invariant-data-protection');
    expect(manifest.type).toBe('invariant');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.apiVersion).toBe('^1.0.0');
  });

  it('exports 3 invariants', () => {
    expect(DATA_PROTECTION_INVARIANTS).toHaveLength(3);
  });

  it('all invariants have required fields', () => {
    for (const inv of DATA_PROTECTION_INVARIANTS) {
      expect(inv.id).toBeTruthy();
      expect(inv.name).toBeTruthy();
      expect(inv.description).toBeTruthy();
      expect(typeof inv.severity).toBe('number');
      expect(typeof inv.check).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// Pattern helpers
// ---------------------------------------------------------------------------

describe('isLogPath', () => {
  it('detects .log extension', () => {
    expect(isLogPath('app.log')).toBe(true);
    expect(isLogPath('/var/log/app.log')).toBe(true);
    expect(isLogPath('C:\\logs\\error.log')).toBe(true);
  });

  it('detects /logs/ directory', () => {
    expect(isLogPath('/var/logs/app.txt')).toBe(true);
    expect(isLogPath('project/logs/debug.txt')).toBe(true);
  });

  it('detects \\logs\\ directory (Windows)', () => {
    expect(isLogPath('C:\\project\\logs\\debug.txt')).toBe(true);
  });

  it('detects /output/ directory', () => {
    expect(isLogPath('/tmp/output/result.txt')).toBe(true);
  });

  it('detects \\output\\ directory (Windows)', () => {
    expect(isLogPath('C:\\tmp\\output\\result.txt')).toBe(true);
  });

  it('detects stdout/stderr paths', () => {
    expect(isLogPath('/dev/stdout')).toBe(true);
    expect(isLogPath('/dev/stderr')).toBe(true);
    expect(isLogPath('stdout.txt')).toBe(true);
  });

  it('returns false for non-log paths', () => {
    expect(isLogPath('src/index.ts')).toBe(false);
    expect(isLogPath('README.md')).toBe(false);
    expect(isLogPath('package.json')).toBe(false);
    expect(isLogPath('catalog.txt')).toBe(false);
  });

  it('returns false for empty/missing input', () => {
    expect(isLogPath('')).toBe(false);
  });
});

describe('PII_PATTERNS', () => {
  it('has 4 patterns', () => {
    expect(PII_PATTERNS).toHaveLength(4);
  });
});

describe('SECRET_PATTERNS', () => {
  it('has 18 patterns', () => {
    expect(SECRET_PATTERNS).toHaveLength(18);
  });

  it('all patterns have required fields', () => {
    for (const entry of SECRET_PATTERNS) {
      expect(entry.pattern).toBeInstanceOf(RegExp);
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Shannon entropy
// ---------------------------------------------------------------------------

describe('shannonEntropy', () => {
  it('returns 0 for empty string', () => {
    expect(shannonEntropy('')).toBe(0);
  });

  it('returns 0 for single repeated character', () => {
    expect(shannonEntropy('aaaaaaa')).toBeLessThan(0.01);
  });

  it('returns high entropy for random-looking strings', () => {
    const entropy = shannonEntropy('aB3$xZ9!mK7@pQ2&nW5#rT8^yU1*dF6%hG4+jL0');
    expect(entropy).toBeGreaterThan(4.5);
  });

  it('returns moderate entropy for simple mixed content', () => {
    const entropy = shannonEntropy('abcdefghijklmnop');
    expect(entropy).toBeGreaterThan(3.0);
  });
});

// ---------------------------------------------------------------------------
// Known credential prefix detection
// ---------------------------------------------------------------------------

describe('hasKnownCredentialPrefix', () => {
  it('detects sk_ prefix', () => {
    expect(hasKnownCredentialPrefix('sk_live_something')).toBe(true);
  });

  it('detects AKIA prefix', () => {
    expect(hasKnownCredentialPrefix('AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('detects sk-ant- prefix', () => {
    expect(hasKnownCredentialPrefix('sk-ant-api03-something')).toBe(true);
  });

  it('detects eyJ prefix (JWT)', () => {
    expect(hasKnownCredentialPrefix('eyJhbGciOiJIUzI1NiJ9')).toBe(true);
  });

  it('detects npm_ prefix', () => {
    expect(hasKnownCredentialPrefix('npm_abcdefghijklmnop')).toBe(true);
  });

  it('detects ghp_ prefix', () => {
    expect(hasKnownCredentialPrefix('ghp_something')).toBe(true);
  });

  it('detects AIza prefix (Google)', () => {
    expect(hasKnownCredentialPrefix('AIzaSyAbc123')).toBe(true);
  });

  it('returns false for unknown prefixes', () => {
    expect(hasKnownCredentialPrefix('not_a_known_prefix')).toBe(false);
    expect(hasKnownCredentialPrefix('random_string')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Entropy-based credential classification
// ---------------------------------------------------------------------------

describe('classifyCredentialShape', () => {
  it('returns null for short values', () => {
    expect(classifyCredentialShape('sk_short')).toBeNull();
  });

  it('returns null for long values (> 512 chars)', () => {
    expect(classifyCredentialShape('a'.repeat(513))).toBeNull();
  });

  it('returns null for natural language (many spaces)', () => {
    expect(
      classifyCredentialShape('this is a normal English sentence with many words')
    ).toBeNull();
  });

  it('detects known-prefix credentials', () => {
    const result = classifyCredentialShape('sk_' + 'x'.repeat(30));
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('high');
    expect(result!.reason).toBe('known credential prefix');
  });

  it('detects high-entropy credential-like strings', () => {
    const result = classifyCredentialShape('Xk9m-2Pq7_Rv5t.Yw3n/Bf8j+Ls4h=Gd6c');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('high');
  });

  it('detects GitHub PAT shape', () => {
    const result = classifyCredentialShape('ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('high');
  });

  it('returns preview with truncation', () => {
    const result = classifyCredentialShape('sk_' + 'x'.repeat(30));
    expect(result).not.toBeNull();
    expect(result!.valuePreview).toBe('sk_xxxxx...'); // first 8 chars + "..."
  });

  it('ignores low-entropy strings without known prefix', () => {
    const result = classifyCredentialShape('aaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Secret fingerprinting
// ---------------------------------------------------------------------------

describe('generateFingerprints', () => {
  it('includes raw value', () => {
    const fp = generateFingerprints('MY_KEY', 'test_value');
    expect(fp.name).toBe('MY_KEY');
    expect(fp.variants).toContain('test_value');
  });

  it('includes base64 variant', () => {
    const fp = generateFingerprints('KEY', 'hello world');
    const b64 = btoa('hello world');
    expect(fp.variants).toContain(b64);
  });

  it('includes URL-encoded variant', () => {
    const fp = generateFingerprints('KEY', 'foo bar/baz');
    expect(fp.variants).toContain(encodeURIComponent('foo bar/baz'));
  });

  it('includes JSON-escaped variant for special chars', () => {
    const fp = generateFingerprints('KEY', 'val"with\\special');
    expect(fp.variants.some((v) => v.includes('\\"'))).toBe(true);
  });

  it('includes prefix/suffix for long secrets', () => {
    const secret = 'this_is_a_very_long_secret_value_12345';
    const fp = generateFingerprints('KEY', secret);
    expect(fp.variants).toContain(secret.slice(0, 16));
    expect(fp.variants).toContain(secret.slice(-16));
  });

  it('does not add prefix/suffix for short secrets', () => {
    const fp = generateFingerprints('KEY', 'short_value');
    // Should have raw + base64 + url-encoded (if different), but no prefix/suffix
    expect(fp.variants.length).toBeLessThanOrEqual(3);
  });
});

describe('parseEnvContent', () => {
  it('parses simple key=value pairs', () => {
    const result = parseEnvContent('KEY=value\nOTHER=123');
    expect(result.get('KEY')).toBe('value');
    expect(result.get('OTHER')).toBe('123');
  });

  it('strips quotes from values', () => {
    const result = parseEnvContent('KEY="quoted_value"\nSINGLE=\'single_quoted\'');
    expect(result.get('KEY')).toBe('quoted_value');
    expect(result.get('SINGLE')).toBe('single_quoted');
  });

  it('skips comments and blank lines', () => {
    const result = parseEnvContent('# comment\n\nKEY=val\n  # another comment');
    expect(result.size).toBe(1);
    expect(result.get('KEY')).toBe('val');
  });

  it('skips lines without = sign', () => {
    const result = parseEnvContent('NOEQUALS\nKEY=val');
    expect(result.size).toBe(1);
  });

  it('skips entries with empty key or value', () => {
    const result = parseEnvContent('=nokey\nNOVAL=');
    expect(result.size).toBe(0);
  });
});

describe('fingerprintEnvSecrets', () => {
  it('fingerprints secret-looking keys with short values (>= 4 chars)', () => {
    const entries = new Map([['API_KEY', 'abcd']]);
    const fps = fingerprintEnvSecrets(entries);
    expect(fps).toHaveLength(1);
    expect(fps[0].name).toBe('API_KEY');
  });

  it('skips non-secret keys with short values (< 8 chars)', () => {
    const entries = new Map([['REGION', 'us-east']]);
    const fps = fingerprintEnvSecrets(entries);
    expect(fps).toHaveLength(0);
  });

  it('includes non-secret keys with long values (>= 8 chars)', () => {
    const entries = new Map([['SOME_VAR', 'a_longer_value_here']]);
    const fps = fingerprintEnvSecrets(entries);
    expect(fps).toHaveLength(1);
  });

  it('skips common non-secret values', () => {
    const entries = new Map([
      ['API_KEY', 'true'],
      ['SECRET', 'localhost'],
      ['TOKEN', 'development'],
    ]);
    const fps = fingerprintEnvSecrets(entries);
    expect(fps).toHaveLength(0);
  });
});

describe('scanForFingerprints', () => {
  it('finds raw value match', () => {
    const fps = [{ name: 'MY_KEY', variants: ['super_secret_value'] }];
    expect(scanForFingerprints('content with super_secret_value embedded', fps)).toBe('MY_KEY');
  });

  it('finds base64 match', () => {
    const secret = 'my_api_key_value';
    const b64 = btoa(secret);
    const fps = [{ name: 'API_KEY', variants: [secret, b64] }];
    expect(scanForFingerprints(`encoded: ${b64}`, fps)).toBe('API_KEY');
  });

  it('returns null when no match', () => {
    const fps = [{ name: 'KEY', variants: ['not_present'] }];
    expect(scanForFingerprints('clean content here', fps)).toBeNull();
  });

  it('skips very short variants (< 4 chars)', () => {
    const fps = [{ name: 'KEY', variants: ['ab'] }];
    expect(scanForFingerprints('content with ab in it', fps)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// no-pii-in-logs
// ---------------------------------------------------------------------------

describe('no-pii-in-logs', () => {
  const inv = findInvariant('no-pii-in-logs');

  it('skips non-file.write actions', () => {
    const result = inv.check({ currentActionType: 'file.read' });
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('Not a file.write');
  });

  it('skips when action type is missing', () => {
    const result = inv.check({});
    expect(result.holds).toBe(true);
  });

  it('skips non-log file targets', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      currentTarget: 'src/index.ts',
      fileContentDiff: 'user@example.com',
    });
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('not a log file');
  });

  it('skips log files with no content', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      currentTarget: '/var/log/app.log',
      fileContentDiff: '',
    });
    expect(result.holds).toBe(true);
  });

  it('skips log files when content is undefined', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      currentTarget: '/var/log/app.log',
    });
    expect(result.holds).toBe(true);
  });

  it('detects email addresses in log files', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      currentTarget: '/var/log/app.log',
      fileContentDiff: 'User login: john.doe@example.com at 2024-01-01',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('email address');
  });

  it('detects SSN in log files', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      currentTarget: 'logs/audit.log',
      fileContentDiff: 'Customer SSN: 123-45-6789',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('SSN');
  });

  it('detects credit card numbers in log files', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      currentTarget: 'output/transactions.txt',
      fileContentDiff: 'Payment: 4111 1111 1111 1111',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('credit card');
  });

  it('detects credit card numbers with dashes', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      currentTarget: '/var/log/payment.log',
      fileContentDiff: 'Card: 4111-1111-1111-1111',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('credit card');
  });

  it('detects phone numbers in log files', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      currentTarget: 'output/contacts.txt',
      fileContentDiff: 'Contact phone: 555-123-4567',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('phone number');
  });

  it('holds when log file has clean content', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      currentTarget: '/var/log/app.log',
      fileContentDiff: '[INFO] Application started successfully at port 3000',
    });
    expect(result.holds).toBe(true);
  });

  it('detects PII in /output/ directory', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      currentTarget: '/tmp/output/report.csv',
      fileContentDiff: 'name,email\nJohn,john@example.com',
    });
    expect(result.holds).toBe(false);
  });

  it('detects PII in stderr path', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      currentTarget: '/proc/self/fd/stderr',
      fileContentDiff: 'Error for user 123-45-6789',
    });
    expect(result.holds).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// no-hardcoded-secrets
// ---------------------------------------------------------------------------

describe('no-hardcoded-secrets', () => {
  const inv = findInvariant('no-hardcoded-secrets');

  it('skips non-file.write actions', () => {
    const result = inv.check({ currentActionType: 'git.push' });
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('Not a file.write');
  });

  it('skips when action type is missing', () => {
    const result = inv.check({});
    expect(result.holds).toBe(true);
  });

  it('skips when content is empty', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: '',
    });
    expect(result.holds).toBe(true);
  });

  it('skips when content is undefined', () => {
    const result = inv.check({
      currentActionType: 'file.write',
    });
    expect(result.holds).toBe(true);
  });

  // --- Original patterns (still working) ---

  it('detects AWS access keys', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('AWS access key');
  });

  it('detects generic API keys with equals', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'api_key = "sk_live_abcdefghijklmnopqrst"',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('generic API key');
  });

  it('detects generic API keys with colon', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'apiKey: "abcdefghijklmnopqrstuvwxyz1234"',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('generic API key');
  });

  it('detects api-secret pattern', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'api-secret = "xyzzy1234567890abcdefghijk"',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('generic API key');
  });

  it('detects Bearer tokens', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff:
        'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0=',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Bearer token');
  });

  it('detects RSA private keys', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: '-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBAKj...',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('private key');
  });

  it('detects EC private keys', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: '-----BEGIN EC PRIVATE KEY-----\nMHQCAQEE...',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('private key');
  });

  it('detects generic private keys', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkq...',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('private key');
  });

  it('detects OPENSSH private keys', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: '-----BEGIN OPENSSH PRIVATE KEY-----\nb3Blb...',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('private key');
  });

  it('detects PostgreSQL connection strings', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'DATABASE_URL=postgres://admin:password123@db.example.com:5432/mydb',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('connection string');
  });

  it('detects MongoDB connection strings', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'const uri = "mongodb://user:pass@cluster0.example.net:27017/db";',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('connection string');
  });

  it('detects Redis connection strings', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'REDIS_URL=redis://default:password@redis.example.com:6379',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('connection string');
  });

  it('detects MySQL connection strings', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'mysql://root:secret@localhost:3306/app',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('connection string');
  });

  // --- New patterns from LeakWall ---

  it('detects GitHub PAT (classic)', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('GitHub PAT');
  });

  it('detects GitHub OAuth tokens', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'GITHUB_TOKEN=gho_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('GitHub OAuth');
  });

  it('detects GitHub fine-grained PAT', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: `token = "github_pat_${'a'.repeat(22)}_${'b'.repeat(59)}"`,
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('GitHub fine-grained PAT');
  });

  it('detects Stripe live key', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: `STRIPE_KEY=sk_live_${'x'.repeat(24)}`,
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Stripe live key');
  });

  it('detects Stripe test key', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: `STRIPE_TEST=sk_test_${'x'.repeat(24)}`,
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Stripe test key');
  });

  it('detects Slack bot tokens', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: `SLACK_TOKEN=xoxb-0000000000000-0000000000000-${'A'.repeat(24)}`,
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Slack bot token');
  });

  it('detects Slack user tokens', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: `token=xoxp-0000000000000-0000000000000-${'A'.repeat(24)}`,
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Slack user token');
  });

  it('detects npm tokens', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: `//registry.npmjs.org/:_authToken=npm_${'a'.repeat(36)}`,
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('npm token');
  });

  it('detects OpenAI API keys', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: `OPENAI_KEY=sk-${'a'.repeat(20)}T3BlbkFJ${'b'.repeat(20)}`,
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('OpenAI API key');
  });

  it('detects Anthropic API keys', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: `ANTHROPIC_KEY=sk-ant-${'a'.repeat(90)}`,
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Anthropic API key');
  });

  it('detects Google API keys', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: `GOOGLE_KEY=AIza${'a'.repeat(35)}`,
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Google API key');
  });

  it('detects JWT tokens', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff:
        'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.Sfl_KxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('JWT token');
  });

  // --- Context-aware pattern: AWS secret key ---

  it('detects AWS secret key with aws context', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: `aws_secret_access_key = ${'A'.repeat(40)}`,
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('AWS secret key');
  });

  it('does not flag 40-char base64 string without AWS context', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: `description = "${'A'.repeat(40)}"`,
    });
    // Without aws/secret/access context, the context-aware pattern should not trigger
    // (entropy may still catch it depending on character diversity)
    const actual = result.actual;
    expect(actual).not.toContain('AWS secret key');
  });

  // --- Known-secret fingerprint detection ---

  it('detects known secrets via fingerprints passed in state', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'config.db = "xJ7mK9pQ2rV5tW3n";',
      secretFingerprints: [
        { name: 'DB_PASSWORD', variants: ['xJ7mK9pQ2rV5tW3n'] },
      ],
    } as SystemState & { secretFingerprints: Array<{ name: string; variants: string[] }> });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Known secret detected via fingerprint: DB_PASSWORD');
  });

  it('detects base64-encoded known secrets via fingerprints', () => {
    const secret = 'my_secret_api_key_12345';
    const b64 = btoa(secret);
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: `encoded = "${b64}";`,
      secretFingerprints: [{ name: 'SECRET', variants: [secret, b64] }],
    } as SystemState & { secretFingerprints: Array<{ name: string; variants: string[] }> });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Known secret detected via fingerprint: SECRET');
  });

  // --- Entropy-based detection ---

  it('detects high-entropy credential-shaped strings', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'token = "Xk9m-2Pq7_Rv5t.Yw3n/Bf8j+Ls4h=Gd6c"',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('entropy-detected credential');
  });

  // --- Clean content ---

  it('holds for clean code content', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: `
        const config = {
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '5432'),
          apiKey: process.env.API_KEY,
        };
      `,
    });
    expect(result.holds).toBe(true);
  });

  it('holds for code with short variable names', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'const api_key = getKey();',
    });
    expect(result.holds).toBe(true);
  });

  it('does not flag "Bearer" without a token value', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'The Bearer scheme requires a token.',
    });
    expect(result.holds).toBe(true);
  });

  it('flags Bearer with an actual token value', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff:
        'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0=',
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('Bearer token');
  });

  it('does not flag protocol documentation without credentials', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'PostgreSQL uses the postgres:// protocol prefix.',
    });
    expect(result.holds).toBe(true);
  });

  it('does not flag bare protocol mention', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      fileContentDiff: 'Use postgres:// for connection strings.',
    });
    expect(result.holds).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// max-file-count-per-action
// ---------------------------------------------------------------------------

describe('max-file-count-per-action', () => {
  const inv = findInvariant('max-file-count-per-action');

  it('skips non-file-mutation actions', () => {
    const result = inv.check({ currentActionType: 'git.push' });
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('Not a file mutation');
  });

  it('skips when action type is missing', () => {
    const result = inv.check({});
    expect(result.holds).toBe(true);
  });

  it('holds when file count is within default limit (50)', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      filesAffected: 10,
    });
    expect(result.holds).toBe(true);
    expect(result.actual).toContain('10 files');
  });

  it('holds at exactly the default limit', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      filesAffected: 50,
    });
    expect(result.holds).toBe(true);
  });

  it('fails when file count exceeds default limit', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      filesAffected: 51,
    });
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('51 files');
    expect(result.actual).toContain('50');
  });

  it('works with file.delete action', () => {
    const result = inv.check({
      currentActionType: 'file.delete',
      filesAffected: 100,
    });
    expect(result.holds).toBe(false);
  });

  it('works with file.move action', () => {
    const result = inv.check({
      currentActionType: 'file.move',
      filesAffected: 100,
    });
    expect(result.holds).toBe(false);
  });

  it('holds when filesAffected is 0', () => {
    const result = inv.check({
      currentActionType: 'file.write',
      filesAffected: 0,
    });
    expect(result.holds).toBe(true);
  });

  it('holds when filesAffected is undefined (defaults to 0)', () => {
    const result = inv.check({
      currentActionType: 'file.write',
    });
    expect(result.holds).toBe(true);
  });

  it('respects custom maxFileCountLimit', () => {
    const state: SystemState & { maxFileCountLimit: number } = {
      currentActionType: 'file.write',
      filesAffected: 11,
      maxFileCountLimit: 10,
    };
    const result = inv.check(state);
    expect(result.holds).toBe(false);
    expect(result.actual).toContain('10 file limit');
  });

  it('holds with custom limit when under', () => {
    const state: SystemState & { maxFileCountLimit: number } = {
      currentActionType: 'file.write',
      filesAffected: 5,
      maxFileCountLimit: 10,
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  it('holds at exactly custom limit', () => {
    const state: SystemState & { maxFileCountLimit: number } = {
      currentActionType: 'file.delete',
      filesAffected: 10,
      maxFileCountLimit: 10,
    };
    const result = inv.check(state);
    expect(result.holds).toBe(true);
  });

  it('skips file.read actions', () => {
    const result = inv.check({
      currentActionType: 'file.read',
      filesAffected: 1000,
    });
    expect(result.holds).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: all invariants work with checkAllInvariants
// ---------------------------------------------------------------------------

describe('integration with invariant checker', () => {
  it('all invariants produce valid results for empty state', () => {
    for (const inv of DATA_PROTECTION_INVARIANTS) {
      const result = inv.check({});
      expect(typeof result.holds).toBe('boolean');
      expect(typeof result.expected).toBe('string');
      expect(typeof result.actual).toBe('string');
    }
  });

  it('invariants have unique IDs', () => {
    const ids = DATA_PROTECTION_INVARIANTS.map((inv) => inv.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all severities are between 1 and 5', () => {
    for (const inv of DATA_PROTECTION_INVARIANTS) {
      expect(inv.severity).toBeGreaterThanOrEqual(1);
      expect(inv.severity).toBeLessThanOrEqual(5);
    }
  });
});
