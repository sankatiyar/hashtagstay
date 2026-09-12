import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Unit tests live beside the code they cover; integration tests that need a
    // real Postgres go in `tests/integration` and are opted into separately so a
    // plain `npm test` stays fast and runnable without a database.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
  },
});
