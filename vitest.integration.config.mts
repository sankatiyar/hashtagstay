import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Integration tests run outside Next.js, so load the env file ourselves.
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/integration/**/*.int.test.ts'],
    environment: 'node',
    // These share one database, so parallel files would race on cleanup.
    fileParallelism: false,
    // A cold Postgres connection plus PostGIS planning is slower than a unit test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
