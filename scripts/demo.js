#!/usr/bin/env node
// AgentGuard governance demo — shows the kernel evaluating a realistic agent session.
// Run: npm run demo:guard

import { createKernel } from '../dist/agentguard/kernel.js';
import {
  renderBanner,
  renderKernelResult,
  renderActionGraph,
} from '../dist/agentguard/renderers/tui.js';

const kernel = createKernel({
  dryRun: true,
  policyDefs: [
    {
      id: 'demo-policy',
      name: 'Demo Safety Policy',
      rules: [
        {
          action: 'git.push',
          effect: 'deny',
          conditions: { branches: ['main', 'master'] },
          reason: 'Protected branch — use a PR',
        },
        {
          action: 'git.force-push',
          effect: 'deny',
          reason: 'Force push rewrites shared history',
        },
        {
          action: 'file.write',
          effect: 'deny',
          conditions: { scope: ['.env'] },
          reason: 'Secrets files must not be modified',
        },
        { action: 'file.read', effect: 'allow', reason: 'Reading is always safe' },
        { action: 'file.write', effect: 'allow', reason: 'Writes allowed by default' },
        { action: 'shell.exec', effect: 'allow', reason: 'Shell allowed by default' },
      ],
      severity: 4,
    },
  ],
});

// Simulate a realistic agent session
const actions = [
  { tool: 'Read', file: 'src/auth/service.ts', agent: 'claude-code' },
  { tool: 'Write', file: 'src/auth/service.ts', content: 'updated code', agent: 'claude-code' },
  { tool: 'Bash', command: 'npm test', agent: 'claude-code' },
  { tool: 'Bash', command: 'git push origin main', agent: 'claude-code' },
  { tool: 'Write', file: '.env', content: 'SECRET=leaked', agent: 'claude-code' },
];

process.stderr.write(renderBanner({ policyName: 'Demo Safety Policy', invariantCount: 6 }));

const results = [];
for (const action of actions) {
  const result = await kernel.propose(action);
  results.push(result);
  process.stderr.write(renderKernelResult(result, true) + '\n');
}

process.stderr.write(renderActionGraph(results));

const allowed = results.filter((r) => r.allowed).length;
const denied = results.filter((r) => !r.allowed).length;
process.stderr.write(
  `  \x1b[2m${allowed} allowed, ${denied} denied, ${kernel.getEventCount()} events emitted\x1b[0m\n\n`
);

kernel.shutdown();
