// Tests for data protection invariants — comprehensive coverage.
import { describe, it, expect } from 'vitest';
import {
  DATA_PROTECTION_INVARIANTS,
  manifest,
  isLogPath,
  PII_PATTERNS,
  SECRET_PATTERNS,
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
  it('has 5 patterns', () => {
    expect(SECRET_PATTERNS).toHaveLength(5);
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
      fileContentDiff: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0=',
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
    // "Bearer " is not followed by a valid token character sequence
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
    // "postgres://" followed by a space — [^\s'"]+ requires at least one non-space char
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
