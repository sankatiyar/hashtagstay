import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@/lib/db/schema';
import { withinKm } from '@/lib/geo';

/**
 * Integration tests against a real PostGIS database.
 *
 * These exist because the most dangerous bugs in this schema are ones that
 * typecheck perfectly and still produce wrong answers or fail only at runtime:
 * an SRID-0 geometry column, a missing `::geography` cast, a unique constraint
 * that was never actually created. Unit tests cannot see any of that.
 *
 * Run with `npm run test:int` after `npm run db:local:start && npm run db:migrate`.
 */

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

const client = postgres(url!, { max: 1, prepare: false, onnotice: () => {} });
const db = drizzle(client, { schema, casing: 'snake_case' });

/** Real coordinates — transposition bugs are invisible with synthetic ones. */
const IISC = { lat: 13.0218, lng: 77.5665 };
const NEARBY = { lat: 13.025, lng: 77.57 }; // ~520 m from IISc
const MYSORE = { lat: 12.2958, lng: 76.6394 }; // ~128 km away

const SUFFIX = `it-${Date.now()}`;

async function cleanup() {
  // Ordered by dependency; properties reference organizations with RESTRICT.
  await client`DELETE FROM properties WHERE slug LIKE ${'%' + SUFFIX}`;
  await client`DELETE FROM organizations WHERE slug LIKE ${'%' + SUFFIX}`;
  await client`DELETE FROM institutions WHERE slug LIKE ${'%' + SUFFIX}`;
  await client`DELETE FROM users WHERE phone LIKE ${'%' + SUFFIX} OR email LIKE ${'%' + SUFFIX}`;
  await client`DELETE FROM webhook_events WHERE provider = ${SUFFIX}`;
}

beforeAll(async () => {
  await client`SELECT 1`;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await client.end({ timeout: 5 });
});

describe('extensions and migration state', () => {
  it('has postgis, pg_trgm and pgcrypto installed', async () => {
    const rows = await client<{ extname: string }[]>`
      SELECT extname FROM pg_extension ORDER BY extname
    `;
    const names = rows.map((r) => r.extname);
    expect(names).toContain('postgis');
    expect(names).toContain('pg_trgm');
    expect(names).toContain('pgcrypto');
  });

  it('recorded every migration in the journal', async () => {
    const rows = await client<{ count: string }[]>`
      SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations
    `;
    // 0000 schema + 0001 SRID enforcement.
    expect(Number(rows[0].count)).toBeGreaterThanOrEqual(2);
  });
});

