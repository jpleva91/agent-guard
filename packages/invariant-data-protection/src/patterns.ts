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
// Secret Patterns
// ---------------------------------------------------------------------------

/** AWS access key IDs: AKIA followed by 16 alphanumeric characters */
export const AWS_KEY_PATTERN = /AKIA[0-9A-Z]{16}/;

/** Generic API key assignments: api_key = "..." or apikey: "..." etc. */
export const GENERIC_API_KEY_PATTERN =
  /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{20,}/i;

/** Bearer tokens in authorization headers (requires 20+ chars to avoid false positives on prose) */
export const BEARER_TOKEN_PATTERN = /Bearer\s+[a-zA-Z0-9\-._~+/]{20,}=*/;

/** PEM-encoded private keys */
export const PRIVATE_KEY_PATTERN = /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/;

/** Database connection strings with embedded credentials */
export const CONNECTION_STRING_PATTERN = /(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+/i;

/** All secret patterns with labels for violation messages */
export const SECRET_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: AWS_KEY_PATTERN, label: 'AWS access key' },
  { pattern: GENERIC_API_KEY_PATTERN, label: 'generic API key' },
  { pattern: BEARER_TOKEN_PATTERN, label: 'Bearer token' },
  { pattern: PRIVATE_KEY_PATTERN, label: 'private key' },
  { pattern: CONNECTION_STRING_PATTERN, label: 'connection string' },
];
