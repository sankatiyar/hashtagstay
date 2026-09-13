# Trying it locally

The app runs at **http://localhost:3100**.

## Starting it

Two things need to be running: the database, then the app.

```bash
npm run db:local:start
npm run dev -- --port 3100
```

If the database has never been seeded (or you ran `db:local:reset`):

```bash
npm run db:migrate
npm run db:seed
```

`db:local:status` tells you whether Postgres is up and how many tables exist.

## The public site

No login needed. This is the resident-facing half — the SEO/SEM top of funnel.

| Page | What to look at |
|---|---|
| [/](http://localhost:3100/) | Search by city, campus and budget |
| [/search](http://localhost:3100/search) | Filters: budget, room sharing, gender preference, amenities, campus radius |
| [/near/iisc-bengaluru](http://localhost:3100/near/iisc-bengaluru) | Campus proximity — the student wedge. Note the real distance on the card |
| [/city/bengaluru](http://localhost:3100/city/bengaluru) | City landing page |
| [/stays/nest-malleswaram-sample](http://localhost:3100/stays/nest-malleswaram-sample) | Listing detail, rooms, pricing, and the verification claim in full |
| [/sitemap.xml](http://localhost:3100/sitemap.xml) | 35 URLs, generated from live data |
| [/robots.txt](http://localhost:3100/robots.txt) | Console and shortlist tokens disallowed |

Worth trying deliberately:

- **Budget matches the cheapest room.** Search Bengaluru with a ₹12,000 budget —
  Nest Malleswaram appears because it has a ₹12,000 twin-sharing option, even
  though its single room is ₹18,000.
- **Gender filter.** Choose "Women-only accommodation". You get the women-only
  property *and* mixed-gender ones that accept women, but never men-only.
- **Campus radius.** `/search?near=iisc-bengaluru&radius=2` versus `radius=15`.
- **View source on a listing page.** The JSON-LD has no `telephone` and no
  `aggregateRating` — deliberately, since publishing an operator's number would
  defeat number masking, and we have no reviews to substantiate a rating.

## The ops console

**http://localhost:3100/admin** — password `devpassword123` for all of these.
They are created by `db:seed` and skipped entirely when `NODE_ENV=production`.

| Login | Role | What it can do |
|---|---|---|
| `ops@hashtagstay.local` | ops | Create and edit inventory, confirm availability, open verifications |
| `verifier@hashtagstay.local` | verifier | Work the checklist, grant a tier, publish |
| `rm@hashtagstay.local` | rm | View inventory (lead desk is M3) |
| `finance@hashtagstay.local` | finance | Payments view (no inventory editing) |
| `rmlead@hashtagstay.local` | rm_lead | As RM, plus desk-wide visibility |
| `admin@hashtagstay.local` | super_admin | Everything except granting a verification |

### The walkthrough that shows the most

1. Sign in as **ops**. Go to Inventory → **Add property**. Fill it in and
   deliberately enter the coordinates the wrong way round (latitude `77.59`,
   longitude `12.97`) — it tells you to swap them, because most of India's
   longitudes are valid latitudes and a global range check cannot catch this.
2. Still as ops, open the property → **Open verification review** → open one.
   The checklist is **read-only** for you: recording checks needs the verifier
   role.
3. Note on the property page that **Publish is disabled** for ops, with the
   reason given.
4. Sign out, sign in as **verifier**. Same review screen, now editable. Mark the
   checks, try granting *On-ground audited* before completing the site-visit
   items — it refuses and names what is outstanding.
5. Complete them, approve. The listing goes live, the badge appears, and an
   expiry date is set (12 months for an on-ground audit).
6. Go back to the public site. The property is now there.
7. Sign in as **finance** and try `/admin/properties` — denied, and the attempt
   is recorded in the audit log.

### Seeing the audit trail

```bash
npm run db:local:psql
```

```sql
SELECT action, entity_type, actor_label, after
FROM audit_log ORDER BY created_at DESC LIMIT 10;
```

After the walkthrough above you should see two *different* actors — `create` by
ops, checklist and approval by the verifier. That is the separation of duties
visible in the record itself.

## What is deliberately not built yet

- **Media upload.** Needs `SUPABASE_SECRET_KEY`, which is blank. No photos on
  any listing.
- **The enquiry form.** `/enquiry` is a placeholder that says so. It needs phone
  OTP to keep bot traffic off the RM desk, and that is blocked on TRAI DLT
  registration.
- **The RM desk (M3), bookings and payments (M4), host portal (M5).**
- **TOTP for staff logins.** Sessions record `mfaSatisfied: false` honestly
  rather than pretending.

## If something looks wrong

- **Everything 500s** — the database is probably not running. `npm run db:local:status`.
- **No listings anywhere** — the database is up but empty. `npm run db:seed`.
- **Port 3100 in use** — another process has it. Pick another port and update
  `NEXT_PUBLIC_SITE_URL` in `.env.local` to match, or canonical links and the
  sitemap will point at the wrong host.
- **A stale page after editing inventory** — public pages use ISR, so a listing
  revalidates within 10 minutes and landing pages within 15. Restart the dev
  server to see a change immediately.
