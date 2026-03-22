import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@red-codes/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@red-codes/adapters': resolve(__dirname, '../../packages/adapters/src/index.ts'),
      '@red-codes/policy': resolve(__dirname, '../../packages/policy/src/index.ts'),
      '@red-codes/events': resolve(__dirname, '../../packages/events/src/index.ts'),
      '@red-codes/kernel': resolve(__dirname, '../../packages/kernel/src/index.ts'),
      '@red-codes/invariants': resolve(__dirname, '../../packages/invariants/src/index.ts'),
      '@red-codes/storage': resolve(__dirname, '../../packages/storage/src/index.ts'),
      '@red-codes/plugins': resolve(__dirname, '../../packages/plugins/src/index.ts'),
      '@red-codes/renderers': resolve(__dirname, '../../packages/renderers/src/index.ts'),
      '@red-codes/telemetry': resolve(__dirname, '../../packages/telemetry/src/index.ts'),
      '@red-codes/telemetry-client': resolve(__dirname, '../../packages/telemetry-client/src/index.ts'),
      '@red-codes/swarm': resolve(__dirname, '../../packages/swarm/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: {
        lines: 50,
        branches: 40,
      },
    },
  },
});