describe('geometry columns', () => {
  it('constrains both point columns to SRID 4326', async () => {
    // This is the assertion that would have caught drizzle silently dropping
    // the srid option. An SRID-0 column throws on every ::geography cast.
    const rows = await client<{ f_table_name: string; type: string; srid: number }[]>`
      SELECT f_table_name, type, srid FROM geometry_columns
      WHERE f_table_name IN ('properties','institutions')
      ORDER BY f_table_name
    `;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.type).toBe('POINT');
      expect(row.srid, `${row.f_table_name} must be SRID 4326`).toBe(4326);
    }
  });

  it('rejects a point inserted with the wrong SRID', async () => {
    await expect(
      client`
        INSERT INTO institutions (name, slug, city, location)
        VALUES ('Bad SRID', ${'bad-srid-' + SUFFIX}, 'Bengaluru',
                ST_SetSRID(ST_MakePoint(77.5, 13.0), 3857))
      `,
    ).rejects.toThrow();
  });

  it('coerces a drizzle-native point insert to the column SRID', async () => {
    // Drizzle's geometry mapToDriverValue emits `point(x y)` with no SRID.
    // PostGIS coerces that to the column's declared SRID on insert, so an
    // ORM-native write lands as 4326 with the axes the right way round.
    //
    // This is why migration 0001 does double duty: without the 4326 typmod the
    // same insert would store SRID 0 and every ::geography cast would throw at
    // runtime. Do not "simplify" that migration away.
    await db.insert(schema.institutions).values({
      name: 'Drizzle Native',
      slug: `drizzle-native-${SUFFIX}`,
      city: 'Bengaluru',
      location: { x: IISC.lng, y: IISC.lat },
    });

    const rows = await client<{ srid: number; lng: number; lat: number }[]>`
      SELECT ST_SRID(location) AS srid,
             ST_X(location)::float8 AS lng,
             ST_Y(location)::float8 AS lat
      FROM institutions WHERE slug = ${`drizzle-native-${SUFFIX}`}
    `;
    expect(rows[0].srid).toBe(4326);
    expect(rows[0].lng).toBeCloseTo(IISC.lng, 4);
    expect(rows[0].lat).toBeCloseTo(IISC.lat, 4);
  });

  it('has a GiST index on each point column', async () => {
    const rows = await client<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND indexdef LIKE '%USING gist%'
      ORDER BY indexname
    `;
    const names = rows.map((r) => r.indexname);
    expect(names).toContain('properties_location_idx');
    expect(names).toContain('institutions_location_idx');
  });
});

describe('proximity search (FR-03)', () => {
  let orgId: string;
  let institutionId: string;

  beforeAll(async () => {
    const [org] = await client<{ id: string }[]>`
      INSERT INTO organizations (name, slug)
      VALUES ('Integration Operator', ${'org-' + SUFFIX})
      RETURNING id
    `;
    orgId = org.id;

    const [inst] = await client<{ id: string }[]>`
      INSERT INTO institutions (name, slug, city, location, is_published)
      VALUES ('IISc', ${'iisc-' + SUFFIX}, 'Bengaluru',
              ST_SetSRID(ST_MakePoint(${IISC.lng}, ${IISC.lat}), 4326), true)
      RETURNING id
    `;
    institutionId = inst.id;

    await client`
      INSERT INTO properties
        (organization_id, name, slug, property_type, address_line1, city, location, listing_state)
      VALUES
        (${orgId}, 'Near Campus', ${'near-' + SUFFIX}, 'coliving', '1 Road', 'Bengaluru',
         ST_SetSRID(ST_MakePoint(${NEARBY.lng}, ${NEARBY.lat}), 4326), 'live'),
        (${orgId}, 'Far Away', ${'far-' + SUFFIX}, 'coliving', '2 Road', 'Mysore',
         ST_SetSRID(ST_MakePoint(${MYSORE.lng}, ${MYSORE.lat}), 4326), 'live')
    `;
  });

  it('measures distance in metres, not degrees', async () => {
    const rows = await client<{ metres: number }[]>`
      SELECT round(ST_Distance(
        ST_SetSRID(ST_MakePoint(${IISC.lng}, ${IISC.lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${MYSORE.lng}, ${MYSORE.lat}), 4326)::geography
      ))::int AS metres
    `;
    // ~128 km straight-line Bengaluru to Mysore. If this comes back as ~1.17,
    // the geography cast was dropped and every radius filter is wrong.
    expect(rows[0].metres).toBeGreaterThan(120_000);
    expect(rows[0].metres).toBeLessThan(135_000);
  });

  it('finds only the nearby property within 2 km', async () => {
    const rows = await client<{ slug: string; metres: number }[]>`
      SELECT p.slug, round(ST_Distance(p.location::geography, i.location::geography))::int AS metres
      FROM properties p, institutions i
      WHERE i.id = ${institutionId}
        AND p.slug LIKE ${'%' + SUFFIX}
        AND ST_DWithin(p.location::geography, i.location::geography, 2000)
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe(`near-${SUFFIX}`);
    expect(rows[0].metres).toBeGreaterThan(300);
    expect(rows[0].metres).toBeLessThan(800);
  });

  it('finds both within 200 km', async () => {
    const rows = await client<{ slug: string }[]>`
      SELECT p.slug FROM properties p, institutions i
      WHERE i.id = ${institutionId}
        AND p.slug LIKE ${'%' + SUFFIX}
        AND ST_DWithin(p.location::geography, i.location::geography, 200000)
    `;
    expect(rows).toHaveLength(2);
  });

  it('produces a working predicate from lib/geo withinKm', async () => {
    // Exercises the actual helper the application will use, not a hand-written
    // query that happens to agree with it.
    const predicate = withinKm(schema.properties.location, IISC, 2);
    const rows = await db
      .select({ slug: schema.properties.slug })
      .from(schema.properties)
      .where(sql`${predicate} AND ${schema.properties.slug} LIKE ${'%' + SUFFIX}`);

    expect(rows.map((r) => r.slug)).toEqual([`near-${SUFFIX}`]);
  });

  it('round-trips coordinates without transposing them', async () => {
    const rows = await client<{ lat: number; lng: number }[]>`
      SELECT ST_Y(location)::float8 AS lat, ST_X(location)::float8 AS lng
      FROM institutions WHERE id = ${institutionId}
    `;
    // If lat/lng were swapped on write, lat would come back as 77.5.
    expect(rows[0].lat).toBeCloseTo(IISC.lat, 4);
    expect(rows[0].lng).toBeCloseTo(IISC.lng, 4);
  });
});

