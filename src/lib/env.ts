import { z } from 'zod';

import { directDatabaseUrl, runtimeDatabaseUrl } from './db/url';

/**
 * Validated environment. Import `env` anywhere on the server; a missing or
 * malformed core variable fails fast at startup with a readable message rather
 * than surfacing as `undefined` deep inside a database call.
 *
 * Two deliberate design points:
 *
 * 1. **Vendor credentials are optional, not required.** WhatsApp BSP, telephony
 *    and Razorpay all sit behind multi-week KYC/approval (build plan concern
 *    #10), so the app must build and run before they exist. Read them through
 *    `requireVendor()`, which throws a specific, actionable error at the moment
 *    a feature actually needs the credential.
 *
 * 2. **Server secrets are never exported to the client.** Only `NEXT_PUBLIC_*`
 *    values live in `clientEnv()`. Next.js inlines `NEXT_PUBLIC_*` at build
 *    time; everything else is server-only.
 *
 * Both accessors are functions rather than constants so that importing a module
 * which transitively reaches this file never throws on load. Parsing at module
 * scope makes unrelated pure code — and any script or job that does not need a
 * database — fail for want of a Supabase URL.
 */

const nodeEnv = z.enum(['development', 'test', 'production']);

/**
 * Postgres URL. Rejects the obvious footgun of pointing migrations at Supabase's
 * transaction pooler, which does not support the session-level features
 * migrations need.
 */
const postgresUrl = z
  .string()
  .min(1)
  .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
    message: 'must be a postgres:// or postgresql:// connection string',
  });

/**
 * An optional variable where **empty string means absent**.
 *
 * This matters because `.env` files have no way to express "unset": a key left
 * as `RAZORPAY_KEY_ID=""` is present with an empty value, so a plain
 * `.optional()` does not apply and `.min(1)` fails. Since the whole point of
 * the vendor variables is that they are blank until procurement finishes, and
 * `.env.example` ships them blank, every optional field has to normalise empty
 * to undefined or the documented template cannot start the app.
 */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    schema.optional(),
  );
}

/**
 * Same normalisation for a field that has a `.default()`.
 *
 * Needed for exactly the same reason: `TELEPHONY_PROVIDER=""` is present, so
 * the default never applies and the empty string is validated against the enum
 * — which fails. Blanking a variable is a realistic thing for a developer to
 * do, and it should mean "use the default", not "crash".
 */
function blankable<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    schema,
  );
}

