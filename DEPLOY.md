# Deploying Sandy Stays (Supabase + Vercel)

This puts a working **demo** on a public Vercel URL, backed by the Supabase
project `kzumobxtwgspfvyxwieq`. Demo mode runs the full resident, RM and host
journeys with test vendors (no real SMS, calls or payments) until Razorpay,
telephony, WhatsApp and SMS are procured — see `docs/vendors.md`.

No database password is copied anywhere by hand: Vercel's Supabase integration
supplies the connection details, and every deploy creates or updates the schema
itself.

## 1. Supabase (once)

**Storage → New bucket**, twice:

- `listing-media` — **Public** (listing photos)
- `verification-documents` — **Private** (ownership and ID documents)

PostGIS does not need enabling by hand; the migration step creates it.

## 2. Vercel

1. **Add New… → Project** → import `sankatiyar/hashtagstay`. Leave the build
   settings as detected.
2. Before the first deploy (or right after it fails): project → **Integrations**
   → **Supabase** → connect the `HAshtagstay` project. This adds
   `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_JWT_SECRET` and `NEXT_PUBLIC_SUPABASE_*`, which the app reads
   directly.
3. Optional **Environment Variables**:
   - `SEED_STAFF_PASSWORD` — 12+ characters. Creates the demo staff logins
     (`admin@hashtagstay.local`, `rm@…`, `rmlead@…`, `ops@…`, `verifier@…`,
     `finance@…`). Without it, the public site works but nobody can sign in to
     the ops console.
   - `CRON_SECRET` — any long random string; enables the daily jobs.
   - `AUTH_SECRET` — a dedicated session secret. Falls back to
     `SUPABASE_JWT_SECRET` if unset.
4. **Deploy** (or **Redeploy** if the first build ran before the integration).

What a deploy does (`vercel-build` in `package.json`):

1. `db:migrate` — creates PostGIS, pg_trgm and pgcrypto, applies migrations.
   Tries the direct connection first and falls back to the pooler.
2. `db:seed` — institutions and fee rules always; sample listings only into an
   empty database; staff logins only if `SEED_STAFF_PASSWORD` is set. The public
   dev password is never used on Vercel.
3. `next build` — pre-renders city, campus and listing pages from the database.

Every push to `main` redeploys. `vercel.json` runs the daily jobs at 08:00 IST.

## Before the real launch

- Set `DEMO_MODE=false`. **Any Vercel deployment defaults to demo mode** until
  this is set; production then refuses every test vendor path, so each vendor
  below must be configured.
- Razorpay, telephony, WhatsApp BSP, SMS (with DLT templates), email.
- `COMPANY_GSTIN` and `COMPANY_STATE_CODE` — tax invoices refuse to issue without them.
- Real fee rules in **Ops → Fees & statements** (the seeded ones are placeholders).
- A dedicated `AUTH_SECRET`, and staff changing their seeded passwords.