describe('constraints that protect data integrity', () => {
  it('enforces webhook idempotency on (provider, provider_event_id)', async () => {
    const insert = () => client`
      INSERT INTO webhook_events (provider, provider_event_id, signature_valid, payload)
      VALUES (${SUFFIX}, 'evt_duplicate', true, '{}'::jsonb)
    `;
    await insert();
    // Providers redeliver. The second attempt must be rejected by the database,
    // not merely avoided by handler timing.
    await expect(insert()).rejects.toThrow(/duplicate key|unique/i);
  });

  it('allows many users with a NULL phone but not two with the same phone', async () => {
    const phone = `+9199${SUFFIX}`;
    await client`INSERT INTO users (audience, email) VALUES ('host', ${'a-' + SUFFIX})`;
    await client`INSERT INTO users (audience, email) VALUES ('host', ${'b-' + SUFFIX})`;

    await client`INSERT INTO users (audience, phone) VALUES ('resident', ${phone})`;
    await expect(
      client`INSERT INTO users (audience, phone) VALUES ('resident', ${phone})`,
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('refuses to delete an organization that still has properties', async () => {
    const [org] = await client<{ id: string }[]>`
      INSERT INTO organizations (name, slug) VALUES ('Restrict Me', ${'restrict-' + SUFFIX})
      RETURNING id
    `;
    await client`
      INSERT INTO properties (organization_id, name, slug, property_type, address_line1, city)
      VALUES (${org.id}, 'Held', ${'held-' + SUFFIX}, 'coliving', '3 Road', 'Bengaluru')
    `;
    // ON DELETE RESTRICT: losing inventory because someone tidied up an
    // operator record would silently break live listings and bookings.
    await expect(
      client`DELETE FROM organizations WHERE id = ${org.id}`,
    ).rejects.toThrow();
  });

  it('rejects a state value outside the enum', async () => {
    const [org] = await client<{ id: string }[]>`
      INSERT INTO organizations (name, slug) VALUES ('Enum Test', ${'enum-' + SUFFIX})
      RETURNING id
    `;
    await expect(
      client`
        INSERT INTO properties (organization_id, name, slug, property_type, address_line1, city, listing_state)
        VALUES (${org.id}, 'Bad', ${'bad-' + SUFFIX}, 'coliving', '4 Road', 'Bengaluru', 'published')
      `,
    ).rejects.toThrow();
  });

  it('defaults a new property to draft, never live', async () => {
    const [org] = await client<{ id: string }[]>`
      INSERT INTO organizations (name, slug) VALUES ('Default Test', ${'default-' + SUFFIX})
      RETURNING id
    `;
    const [row] = await client<{ listing_state: string; verification_tier: string }[]>`
      INSERT INTO properties (organization_id, name, slug, property_type, address_line1, city)
      VALUES (${org.id}, 'Fresh', ${'fresh-' + SUFFIX}, 'coliving', '5 Road', 'Bengaluru')
      RETURNING listing_state, verification_tier
    `;
    expect(row.listing_state).toBe('draft');
    expect(row.verification_tier).toBe('none');
  });
});

describe('money columns', () => {
  it('stores rent as an exact integer count of minor units', async () => {
    const [org] = await client<{ id: string }[]>`
      INSERT INTO organizations (name, slug) VALUES ('Money Test', ${'money-' + SUFFIX})
      RETURNING id
    `;
    const [prop] = await client<{ id: string }[]>`
      INSERT INTO properties (organization_id, name, slug, property_type, address_line1, city)
      VALUES (${org.id}, 'Priced', ${'priced-' + SUFFIX}, 'coliving', '6 Road', 'Bengaluru')
      RETURNING id
    `;
    // 850000 paise = Rs 8,500.00
    const [room] = await client<{ rent_amount_minor: string; rent_currency: string }[]>`
      INSERT INTO room_types (property_id, name, rent_amount_minor, rent_currency)
      VALUES (${prop.id}, 'Single', 850000, 'INR')
      RETURNING rent_amount_minor, rent_currency
    `;
    // bigint arrives as a string from node-postgres; exactness is the point.
    expect(String(room.rent_amount_minor)).toBe('850000');
    expect(room.rent_currency.trim()).toBe('INR');
  });
});
