# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Sandy Stays (internal name `hashtagstay`, product spec in `docs/HashtagStay_PRD.docx`): an aggregator for co-living and student housing. SEO brings residents in, and a relationship-manager (RM) desk closes bookings over the phone. The platform earns a facilitation fee from residents and a monthly commission from operators. It never holds rent or deposits. Next.js 16 (App Router, Turbopack) · React 19 · Tailwind 4 · Drizzle + postgres.js · Postgres 17 with PostGIS · Vitest · deployed on Vercel + Supabase.

`README.md` holds the full list of domain invariants (money, state machines, separation of duties, geo, GST/DPDP). Read its "Invariants" section before changing services. Its milestone status table, and the "not built yet" list in `TESTING.md`, are out of date: M1–M5 (ops console, public site, RM desk, bookings/payments/invoices, host portal) are all implemented.

## Commands

```bash
npm run dev                      # dev server (.claude/launch.json pins the port; keep NEXT_PUBLIC_SITE_URL/AUTH_URL in .env.local in sync)
npm run verify                   # typecheck + lint + unit tests
npm run format:check             # CI also runs this; fix with `npm run format` (prettier + tailwind class sorting)
npm test                         # unit tests: src/**/*.test.ts(x), no database needed
npx vitest run src/lib/fees.test.ts          # a single unit test file
npx vitest run -t "banker"                   # tests matching a name
npm run test:int                 # integration tests: tests/integration/*.int.test.ts, needs a migrated DB
npx vitest run --config vitest.integration.config.mts tests/integration/journey.int.test.ts
npm run db:local:start           # local PostGIS on 127.0.0.1:5433 (db:local:status / stop / reset / psql)
npm run db:migrate               # enables postgis, pg_trgm, pgcrypto, then applies drizzle/
npm run db:seed                  # institutions, fee rules, staff logins (dev only), sample listings incl. 50 around each campus (seed/bulk-inventory.ts)
npm run db:generate              # generate a migration after editing src/lib/db/schema
```

- `typecheck` runs `next typegen` first, because `PageProps`/`LayoutProps` types live in the gitignored `.next/types`.
- Integration tests load `.env.local` themselves and run serially (they share one DB). They create and delete rows with a unique suffix, so running them against the seeded dev DB is safe.
- Use `db:migrate`, never `db:push`. Push would revert the hand-written SRID migration `drizzle/0001`. CI fails if `db:generate` produces a diff, so schema edits must ship with their generated migration.
- **`next build` needs a reachable, seeded database.** `generateStaticParams` on `/stays/[slug]`, `/city/[slug]` and `/near/[slug]` queries live inventory. CI asserts the city and campus pages were prerendered. Listing pages prerender only non-sample inventory; the ~1,300 `-sample` listings render on first request and are then cached. Don't make `generateStaticParams` swallow DB errors.
- Seeded staff logins locally: `ops@`, `verifier@`, `rm@`, `rmlead@`, `finance@`, `admin@hashtagstay.local`. The password is `devpassword123`, or `SEED_STAFF_PASSWORD` when that variable is set. On Vercel, staff logins are created only if `SEED_STAFF_PASSWORD` is set.

## Architecture

**Route surfaces** (`src/app`):
- `(public)/`: resident site with search, listings, city and campus landing pages, enquiry with OTP, account, pay, and shortlist links `s/[token]`. It uses SSG/ISR.
- `admin/`: staff console for inventory, verification, leads (the RM desk), bookings, fees, reports, tickets and photo moderation.
- `host/`: operator self-serve portal.
- `api/`:
  - `webhooks/*` and `track`.
  - `cron/run`: guarded by `CRON_SECRET`, calls `runScheduledJobs` in `src/lib/services/jobs.ts`. Every job step is idempotent.
  - `exports`, and `files` (for private documents).

**Request flow for mutations:** page → `'use server'` action file next to the page → guard → service → DB.
- Guards live in `src/lib/auth/guard.ts`:
  - Pages call `requireStaff` / `requirePermission`.
  - Actions call `requirePermissionForAction`, which throws instead of redirecting.
  - Denied attempts are audited.
  - The host portal scopes access through `src/lib/services/host-portal.ts` (`assertPropertyInOrg`, etc.).
- `src/lib/services/*` is the only code that mutates domain rows. That is where state-machine checks, `audit()` entries, events and `updatedAt` happen. Pages must not write to the DB directly.
- Actions return `{ error?, ok? }`. `runAction` in `src/lib/action-result.ts` turns service errors (named `*Error` classes) into messages the user can see, and hides unexpected errors.
- `proxy.ts` only checks that a session cookie exists, for a friendlier redirect. It is not authorization.

**Auth** (`src/lib/auth`):
- Server-side session rows; only the SHA-256 of the token is stored, in cookie `hs_session`.
- One `users` table with three audiences:
  - staff: roles, permission matrix in `permissions.ts`
  - host: org membership
  - resident: phone OTP
- Separation of duties is deliberate. `ops` can't approve verification, `verifier` can't edit properties, and `super_admin` lacks `verification:approve`.

**State machines** (`src/lib/state-machines`) are declared as data for listing, lead, booking and verification. Services call them, and an illegal move throws `IllegalTransitionError`. Bookings must pass through `pending_host_confirmation` before any fee is charged. A listing reaches `live` only through verification.

**Data layer** (`src/lib/db`):
- `db` is a lazy Proxy over a `globalThis`-cached client, so importing it never connects.
- `prepare: false` is required for Supabase's transaction pooler.
- `casing: 'snake_case'`.
- URL resolution (`url.ts`, used by `env.ts`) accepts both our names (`DATABASE_URL`, `DATABASE_URL_DIRECT`) and the Vercel–Supabase integration names (`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`).
- Migrate and seed scripts use `connectForScript`, which tries the direct URL and then the pooler.

**Invariants to preserve:**
- Money is integer minor units plus an ISO currency, handled only through `src/lib/money`. Fee rates are basis points and are snapshotted onto bookings.
- Distance queries go through `src/lib/geo`. They need the `::geography` cast and `ST_DWithin`.
- Attribution (utm, gclid and similar) is written when a lead is inserted.
- Host and resident phone numbers never reach the client, JSON-LD or shortlist pages; calls go through masked numbers.

**Vendor adapters** (`src/lib/integrations`: telephony, messaging, payments, storage):
- Each one picks a real provider when its env vars are set, and otherwise falls back to a `test` provider.
- Production refuses test providers unless `DEMO_MODE` is on.
- On Vercel, `DEMO_MODE` defaults to true unless it is explicitly set.
- Env is validated with zod in `src/lib/env.ts`: use `serverEnv()` / `clientEnv()`, never raw `process.env`.

**UI:**
- Design tokens and component classes are Tailwind 4 `@theme` / `@utility` rules in `src/app/globals.css`. The classes are `btn-primary`, `btn-secondary`, `btn-accent`, `btn-ghost`, `card`, `field`, `label`, `eyebrow`, `chip` and `container-page`. Use them instead of re-rolling styles.
- The palette is orange brand, peach and sand on white.
- Photos are hotlinked Unsplash IDs from `src/lib/photos.ts`. Sample listings are labelled as samples; real listings show only moderated uploads.

**Deploy:** Vercel runs `vercel-build`, which does migrate → seed → `next build` (see `DEPLOY.md`). `vercel.json` schedules the daily cron. Any push to `main` of the linked repo redeploys production.
