#!/usr/bin/env node
/**
 * Local development database lifecycle.
 *
 * Development runs against a local PostGIS cluster rather than Supabase, which
 * keeps the edit loop fast, avoids burning cloud connection limits on hot
 * reloads, and matches what CI runs against.
 *
 * Two ways to get one; this script drives the first and tells you about the
 * second:
 *
 *  1. Local Postgres binaries (no admin install needed on Windows):
 *       - https://www.enterprisedb.com/download-postgresql-binaries  (zip)
 *       - https://download.osgeo.org/postgis/windows/pg17/           (PostGIS bundle,
 *         extracted over the same bin/lib/share directories)
 *     Point PGSQL_HOME at the extracted `pgsql` directory.
 *
 *  2. Docker, if you have it:
 *       docker run -d --name hashtagstay-db -p 5433:5432 \
 *         -e POSTGRES_PASSWORD=hashtagstay_local_dev -e POSTGRES_DB=hashtagstay \
 *         postgis/postgis:17-3.5
 *     Then skip this script and just run `npm run db:migrate`.
 *
 * Usage: node scripts/db-local.mjs <start|stop|status|reset|psql>
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const PGSQL_HOME = process.env.PGSQL_HOME ?? join(homedir(), '.local', 'pgsql');
const PGDATA = process.env.PGDATA_DIR ?? join(homedir(), '.local', 'pgdata');
const PORT = process.env.PGPORT_LOCAL ?? '5433';
const DB_NAME = 'hashtagstay';
const SUPERUSER = 'postgres';
/** Local-only, loopback-only cluster. Not an account credential. */
const PASSWORD = 'hashtagstay_local_dev';

const exe = (name) =>
  join(PGSQL_HOME, 'bin', process.platform === 'win32' ? `${name}.exe` : name);

function requireBinaries() {
  if (!existsSync(exe('pg_ctl'))) {
    console.error(
      `Postgres binaries not found at ${PGSQL_HOME}.\n\n` +
        'Set PGSQL_HOME to your extracted `pgsql` directory, or use the Docker\n' +
        'option documented at the top of scripts/db-local.mjs.',
    );
    process.exit(1);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, PGPASSWORD: PASSWORD },
    ...options,
  });
  return result.status ?? 1;
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: PASSWORD },
  });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

const serverArgs = `-p ${PORT} -c listen_addresses=127.0.0.1`;

function isRunning() {
  const out = capture(exe('pg_isready'), ['-h', '127.0.0.1', '-p', PORT]);
  return out.includes('accepting connections');
}

function initCluster() {
  if (existsSync(join(PGDATA, 'PG_VERSION'))) return;

  console.log(`Initialising cluster at ${PGDATA} ...`);
  // initdb wants the password in a file rather than on the command line, so it
  // does not end up in the process table or shell history.
  const dir = mkdtempSync(join(tmpdir(), 'hspw-'));
  const pwfile = join(dir, 'pw.txt');
  try {
    writeFileSync(pwfile, PASSWORD, 'utf8');
    const code = run(exe('initdb'), [
      '-D',
      PGDATA,
      '-U',
      SUPERUSER,
      `--pwfile=${pwfile}`,
      '-E',
      'UTF8',
      '--locale=C',
    ]);
    if (code !== 0) process.exit(code);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function ensureDatabaseAndExtensions() {
  const existing = capture(exe('psql'), [
    '-h',
    '127.0.0.1',
    '-p',
    PORT,
    '-U',
    SUPERUSER,
    '-d',
    'postgres',
    '-tAc',
    `SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'`,
  ]);

  if (existing !== '1') {
    console.log(`Creating database ${DB_NAME} ...`);
    run(exe('createdb'), ['-h', '127.0.0.1', '-p', PORT, '-U', SUPERUSER, DB_NAME]);
  }

  // `db:migrate` also ensures these, but doing it here means `db:local:start`
  // leaves a database that is immediately usable by psql or a GUI client.
  run(exe('psql'), [
    '-h',
    '127.0.0.1',
    '-p',
    PORT,
    '-U',
    SUPERUSER,
    '-d',
    DB_NAME,
    '-q',
    '-c',
    // client_min_messages keeps "extension already exists, skipping" NOTICEs
    // out of the output on repeat runs, so a clean start looks clean.
    'SET client_min_messages=warning;' +
      'CREATE EXTENSION IF NOT EXISTS postgis;' +
      'CREATE EXTENSION IF NOT EXISTS pg_trgm;' +
      'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
  ]);
}

function start() {
  requireBinaries();
  if (isRunning()) {
    console.log(`Already running on 127.0.0.1:${PORT}.`);
    ensureDatabaseAndExtensions();
    return;
  }
  initCluster();
  console.log(`Starting Postgres on 127.0.0.1:${PORT} ...`);
  // stdio must be 'ignore', not inherited: the postmaster pg_ctl launches
  // inherits these handles and outlives pg_ctl, so an inherited stdout keeps
  // the caller's pipe open and `npm run db:local:start | ...` never returns.
  // Server output goes to server.log via -l regardless.
  const code = run(
    exe('pg_ctl'),
    ['-D', PGDATA, '-o', serverArgs, '-l', join(PGDATA, 'server.log'), '-w', 'start'],
    { stdio: 'ignore' },
  );
  if (code !== 0) {
    console.error(`Failed to start. See ${join(PGDATA, 'server.log')}`);
    process.exit(code);
  }
  ensureDatabaseAndExtensions();
  console.log(
    `\nReady.\n  DATABASE_URL="postgresql://${SUPERUSER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}"`,
  );
}

function stop() {
  requireBinaries();
  if (!isRunning()) {
    console.log('Not running.');
    return;
  }
  process.exit(run(exe('pg_ctl'), ['-D', PGDATA, '-m', 'fast', '-w', 'stop']));
}

function status() {
  requireBinaries();
  console.log(capture(exe('pg_isready'), ['-h', '127.0.0.1', '-p', PORT]));
  if (isRunning()) {
    console.log(
      capture(exe('psql'), [
        '-h',
        '127.0.0.1',
        '-p',
        PORT,
        '-U',
        SUPERUSER,
        '-d',
        DB_NAME,
        '-tAc',
        "SELECT 'postgis ' || postgis_version()",
      ]),
    );
    console.log(
      `tables: ${capture(exe('psql'), [
        '-h',
        '127.0.0.1',
        '-p',
        PORT,
        '-U',
        SUPERUSER,
        '-d',
        DB_NAME,
        '-tAc',
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
      ])}`,
    );
  }
}

/** Drop and recreate. Destructive by design — local only. */
function reset() {
  requireBinaries();
  if (!isRunning()) start();
  console.log(`Dropping and recreating ${DB_NAME} ...`);
  run(exe('dropdb'), [
    '-h',
    '127.0.0.1',
    '-p',
    PORT,
    '-U',
    SUPERUSER,
    '--if-exists',
    '-f',
    DB_NAME,
  ]);
  ensureDatabaseAndExtensions();
  console.log('Done. Run `npm run db:migrate` next.');
}

function psql() {
  requireBinaries();
  process.exit(
    run(exe('psql'), ['-h', '127.0.0.1', '-p', PORT, '-U', SUPERUSER, '-d', DB_NAME]),
  );
}

const commands = { start, stop, status, reset, psql };
const command = process.argv[2];

if (!command || !(command in commands)) {
  console.error(
    `Usage: node scripts/db-local.mjs <${Object.keys(commands).join('|')}>`,
  );
  process.exit(1);
}

commands[command]();
