import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@red-codes/matchers': path.resolve(__dirname, 'src/index.ts'),
      '@red-codes/core': path.resolve(__dirname, '../core/src/index.ts'),
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
