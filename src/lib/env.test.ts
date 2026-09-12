import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Environment parsing tests.
 *
 * These exist because of a real bug: every vendor variable was declared
 * `.optional()`, but `.env.example` ships them as empty strings — and an empty
 * string is *present*, so `.optional()` never applied and `.min(1)` failed.
 * The documented template could not start the app. A test that parses the
 * template's own shape is the only thing that catches that class of mistake.
 *
 * `serverEnv()` memoises, so each test re-imports the module with a fresh
 * registry via `vi.resetModules()` through dynamic import.
 */

const MINIMAL: Record<string, string> = {
  DATABASE_URL: 'postgresql://postgres:pw@127.0.0.1:5433/hashtagstay',
  AUTH_SECRET: 'x'.repeat(32),
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

const original = { ...process.env };

async function freshEnvModule() {
  const { resetModules } = await import('vitest').then((m) => ({
    resetModules: m.vi.resetModules.bind(m.vi),
  }));
  resetModules();
  return import('./env');
}

beforeEach(() => {
  // Start from a clean slate so a developer's own shell does not leak in.
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith('NEXT_PUBLIC_') ||
      key.startsWith('DATABASE_') ||
      key.startsWith('RAZORPAY_') ||
      key.startsWith('TELEPHONY_') ||
      key.startsWith('WHATSAPP_') ||
      key.startsWith('SMS_') ||
      key.startsWith('EMAIL_') ||
      key.startsWith('INNGEST_') ||
      key.startsWith('COMPANY_') ||
      key.startsWith('SUPABASE_') ||
      key === 'AUTH_SECRET' ||
      key === 'AUTH_URL' ||
      key === 'SENTRY_DSN'
    ) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, MINIMAL);
});

afterEach(() => {
  process.env = { ...original };
});

/** Parse `.env.example` into a plain record, the way a dotenv loader would. */
function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    // Strip a quoted value first, then any trailing inline comment. Doing it in
    // the other order would mangle a value that legitimately contains '#'.
    const quoted = /^(["'])(.*?)\1\s*(?:#.*)?$/.exec(value);
    if (quoted) {
      value = quoted[2];
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }

    out[key] = value;
  }
  return out;
}

describe('serverEnv()', () => {
  it('accepts the minimal set', async () => {
    const { serverEnv } = await freshEnvModule();
    expect(serverEnv().DATABASE_URL).toContain('postgresql://');
  });

  it('treats an empty vendor variable as absent, not as a violation', async () => {
    // The exact shape `.env.example` ships.
    process.env.RAZORPAY_KEY_ID = '';
    process.env.WHATSAPP_API_KEY = '';
    process.env.SENTRY_DSN = '';
    process.env.COMPANY_GSTIN = '';
    process.env.COMPANY_STATE_CODE = '';
    process.env.SUPABASE_SECRET_KEY = '';

    const { serverEnv } = await freshEnvModule();
    const env = serverEnv();

    expect(env.RAZORPAY_KEY_ID).toBeUndefined();
    expect(env.WHATSAPP_API_KEY).toBeUndefined();
    expect(env.COMPANY_GSTIN).toBeUndefined();
    expect(env.COMPANY_STATE_CODE).toBeUndefined();
  });

  it('parses the committed .env.example without error', async () => {
    // The regression guard: the documented template must be able to start the
    // app once the handful of genuinely-required values are filled in.
    const template = parseEnvFile('.env.example');
    for (const [key, value] of Object.entries(template)) {
      if (value.includes('<') || value === '') {
        // Placeholders and blanks stand in for "not set yet".
        process.env[key] = '';
      } else {
        process.env[key] = value;
      }
    }
    Object.assign(process.env, MINIMAL);

    const { serverEnv, clientEnv } = await freshEnvModule();
    expect(() => serverEnv()).not.toThrow();
    expect(() => clientEnv()).not.toThrow();
  });

  it('still rejects a genuinely malformed value', async () => {
    process.env.COMPANY_GSTIN = 'not-a-gstin';
    const { serverEnv } = await freshEnvModule();
    expect(() => serverEnv()).toThrow(/GSTIN/);
  });

  it('rejects a missing DATABASE_URL', async () => {
    delete process.env.DATABASE_URL;
    const { serverEnv } = await freshEnvModule();
    expect(() => serverEnv()).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', async () => {
    process.env.DATABASE_URL = 'mysql://localhost/db';
    const { serverEnv } = await freshEnvModule();
    expect(() => serverEnv()).toThrow(/postgres/);
  });

  it('rejects a short AUTH_SECRET', async () => {
    process.env.AUTH_SECRET = 'tooshort';
    const { serverEnv } = await freshEnvModule();
    expect(() => serverEnv()).toThrow(/at least 32/);
  });

  it('defaults the vendor providers to none', async () => {
    const { serverEnv } = await freshEnvModule();
    const env = serverEnv();
    expect(env.TELEPHONY_PROVIDER).toBe('none');
    expect(env.WHATSAPP_PROVIDER).toBe('none');
    expect(env.SMS_PROVIDER).toBe('none');
  });
});

describe('requireVendor()', () => {
  it('names the variable and the capability when unconfigured', async () => {
    process.env.RAZORPAY_KEY_ID = '';
    const { requireVendor } = await freshEnvModule();
    // `[\s\S]` rather than the `s` flag: the tsconfig target predates it.
    expect(() => requireVendor('RAZORPAY_KEY_ID', 'Fee collection')).toThrow(
      /Fee collection is not configured[\s\S]*RAZORPAY_KEY_ID/,
    );
  });

  it('returns the value when configured', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_abc';
    const { requireVendor } = await freshEnvModule();
    expect(requireVendor('RAZORPAY_KEY_ID', 'Fee collection')).toBe('rzp_test_abc');
  });
});

describe('capabilities()', () => {
  it('reports everything off with a blank vendor set', async () => {
    const { capabilities } = await freshEnvModule();
    expect(capabilities()).toEqual({
      payments: false,
      telephony: false,
      whatsapp: false,
      sms: false,
      email: false,
      invoicing: false,
    });
  });

  it('turns payments on only when both Razorpay values are present', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_abc';
    const { capabilities } = await freshEnvModule();
    expect(capabilities().payments).toBe(false);

    process.env.RAZORPAY_KEY_SECRET = 'secret';
    const fresh = await freshEnvModule();
    expect(fresh.capabilities().payments).toBe(true);
  });

  it('requires both a provider and a key for telephony', async () => {
    process.env.TELEPHONY_PROVIDER = 'exotel';
    const { capabilities } = await freshEnvModule();
    expect(capabilities().telephony).toBe(false);

    process.env.TELEPHONY_API_KEY = 'key';
    const fresh = await freshEnvModule();
    expect(fresh.capabilities().telephony).toBe(true);
  });

  it('requires both GSTIN and state code for invoicing', async () => {
    process.env.COMPANY_GSTIN = '29ABCDE1234F1Z5';
    const { capabilities } = await freshEnvModule();
    expect(capabilities().invoicing).toBe(false);

    process.env.COMPANY_STATE_CODE = '29';
    const fresh = await freshEnvModule();
    expect(fresh.capabilities().invoicing).toBe(true);
  });
});
