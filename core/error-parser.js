// Error parser — detects and classifies JS/TS/Node errors from stderr output

const ERROR_PATTERNS = [
  // Node.js / JavaScript runtime errors
  { pattern: /TypeError: Cannot read propert/i, type: 'null-reference' },
  { pattern: /TypeError: Cannot access/i, type: 'null-reference' },
  { pattern: /TypeError: (\w+) is not a function/i, type: 'type-mismatch' },
  { pattern: /TypeError:/i, type: 'type-error' },
  { pattern: /SyntaxError:/i, type: 'syntax' },
  { pattern: /ReferenceError:/i, type: 'undefined-reference' },
  { pattern: /RangeError: Maximum call stack/i, type: 'stack-overflow' },
  { pattern: /RangeError:/i, type: 'range-error' },
  { pattern: /ECONNREFUSED/i, type: 'network' },
  { pattern: /ECONNRESET/i, type: 'network' },
  { pattern: /ETIMEDOUT/i, type: 'network' },
  { pattern: /EADDRINUSE/i, type: 'network' },
  { pattern: /ENOENT/i, type: 'file-not-found' },
  { pattern: /EACCES/i, type: 'permission' },
  { pattern: /ERR_MODULE_NOT_FOUND/i, type: 'import' },
  { pattern: /Cannot find module/i, type: 'import' },
  { pattern: /UnhandledPromiseRejection/i, type: 'unhandled-promise' },
  { pattern: /unhandled promise rejection/i, type: 'unhandled-promise' },
  { pattern: /SIGPIPE/i, type: 'broken-pipe' },
  { pattern: /EPIPE/i, type: 'broken-pipe' },
  { pattern: /out of memory/i, type: 'memory-leak' },
  { pattern: /heap out of memory/i, type: 'memory-leak' },
  { pattern: /Invalid regular expression/i, type: 'regex' },
  { pattern: /Assertion.*failed/i, type: 'assertion' },
  { pattern: /AssertionError/i, type: 'assertion' },
  { pattern: /DEPRECAT/i, type: 'deprecated' },

  // ESLint output format: "filepath:line:col: error message (rule-name)"
  { pattern: /^\S+:\d+:\d+:\s+error\s+/m, type: 'lint-error' },
  { pattern: /^\S+:\d+:\d+:\s+warning\s+/m, type: 'lint-warning' },
  { pattern: /✖ \d+ problems?\s/i, type: 'lint-error' },

  // Vitest / Jest test failures
  { pattern: /FAIL\s+\S+\.(?:test|spec)\./i, type: 'test-failure' },
  { pattern: /AssertionError: expected/i, type: 'assertion' },
  { pattern: /Expected:.*Received:/s, type: 'assertion' },
  { pattern: /Test Suites:.*failed/i, type: 'test-failure' },
  { pattern: /Tests:\s+\d+ failed/i, type: 'test-failure' },

  // TypeScript compiler errors: "error TS2345:"
  { pattern: /error TS\d+:/i, type: 'type-error' },
  { pattern: /\.tsx?\(\d+,\d+\):\s*error/i, type: 'type-error' },

  // Merge conflict markers
  { pattern: /^<{7}\s/m, type: 'merge-conflict' },
  { pattern: /^>{7}\s/m, type: 'merge-conflict' },

  // Security scanner output (npm audit, snyk)
  { pattern: /\d+ vulnerabilit/i, type: 'security-finding' },
  { pattern: /high.*severity/i, type: 'security-finding' },
  { pattern: /critical.*vulnerability/i, type: 'security-finding' },

  // CI failure patterns (GitHub Actions, generic CI)
  { pattern: /::error::/i, type: 'ci-failure' },
  { pattern: /Build failed/i, type: 'ci-failure' },
  { pattern: /Pipeline failed/i, type: 'ci-failure' },

  // Generic (must be last)
  { pattern: /Error:/i, type: 'generic' },
];

/**
 * Parse a block of stderr text into structured error objects.
 * @param {string} text - Raw stderr output
 * @returns {Array<{type: string, message: string, rawLines: string[]}>}
 */
export function parseErrors(text) {
  const lines = text.split('\n');
  const errors = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this line starts a new error
    const matched = matchErrorType(trimmed);
    if (matched) {
      if (current) errors.push(current);
      current = {
        type: matched.type,
        message: extractMessage(trimmed),
        rawLines: [line],
      };
    } else if (current) {
      // Stack trace or continuation line
      current.rawLines.push(line);
    }
  }

  if (current) errors.push(current);

  // Deduplicate: Node.js often prints the same error twice (V8 formatted + raw)
  return deduplicateErrors(errors);
}

/**
 * Remove duplicate errors with the same type and message.
 * Keeps the one with more stack trace lines.
 */
function deduplicateErrors(errors) {
  const seen = new Map();
  for (const error of errors) {
    const key = `${error.type}:${error.message}`;
    const existing = seen.get(key);
    if (!existing || error.rawLines.length > existing.rawLines.length) {
      seen.set(key, error);
    }
  }
  return Array.from(seen.values());
}

/**
 * Classify a single line of text.
 * @param {string} line
 * @returns {{type: string, pattern: RegExp} | null}
 */
function matchErrorType(line) {
  for (const entry of ERROR_PATTERNS) {
    if (entry.pattern.test(line)) {
      return entry;
    }
  }
  return null;
}

/**
 * Extract the human-readable error message from a line.
 * @param {string} line
 * @returns {string}
 */
function extractMessage(line) {
  // Strip Node.js internal prefixes like "node:internal/modules/cjs/loader:1234"
  const cleaned = line.replace(/^.*?(?:Error|Warning):\s*/i, '').trim();
  return cleaned || line.trim();
}
