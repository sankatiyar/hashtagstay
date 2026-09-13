import { describe, expect, it } from 'vitest';

import {
  describeDatabaseUrl,
  normalizeDatabaseUrl,
  runtimeDatabaseUrl,
  scriptDatabaseUrls,
} from './url';

describe('normalizeDatabaseUrl()', () => {
  it('strips parameters meant for other clients', () => {
    expect(
      normalizeDatabaseUrl(
        'postgres://u:p@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x',
      ),
    ).toBe(
      'postgres://u:p@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require',
    );
  });

  it('drops the query string entirely when nothing is left', () => {
    expect(normalizeDatabaseUrl('postgres://u:p@h:5432/db?pgbouncer=true')).toBe(
      'postgres://u:p@h:5432/db',
    );
  });

  it('never re-encodes a password with reserved characters', () => {
    const url = 'postgres://postgres.ref:p%40ss#w0rd!@h:6543/postgres';
    expect(normalizeDatabaseUrl(url)).toBe(url);
  });

  it('passes through undefined and empty values as undefined', () => {
    expect(normalizeDatabaseUrl(undefined)).toBeUndefined();
    expect(normalizeDatabaseUrl('')).toBeUndefined();
  });
});

describe('platform fallbacks', () => {
  it('prefers the project’s own variable over the integration’s', () => {
    expect(
      runtimeDatabaseUrl({
        DATABASE_URL: 'postgres://a',
        POSTGRES_URL: 'postgres://b',
      }),
    ).toBe('postgres://a');
  });

  it('uses the Vercel–Supabase integration variables when ours are absent', () => {
    expect(runtimeDatabaseUrl({ DATABASE_URL: '', POSTGRES_URL: 'postgres://b' })).toBe(
      'postgres://b',
    );
  });

  it('orders script connections direct first, then pooled, without duplicates', () => {
    expect(
      scriptDatabaseUrls({
        POSTGRES_URL_NON_POOLING: 'postgres://direct',
        POSTGRES_URL: 'postgres://pooled',
      }),
    ).toEqual(['postgres://direct', 'postgres://pooled']);
    expect(scriptDatabaseUrls({ DATABASE_URL: 'postgres://same' })).toEqual([
      'postgres://same',
    ]);
  });
});

describe('describeDatabaseUrl()', () => {
  it('prints the host without the credentials', () => {
    const described = describeDatabaseUrl(
      'postgres://user:secret@db.example.com:5432/postgres',
    );
    expect(described).toBe('db.example.com:5432');
    expect(described).not.toContain('secret');
  });
});
