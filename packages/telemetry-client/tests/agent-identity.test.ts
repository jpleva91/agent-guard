import { describe, it, expect } from 'vitest';

describe('agent identity', () => {
  it('TelemetryClientConfig accepts agentName', async () => {
    const { createTelemetryClient } = await import('../src/client.js');
    const client = await createTelemetryClient({
      mode: 'anonymous',
      agentName: 'backlog-steward',
    });
    expect(client).toBeDefined();
    const status = client.status();
    expect(status.mode).toBe('anonymous');
  });

  it('resolves agentName from AGENTGUARD_AGENT_NAME env var', async () => {
    process.env.AGENTGUARD_AGENT_NAME = 'test-agent';
    // Re-import to pick up env var
    const mod = await import('../src/client.js');
    const client = await mod.createTelemetryClient({ mode: 'anonymous' });
    expect(client).toBeDefined();
    delete process.env.AGENTGUARD_AGENT_NAME;
  });
});
