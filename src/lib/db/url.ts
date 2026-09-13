/**
 * Database connection strings.
 *
 * Accepts this project's own names and the ones the Vercel–Supabase
 * integration injects (`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`), so
 * connecting the integration in Vercel is enough: nobody has to copy a database
 * password into a settings screen.
 *
 * Deliberately free of imports, because `lib/env` uses it and must stay safe to
 * reach from any bundle.
 */

type Env = Record<string, string | undefined>;

/**
 * Query parameters meant for other clients. postgres.js forwards unknown
 * parameters to the server as runtime settings, and Supavisor rejects them.
 */
const FOREIGN_PARAMS = new Set(['supa', 'pgbouncer', 'connection_limit']);

/**
 * Strip foreign parameters without re-encoding the rest of the string: a
 * password containing reserved characters must reach the driver unchanged.
 */
export function normalizeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;

  const kept = url
    .slice(queryStart + 1)
    .split('&')
    .filter((pair) => pair && !FOREIGN_PARAMS.has(pair.split('=')[0]));
  return kept.length > 0
    ? `${url.slice(0, queryStart)}?${kept.join('&')}`
    : url.slice(0, queryStart);
}

/** Runtime connection: the transaction pooler on Supabase. */
export function runtimeDatabaseUrl(env: Env = process.env): string | undefined {
  return normalizeDatabaseUrl(env.DATABASE_URL || env.POSTGRES_URL);
}

/** Migration connection, if one is set explicitly. */
export function directDatabaseUrl(env: Env = process.env): string | undefined {
  return normalizeDatabaseUrl(env.DATABASE_URL_DIRECT || env.POSTGRES_URL_NON_POOLING);
}

/**
 * Every usable connection string for scripts, best first: direct, then pooled.
 * Supabase's direct host is IPv6-only, which some build machines cannot reach,
 * so scripts fall back to the pooler rather than failing the deploy.
 */
export function scriptDatabaseUrls(env: Env = process.env): string[] {
  const urls = [directDatabaseUrl(env), runtimeDatabaseUrl(env)].filter(
    (url): url is string => Boolean(url),
  );
  return [...new Set(urls)];
}

/** Host and port only — safe to print. */
export function describeDatabaseUrl(url: string): string {
  const match = /@([^/?]+)/.exec(url);
  return match ? match[1] : 'database';
}
