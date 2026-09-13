import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  getPublicListing,
  listLiveCities,
  listLiveListingSlugs,
  nearbyInstitutions,
  searchListings,
} from '@/lib/services/public-search';

/**
 * Public search, against a real database.
 *
 * Two invariants matter more than any feature here, and both are asserted
 * structurally rather than by reading the code:
 *
 *  1. Only `live` inventory is ever returned.
 *  2. Operator contact details never appear in a public projection — that is
 *     the disintermediation control the whole fee model rests on.
 */

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
const client = postgres(url!, { max: 1, prepare: false, onnotice: () => {} });

const SUFFIX = `pub-${Date.now()}`;
const CITY = `Testville ${SUFFIX}`;

// Real coordinates so distances are meaningful.
const CAMPUS = { lat: 13.0218, lng: 77.5665 }; // IISc
const NEAR = { lat: 13.025, lng: 77.57 }; // ~520 m
const FAR = { lat: 13.08, lng: 77.62 }; // ~8 km

let campusSlug: string;

async function cleanup() {
  await client`
    DELETE FROM properties
    WHERE organization_id IN (
      SELECT id FROM organizations WHERE slug LIKE ${'%' + SUFFIX}
    )
  `;
  await client`DELETE FROM organizations WHERE slug LIKE ${'%' + SUFFIX}`;
  await client`DELETE FROM institutions WHERE slug LIKE ${'%' + SUFFIX}`;
}

/**
 * Insert a property with one room type and an availability row.
 *
 * Amenities are bound with `client.json(...)` rather than `JSON.stringify`.
 * postgres.js serialises a value bound to a json/jsonb target itself, so a
 * pre-stringified array gets double-encoded: the column ends up holding the
 * JSON *string* '["wifi","cctv"]' instead of an array, and jsonb containment
 * silently matches nothing. Application inserts go through Drizzle, which
 * handles this correctly — this was a fixture bug, not a service bug.
 */
async function makeProperty(opts: {
  name: string;
  listingState: string;
  lat?: number;
  lng?: number;
  rent: number;
  occupancy?: number;
  genderPolicy?: string;
  propertyType?: string;
  amenities?: string[];
  bedsFree?: number;
  verificationTier?: string;
  orgId: string;
  city?: string;
}) {
  const slug = `${opts.name.toLowerCase().replaceAll(' ', '-')}-${SUFFIX}`;
  const [property] = await client<{ id: string }[]>`
    INSERT INTO properties
      (organization_id, name, slug, property_type, address_line1, city,
       listing_state, gender_policy, verification_tier, amenities, location)
    VALUES (
      ${opts.orgId}, ${opts.name}, ${slug},
      ${opts.propertyType ?? 'coliving'}, '1 Road', ${opts.city ?? CITY},
      ${opts.listingState}, ${opts.genderPolicy ?? 'any'},
      ${opts.verificationTier ?? 'documents_checked'},
      ${client.json(opts.amenities ?? [])},
      ${
        opts.lat !== undefined && opts.lng !== undefined
          ? client`ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)`
          : null
      }
    )
    RETURNING id
  `;

  const [room] = await client<{ id: string }[]>`
    INSERT INTO room_types (property_id, name, occupancy, rent_amount_minor, rent_currency)
    VALUES (${property.id}, 'Room', ${opts.occupancy ?? 1}, ${opts.rent}, 'INR')
    RETURNING id
  `;

  await client`
    INSERT INTO availability (room_type_id, available_count, source)
    VALUES (${room.id}, ${opts.bedsFree ?? 2}, 'ops')
  `;

  return { id: property.id, slug };
}

