// Regex patterns for data protection invariants.
// Extracted for testability and reuse.

// ---------------------------------------------------------------------------
// PII Patterns
// ---------------------------------------------------------------------------

/** Email addresses: user@domain.tld */
export const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/** US Social Security Numbers: 123-45-6789 */
export const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;

/** Credit card numbers: 1234 5678 9012 3456 or 1234-5678-9012-3456 or 1234567890123456 */
export const CREDIT_CARD_PATTERN = /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/;

/** US phone numbers: 123-456-7890 or 123.456.7890 or 1234567890 */
export const PHONE_PATTERN = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/;

/** All PII patterns with labels for violation messages */
export const PII_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: EMAIL_PATTERN, label: 'email address' },
  { pattern: SSN_PATTERN, label: 'SSN' },
  { pattern: CREDIT_CARD_PATTERN, label: 'credit card number' },
  { pattern: PHONE_PATTERN, label: 'phone number' },
];

// ---------------------------------------------------------------------------
// Log file path patterns
// ---------------------------------------------------------------------------

/** File extensions and path segments that indicate log/output files */
export const LOG_PATH_PATTERNS: readonly RegExp[] = [
  /\.log$/i,
  /(?:^|\/)logs\//i,
  /(?:^|\\)logs\\/i,
  /(?:^|\/)output\//i,
  /(?:^|\\)output\\/i,
  /\bstdout\b/i,
  /\bstderr\b/i,
];

/** Returns true if the given path looks like a log or output file */
export function isLogPath(filePath: string): boolean {
  if (!filePath) return false;
  return LOG_PATH_PATTERNS.some((p) => p.test(filePath));
}

// ---------------------------------------------------------------------------
// Secret Patterns (with optional context-aware regex for false positive reduction)
// ---------------------------------------------------------------------------

/** A secret detection pattern with an optional context regex.
 * When `contextPattern` is set, the main pattern only triggers if the surrounding
 * content also matches the context regex (reduces false positives). */
export interface SecretPatternDef {
  pattern: RegExp;
  label: string;
  contextPattern?: RegExp;
}

/** AWS access key IDs: AKIA followed by 16 alphanumeric characters */
export const AWS_KEY_PATTERN = /AKIA[0-9A-Z]{16}/;

/** AWS secret access key: 40-char base64 string (requires nearby AWS/secret/access context) */
export const AWS_SECRET_KEY_PATTERN = /[0-9a-zA-Z/+]{40}/;
export const AWS_SECRET_KEY_CONTEXT = /(?:aws|secret|access)/i;

/** Generic API key assignments: api_key = "..." or apikey: "..." etc. */
export const GENERIC_API_KEY_PATTERN =
  /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{20,}/i;

/** Bearer tokens in authorization headers (requires 20+ chars to avoid false positives on prose) */
export const BEARER_TOKEN_PATTERN = /Bearer\s+[a-zA-Z0-9\-._~+/]{20,}=*/;

/** PEM-encoded private keys (including OPENSSH format) */
export const PRIVATE_KEY_PATTERN = /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/;

/** Database connection strings with embedded credentials */
export const CONNECTION_STRING_PATTERN = /(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+/i;

/** GitHub Personal Access Token (classic) */
export const GITHUB_PAT_PATTERN = /ghp_[a-zA-Z0-9]{36}/;

/** GitHub OAuth Token */
export const GITHUB_OAUTH_PATTERN = /gho_[a-zA-Z0-9]{36}/;

/** GitHub Fine-Grained Personal Access Token */
export const GITHUB_FINE_GRAINED_PAT_PATTERN = /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/;

/** Stripe Live Secret Key */
export const STRIPE_LIVE_KEY_PATTERN = /sk_live_[a-zA-Z0-9]{24,}/;

/** Stripe Test Secret Key */
export const STRIPE_TEST_KEY_PATTERN = /sk_test_[a-zA-Z0-9]{24,}/;

/** Slack Bot Token */
export const SLACK_BOT_TOKEN_PATTERN = /xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/;

/** Slack User Token */
export const SLACK_USER_TOKEN_PATTERN = /xoxp-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,}/;

/** npm Access Token */
export const NPM_TOKEN_PATTERN = /npm_[a-zA-Z0-9]{36}/;

/** OpenAI API Key */
export const OPENAI_KEY_PATTERN = /sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20}/;

