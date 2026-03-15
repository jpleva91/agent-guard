// CLI command: agentguard analytics — cross-session violation pattern analysis.
// Advanced analytics have moved to AgentGuard Cloud.

import type { StorageConfig } from '@red-codes/storage';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function analytics(_args: string[], _storageConfig?: StorageConfig): Promise<number> {
  console.log('Advanced analytics available in AgentGuard Cloud. Visit https://agentguard.dev');
  return 0;
}
