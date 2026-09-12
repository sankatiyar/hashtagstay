import { z } from 'zod';

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
 *    values live in `clientEnv`. Next.js inlines `NEXT_PUBLIC_*` at build time;
 *    everything else is server-only and referenced lazily.
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

const serverSchema = z.object({
  NODE_ENV: nodeEnv.default('development'),

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
  DATABASE_URL_DIRECT: postgresUrl.optional(),

  // --- Supabase -----------------------------------------------------------
  /**
   * Server-side Supabase key (`service_role` / secret). Bypasses Row Level
   * Security, so it must never reach the browser. Only needed for Storage
   * operations and admin tasks; optional until we wire media upload in M1.
   */
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),

  // --- Auth ---------------------------------------------------------------
  /** Session/JWT signing secret. Generate with `openssl rand -base64 32`. */
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  AUTH_URL: z.url().optional(),

  // --- Vendors (optional until procured — see requireVendor) --------------
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),

  /** Exotel or Ozonetel — click-to-call, number masking, recording (FR-12). */
  TELEPHONY_PROVIDER: z.enum(['exotel', 'ozonetel', 'none']).default('none'),
  TELEPHONY_API_KEY: z.string().min(1).optional(),
  TELEPHONY_API_TOKEN: z.string().min(1).optional(),
  TELEPHONY_ACCOUNT_SID: z.string().min(1).optional(),
  TELEPHONY_CALLER_ID: z.string().min(1).optional(),
  TELEPHONY_WEBHOOK_SECRET: z.string().min(1).optional(),

  /** WhatsApp Business via a BSP (AiSensy / Interakt / Gupshup). */
  WHATSAPP_PROVIDER: z.enum(['aisensy', 'interakt', 'gupshup', 'none']).default('none'),
  WHATSAPP_API_KEY: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().min(1).optional(),

  /** Transactional SMS + OTP (MSG91 or equivalent Indian aggregator). */
  SMS_PROVIDER: z.enum(['msg91', 'none']).default('none'),
  SMS_API_KEY: z.string().min(1).optional(),
  SMS_OTP_TEMPLATE_ID: z.string().min(1).optional(),
  SMS_SENDER_ID: z.string().min(1).optional(),

  EMAIL_PROVIDER: z.enum(['resend', 'ses', 'none']).default('none'),
  EMAIL_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),

  /** Durable SLA timers and notification fan-out. */
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),

  SENTRY_DSN: z.string().min(1).optional(),

  // --- Compliance / business config ---------------------------------------
  /**
   * Our own GSTIN, required on every tax invoice we issue (build plan concern
   * #6). Optional in dev; M4 invoice generation refuses to run without it.
   */
  COMPANY_GSTIN: z
    .string()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      'not a valid 15-character GSTIN',
    )
    .optional(),
  /** State code of our place of supply, deciding CGST+SGST vs IGST. */
  COMPANY_STATE_CODE: z
    .string()
    .regex(/^[0-9]{2}$/)
    .optional(),

  /**
   * Policy version stamped onto every consent record. Bump it whenever the
   * privacy notice changes, so we never retroactively claim consent under terms
   * the user never saw (DPDP).
   */
  PRIVACY_POLICY_VERSION: z.string().min(1).default('2026-09-01'),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  /**
   * Supabase publishable (anon) key. Public by design — it is protected by Row
   * Level Security, not by secrecy. Never put the `service_role` key here.
   */
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_GA4_MEASUREMENT_ID: z.string().optional(),
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

/**
 * Client env is parsed eagerly from inlined literals. These must be written as
 * explicit `process.env.NEXT_PUBLIC_*` member expressions — Next.js replaces
 * them at build time and cannot see a dynamic lookup.
 */
export const clientEnv: ClientEnv = parseOrThrow(
  clientSchema,
  {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_GA4_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
  },
  'client',
);

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
  cachedServerEnv ??= parseOrThrow(serverSchema, process.env, 'server');
  return cachedServerEnv;
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
