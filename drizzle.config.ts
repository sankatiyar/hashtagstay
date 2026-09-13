import { existsSync } from 'node:fs';

import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit runs outside Next.js, so `.env.local` is not loaded for us.
 * `process.loadEnvFile` is built into Node 20.12+ — no dotenv dependency.
 */
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

/**
 * Migrations must use the DIRECT connection (port 5432), never Supabase's
 * transaction pooler: DDL and the advisory locks that serialise migrations do
 * not work through PgBouncer in transaction mode.
 */
const url =
  process.env.DATABASE_URL_DIRECT ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!url) {
  throw new Error(
    'DATABASE_URL_DIRECT (or DATABASE_URL) is not set. Copy .env.example to ' +
      '.env.local and fill in your Supabase connection strings.',
  );
}

export default defineConfig({
  schema: './src/lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  // Schema objects we do not own and must not be dropped: PostGIS installs
  // `spatial_ref_sys` and friends into public, and Supabase manages `auth`,
  // `storage` and the rest. Without these filters, `drizzle-kit push` will
  // happily generate DROP statements for them.
  schemaFilter: ['public'],
  tablesFilter: ['!spatial_ref_sys', '!geography_columns', '!geometry_columns'],
  extensionsFilters: ['postgis'],
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