/** Anthropic API Key */
export const ANTHROPIC_KEY_PATTERN = /sk-ant-[a-zA-Z0-9\-]{90,}/;

/** Google API Key */
export const GOOGLE_API_KEY_PATTERN = /AIza[0-9A-Za-z_-]{35}/;

/** JWT Token (three base64url-encoded segments) */
export const JWT_TOKEN_PATTERN = /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/;

/** All secret patterns with labels and optional context for violation messages */
export const SECRET_PATTERNS: readonly SecretPatternDef[] = [
  { pattern: AWS_KEY_PATTERN, label: 'AWS access key' },
  {
    pattern: AWS_SECRET_KEY_PATTERN,
    label: 'AWS secret key',
    contextPattern: AWS_SECRET_KEY_CONTEXT,
  },
  { pattern: GENERIC_API_KEY_PATTERN, label: 'generic API key' },
  { pattern: BEARER_TOKEN_PATTERN, label: 'Bearer token' },
  { pattern: PRIVATE_KEY_PATTERN, label: 'private key' },
  { pattern: CONNECTION_STRING_PATTERN, label: 'connection string' },
  { pattern: GITHUB_PAT_PATTERN, label: 'GitHub PAT' },
  { pattern: GITHUB_OAUTH_PATTERN, label: 'GitHub OAuth token' },
  { pattern: GITHUB_FINE_GRAINED_PAT_PATTERN, label: 'GitHub fine-grained PAT' },
  { pattern: STRIPE_LIVE_KEY_PATTERN, label: 'Stripe live key' },
  { pattern: STRIPE_TEST_KEY_PATTERN, label: 'Stripe test key' },
  { pattern: SLACK_BOT_TOKEN_PATTERN, label: 'Slack bot token' },
  { pattern: SLACK_USER_TOKEN_PATTERN, label: 'Slack user token' },
  { pattern: NPM_TOKEN_PATTERN, label: 'npm token' },
  { pattern: OPENAI_KEY_PATTERN, label: 'OpenAI API key' },
  { pattern: ANTHROPIC_KEY_PATTERN, label: 'Anthropic API key' },
  { pattern: GOOGLE_API_KEY_PATTERN, label: 'Google API key' },
  { pattern: JWT_TOKEN_PATTERN, label: 'JWT token' },
];

// ---------------------------------------------------------------------------
// Entropy-based secret detection
// ---------------------------------------------------------------------------

