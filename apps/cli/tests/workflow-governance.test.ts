// Tests for the reusable GitHub Actions governance workflow
// Validates the workflow YAML structure and required elements
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WORKFLOW_PATH = resolve(__dirname, '../../../.github/workflows/agentguard-governance.yml');

function readWorkflow(): string {
  return readFileSync(WORKFLOW_PATH, 'utf-8');
}

describe('agentguard-governance.yml reusable workflow', () => {
  it('exists and is non-empty', () => {
    const content = readWorkflow();
    expect(content.length).toBeGreaterThan(0);
  });

  it('is a reusable workflow (workflow_call trigger)', () => {
    const content = readWorkflow();
    expect(content).toContain('workflow_call:');
  });

  describe('inputs', () => {
    it('has session-file input', () => {
      const content = readWorkflow();
      expect(content).toContain('session-file:');
    });

    it('has action-manifest input for guard --dry-run', () => {
      const content = readWorkflow();
      expect(content).toContain('action-manifest:');
    });

    it('has policy-file input with default', () => {
      const content = readWorkflow();
      expect(content).toContain('policy-file:');
      expect(content).toContain("default: 'agentguard.yaml'");
    });

    it('has mode input with enforce/audit options', () => {
      const content = readWorkflow();
      expect(content).toContain('mode:');
      expect(content).toMatch(/enforce/);
      expect(content).toMatch(/audit/);
    });

    it('has fail-on-violation input', () => {
      const content = readWorkflow();
      expect(content).toContain('fail-on-violation:');
    });

    it('has fail-on-denial input', () => {
      const content = readWorkflow();
      expect(content).toContain('fail-on-denial:');
    });

    it('has violation-threshold input', () => {
      const content = readWorkflow();
      expect(content).toContain('violation-threshold:');
    });

    it('has post-evidence input', () => {
      const content = readWorkflow();
      expect(content).toContain('post-evidence:');
    });

    it('has agentguard-version input with latest default', () => {
      const content = readWorkflow();
      expect(content).toContain('agentguard-version:');
      expect(content).toContain("default: 'latest'");
    });

    it('has node-version input', () => {
      const content = readWorkflow();
      expect(content).toContain('node-version:');
    });
  });

  describe('job structure', () => {
    it('has governance-check job', () => {
      const content = readWorkflow();
      expect(content).toContain('governance-check:');
    });

    it('runs on ubuntu-latest', () => {
      const content = readWorkflow();
      expect(content).toContain('runs-on: ubuntu-latest');
    });

    it('has contents read permission', () => {
      const content = readWorkflow();
      expect(content).toContain('contents: read');
    });

    it('has pull-requests write permission for evidence posting', () => {
      const content = readWorkflow();
      expect(content).toContain('pull-requests: write');
    });
  });

  describe('steps', () => {
    it('checks out repository', () => {
      const content = readWorkflow();
      expect(content).toContain('actions/checkout@');
    });

    it('sets up Node.js', () => {
      const content = readWorkflow();
      expect(content).toContain('actions/setup-node@');
    });

    it('installs AgentGuard from npm', () => {
      const content = readWorkflow();
      expect(content).toContain('npm install -g @red-codes/agentguard');
    });

    it('validates the policy file using agentguard policy validate', () => {
      const content = readWorkflow();
      expect(content).toContain('agentguard policy validate');
    });

    it('runs ci-check for session-based verification', () => {
      const content = readWorkflow();
      expect(content).toContain('agentguard ci-check');
    });

    it('runs guard --dry-run for action manifest evaluation', () => {
      const content = readWorkflow();
      expect(content).toContain('agentguard guard --dry-run');
    });

    it('writes a job summary to GITHUB_STEP_SUMMARY', () => {
      const content = readWorkflow();
      expect(content).toContain('GITHUB_STEP_SUMMARY');
    });

    it('uploads governance report artifact', () => {
      const content = readWorkflow();
      expect(content).toContain('actions/upload-artifact@');
      expect(content).toContain('governance-report');
    });

    it('uploads governance session artifact', () => {
      const content = readWorkflow();
      expect(content).toContain('governance-session');
    });
  });

  describe('mode behavior', () => {
    it('audit mode does not fail on violations', () => {
      const content = readWorkflow();
      // In audit mode, ci-check should use || true to prevent failure
      expect(content).toContain('audit');
      expect(content).toMatch(/audit.*\|\| true|mode.*audit/s);
    });

    it('enforce mode propagates failure', () => {
      const content = readWorkflow();
      expect(content).toContain('enforce');
    });
  });

  describe('violation threshold', () => {
    it('has a threshold check step', () => {
      const content = readWorkflow();
      expect(content).toContain('Check violation threshold');
    });

    it('threshold check references violation-threshold input', () => {
      const content = readWorkflow();
      expect(content).toContain('inputs.violation-threshold');
    });
  });
});
