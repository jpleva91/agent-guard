// Lightweight CLI argument parser — zero dependencies.

interface ArgSpec {
  boolean?: string[];
  string?: string[];
  alias?: Record<string, string>;
  stopAt?: string;
}

interface ParseResult {
  flags: Record<string, string | boolean | null>;
  positional: string[];
  rest: string[];
}

export function parseArgs(argv: string[], spec: ArgSpec = {}): ParseResult {
  const booleans = new Set(spec.boolean || []);
  const strings = new Set(spec.string || []);
  const alias = spec.alias || {};
  const stopAt = spec.stopAt || null;

  const flags: Record<string, string | boolean | null> = {};
  const positional: string[] = [];
  let rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (stopAt && arg === stopAt) {
      rest = argv.slice(i + 1);
      break;
    }

    const resolved = alias[arg] || arg;

    if (booleans.has(resolved) || booleans.has(arg)) {
      flags[resolved.replace(/^-+/, '')] = true;
    } else if (strings.has(resolved) || strings.has(arg)) {
      const key = resolved.replace(/^-+/, '');
      const value = argv[i + 1];
      if (!value || value.startsWith('-')) {
        flags[key] = null;
      } else {
        flags[key] = value;
        i++;
      }
    } else if (arg.startsWith('-')) {
      flags[arg.replace(/^-+/, '')] = true;
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional, rest };
}

interface CommandHelp {
  name: string;
  description: string;
  usage: string;
  flags?: Array<{ flag: string; description: string }>;
  examples?: string[];
}

export function formatHelp(cmd: CommandHelp): string {
  const lines: string[] = [];
  lines.push(`  \x1b[1m${cmd.name}\x1b[0m — ${cmd.description}`);
  lines.push('');
  lines.push(`  \x1b[1mUsage:\x1b[0m  ${cmd.usage}`);

  if (cmd.flags && cmd.flags.length > 0) {
    lines.push('');
    lines.push('  \x1b[1mFlags:\x1b[0m');
    const maxLen = Math.max(...cmd.flags.map((f) => f.flag.length));
    for (const f of cmd.flags) {
      lines.push(`    ${f.flag.padEnd(maxLen + 2)} ${f.description}`);
    }
  }

  if (cmd.examples && cmd.examples.length > 0) {
    lines.push('');
    lines.push('  \x1b[1mExamples:\x1b[0m');
    for (const ex of cmd.examples) {
      lines.push(`    ${ex}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
