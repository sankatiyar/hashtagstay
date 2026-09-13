# Sandy Stays

Digital-first aggregator for co-living and student housing. The operating model
is **digital discovery + human closure**: SEO/SEM brings demand in, and a
tele-sales / relationship-management desk converts it over the phone.

The platform does not own or operate inventory. It aggregates supply from
co-living operators, PBSA (purpose-built student accommodation) operators and
individual hosts, and earns a facilitation fee from residents plus commission
from operators.

Product requirements: [`docs/HashtagStay_PRD.docx`](docs/HashtagStay_PRD.docx).

## Status

Phase 1 / M0 — foundations complete. Schema and core primitives are in place;
migrations are generated but not yet applied. No UI beyond the scaffold yet.

| Milestone | Scope | State |
|---|---|---|
| M0 | Foundations, schema, money/geo/state-machine/RBAC primitives | done |
| M1 | Inventory + internal ops console | next |
| M2 | Public discovery, SEO, lead capture | |
| M3 | RM desk: routing, SLA timers, masked calling, shortlists | |
| M4 | Booking, fee engine, payments, GST invoicing | |
| M5 | Host portal + admin reporting | |
| M6 | Hardening + soft launch | |

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind 4 ·
Drizzle ORM · Supabase Postgres with PostGIS · Vitest

Telephony (Exotel/Ozonetel), WhatsApp (BSP), payments (Razorpay) and SMS/OTP
(MSG91) are integrated behind adapters and are **pending procurement** — see
[`docs/vendors.md`](docs/vendors.md). The app builds and runs without them; a
feature needing an unconfigured vendor throws a named error at the point of use.

## Getting started

Requires Node.js 20.9+ (built and tested on 24).

```bash
npm install
cp .env.example .env.local
npm run db:local:start   # local PostGIS cluster on port 5433
npm run db:migrate
npm run dev
```

`db:migrate` enables PostGIS, `pg_trgm` and `pgcrypto`, then applies the
migrations in `drizzle/`.

### The database

Development runs against a **local** PostGIS cluster, not Supabase. That keeps
the edit loop fast, avoids burning cloud connection limits on hot reloads, and
matches what CI runs against.

