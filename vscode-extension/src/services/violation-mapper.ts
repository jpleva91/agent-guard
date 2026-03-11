// Pure violation-to-location mapping utilities — no VS Code dependency.
// Extracts file paths and line numbers from governance events to map
// violations to source locations for inline indicators.

import type { GovernanceEvent } from './event-reader';

/** A source location extracted from a governance event */
export interface ViolationLocation {
  readonly filePath: string;
  readonly line: number;
  readonly message: string;
  readonly severity: ViolationSeverity;
  readonly invariantId: string;
  readonly eventId: string;
}

/** Severity levels for violation indicators */
export type ViolationSeverity = 'error' | 'warning' | 'info';

/** Event kinds that produce violation locations */
const VIOLATION_EVENT_KINDS = new Set([
  'InvariantViolation',
  'PolicyDenied',
  'BlastRadiusExceeded',
  'ActionDenied',
]);

/**
 * Check if an event kind can produce violation locations.
 */
export function isViolationEvent(kind: string): boolean {
  return VIOLATION_EVENT_KINDS.has(kind);
}

/**
 * Extract violation locations from a governance event.
 * A single event may produce multiple locations (e.g., blast radius
 * violations reference multiple files).
 */
export function extractViolationLocations(event: GovernanceEvent): ViolationLocation[] {
  switch (event.kind) {
    case 'InvariantViolation':
      return extractFromInvariantViolation(event);
    case 'PolicyDenied':
      return extractFromPolicyDenied(event);
    case 'BlastRadiusExceeded':
      return extractFromBlastRadius(event);
    case 'ActionDenied':
      return extractFromActionDenied(event);
    default:
      return [];
  }
}

function getMetadata(event: GovernanceEvent): Record<string, unknown> {
  return typeof event.metadata === 'object' && event.metadata !== null
    ? (event.metadata as Record<string, unknown>)
    : {};
}

function extractFromInvariantViolation(event: GovernanceEvent): ViolationLocation[] {
  const locations: ViolationLocation[] = [];
  const metadata = getMetadata(event);
  const invariantId = String(event.invariant ?? 'unknown');
  const invariantName = String(metadata.name ?? invariantId);
  const actual = String(event.actual ?? '');
  const severity = mapInvariantSeverity(metadata.severity);

  // Direct file/line reference on the event
  if (typeof event.file === 'string' && event.file) {
    locations.push({
      filePath: event.file,
      line: typeof event.line === 'number' ? event.line : 0,
      message: `Invariant violation [${invariantName}]: ${actual}`,
      severity,
      invariantId,
      eventId: event.id,
    });
  }

  // Extract file paths embedded in the "actual" field
  const embeddedFiles = extractFilePathsFromText(actual);
  for (const filePath of embeddedFiles) {
    // Avoid duplicates with the direct file reference
    if (filePath === event.file) continue;
    locations.push({
      filePath,
      line: 0,
      message: `Invariant violation [${invariantName}]: ${actual}`,
      severity,
      invariantId,
      eventId: event.id,
    });
  }

  return locations;
}

function extractFromPolicyDenied(event: GovernanceEvent): ViolationLocation[] {
  const locations: ViolationLocation[] = [];
  const metadata = getMetadata(event);
  const reason = String(event.reason ?? metadata.reason ?? 'policy denied');
  const action = String(event.action ?? metadata.action ?? 'action');

  if (typeof event.file === 'string' && event.file) {
    locations.push({
      filePath: event.file,
      line: typeof event.line === 'number' ? event.line : 0,
      message: `Policy denied: ${action} — ${reason}`,
      severity: 'warning',
      invariantId: 'policy-denied',
      eventId: event.id,
    });
  }

  return locations;
}

function extractFromBlastRadius(event: GovernanceEvent): ViolationLocation[] {
  const locations: ViolationLocation[] = [];
  const filesAffected = event.filesAffected ?? 0;
  const limit = event.limit ?? 0;
  const message = `Blast radius exceeded (${filesAffected}/${limit} files)`;

  // The "files" optional field contains the list of affected files
  const files = event.files;
  if (Array.isArray(files)) {
    for (const filePath of files) {
      if (typeof filePath === 'string') {
        locations.push({
          filePath,
          line: 0,
          message,
          severity: 'error',
          invariantId: 'blast-radius-exceeded',
          eventId: event.id,
        });
      }
    }
  }

  return locations;
}

function extractFromActionDenied(event: GovernanceEvent): ViolationLocation[] {
  const locations: ViolationLocation[] = [];
  const target = String(event.target ?? '');
  const reason = String(event.reason ?? 'denied');
  const actionType = String(event.actionType ?? 'action');

  // Only create location if target looks like a file path
  if (target && looksLikeFilePath(target)) {
    locations.push({
      filePath: target,
      line: 0,
      message: `Action denied: ${actionType} on ${target} — ${reason}`,
      severity: 'warning',
      invariantId: 'action-denied',
      eventId: event.id,
    });
  }

  return locations;
}

/**
 * Map numeric invariant severity to violation severity level.
 */
function mapInvariantSeverity(severity: unknown): ViolationSeverity {
  const num = typeof severity === 'number' ? severity : 0;
  if (num >= 4) return 'error';
  if (num >= 2) return 'warning';
  return 'info';
}

/**
 * Extract file paths from free-text strings.
 * Handles patterns like "Sensitive files detected: .env, credentials.json"
 * and "modified: path/to/file.ts, path/to/other.ts"
 */
function extractFilePathsFromText(text: string): string[] {
  const paths: string[] = [];

  // Match after "detected:", "modified:", or "target:" prefixes
  const prefixMatch = text.match(/(?:detected|modified|target):\s*(.+)/i);
  if (prefixMatch) {
    const candidates = prefixMatch[1].split(',').map((s) => s.trim());
    for (const candidate of candidates) {
      if (looksLikeFilePath(candidate)) {
        paths.push(candidate);
      }
    }
  }

  return paths;
}

/**
 * Heuristic check if a string looks like a file path.
 */
function looksLikeFilePath(s: string): boolean {
  if (!s || s.length > 500) return false;
  // Must contain a dot (extension) or a path separator
  if (!s.includes('.') && !s.includes('/') && !s.includes('\\')) return false;
  // Must not contain typical non-path characters
  if (/[\s<>|"']/.test(s)) return false;
  return true;
}
