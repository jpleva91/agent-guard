// Tests for CLI argument parser
import { describe, it, expect } from 'vitest';
import { parseArgs, formatHelp } from '../src/args.js';

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('parses boolean flags', () => {
    const result = parseArgs(['--dry-run', '--verbose'], {
      boolean: ['--dry-run', '--verbose'],
    });
    expect(result.flags['dry-run']).toBe(true);
    expect(result.flags['verbose']).toBe(true);
  });

  it('parses string flags with values', () => {
    const result = parseArgs(['--policy', 'agentguard.yaml'], {
      string: ['--policy'],
    });
    expect(result.flags['policy']).toBe('agentguard.yaml');
  });

  it('sets string flag to null when value is missing (end of args)', () => {
    const result = parseArgs(['--policy'], {
      string: ['--policy'],
    });
    expect(result.flags['policy']).toBeNull();
  });

  it('sets string flag to null when next arg is a flag', () => {
    const result = parseArgs(['--policy', '--verbose'], {
      string: ['--policy'],
      boolean: ['--verbose'],
    });
    expect(result.flags['policy']).toBeNull();
  });

  it('resolves aliases', () => {
    const result = parseArgs(['-p', 'my-policy.yaml'], {
      string: ['--policy'],
      alias: { '-p': '--policy' },
    });
    expect(result.flags['policy']).toBe('my-policy.yaml');
  });

  it('resolves boolean aliases', () => {
    const result = parseArgs(['-v'], {
      boolean: ['--verbose'],
      alias: { '-v': '--verbose' },
    });
    expect(result.flags['verbose']).toBe(true);
  });

  it('collects positional arguments', () => {
    const result = parseArgs(['run-123', 'extra'], {});
    expect(result.positional).toEqual(['run-123', 'extra']);
  });

  it('treats unknown flags as booleans', () => {
    const result = parseArgs(['--unknown-flag'], {});
    expect(result.flags['unknown-flag']).toBe(true);
  });

  it('handles stopAt to collect rest args', () => {
    const result = parseArgs(['--verbose', '--', 'cmd', 'arg1', 'arg2'], {
      boolean: ['--verbose'],
      stopAt: '--',
    });
    expect(result.flags['verbose']).toBe(true);
    expect(result.rest).toEqual(['cmd', 'arg1', 'arg2']);
  });

  it('returns empty results for empty argv', () => {
    const result = parseArgs([], {});
    expect(result.flags).toEqual({});
    expect(result.positional).toEqual([]);
    expect(result.rest).toEqual([]);
  });

  it('handles mixed flags and positional args', () => {
    const result = parseArgs(['--verbose', 'run_abc', '--policy', 'test.yaml'], {
      boolean: ['--verbose'],
      string: ['--policy'],
    });
    expect(result.flags['verbose']).toBe(true);
    expect(result.flags['policy']).toBe('test.yaml');
    expect(result.positional).toEqual(['run_abc']);
  });
});

// ---------------------------------------------------------------------------
// formatHelp
// ---------------------------------------------------------------------------

describe('formatHelp', () => {
  it('renders name and description', () => {
    const output = formatHelp({
      name: 'guard',
      description: 'Start the runtime',
      usage: 'agentguard guard [options]',
    });
    expect(output).toContain('guard');
    expect(output).toContain('Start the runtime');
    expect(output).toContain('Usage:');
    expect(output).toContain('agentguard guard [options]');
  });

  it('renders flags section', () => {
    const output = formatHelp({
      name: 'guard',
      description: 'Start the runtime',
      usage: 'agentguard guard [options]',
      flags: [
        { flag: '--policy <file>', description: 'Policy file to load' },
        { flag: '--dry-run', description: 'Evaluate without executing' },
      ],
    });
    expect(output).toContain('Flags:');
    expect(output).toContain('--policy <file>');
    expect(output).toContain('Policy file to load');
    expect(output).toContain('--dry-run');
  });

  it('renders examples section', () => {
    const output = formatHelp({
      name: 'guard',
      description: 'Start',
      usage: 'agentguard guard',
      examples: ['agentguard guard --dry-run', 'agentguard guard --policy custom.yaml'],
    });
    expect(output).toContain('Examples:');
    expect(output).toContain('agentguard guard --dry-run');
    expect(output).toContain('agentguard guard --policy custom.yaml');
  });

  it('omits flags section when no flags provided', () => {
    const output = formatHelp({
      name: 'test',
      description: 'Test cmd',
      usage: 'agentguard test',
    });
    expect(output).not.toContain('Flags:');
  });

  it('omits examples section when no examples provided', () => {
    const output = formatHelp({
      name: 'test',
      description: 'Test cmd',
      usage: 'agentguard test',
    });
    expect(output).not.toContain('Examples:');
  });
});