beforeAll(async () => {
  await cleanup();

  const [org] = await client<{ id: string }[]>`
    INSERT INTO organizations (name, slug, contact_phone, contact_email)
    VALUES ('Public Test Operator', ${'org-' + SUFFIX}, '+919000099999',
            'secret-operator@example.com')
    RETURNING id
  `;
  const orgId = org.id;

  campusSlug = `campus-${SUFFIX}`;
  await client`
    INSERT INTO institutions (name, slug, city, location, is_published)
    VALUES ('Test Campus', ${campusSlug}, ${CITY},
            ST_SetSRID(ST_MakePoint(${CAMPUS.lng}, ${CAMPUS.lat}), 4326), true)
  `;

  await makeProperty({
    name: 'Live Near Cheap',
    listingState: 'live',
    ...NEAR,
    rent: 900_000,
    occupancy: 3,
    amenities: ['wifi', 'cctv'],
    verificationTier: 'onground_audited',
    orgId,
  });
  await makeProperty({
    name: 'Live Near Pricey',
    listingState: 'live',
    ...NEAR,
    rent: 2_500_000,
    occupancy: 1,
    amenities: ['wifi'],
    orgId,
  });
  await makeProperty({
    name: 'Live Far',
    listingState: 'live',
    ...FAR,
    rent: 1_200_000,
    amenities: ['wifi'],
    orgId,
  });
  await makeProperty({
    name: 'Live Women Only',
    listingState: 'live',
    ...NEAR,
    rent: 1_500_000,
    genderPolicy: 'female_only',
    orgId,
  });
  await makeProperty({
    name: 'Live Men Only',
    listingState: 'live',
    ...NEAR,
    rent: 1_500_000,
    genderPolicy: 'male_only',
    orgId,
  });
  // Non-live inventory, which must never surface.
  await makeProperty({
    name: 'Draft Hidden',
    listingState: 'draft',
    ...NEAR,
    rent: 100_000,
    orgId,
  });
  await makeProperty({
    name: 'Paused Hidden',
    listingState: 'paused',
    ...NEAR,
    rent: 100_000,
    orgId,
  });
  await makeProperty({
    name: 'Suspended Hidden',
    listingState: 'suspended',
    ...NEAR,
    rent: 100_000,
    orgId,
  });
  await makeProperty({
    name: 'In Verification Hidden',
    listingState: 'in_verification',
    ...NEAR,
    rent: 100_000,
    orgId,
  });
});

afterAll(async () => {
  await cleanup();
  await client.end({ timeout: 5 });
});

describe('only live inventory is public', () => {
  it('returns live listings and nothing else', async () => {
    const { rows } = await searchListings({ city: CITY, pageSize: 48 });
    const names = rows.map((r) => r.name);

    expect(names).toContain('Live Near Cheap');
    expect(names).toContain('Live Far');

    // The cheapest properties in the fixture are all non-live. If any leaks,
    // it would also top a price sort — so this catches both bugs at once.
    for (const hidden of [
      'Draft Hidden',
      'Paused Hidden',
      'Suspended Hidden',
      'In Verification Hidden',
    ]) {
      expect(names).not.toContain(hidden);
    }
  });

  it('404s a non-live listing by slug rather than serving it', async () => {
    expect(await getPublicListing(`draft-hidden-${SUFFIX}`)).toBeNull();
    expect(await getPublicListing(`paused-hidden-${SUFFIX}`)).toBeNull();
    expect(await getPublicListing(`live-far-${SUFFIX}`)).not.toBeNull();
  });

  it('omits non-live listings from the sitemap', async () => {
    const slugs = (await listLiveListingSlugs()).map((s) => s.slug);
    expect(slugs).toContain(`live-far-${SUFFIX}`);
    expect(slugs).not.toContain(`draft-hidden-${SUFFIX}`);
  });

  it('counts only live inventory per city', async () => {
    const cities = await listLiveCities();
    const entry = cities.find((c) => c.city === CITY);
    // Five live fixtures, four hidden.
    expect(entry?.listingCount).toBe(5);
  });
});

describe('operator contact details never reach a public projection', () => {
  it('exposes no contact fields on a search row', async () => {
    const { rows } = await searchListings({ city: CITY, pageSize: 1 });
    const keys = Object.keys(rows[0]).join(' ').toLowerCase();

    // Structural, not a code review: if someone adds a contact column to the
    // public query, this fails. Leaking an operator's number is how a booking
    // happens off-platform and we earn nothing.
    expect(keys).not.toContain('phone');
    expect(keys).not.toContain('email');
    expect(keys).not.toContain('contact');
  });

  it('exposes no contact fields on a listing detail', async () => {
    const listing = await getPublicListing(`live-far-${SUFFIX}`);
    const serialised = JSON.stringify(listing).toLowerCase();

    expect(Object.keys(listing!).join(' ').toLowerCase()).not.toContain('contact');
    // And the seeded operator's actual details must be absent from the payload.
    expect(serialised).not.toContain('919000099999');
    expect(serialised).not.toContain('secret-operator@example.com');
  });
});

