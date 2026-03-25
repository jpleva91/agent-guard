// Tests for demo CLI command
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { demo } from '../src/commands/demo.js';

beforeEach(() => {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

describe('demo', () => {
  it('runs without errors and returns 0', async () => {
    const code = await demo();
    expect(code).toBe(0);
  });

  it('shows allowed and denied actions', async () => {
    await demo();

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('ALLOW'));
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('DENY'));
  });

  it('shows summary with counts', async () => {
    await demo();

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('3 allowed'));
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('5 blocked'));
  });

  it('shows getting started instructions', async () => {
    await demo();

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('npx @red-codes/agentguard claude-init')
    );
  });
});
