// Error parser — detects and classifies JS/TS/Node errors from stderr output
// No DOM — pure parsing logic.

export interface ParsedError {
  type: string;
  message: string;
  rawLines: string[];
}

interface ErrorPattern {
  pattern: RegExp;
  type: string;
}

const ERROR_PATTERNS: ErrorPattern[] = [
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

  // ESLint
  { pattern: /^\S+:\d+:\d+:\s+error\s+/m, type: 'lint-error' },
  { pattern: /^\S+:\d+:\d+:\s+warning\s+/m, type: 'lint-warning' },
  { pattern: /✖ \d+ problems?\s/i, type: 'lint-error' },

  // Test failures
  { pattern: /FAIL\s+\S+\.(?:test|spec)\./i, type: 'test-failure' },
  { pattern: /AssertionError: expected/i, type: 'assertion' },
  { pattern: /Expected:.*Received:/s, type: 'assertion' },
  { pattern: /Test Suites:.*failed/i, type: 'test-failure' },
  { pattern: /Tests:\s+\d+ failed/i, type: 'test-failure' },

  // TypeScript
  { pattern: /error TS\d+:/i, type: 'type-error' },
  { pattern: /\.tsx?\(\d+,\d+\):\s*error/i, type: 'type-error' },

  // Merge conflicts
  { pattern: /^<{7}\s/m, type: 'merge-conflict' },
  { pattern: /^>{7}\s/m, type: 'merge-conflict' },

  // Security
  { pattern: /\d+ vulnerabilit/i, type: 'security-finding' },
  { pattern: /high.*severity/i, type: 'security-finding' },
  { pattern: /critical.*vulnerability/i, type: 'security-finding' },

  // CI
  { pattern: /::error::/i, type: 'ci-failure' },
  { pattern: /Build failed/i, type: 'ci-failure' },
  { pattern: /Pipeline failed/i, type: 'ci-failure' },

  // Python
  { pattern: /Traceback \(most recent call last\)/, type: 'generic' },
  { pattern: /RecursionError:/i, type: 'stack-overflow' },
  { pattern: /NameError: name '.+' is not defined/i, type: 'undefined-reference' },
  { pattern: /AttributeError:/i, type: 'null-reference' },
  { pattern: /ModuleNotFoundError:/i, type: 'import' },
  { pattern: /ImportError:/i, type: 'import' },
  { pattern: /KeyError:/i, type: 'key-error' },
  { pattern: /IndexError:/i, type: 'range-error' },
  { pattern: /ValueError:/i, type: 'type-mismatch' },
  { pattern: /ZeroDivisionError:/i, type: 'range-error' },
  { pattern: /FileNotFoundError:/i, type: 'file-not-found' },
  { pattern: /PermissionError:/i, type: 'permission' },

  // Go
  { pattern: /panic: runtime error:/i, type: 'null-reference' },
  { pattern: /fatal error: concurrent map/i, type: 'concurrency' },
  { pattern: /panic:/i, type: 'stack-overflow' },
  { pattern: /^\.\/\S+\.go:\d+:\d+:/m, type: 'syntax' },

  // Rust
  { pattern: /error\[E\d+\]:/, type: 'type-error' },
  { pattern: /warning\[.*\]:/, type: 'lint-warning' },
  { pattern: /cannot find .+ in this scope/i, type: 'undefined-reference' },
  { pattern: /thread '.*' panicked at/, type: 'stack-overflow' },
  { pattern: /borrow of moved value/i, type: 'type-error' },

  // Java / Kotlin
  { pattern: /NullPointerException/, type: 'null-reference' },
  { pattern: /ClassNotFoundException/, type: 'import' },
  { pattern: /ClassCastException/, type: 'type-mismatch' },
  { pattern: /ArrayIndexOutOfBoundsException/, type: 'range-error' },
  { pattern: /StackOverflowError/, type: 'stack-overflow' },
  { pattern: /OutOfMemoryError/, type: 'memory-leak' },
  { pattern: /ConcurrentModificationException/, type: 'concurrency' },
  { pattern: /IllegalArgumentException/, type: 'type-mismatch' },
  { pattern: /FileNotFoundException/, type: 'file-not-found' },
  { pattern: /NoSuchElementException/, type: 'key-error' },
  { pattern: /Exception in thread/i, type: 'generic' },

  // Generic (must be last)
  { pattern: /Error:/i, type: 'generic' },
];

export function parseErrors(text: string): ParsedError[] {
  const lines = text.split('\n');
  const errors: ParsedError[] = [];
  let current: ParsedError | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const matched = matchErrorType(trimmed);
    if (matched) {
      if (current) errors.push(current);
      current = {
        type: matched.type,
        message: extractMessage(trimmed),
        rawLines: [line],
      };
    } else if (current) {
      current.rawLines.push(line);
    }
  }

  if (current) errors.push(current);

  mergePythonTracebacks(errors);
  return deduplicateErrors(errors);
}

function mergePythonTracebacks(errors: ParsedError[]): void {
  for (let i = errors.length - 2; i >= 0; i--) {
    const current = errors[i];
    const next = errors[i + 1];
    if (
      current.type === 'generic' &&
      current.message.includes('most recent call last') &&
      next.type !== 'generic'
    ) {
      next.rawLines = [...current.rawLines, ...next.rawLines];
      errors.splice(i, 1);
    }
  }
}

function deduplicateErrors(errors: ParsedError[]): ParsedError[] {
  const seen = new Map<string, ParsedError>();
  for (const error of errors) {
    const key = `${error.type}:${error.message}`;
    const existing = seen.get(key);
    if (!existing || error.rawLines.length > existing.rawLines.length) {
      seen.set(key, error);
    }
  }
  return Array.from(seen.values());
}

function matchErrorType(line: string): ErrorPattern | null {
  for (const entry of ERROR_PATTERNS) {
    if (entry.pattern.test(line)) {
      return entry;
    }
  }
  return null;
}

function extractMessage(line: string): string {
  const rustMatch = line.match(/^error\[E\d+\]:\s*(.+)/);
  if (rustMatch) return rustMatch[1].trim();

  const panicMatch = line.match(/^panic:\s*(.+)/);
  if (panicMatch) return panicMatch[1].trim();

  const goCompileMatch = line.match(/^\.\/.+\.go:\d+:\d+:\s*(.+)/);
  if (goCompileMatch) return goCompileMatch[1].trim();

  const javaMatch = line.match(/^Exception in thread\s+"[^"]*"\s+[\w.]+(?::\s*(.+))?/);
  if (javaMatch) return (javaMatch[1] || line).trim();

  const cleaned = line.replace(/^.*?(?:Error|Warning):\s*/i, '').trim();
  return cleaned || line.trim();
}