describe('proximity search (FR-03)', () => {
  it('finds only nearby listings within the radius', async () => {
    const { rows } = await searchListings({
      city: CITY,
      institutionSlug: campusSlug,
      radiusKm: 2,
      pageSize: 48,
    });
    const names = rows.map((r) => r.name);
    expect(names).toContain('Live Near Cheap');
    expect(names).not.toContain('Live Far');
  });

  it('includes the far listing at a wider radius', async () => {
    const { rows } = await searchListings({
      city: CITY,
      institutionSlug: campusSlug,
      radiusKm: 15,
      pageSize: 48,
    });
    expect(rows.map((r) => r.name)).toContain('Live Far');
  });

  it('returns distance in metres, not degrees', async () => {
    const { rows } = await searchListings({
      city: CITY,
      institutionSlug: campusSlug,
      radiusKm: 2,
      pageSize: 48,
    });
    const near = rows.find((r) => r.name === 'Live Near Cheap')!;
    // ~520 m. A degree-based result would be ~0.005.
    expect(near.distanceMeters).toBeGreaterThan(300);
    expect(near.distanceMeters).toBeLessThan(800);
  });

  it('reports null distance when no campus was given', async () => {
    const { rows } = await searchListings({ city: CITY, pageSize: 1 });
    expect(rows[0].distanceMeters).toBeNull();
  });

  it('sorts by distance when asked', async () => {
    const { rows } = await searchListings({
      city: CITY,
      institutionSlug: campusSlug,
      radiusKm: 15,
      sort: 'distance',
      pageSize: 48,
    });
    const distances = rows.map((r) => r.distanceMeters!);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it('ignores an unknown campus slug rather than returning nothing', async () => {
    const { rows, institution } = await searchListings({
      city: CITY,
      institutionSlug: 'no-such-campus',
      pageSize: 48,
    });
    expect(institution).toBeNull();
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('filters', () => {
  it('matches budget against the cheapest room, not the dearest', async () => {
    // "Live Near Cheap" has a 900,000 triple; a 1,000,000 budget must include it.
    const { rows } = await searchListings({
      city: CITY,
      maxRentMinor: 1_000_000,
      pageSize: 48,
    });
    const names = rows.map((r) => r.name);
    expect(names).toContain('Live Near Cheap');
    expect(names).not.toContain('Live Near Pricey');
  });

  it('filters by room sharing', async () => {
    const { rows } = await searchListings({
      city: CITY,
      maxOccupancy: 1,
      pageSize: 48,
    });
    expect(rows.map((r) => r.name)).toContain('Live Near Pricey');
    expect(rows.map((r) => r.name)).not.toContain('Live Near Cheap');
  });

  it('shows women-only and mixed listings but never men-only', async () => {
    const { rows } = await searchListings({
      city: CITY,
      genderPolicy: 'female_only',
      pageSize: 48,
    });
    const names = rows.map((r) => r.name);
    expect(names).toContain('Live Women Only');
    expect(names).toContain('Live Far'); // gender_policy 'any'
    // The one result that would matter most to get wrong.
    expect(names).not.toContain('Live Men Only');
  });

  it('treats multiple amenities as AND, not OR', async () => {
    const both = await searchListings({
      city: CITY,
      amenities: ['wifi', 'cctv'],
      pageSize: 48,
    });
    expect(both.rows.map((r) => r.name)).toEqual(['Live Near Cheap']);

    const one = await searchListings({ city: CITY, amenities: ['wifi'], pageSize: 48 });
    expect(one.rows.length).toBeGreaterThan(1);
  });

  it('filters by property type', async () => {
    const { rows } = await searchListings({
      city: CITY,
      propertyType: 'homeshare',
      pageSize: 48,
    });
    expect(rows).toHaveLength(0);
  });

  it('sorts by price ascending and descending', async () => {
    const asc = await searchListings({ city: CITY, sort: 'price_asc', pageSize: 48 });
    const prices = asc.rows.map((r) => r.fromRentMinor);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));

    const desc = await searchListings({ city: CITY, sort: 'price_desc', pageSize: 48 });
    const descPrices = desc.rows.map((r) => r.fromRentMinor);
    expect(descPrices).toEqual([...descPrices].sort((a, b) => b - a));
  });
});

describe('pagination', () => {
  it('counts distinct properties, not joined rows', async () => {
    // The search query groups by property; a naive count over the grouped rows
    // would inflate the total once a property has several room types.
    const { total } = await searchListings({ city: CITY, pageSize: 2 });
    expect(total).toBe(5);
  });

  it('respects page size and offset without overlap', async () => {
    const first = await searchListings({
      city: CITY,
      sort: 'price_asc',
      pageSize: 2,
      page: 1,
    });
    const second = await searchListings({
      city: CITY,
      sort: 'price_asc',
      pageSize: 2,
      page: 2,
    });

    expect(first.rows).toHaveLength(2);
    expect(second.rows).toHaveLength(2);
    const overlap = first.rows.filter((r) => second.rows.some((s) => s.id === r.id));
    expect(overlap).toHaveLength(0);
  });

  it('clamps an absurd page size', async () => {
    const result = await searchListings({ city: CITY, pageSize: 10_000 });
    expect(result.pageSize).toBe(48);
  });
});

describe('getPublicListing()', () => {
  it('returns rooms cheapest-first, so "from" pricing is the first row', async () => {
    const listing = await getPublicListing(`live-far-${SUFFIX}`);
    expect(listing!.rooms.length).toBeGreaterThan(0);
    const rents = listing!.rooms.map((r) => r.rentAmountMinor);
    expect(rents).toEqual([...rents].sort((a, b) => a - b));
  });

  it('returns null for an unknown slug', async () => {
    expect(await getPublicListing('does-not-exist')).toBeNull();
  });
});

describe('nearbyInstitutions()', () => {
  it('lists campuses near a coordinate with metre distances', async () => {
    const results = await nearbyInstitutions(NEAR, 4);
    const found = results.find((r) => r.slug === campusSlug);
    expect(found).toBeDefined();
    expect(found!.distanceMeters).toBeGreaterThan(300);
    expect(found!.distanceMeters).toBeLessThan(800);
  });

  it('returns nothing for a property with no coordinate', async () => {
    expect(await nearbyInstitutions(null)).toEqual([]);
  });
});

describe('campus catchments (nearestCampusOnly)', () => {
  // Far from every seeded campus, so only these two fixtures compete. Its own
  // city keeps the per-city counts asserted above unaffected.
  const CAMPUS_A = { lat: 21.1458, lng: 79.0882 };
  const CAMPUS_B = { lat: 21.1458, lng: 79.1082 }; // ~2.1 km east of A
  const BETWEEN = { lat: 21.1458, lng: 79.0952 }; // ~0.7 km from A, ~1.4 km from B
  const catchmentCity = `Catchment ${SUFFIX}`;
  const slugA = `catchment-a-${SUFFIX}`;
  const slugB = `catchment-b-${SUFFIX}`;

  beforeAll(async () => {
    const [org] = await client<{ id: string }[]>`
      SELECT id FROM organizations WHERE slug = ${'org-' + SUFFIX}
    `;
    for (const [slug, point] of [
      [slugA, CAMPUS_A],
      [slugB, CAMPUS_B],
    ] as const) {
      await client`
        INSERT INTO institutions (name, slug, city, location, is_published)
        VALUES (${slug}, ${slug}, ${catchmentCity},
                ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326), true)
      `;
    }
    await makeProperty({
      name: 'Catchment Between',
      listingState: 'live',
      ...BETWEEN,
      rent: 1_000_000,
      orgId: org.id,
      city: catchmentCity,
    });
  });

  it('lists a listing only on the page of the campus it is nearest to', async () => {
    const a = await searchListings({
      institutionSlug: slugA,
      radiusKm: 5,
      nearestCampusOnly: true,
      pageSize: 48,
    });
    const b = await searchListings({
      institutionSlug: slugB,
      radiusKm: 5,
      nearestCampusOnly: true,
      pageSize: 48,
    });
    expect(a.rows.map((r) => r.name)).toContain('Catchment Between');
    expect(b.rows.map((r) => r.name)).not.toContain('Catchment Between');
  });

  it('still finds it by radius from the other campus when not restricted', async () => {
    const { rows } = await searchListings({
      institutionSlug: slugB,
      radiusKm: 5,
      pageSize: 48,
    });
    expect(rows.map((r) => r.name)).toContain('Catchment Between');
  });
});
