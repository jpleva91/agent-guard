// Default OpenClaw policy — v1 covering filesystem, command execution, and network egress.
// Opt-in: pass to kernel config as policyDefs to enable.

import type { LoadedPolicy } from '@red-codes/policy';

/** Default OpenClaw policy with deny rules for common unsafe patterns. */
export const OPENCLAW_DEFAULT_POLICY: LoadedPolicy = {
  id: 'openclaw-default-v1',
  name: 'OpenClaw Default Policy',
  description: 'Default governance policy for OpenClaw tool calls',
  severity: 4,
  rules: [
    // --- Filesystem ---
    {
      action: ['file.read', 'file.write'],
      effect: 'deny' as const,
      conditions: {
        scope: ['.env', '.env.*', '**/.env', '**/.env.*'],
      },
      reason: 'Access to environment files is denied — potential secret exposure',
    },
    {
      action: ['file.read', 'file.write'],
      effect: 'deny' as const,
      conditions: {
        scope: ['.ssh/*', '**/.ssh/*'],
      },
      reason: 'Access to SSH keys is denied — credential exposure risk',
    },
    {
      action: ['file.read', 'file.write'],
      effect: 'deny' as const,
      conditions: {
        scope: ['*credentials*', '**/credentials*', '*.pem', '**/*.pem', '*.key', '**/*.key'],
      },
      reason: 'Access to credential files is denied',
    },

    // --- Command execution ---
    {
      action: 'shell.exec',
      effect: 'deny' as const,
      conditions: {
        scope: ['curl *', 'wget *'],
      },
      reason: 'Outbound data transfer commands are denied — network egress risk',
    },
    {
      action: 'shell.exec',
      effect: 'deny' as const,
      conditions: {
        scope: ['rm -rf *', 'rm -r *'],
      },
      reason: 'Recursive deletion is denied — destructive operation',
    },
    {
      action: 'shell.exec',
      effect: 'deny' as const,
      conditions: {
        scope: ['chmod *', 'chown *'],
      },
      reason: 'Permission modification is denied — escalation risk',
    },

    // --- Network egress ---
    {
      action: 'http.request',
      effect: 'deny' as const,
      reason: 'Network egress is denied by default in OpenClaw governance mode',
    },

    // --- Default allow for safe operations ---
    {
      action: 'file.read',
      effect: 'allow' as const,
      reason: 'File reads are allowed by default',
    },
    {
      action: '*',
      effect: 'allow' as const,
      reason: 'Default allow for unmatched actions',
    },
  ],
};