`npm run db:local:start` handles it. It needs Postgres binaries — either point
`PGSQL_HOME` at an extracted [PostgreSQL zip](https://www.enterprisedb.com/download-postgresql-binaries)
with the [PostGIS bundle](https://download.osgeo.org/postgis/windows/pg17/)
merged over it (no admin install required on Windows), or skip the script
entirely and use Docker:

```bash
docker run -d --name hashtagstay-db -p 5433:5432 \
  -e POSTGRES_PASSWORD=hashtagstay_local_dev -e POSTGRES_DB=hashtagstay \
  postgis/postgis:17-3.5
```

Other commands: `db:local:stop`, `db:local:status`, `db:local:reset` (drops and
recreates), `db:local:psql`.

### Pointing at Supabase instead

`.env.local` carries the Supabase connection strings commented out. Fill in the
password and swap them in. Supabase exposes two, and they are **not**
interchangeable:

- `DATABASE_URL` — the **transaction pooler** (port 6543) for app runtime.
  Prepared statements are disabled for it in `src/lib/db/index.ts`; leaving them
  on causes intermittent `prepared statement "s1" already exists` errors that
  look like random flakes.
- `DATABASE_URL_DIRECT` — the **direct connection** (port 5432) for migrations.
  DDL and the advisory locks that serialise migrations do not work through the
  transaction pooler.

## The build needs a database

`next build` connects to Postgres. `generateStaticParams` on `/stays/[slug]`,
`/city/[slug]` and `/near/[slug]` queries live inventory to decide what to
prerender, so **`DATABASE_URL` must resolve in any environment that builds this
app**, including CI and your deployment platform's build step.

This is deliberate. The alternative — swallowing a connection error and
returning no params — would turn a loud failure into a silent one that ships
zero prerendered city, campus and listing pages. On a funnel that depends
entirely on those being indexed, you would not notice until rankings dropped.
CI additionally asserts that the landing pages were actually prerendered, since
a build that connects but finds nothing still exits zero.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run verify` | typecheck + lint + tests (run before pushing) |
| `npm test` | Unit tests |
| `npm run test:int` | Integration tests — needs a running database |
| `npm run db:local:start` | Start the local PostGIS cluster |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |

Use `db:migrate`, not `db:push`. Push diffs the live database and applies what
it infers, which is fine for a scratch database and unacceptable against
anything holding real bookings. It would also revert the hand-written SRID
migration (`drizzle/0001`).

## Layout

```
src/
  proxy.ts      Optimistic auth redirect (Next 16's renamed middleware)
  app/
    admin/      Ops console — inventory, verification, stale queue   [M1]
    host/       Host portal                                          [M5]
    crm/        RM desk                                              [M3]
    (public)/   Discovery, listings, city & university landing pages [M2]
  components/
    ui/         Badges for listing state, verification tier, freshness
  lib/
    db/         Drizzle schema (32 tables), client, migrations, seed
    money/      Currency representation and arithmetic
    geo/        PostGIS proximity search
    state-machines/  Listing, lead, booking, verification lifecycles
    auth/       RBAC model, sessions, password hashing, route guards
    audit/      Append-only audit trail
    services/   Data access — the only place that mutates domain rows
    taxonomy/   Amenity and house-rule vocabularies
    env.ts      Validated environment
```

**Authorization lives in `lib/auth/guard.ts`, not in `proxy.ts`.** The proxy only
checks that a session cookie exists, so an unauthenticated visitor gets a
redirect instead of an empty screen. Next.js is explicit that proxy must not be
a session or authorization solution, and a cookie's presence says nothing about
whether it is valid, revoked, or belongs to a disabled account.

**Mutations go through `lib/services`, never straight from a page.** That is what
guarantees the state machine is enforced, an audit entry is written, and
`updatedAt` is set — a page writing directly gets none of those.

## Invariants worth knowing before you change code

These are enforced by tests, and a few of them are the difference between a
trustworthy aggregator and a broken one.

**Money is never a float.** Every amount is an integer count of minor units
plus an ISO-4217 code. `src/lib/money` is the only place currency is
represented or arithmeticked. Percentage fees use banker's rounding so they do
not accumulate an upward bias across thousands of bookings, and allocation
helpers never lose or invent a minor unit.

**A booking cannot be charged before the host confirms.** There is no path from
`initiated` to `fee_pending`; every booking passes through
`pending_host_confirmation`. Availability is *advisory* — small operators do not
keep calendars current — so charging first is how an aggregator sells a filled
room, which is the fastest way to destroy the trust the product is built on.

**A listing cannot go live without verification.** `draft → live` does not
exist. Leaving suspension also requires re-verification rather than a direct
un-suspend.

**Whoever submits a listing cannot certify it.** The `verifier` role cannot
create or edit properties, `ops` cannot approve verification, and even a user
holding both roles is refused approval on a listing they submitted. `super_admin`
deliberately lacks `verification:approve`: the badge is a claim made to
residents about a third party's property, not an internal setting.

**Lead attribution is written at insert.** UTM parameters, `gclid`, `fbclid`,
referrer and landing page cannot be reconstructed later, and every acquisition
metric depends on them.

**Fees are snapshotted onto bookings.** Editing a fee rule never rewrites the
economics of a booking already made. Rates are integer basis points.

**Proximity queries must cast to geography.** Point columns are
`geometry(Point,4326)`, where distance is in *degrees*. A query missing the
`::geography` cast still returns plausible-but-wrong rows. Always go through
`src/lib/geo`, which also uses `ST_DWithin` rather than `ST_Distance(...) < n`
so the GiST index is actually used.

**Webhook idempotency lives in the schema.** `webhook_events` has a unique
`(provider, provider_event_id)`; providers redeliver, and "process once" cannot
depend on handler timing.

## Compliance notes

Not optional extras — these shape the schema.

- **GST.** Charging an Indian resident a fee obliges us to issue a tax invoice
  with a gapless serial series per financial year. Numbering cannot be
  retrofitted. Refunds reverse via credit note; an issued invoice is never
  edited or deleted.
- **DPDP Act.** Consent is recorded per purpose, append-only, stamped with a
  policy version so a later policy change cannot retroactively claim consent.
  Under-18 enquirers require guardian consent (§9) — a recurring case in student
  housing, not an edge case. Call recording requires a disclosed announcement.
- **Audit trail.** Bulk PII export, refunds, fee-rule edits, role grants and
  recording playback always write an audit entry.

## Notes for contributors

`AGENTS.md` is written and re-added by `next dev`. This Next.js version differs
from Next 15 in ways that matter: middleware is now `proxy.ts` (Node runtime
only), request APIs (`cookies`, `headers`, `params`, `searchParams`) are
await-only, and `revalidateTag` requires a cacheLife profile. Read the bundled
docs in `node_modules/next/dist/docs/` before writing framework code.
