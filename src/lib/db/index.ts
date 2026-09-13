import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { serverEnv } from '@/lib/env';

import * as schema from './schema';

/**
 * Database client.
 *
 * Two Supabase-specific decisions worth knowing before you change anything here:
 *
 * 1. `prepare: false` is **required**. `DATABASE_URL` points at Supabase's
 *    transaction pooler (PgBouncer, port 6543), which multiplexes many clients
 *    onto few server connections and therefore cannot support session-scoped
 *    prepared statements. Leaving prepare on produces intermittent
 *    "prepared statement \"s1\" already exists" errors under concurrency —
 *    which look like random flakes, not a config bug.
 *
 * 2. The client is cached on `globalThis` in development. Next.js hot-reload
 *    re-evaluates modules on every edit; without the cache each save leaks a
 *    connection pool and you exhaust Supabase's connection limit within a few
 *    minutes of ordinary work.
 */

const connectionOptions: postgres.Options<Record<string, never>> = {
  // See note 1 above — do not remove.
  prepare: false,
  // Serverless invocations are short-lived and numerous; a small per-instance
  // pool avoids starving the shared pooler. `next build` prerenders every
  // listing from many worker processes at once, each with its own pool, so a
  // build worker gets two connections: ~1,300 pages then share a couple of
  // dozen connections instead of exhausting the database's client limit.
  max: process.env.NEXT_PHASE === 'phase-production-build' ? 2 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Return DATE/TIMESTAMP as-is and let Drizzle own the mapping, so a column's
  // type in the schema is the single source of truth for its JS shape.
  types: {},
  onnotice: () => {
    // Supabase emits routine NOTICE output (extension already exists, etc.).
    // Silence it in normal operation; migrations log their own progress.
  },
};

type DbClient = ReturnType<typeof createClient>;

function createClient() {
  const sql = postgres(serverEnv().DATABASE_URL, connectionOptions);
  return drizzle(sql, { schema, casing: 'snake_case' });
}

const globalForDb = globalThis as unknown as { __hashtagstayDb?: DbClient };

/**
 * Lazily-created singleton. Exported as a getter rather than a value so that
 * merely importing this module (which the schema barrel does) never opens a
 * connection or forces env validation at build time.
 */
export function getDb(): DbClient {
  if (process.env.NODE_ENV === 'production') {
    // One pool per serverless instance; no global caching needed or wanted.
    globalForDb.__hashtagstayDb ??= createClient();
    return globalForDb.__hashtagstayDb;
  }
  globalForDb.__hashtagstayDb ??= createClient();
  return globalForDb.__hashtagstayDb;
}

/**
 * Convenience proxy so call sites can write `db.select()...` without threading
 * `getDb()` everywhere, while the underlying client stays lazy.
 */
export const db = new Proxy({} as DbClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
export type { DbClient };
