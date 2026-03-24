// End-to-end integration test: postinstall writes configs → kernel loads policy → hook payloads evaluated.
// Validates the complete user journey: install → policy generation → Claude Code + Copilot CLI governance.
// Uses REAL kernel, REAL policy evaluator, REAL adapters — no mocks.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { writeClaudeCodeHooks, writeCopilotCliHooks, writeStarterPolicy } from '../src/postinstall.js';
import { processClaudeCodeHook } from '@red-codes/adapters';
import { processCopilotCliHook } from '@red-codes/adapters';
import type { ClaudeCodeHookPayload, CopilotCliHookPayload } from '@red-codes/adapters';
import { createKernel } from '@red-codes/kernel';
import type { EventSink, KernelResult } from '@red-codes/kernel';
import type { GovernanceDecisionRecord, DecisionSink } from '@red-codes/core';
import type { DomainEvent } from '@red-codes/core';
import { resetActionCounter } from '@red-codes/core';
import { resetEventCounter } from '@red-codes/events';
import { loadYamlPolicy } from '@red-codes/policy';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTempDir(label: string): string {
  const dir = join(
    tmpdir(),
    `ag-e2e-postinstall-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  // writeStarterPolicy requires a package.json to exist
  writeFileSync(join(dir, 'package.json'), '{}');
  return dir;
}

function createTestSinks() {
  const events: DomainEvent[] = [];
  const decisions: GovernanceDecisionRecord[] = [];
  const eventSink: EventSink = { write: (e) => events.push(e) };
  const decisionSink: DecisionSink = { write: (r) => decisions.push(r) };
  return { events, decisions, eventSink, decisionSink };
}

/** Load the starter policy from a temp dir and create a kernel with it. */
function loadPolicyAndCreateKernel(tempDir: string, decisionSink: DecisionSink) {
  const yamlContent = readFileSync(join(tempDir, 'agentguard.yaml'), 'utf8');
  const policy = loadYamlPolicy(yamlContent);

  return createKernel({
    policyDefs: [policy],
    evaluateOptions: { defaultDeny: false },
    dryRun: true,
    decisionSinks: [decisionSink],
  });
}

/** Build a Claude Code PreToolUse hook payload. */
function claudePreToolUse(
  tool_name: string,
  tool_input: Record<string, unknown> = {}
): ClaudeCodeHookPayload {
  return { hook: 'PreToolUse', tool_name, tool_input };
}

/** Build a Copilot CLI hook payload. */
function copilotPreToolUse(toolName: string, toolArgs: string): CopilotCliHookPayload {
  return { toolName, toolArgs };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(() => {
  resetActionCounter();
  resetEventCounter();
  tempDir = makeTempDir('pipeline');
  writeStarterPolicy(tempDir);
});

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 1. Postinstall creates valid policy that loads without error
// ---------------------------------------------------------------------------

describe('E2E postinstall pipeline: policy loading', () => {
  it('postinstall creates valid policy that loads without error', () => {
    expect(existsSync(join(tempDir, 'agentguard.yaml'))).toBe(true);
    const yamlContent = readFileSync(join(tempDir, 'agentguard.yaml'), 'utf8');
    const policy = loadYamlPolicy(yamlContent);

    expect(policy.id).toBe('default-policy');
    expect(policy.name).toBe('Default Safety Policy');
    expect(policy.severity).toBe(4);
    expect(policy.rules.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2–5. Claude Code hook evaluations
// ---------------------------------------------------------------------------

describe('E2E postinstall pipeline: Claude Code hooks', () => {
  it('denies git push to main', async () => {
    const { decisions, decisionSink } = createTestSinks();
    const kernel = loadPolicyAndCreateKernel(tempDir, decisionSink);

    const payload = claudePreToolUse('Bash', { command: 'git push origin main' });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(false);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('deny');
    expect(result.decisionRecord!.action.type).toBe('git.push');
    expect(decisions).toHaveLength(1);
  });

  it('allows file read', async () => {
    const { decisions, decisionSink } = createTestSinks();
    const kernel = loadPolicyAndCreateKernel(tempDir, decisionSink);

    const payload = claudePreToolUse('Read', { file_path: 'src/index.ts' });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(true);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('allow');
    expect(result.decisionRecord!.action.type).toBe('file.read');
    expect(decisions).toHaveLength(1);
  });

  it('denies force push', async () => {
    const { decisions, decisionSink } = createTestSinks();
    const kernel = loadPolicyAndCreateKernel(tempDir, decisionSink);

    const payload = claudePreToolUse('Bash', { command: 'git push --force origin main' });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(false);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('deny');
    // Force push is detected as git.force-push by the AAB
    expect(result.decisionRecord!.action.type).toBe('git.force-push');
    expect(decisions).toHaveLength(1);
  });

  it('denies .env write', async () => {
    const { decisions, decisionSink } = createTestSinks();
    const kernel = loadPolicyAndCreateKernel(tempDir, decisionSink);

    const payload = claudePreToolUse('Write', { file_path: '.env', content: 'SECRET=abc' });
    const result = await processClaudeCodeHook(kernel, payload);

    expect(result.allowed).toBe(false);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('deny');
    expect(result.decisionRecord!.action.type).toBe('file.write');
    expect(decisions).toHaveLength(1);
  });

  it('allows push to feature branch', async () => {
    const { decisions, decisionSink } = createTestSinks();
    const kernel = loadPolicyAndCreateKernel(tempDir, decisionSink);

    const payload = claudePreToolUse('Bash', { command: 'git push origin feat/my-feature' });
    // Must pass testsPass so test-before-push invariant doesn't deny
    const result = await processClaudeCodeHook(kernel, payload, { testsPass: true });

    expect(result.allowed).toBe(true);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('allow');
    expect(result.decisionRecord!.action.type).toBe('git.push');
    expect(decisions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 6–9, 11. Copilot CLI hook evaluations
// ---------------------------------------------------------------------------

describe('E2E postinstall pipeline: Copilot CLI hooks', () => {
  it('denies git push to main', async () => {
    const { decisions, decisionSink } = createTestSinks();
    const kernel = loadPolicyAndCreateKernel(tempDir, decisionSink);

    const payload = copilotPreToolUse('bash', JSON.stringify({ command: 'git push origin main' }));
    const result = await processCopilotCliHook(kernel, payload);

    expect(result.allowed).toBe(false);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('deny');
    expect(result.decisionRecord!.action.type).toBe('git.push');
    expect(decisions).toHaveLength(1);
  });

  it('allows file read', async () => {
    const { decisions, decisionSink } = createTestSinks();
    const kernel = loadPolicyAndCreateKernel(tempDir, decisionSink);

    const payload = copilotPreToolUse('view', JSON.stringify({ file_path: 'README.md' }));
    const result = await processCopilotCliHook(kernel, payload);

    expect(result.allowed).toBe(true);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('allow');
    expect(result.decisionRecord!.action.type).toBe('file.read');
    expect(decisions).toHaveLength(1);
  });

  it('denies .env file creation', async () => {
    const { decisions, decisionSink } = createTestSinks();
    const kernel = loadPolicyAndCreateKernel(tempDir, decisionSink);

    const payload = copilotPreToolUse(
      'create',
      JSON.stringify({ file_path: '.env', content: 'SECRET=abc' })
    );
    const result = await processCopilotCliHook(kernel, payload);

    expect(result.allowed).toBe(false);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('deny');
    expect(result.decisionRecord!.action.type).toBe('file.write');
    expect(decisions).toHaveLength(1);
  });

  it('denies force push', async () => {
    const { decisions, decisionSink } = createTestSinks();
    const kernel = loadPolicyAndCreateKernel(tempDir, decisionSink);

    const payload = copilotPreToolUse(
      'bash',
      JSON.stringify({ command: 'git push --force origin master' })
    );
    const result = await processCopilotCliHook(kernel, payload);

    expect(result.allowed).toBe(false);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('deny');
    expect(result.decisionRecord!.action.type).toBe('git.force-push');
    expect(decisions).toHaveLength(1);
  });

  it('allows push to feature branch', async () => {
    const { decisions, decisionSink } = createTestSinks();
    const kernel = loadPolicyAndCreateKernel(tempDir, decisionSink);

    const payload = copilotPreToolUse(
      'bash',
      JSON.stringify({ command: 'git push origin feat/my-feature' })
    );
    // Must pass testsPass so test-before-push invariant doesn't deny
    const result = await processCopilotCliHook(kernel, payload, { testsPass: true });

    expect(result.allowed).toBe(true);
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.outcome).toBe('allow');
    expect(result.decisionRecord!.action.type).toBe('git.push');
    expect(decisions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 12. Generated policy includes all essential deny rules
// ---------------------------------------------------------------------------

describe('E2E postinstall pipeline: policy content validation', () => {
  it('generated policy includes all essential deny rules', () => {
    const yamlContent = readFileSync(join(tempDir, 'agentguard.yaml'), 'utf8');

    // Protected branch push
    expect(yamlContent).toContain('action: git.push');
    expect(yamlContent).toContain('branches: [main, master]');
    expect(yamlContent).toContain('Direct push to protected branch');

    // Force push
    expect(yamlContent).toContain('action: git.force-push');
    expect(yamlContent).toContain('Force push rewrites shared history');

    // Secrets protection
    expect(yamlContent).toContain('target: .env');
    expect(yamlContent).toContain('Secrets files must not be modified');

    // npm credentials
    expect(yamlContent).toContain('target: ".npmrc"');
    expect(yamlContent).toContain('npm credentials file must not be modified');

    // SSH keys
    expect(yamlContent).toContain('target: "id_rsa"');
    expect(yamlContent).toContain('target: "id_ed25519"');

    // Destructive commands
    expect(yamlContent).toContain('target: rm -rf');

    // Deploy protection
    expect(yamlContent).toContain('action: deploy.trigger');
    expect(yamlContent).toContain('action: infra.destroy');

    // Default allow rules
    expect(yamlContent).toContain('action: file.read');
    expect(yamlContent).toContain('Reading is always safe');
  });
});

// ---------------------------------------------------------------------------
// 13. Claude Code hooks config has correct structure
// ---------------------------------------------------------------------------

describe('E2E postinstall pipeline: hook config structure', () => {
  it('Claude Code hooks config has correct structure', () => {
    writeClaudeCodeHooks(tempDir);

    const settingsPath = join(tempDir, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

    // Must have all four hook types
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
    expect(settings.hooks.Notification).toBeDefined();
    expect(settings.hooks.Stop).toBeDefined();

    // PreToolUse should have a command hook
    expect(Array.isArray(settings.hooks.PreToolUse)).toBe(true);
    expect(settings.hooks.PreToolUse.length).toBeGreaterThan(0);
    const preHook = settings.hooks.PreToolUse[0];
    expect(preHook.hooks).toBeDefined();
    expect(preHook.hooks[0].type).toBe('command');
    expect(preHook.hooks[0].command).toMatch(/^npx --no-install agentguard /);
    expect(preHook.hooks[0].timeout).toBe(30000);

    // PostToolUse should have a Bash matcher
    expect(settings.hooks.PostToolUse.length).toBeGreaterThan(0);
    const postHook = settings.hooks.PostToolUse[0];
    expect(postHook.matcher).toBe('Bash');
    expect(postHook.hooks[0].type).toBe('command');

    // Notification hook
    expect(settings.hooks.Notification.length).toBeGreaterThan(0);
    expect(settings.hooks.Notification[0].hooks[0].type).toBe('command');

    // Stop hook
    expect(settings.hooks.Stop.length).toBeGreaterThan(0);
    expect(settings.hooks.Stop[0].hooks[0].type).toBe('command');
  });

  // ---------------------------------------------------------------------------
  // 14. Copilot CLI hooks config has correct structure
  // ---------------------------------------------------------------------------

  it('Copilot CLI hooks config has correct structure', () => {
    writeCopilotCliHooks(tempDir);

    const hooksPath = join(tempDir, '.github', 'hooks', 'hooks.json');
    expect(existsSync(hooksPath)).toBe(true);

    const config = JSON.parse(readFileSync(hooksPath, 'utf8'));

    // Must have version and hooks
    expect(config.version).toBe(1);
    expect(config.hooks).toBeDefined();

    // preToolUse
    expect(config.hooks.preToolUse).toBeDefined();
    expect(Array.isArray(config.hooks.preToolUse)).toBe(true);
    expect(config.hooks.preToolUse.length).toBeGreaterThan(0);
    const preHook = config.hooks.preToolUse[0];
    expect(preHook.type).toBe('command');
    expect(preHook.bash).toMatch(/^npx --no-install agentguard /);
    expect(preHook.timeoutSec).toBe(30);

    // postToolUse
    expect(config.hooks.postToolUse).toBeDefined();
    expect(Array.isArray(config.hooks.postToolUse)).toBe(true);
    expect(config.hooks.postToolUse.length).toBeGreaterThan(0);
    const postHook = config.hooks.postToolUse[0];
    expect(postHook.type).toBe('command');
    expect(postHook.bash).toMatch(/^npx --no-install agentguard /);
    expect(postHook.timeoutSec).toBe(10);
  });
});
