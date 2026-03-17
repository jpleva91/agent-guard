import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@red-codes/invariant-data-protection': path.resolve(__dirname, 'src/index.ts'),
      '@red-codes/invariants': path.resolve(__dirname, '../invariants/src/index.ts'),
      '@red-codes/plugins': path.resolve(__dirname, '../plugins/src/index.ts'),
      '@red-codes/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@red-codes/events': path.resolve(__dirname, '../events/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
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
