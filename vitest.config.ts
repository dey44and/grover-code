import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@grover/language': fromRoot('./packages/language/src/index.ts'),
      '@grover/runtime': fromRoot('./packages/runtime/src/index.ts'),
    },
  },
  test: {
    exclude: ['**/dist/**', '**/node_modules/**'],
    coverage: {
      exclude: ['**/*.test.{ts,tsx}', '**/index.ts', '**/vite.config.ts'],
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/web/src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        branches: 75,
        functions: 87,
        lines: 85,
        statements: 85,
      },
    },
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
  },
});
