import { existsSync } from 'node:fs';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { connectForScript } from './script-connection';

/**
 * Migration runner. Run with `npm run db:migrate`; also runs on every Vercel
 * deploy through `vercel-build`.
 *
 * Deliberately a script rather than `drizzle-kit push`: push diffs the live
 * database against the schema and applies whatever it infers, which is fine for
 * a scratch database and unacceptable against anything holding real bookings.
 * Generated SQL files are reviewable, ordered and replayable.
 */

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

/**
 * Extensions the schema depends on. These run before migrations because a
 * `geography(Point,4326)` column cannot be created until PostGIS exists, and
 * drizzle-kit does not emit extension DDL itself.
 *
 *  - postgis  : FR-03 university-proximity search
 *  - pg_trgm  : fuzzy matching on property/locality names in search
 *  - pgcrypto : gen_random_uuid() for primary keys
 */
const REQUIRED_EXTENSIONS = ['postgis', 'pg_trgm', 'pgcrypto'] as const;

async function main() {
  // One connection: migrations must run in order.
  const sql = await connectForScript();

  try {
    for (const extension of REQUIRED_EXTENSIONS) {
      process.stdout.write(`  ensuring extension ${extension}... `);
      await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS "${extension}"`);
      console.log('ok');
    }

    console.log('\nApplying migrations from ./drizzle ...');
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations applied.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error('\nMigration failed:');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
