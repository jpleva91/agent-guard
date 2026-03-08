// Stacktrace parser — extracts file, line, column from stack traces
// Supports Node.js, TypeScript, Python, Go, Rust, Java

export interface StackFrame {
  file: string;
  line: number;
  column: number | null;
  fn: string | null;
}

const STACK_LINE_RE = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/;
const TSC_RE = /^(.+?)\((\d+),(\d+)\):\s*error/;
const PYTHON_FRAME_RE = /^\s*File "(.+?)", line (\d+)/;
const GO_FRAME_RE = /^\s*(\S+\.go):(\d+)/;
const RUST_FRAME_RE = /^\s*-->\s*(.+?):(\d+):(\d+)/;
const JAVA_FRAME_RE = /^\s*at\s+[\w.$]+\((.+?):(\d+)\)/;
const SIMPLE_LOCATION_RE = /^(.+?):(\d+)(?::(\d+))?$/;

export function parseStackTrace(lines: string[]): StackFrame[] {
  const frames: StackFrame[] = [];

  for (const raw of lines) {
    const line = raw.trim();

    const atMatch = line.match(STACK_LINE_RE);
    if (atMatch) {
      const file = atMatch[2];
      if (isInternalFrame(file)) continue;
      frames.push({
        file: atMatch[2],
        line: parseInt(atMatch[3], 10),
        column: parseInt(atMatch[4], 10),
        fn: atMatch[1] || null,
      });
      continue;
    }

    const tscMatch = line.match(TSC_RE);
    if (tscMatch) {
      frames.push({
        file: tscMatch[1],
        line: parseInt(tscMatch[2], 10),
        column: parseInt(tscMatch[3], 10),
        fn: null,
      });
      continue;
    }

    const pyMatch = line.match(PYTHON_FRAME_RE);
    if (pyMatch) {
      if (!isInternalFrame(pyMatch[1])) {
        frames.push({
          file: pyMatch[1],
          line: parseInt(pyMatch[2], 10),
          column: null,
          fn: null,
        });
      }
      continue;
    }

    const rustMatch = line.match(RUST_FRAME_RE);
    if (rustMatch) {
      frames.push({
        file: rustMatch[1],
        line: parseInt(rustMatch[2], 10),
        column: parseInt(rustMatch[3], 10),
        fn: null,
      });
      continue;
    }

    const javaMatch = line.match(JAVA_FRAME_RE);
    if (javaMatch) {
      if (!isInternalFrame(javaMatch[1])) {
        frames.push({
          file: javaMatch[1],
          line: parseInt(javaMatch[2], 10),
          column: null,
          fn: null,
        });
      }
      continue;
    }

    const goMatch = line.match(GO_FRAME_RE);
    if (goMatch) {
      if (!isInternalFrame(goMatch[1])) {
        frames.push({
          file: goMatch[1],
          line: parseInt(goMatch[2], 10),
          column: null,
          fn: null,
        });
      }
      continue;
    }
  }

  return frames;
}

export function getUserFrame(frames: StackFrame[]): StackFrame | null {
  return frames.find((f) => !isInternalFrame(f.file)) || frames[0] || null;
}

export function extractLocation(text: string): { file: string; line: number; column: number | null } | null {
  const match = text.match(SIMPLE_LOCATION_RE);
  if (match && !isInternalFrame(match[1])) {
    return {
      file: match[1],
      line: parseInt(match[2], 10),
      column: match[3] ? parseInt(match[3], 10) : null,
    };
  }
  return null;
}

function isInternalFrame(file: string): boolean {
  return (
    file.startsWith('node:') ||
    file.startsWith('internal/') ||
    file.includes('node_modules') ||
    file.startsWith('<anonymous>')
  );
}
