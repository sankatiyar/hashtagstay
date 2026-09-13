import postgres from 'postgres';

import { describeDatabaseUrl, scriptDatabaseUrls } from './url';

/**
 * Open a single-connection client for migrations and the seed, using the first
 * connection string that actually answers. On a Vercel build the direct
 * Supabase host can be unreachable (IPv6 only), and failing the deploy for that
 * when the pooler works would be pointless.
 */
export async function connectForScript(): Promise<ReturnType<typeof postgres>> {
  const urls = scriptDatabaseUrls();
  if (urls.length === 0) {
    throw new Error(
      'No database connection string is set. Use DATABASE_URL (and DATABASE_URL_DIRECT), ' +
        'or connect the Supabase integration in Vercel.',
    );
  }

  let lastError: unknown;
  for (const url of urls) {
    const sql = postgres(url, {
      max: 1,
      prepare: false,
      onnotice: () => {},
      connect_timeout: 15,
    });
    try {
      await sql`select 1`;
      console.log(`  connected to ${describeDatabaseUrl(url)}`);
      return sql;
    } catch (error) {
      lastError = error;
      console.warn(
        `  could not reach ${describeDatabaseUrl(url)} (${error instanceof Error ? error.message : 'unknown error'})`,
      );
      await sql.end({ timeout: 1 }).catch(() => {});
    }
  }
  throw lastError;
}
