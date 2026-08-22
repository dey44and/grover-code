import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/grover-code/',
  plugins: [react()],
  resolve: {
    alias: {
      '@grover/language': fileURLToPath(
        new URL('../../packages/language/src/index.ts', import.meta.url),
      ),
      '@grover/runtime': fileURLToPath(
        new URL('../../packages/runtime/src/index.ts', import.meta.url),
      ),
    },
  },
});
