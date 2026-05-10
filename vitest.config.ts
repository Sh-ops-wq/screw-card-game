import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/tests/**/*.test.ts'],
    environment: 'node'
  },
  resolve: {
    alias: {
      '@shared': new URL('./shared', import.meta.url).pathname
    }
  }
});