/** Shannon entropy of a string (bits per character). Returns 0 for empty input. */
export function shannonEntropy(data: string): number {
  if (!data) return 0;
  const freq = new Map<string, number>();
  for (const ch of data) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  const len = data.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Well-known credential prefixes used for fast classification. */
const KNOWN_CREDENTIAL_PREFIXES = [
  'sk_',
  'pk_',
  'ghp_',
  'gho_',
  'github_pat_',
  'AKIA',
  'sk-ant-',
  'xoxb-',
  'xoxp-',
  'npm_',
  'eyJ',
  'Bearer ',
  'Basic ',
  'AIza',
] as const;

/** Returns true if the value starts with a known credential prefix. */
export function hasKnownCredentialPrefix(value: string): boolean {
  return KNOWN_CREDENTIAL_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/** Result of entropy-based classification. */
export interface EntropyMatch {
  valuePreview: string;
  entropy: number;
  length: number;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/** Default entropy threshold for credential detection (bits per character). */
const ENTROPY_THRESHOLD = 4.5;

/**
 * Classify a single string value as potentially credential-shaped using
 * Shannon entropy, heuristic scoring, and known-prefix matching.
 *
 * Inspired by LeakWall's DataShapeClassifier.
 */
export function classifyCredentialShape(value: string): EntropyMatch | null {
  // Length filter: too short or too long strings are not credentials
  if (value.length < 16 || value.length > 512) return null;

  // Natural language filter: skip strings with many spaces
  let spaceCount = 0;
  for (const ch of value) {
    if (ch === ' ') spaceCount++;
  }
  if (spaceCount > 3) return null;

  const entropy = shannonEntropy(value);
  const prefixMatch = hasKnownCredentialPrefix(value);

  // Skip below entropy threshold unless it has a known prefix
  if (entropy < ENTROPY_THRESHOLD && !prefixMatch) return null;

  // Heuristic scoring
  const hasMixedCase = /[A-Z]/.test(value) && /[a-z]/.test(value);
  const hasDigits = /\d/.test(value);
  const hasSpecial = /[_\-/+=.:@!#$%&*]/.test(value);
  const noSpaces = !value.includes(' ');

  const score =
    (hasMixedCase ? 1 : 0) + (hasDigits ? 1 : 0) + (hasSpecial ? 1 : 0) + (noSpaces ? 1 : 0);

  // Must meet minimum score OR have known prefix
  if (score < 3 && !prefixMatch) return null;

  const confidence =
    prefixMatch || score === 4 ? 'high' : score === 3 && entropy > 5.0 ? 'medium' : 'low';

  const preview = value.length > 12 ? `${value.slice(0, 8)}...` : value;

  const reason = prefixMatch
    ? 'known credential prefix'
    : `high entropy (${entropy.toFixed(2)}), heuristic score ${score}/4`;

  return { valuePreview: preview, entropy, length: value.length, confidence, reason };
}

// ---------------------------------------------------------------------------
// Known-secret fingerprinting
// ---------------------------------------------------------------------------

/** A fingerprinted secret with its source name and encoded variants. */
export interface SecretFingerprint {
  name: string;
  variants: string[];
}

/**
 * Generate encoded variants of a secret value for multi-encoding detection.
 * Produces: raw, base64, URL-encoded, and JSON-escaped variants.
 */
export function generateFingerprints(name: string, value: string): SecretFingerprint {
  const variants: string[] = [value];

  // Base64-encoded
  const b64 = btoa(value);
  if (b64 !== value) variants.push(b64);

  // URL-encoded
  const urlEncoded = encodeURIComponent(value);
  if (urlEncoded !== value) variants.push(urlEncoded);

  // JSON-escaped (for secrets with quotes or backslashes)
  if (value.includes('"') || value.includes('\\')) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    variants.push(escaped);
  }

  // Prefix/suffix for long secrets (catch partial matches)
  if (value.length > 20) {
    variants.push(value.slice(0, 16));
    variants.push(value.slice(-16));
  }

  return { name, variants };
}

/**
 * Parse a .env file content and return key-value pairs.
 * Handles comments, blank lines, quoted values, and inline comments.
 */
export function parseEnvContent(content: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!key || !val) continue;
    result.set(key, val);
  }
  return result;
}

/** Key name substrings that indicate a secret value (case-insensitive). */
const SECRET_KEY_INDICATORS = [
  'key',
  'secret',
  'token',
  'password',
  'passwd',
  'credential',
  'auth',
  'private',
  'api_key',
  'apikey',
  'access_key',
  'connection_string',
  'database_url',
  'db_pass',
] as const;

/** Common non-secret values to skip (prevents false-positive fingerprinting). */
const COMMON_VALUE_SKIPLIST = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'none',
  'localhost',
  'development',
  'production',
  'staging',
  'test',
  'debug',
  'info',
  'warn',
  'error',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
]);

/**
 * Filter env entries to those likely containing secrets, then generate fingerprints.
 * Uses a two-tier minimum length: secret-looking keys require 4+ char values,
 * all other keys require 8+ char values.
 */
export function fingerprintEnvSecrets(envEntries: Map<string, string>): SecretFingerprint[] {
  const fingerprints: SecretFingerprint[] = [];

  for (const [key, value] of envEntries) {
    // Skip common non-secret values
    if (COMMON_VALUE_SKIPLIST.has(value.toLowerCase())) continue;

    const keyLower = key.toLowerCase();
    const isSecretKey = SECRET_KEY_INDICATORS.some((ind) => keyLower.includes(ind));

    // Two-tier minimum length
    const minLength = isSecretKey ? 4 : 8;
    if (value.length < minLength) continue;

    fingerprints.push(generateFingerprints(key, value));
  }

  return fingerprints;
}

/**
 * Scan content against fingerprinted secrets. Returns the name of the first
 * matching fingerprint, or null if none found.
 */
export function scanForFingerprints(
  content: string,
  fingerprints: readonly SecretFingerprint[]
): string | null {
  for (const fp of fingerprints) {
    for (const variant of fp.variants) {
      if (variant.length >= 4 && content.includes(variant)) {
        return fp.name;
      }
    }
  }
  return null;
}
