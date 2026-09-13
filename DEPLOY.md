# Deploying HashtagStay (Supabase + Vercel)

This puts a working **demo** on a public Vercel URL, backed by the Supabase
project `kzumobxtwgspfvyxwieq`. Demo mode runs the full resident, RM and host
journeys with test vendors (no real SMS, calls or payments) until Razorpay,
telephony, WhatsApp and SMS are procured — see `docs/vendors.md`.

Secrets are entered by the project owner only: into `.env.local` on your own
machine and into the Vercel dashboard. Never paste them into chat, issues or
commits.

## 1. Supabase

1. Supabase dashboard → project → **Connect**.
   - **Transaction pooler** string (port `6543`) → `DATABASE_URL`
   - **Session pooler** string (port `5432`) → `DATABASE_URL_DIRECT`
     (the direct `db.<ref>.supabase.co` host is IPv6-only and often unreachable
     from home networks and CI; the session pooler works everywhere)
2. **Database → Extensions**: enable `postgis`. The migrations need it and do
   not create it themselves.
3. **Storage → New bucket**, twice:
   - `listing-media` — **Public** (listing photos)
   - `verification-documents` — **Private** (ownership and ID documents, served
     only through short-lived signed URLs)
4. **Project Settings → API Keys**: copy the **secret** key → `SUPABASE_SECRET_KEY`.
5. Put those three into `.env.local`, plus a `SEED_STAFF_PASSWORD` of your
   choosing (12+ characters — this becomes the demo staff password).

Then create the schema and demo data:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Run the seed with `DEMO_MODE="true"` in `.env.local` so sample inventory is
created. Staff logins (`admin@hashtagstay.local`, `rm@…`, `ops@…`, `verifier@…`,
`rmlead@…`, `finance@…`) use your `SEED_STAFF_PASSWORD`.

## 2. Vercel

1. vercel.com → **Add New… → Project** → import `sankatiyar/hashtagstay`.
2. Framework preset: Next.js (detected). Leave build settings as they are.
3. **Environment Variables** (Production and Preview):

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler string |
| `DATABASE_URL_DIRECT` | Supabase session pooler string |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kzumobxtwgspfvyxwieq.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_WtxUP4X34TsVaZeauXGk3g_O-wHj88v` |
| `SUPABASE_SECRET_KEY` | Supabase secret key |
| `AUTH_SECRET` | a new random value (see below) |
| `CRON_SECRET` | a new random value |
| `DEMO_MODE` | `true` |
| `NEXT_PUBLIC_SITE_URL` | your Vercel URL, e.g. `https://hashtagstay.vercel.app` |
| `AUTH_URL` | the same URL |

Generate each random value with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

4. **Deploy.** The build reads the database to pre-render city, campus and
   listing pages, so the migration and seed in step 1 must run first.
5. After the first deploy, if the URL differs from what you entered, update
   `NEXT_PUBLIC_SITE_URL` and `AUTH_URL` and redeploy.

Every push to `main` redeploys. `vercel.json` runs the daily jobs
(`/api/cron/run`: SLA escalations, stale-availability nudges, verification
expiry) at 08:00 IST.

## Before the real launch

- Remove `DEMO_MODE` (or set it to `false`). Production then refuses every test
  vendor path, so each vendor below must be configured.
- Razorpay, telephony, WhatsApp BSP, SMS (with DLT templates), email.
- `COMPANY_GSTIN` and `COMPANY_STATE_CODE` — tax invoices refuse to issue without them.
- Real fee rules in **Ops → Fees & statements** (the seeded ones are placeholders).
- Rotate `SEED_STAFF_PASSWORD` logins: have each staff member change their password.