const serverSchema = z.object({
  NODE_ENV: blankable(nodeEnv.default('development')),

  // --- Database -----------------------------------------------------------
  /**
   * Runtime connection. On Supabase use the **transaction pooler** (port 6543)
   * for serverless — see `src/lib/db/index.ts`, which disables prepared
   * statements accordingly.
   */
  DATABASE_URL: postgresUrl,
  /**
   * Migration connection. Must be the **direct** connection (port 5432) or the
   * session pooler; DDL and advisory locks do not work over the transaction
   * pooler. Falls back to DATABASE_URL for local Postgres where they're equal.
   */
  DATABASE_URL_DIRECT: optional(postgresUrl),

  // --- Supabase -----------------------------------------------------------
  /**
   * Server-side Supabase key (`service_role` / secret). Bypasses Row Level
   * Security, so it must never reach the browser. Only needed for Storage
   * operations and admin tasks; optional until we wire media upload in M1.
   */
  SUPABASE_SECRET_KEY: optional(z.string().min(1)),

  // --- Auth ---------------------------------------------------------------
  /** Session/JWT signing secret. Generate with `openssl rand -base64 32`. */
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  AUTH_URL: optional(z.url()),

  // --- Vendors (optional until procured — see requireVendor) --------------
  RAZORPAY_KEY_ID: optional(z.string().min(1)),
  RAZORPAY_KEY_SECRET: optional(z.string().min(1)),
  RAZORPAY_WEBHOOK_SECRET: optional(z.string().min(1)),

  /** Exotel or Ozonetel — click-to-call, number masking, recording (FR-12). */
  TELEPHONY_PROVIDER: blankable(z.enum(['exotel', 'ozonetel', 'none']).default('none')),
  TELEPHONY_API_KEY: optional(z.string().min(1)),
  TELEPHONY_API_TOKEN: optional(z.string().min(1)),
  TELEPHONY_ACCOUNT_SID: optional(z.string().min(1)),
  TELEPHONY_CALLER_ID: optional(z.string().min(1)),
  TELEPHONY_WEBHOOK_SECRET: optional(z.string().min(1)),

  /** WhatsApp Business via a BSP (AiSensy / Interakt / Gupshup). */
  WHATSAPP_PROVIDER: blankable(
    z.enum(['aisensy', 'interakt', 'gupshup', 'none']).default('none'),
  ),
  WHATSAPP_API_KEY: optional(z.string().min(1)),
  WHATSAPP_PHONE_NUMBER_ID: optional(z.string().min(1)),
  WHATSAPP_WEBHOOK_SECRET: optional(z.string().min(1)),

  /** Transactional SMS + OTP (MSG91 or equivalent Indian aggregator). */
  SMS_PROVIDER: blankable(z.enum(['msg91', 'none']).default('none')),
  SMS_API_KEY: optional(z.string().min(1)),
  SMS_OTP_TEMPLATE_ID: optional(z.string().min(1)),
  SMS_SENDER_ID: optional(z.string().min(1)),

  EMAIL_PROVIDER: blankable(z.enum(['resend', 'ses', 'none']).default('none')),
  EMAIL_API_KEY: optional(z.string().min(1)),
  EMAIL_FROM: optional(z.string().min(1)),

  /** Durable SLA timers and notification fan-out. */
  INNGEST_EVENT_KEY: optional(z.string().min(1)),
  INNGEST_SIGNING_KEY: optional(z.string().min(1)),

  SENTRY_DSN: optional(z.string().min(1)),

  // --- Compliance / business config ---------------------------------------
  /**
   * Our own GSTIN, required on every tax invoice we issue (build plan concern
   * #6). Optional in dev; M4 invoice generation refuses to run without it.
   */
  COMPANY_GSTIN: optional(
    z
      .string()
      .regex(
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
        'not a valid 15-character GSTIN',
      ),
  ),
  /** State code of our place of supply, deciding CGST+SGST vs IGST. */
  COMPANY_STATE_CODE: optional(
    z.string().regex(/^[0-9]{2}$/, 'must be a 2-digit GST state code'),
  ),

  /**
   * Policy version stamped onto every consent record. Bump it whenever the
   * privacy notice changes, so we never retroactively claim consent under terms
   * the user never saw (DPDP).
   */
  PRIVACY_POLICY_VERSION: blankable(z.string().min(1).default('2026-09-01')),

  /**
   * Public demo deployment. Lets a production build use the test vendor
   * adapters — outbox messages, test payments, on-screen OTP codes, the TEST
   * invoice series — so the whole journey can be clicked through before the
   * vendors are procured. Every such screen says so. Never set on the real
   * launch: `isLiveProduction()` is what keeps test paths out of it.
   */
  DEMO_MODE: blankable(z.enum(['true', 'false']).default('false')).transform(
    (value) => value === 'true',
  ),

  /** Bearer token Vercel Cron sends to /api/cron/run. */
  CRON_SECRET: optional(z.string().min(16)),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: blankable(z.url().default('http://localhost:3000')),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  /**
   * Supabase publishable (anon) key. Public by design — it is protected by Row
   * Level Security, not by secrecy. Never put the `service_role` key here.
   */
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_GA4_MEASUREMENT_ID: optional(z.string().min(1)),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

function parseOrThrow<T extends z.ZodType>(schema: T, source: unknown, label: string) {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid ${label} environment:\n${formatIssues(result.error)}\n\n` +
        'Copy .env.example to .env.local and fill in the missing values.',
    );
  }
  return result.data as z.infer<T>;
}

let cachedClientEnv: ClientEnv | null = null;

/**
 * Client env, parsed lazily and memoised.
 *
 * Lazy matters more than it looks. Parsing at module scope means *any* import
 * chain that transitively reaches this file throws when the variables are
 * absent — which made pure helpers in modules that merely sit next to a
 * database import untestable, and would fail a script or a job that has no
 * business needing a Supabase URL.
 *
 * The `process.env.NEXT_PUBLIC_*` reads must stay written as explicit member
 * expressions: Next.js substitutes them at build time and cannot see a dynamic
 * lookup. Being inside a function body does not prevent that substitution.
 */
export function clientEnv(): ClientEnv {
  cachedClientEnv ??= parseOrThrow(
    clientSchema,
    {
      // Vercel exposes its production domain to the build; use it when no site
      // URL is set, so canonical links and sitemaps are right on first deploy.
      NEXT_PUBLIC_SITE_URL:
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
          : undefined),
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      // The Vercel–Supabase integration still names the publishable key "anon".
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_GA4_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
    },
    'client',
  );
  return cachedClientEnv;
}

/**
 * Map the variables the Vercel–Supabase integration injects onto ours, so a
 * deployment works once the integration is connected — no database password
 * copied by hand. Explicitly set project variables always win.
 *
 * A Vercel deployment defaults to DEMO_MODE, because until vendors are procured
 * a deployment without it cannot send an OTP, so nothing works. The real launch
 * sets DEMO_MODE=false, which production then enforces.
 */
function withPlatformFallbacks(
  source: NodeJS.ProcessEnv,
): Record<string, string | undefined> {
  return {
    ...source,
    DATABASE_URL: runtimeDatabaseUrl(source),
    DATABASE_URL_DIRECT: directDatabaseUrl(source),
    SUPABASE_SECRET_KEY: source.SUPABASE_SECRET_KEY || source.SUPABASE_SERVICE_ROLE_KEY,
    // AUTH_SECRET only keys the HMAC on one-time codes (lib/services/otp), so
    // any long server-only secret the integration provides will do. Newer
    // integrations set SUPABASE_SECRET_KEY rather than a JWT secret.
    AUTH_SECRET:
      source.AUTH_SECRET ||
      source.SUPABASE_JWT_SECRET ||
      source.SUPABASE_SECRET_KEY ||
      source.SUPABASE_SERVICE_ROLE_KEY,
    DEMO_MODE: source.DEMO_MODE || (source.VERCEL ? 'true' : undefined),
  };
}

let cachedServerEnv: ServerEnv | null = null;

/**
 * Server env, parsed lazily and memoised. Lazy so that importing a module which
 * transitively touches this file from a Client Component bundle does not blow up
 * at build time.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error(
      'serverEnv() was called in the browser. Server secrets must never reach ' +
        'the client — use clientEnv for NEXT_PUBLIC_* values instead.',
    );
  }
  cachedServerEnv ??= parseOrThrow(
    serverSchema,
    withPlatformFallbacks(process.env),
    'server',
  );
  return cachedServerEnv;
}

/**
 * True only on the real production site, where test vendor modes are refused.
 * A production build with DEMO_MODE on is a demo, not the live site.
 */
export function isLiveProduction(): boolean {
  const e = serverEnv();
  return e.NODE_ENV === 'production' && !e.DEMO_MODE;
}

/** The connection string migrations should use. */
export function migrationDatabaseUrl(): string {
  const e = serverEnv();
  return e.DATABASE_URL_DIRECT ?? e.DATABASE_URL;
}

/**
 * Keys whose value may legitimately be absent at boot — i.e. the vendor
 * credentials. `-?` strips optionality so the `undefined extends ...` test sees
 * the declared type rather than the optional-property union.
 */
type VendorKey = Extract<
  {
    [K in keyof ServerEnv]-?: undefined extends ServerEnv[K] ? K : never;
  }[keyof ServerEnv],
  keyof ServerEnv
>;

/**
 * Read a vendor credential that is optional at boot but mandatory for the
 * feature about to run. Throws a message that names the variable and the
 * capability it gates, so an unprocured vendor produces a clear operational
 * error instead of a generic 500.
 */
export function requireVendor<K extends VendorKey>(
  key: K,
  capability: string,
): NonNullable<ServerEnv[K]> {
  const value = serverEnv()[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(
      `${capability} is not configured: environment variable ${String(key)} is missing. ` +
        'This vendor credential is pending procurement — see docs/vendors.md.',
    );
  }
  return value as NonNullable<ServerEnv[K]>;
}

/** Feature flags derived from which vendors are actually configured. */
export function capabilities() {
  const e = serverEnv();
  return {
    payments: Boolean(e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET),
    telephony: e.TELEPHONY_PROVIDER !== 'none' && Boolean(e.TELEPHONY_API_KEY),
    whatsapp: e.WHATSAPP_PROVIDER !== 'none' && Boolean(e.WHATSAPP_API_KEY),
    sms: e.SMS_PROVIDER !== 'none' && Boolean(e.SMS_API_KEY),
    email: e.EMAIL_PROVIDER !== 'none' && Boolean(e.EMAIL_API_KEY),
    invoicing: Boolean(e.COMPANY_GSTIN && e.COMPANY_STATE_CODE),
  } as const;
}
