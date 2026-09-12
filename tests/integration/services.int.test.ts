import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  confirmAvailability,
  countPropertiesByState,
  getPropertyDetail,
  listProperties,
  listPropertyCities,
  listStaleInventory,
  transitionListing,
  updateProperty,
} from '@/lib/services/properties';
import { IllegalTransitionError } from '@/lib/state-machines';

/**
 * Service-layer integration tests.
 *
 * These exist because of a bug that typechecked perfectly and failed only at
 * runtime: `listStaleInventory` interpolated a JS `Date` into a `sql` template,
 * which reached Postgres as `Date.prototype.toString()` output and could not be
 * parsed. Nothing short of executing the query against a real database catches
 * that, and the screen it broke (the ops overview) was one I had not opened.
 *
 * Every exported query runs here for that reason — executing it at all is most
 * of the value.
 */

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
const client = postgres(url!, { max: 1, prepare: false, onnotice: () => {} });

const SUFFIX = `svc-${Date.now()}`;
const ACTOR = { id: null, label: `integration-test-${SUFFIX}` };

let orgId: string;
let livePropertyId: string;
let draftPropertyId: string;
let roomTypeId: string;

async function cleanup() {
  await client`DELETE FROM audit_log WHERE actor_label = ${ACTOR.label}`;
  await client`DELETE FROM properties WHERE slug LIKE ${'%' + SUFFIX}`;
  await client`DELETE FROM organizations WHERE slug LIKE ${'%' + SUFFIX}`;
}

beforeAll(async () => {
  await cleanup();

  const [org] = await client<{ id: string }[]>`
    INSERT INTO organizations (name, slug)
    VALUES ('Service Test Operator', ${'org-' + SUFFIX})
    RETURNING id
  `;
  orgId = org.id;

  const [live] = await client<{ id: string }[]>`
    INSERT INTO properties
      (organization_id, name, slug, property_type, address_line1, locality, city,
       listing_state, verification_tier, location)
    VALUES
      (${orgId}, 'Service Live Property', ${'live-' + SUFFIX}, 'coliving',
       '1 Test Road', 'Indiranagar', 'Bengaluru', 'live', 'onground_audited',
       ST_SetSRID(ST_MakePoint(77.6408, 12.9784), 4326))
    RETURNING id
  `;
  livePropertyId = live.id;

  const [draft] = await client<{ id: string }[]>`
    INSERT INTO properties
      (organization_id, name, slug, property_type, address_line1, city, listing_state)
    VALUES
      (${orgId}, 'Service Draft Property', ${'draft-' + SUFFIX}, 'pbsa',
       '2 Test Road', 'Pune', 'draft')
    RETURNING id
  `;
  draftPropertyId = draft.id;

  const [room] = await client<{ id: string }[]>`
    INSERT INTO room_types (property_id, name, occupancy, rent_amount_minor, rent_currency)
    VALUES (${livePropertyId}, 'Single', 1, 1500000, 'INR')
    RETURNING id
  `;
  roomTypeId = room.id;
});

afterAll(async () => {
  await cleanup();
  await client.end({ timeout: 5 });
});

describe('listProperties()', () => {
  it('returns rows with aggregated room and bed counts', async () => {
    const { rows } = await listProperties({ search: SUFFIX, pageSize: 50 });
    const live = rows.find((r) => r.slug === `live-${SUFFIX}`);

    expect(live).toBeDefined();
    expect(live!.roomTypeCount).toBe(1);
    // No availability row yet, so coalesce must give 0 rather than null.
    expect(live!.availableBeds).toBe(0);
    expect(live!.organizationName).toBe('Service Test Operator');
  });

  it('reports never-confirmed availability as null age, not zero', async () => {
    // Zero would render "confirmed today" for inventory nobody has ever checked.
    const { rows } = await listProperties({ search: `live-${SUFFIX}` });
    expect(rows[0].availabilityAgeDays).toBeNull();
    expect(rows[0].availabilityConfirmedOn).toBeNull();
  });

  it('filters by listing state', async () => {
    const { rows } = await listProperties({
      search: SUFFIX,
      listingState: 'draft',
      pageSize: 50,
    });
    expect(rows.map((r) => r.slug)).toEqual([`draft-${SUFFIX}`]);
  });

  it('filters by city', async () => {
    const { rows } = await listProperties({ search: SUFFIX, city: 'Pune' });
    expect(rows.every((r) => r.city === 'Pune')).toBe(true);
  });

  it('searches name, slug and locality', async () => {
    const byLocality = await listProperties({ search: 'Indiranagar' });
    expect(byLocality.rows.some((r) => r.slug === `live-${SUFFIX}`)).toBe(true);
  });

  it('paginates without losing the total', async () => {
    const firstPage = await listProperties({ search: SUFFIX, pageSize: 1, page: 1 });
    expect(firstPage.rows).toHaveLength(1);
    expect(firstPage.total).toBeGreaterThanOrEqual(2);
  });

  it('clamps an absurd page size rather than trying to serve it', async () => {
    const result = await listProperties({ pageSize: 100_000 });
    expect(result.pageSize).toBe(100);
  });
});

describe('getPropertyDetail()', () => {
  it('returns the property with its rooms', async () => {
    const detail = await getPropertyDetail(livePropertyId);
    expect(detail).not.toBeNull();
    expect(detail!.property.slug).toBe(`live-${SUFFIX}`);
    expect(detail!.rooms).toHaveLength(1);
    expect(detail!.rooms[0].roomType.rentAmountMinor).toBe(1_500_000);
  });

  it('reads the point column back as lat/lng in the right order', async () => {
    const detail = await getPropertyDetail(livePropertyId);
    // y is latitude, x is longitude. Swapped, Bengaluru lands in the ocean.
    expect(detail!.property.location!.y).toBeCloseTo(12.9784, 3);
    expect(detail!.property.location!.x).toBeCloseTo(77.6408, 3);
  });

  it('treats an unverified property as not expired', async () => {
    const detail = await getPropertyDetail(draftPropertyId);
    expect(detail!.verificationExpired).toBe(false);
  });

  it('returns null for an unknown id', async () => {
    expect(await getPropertyDetail('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('listStaleInventory()', () => {
  it('executes — the regression this suite was written for', async () => {
    // The original failure was a JS Date interpolated into a sql template,
    // producing an unparseable timestamp. Simply running the query catches it.
    await expect(listStaleInventory(14)).resolves.toBeInstanceOf(Array);
  });

  it('includes live inventory whose availability was never confirmed', async () => {
    const rows = await listStaleInventory(14);
    const found = rows.find((r) => r.propertyId === livePropertyId);
    expect(found).toBeDefined();
    expect(found!.lastConfirmedAt).toBeNull();
    expect(found!.ageDays).toBeNull();
  });

  it('excludes draft inventory — only live and paused are chased', async () => {
    const rows = await listStaleInventory(14);
    expect(rows.some((r) => r.propertyId === draftPropertyId)).toBe(false);
  });

  it('drops a property once availability is freshly confirmed', async () => {
    await confirmAvailability(
      roomTypeId,
      { availableCount: 4, source: 'ops', confirmedByUserId: null },
      ACTOR,
    );

    const rows = await listStaleInventory(14);
    expect(rows.some((r) => r.propertyId === livePropertyId)).toBe(false);
  });

  it('accepts a zero-day window, treating everything as stale', async () => {
    const rows = await listStaleInventory(0);
    expect(rows).toBeInstanceOf(Array);
  });

  it('rejects a nonsensical window', async () => {
    await expect(listStaleInventory(-5)).rejects.toThrow(/non-negative/);
  });
});

describe('confirmAvailability()', () => {
  it('records the count, provenance and confirmation time', async () => {
    await confirmAvailability(
      roomTypeId,
      {
        availableCount: 7,
        source: 'ops',
        confirmedByUserId: null,
        notes: 'spoke to the manager',
      },
      ACTOR,
    );

    const [row] = await client<
      { available_count: number; source: string; notes: string }[]
    >`
      SELECT available_count, source, notes FROM availability
      WHERE room_type_id = ${roomTypeId}
    `;
    expect(row.available_count).toBe(7);
    expect(row.source).toBe('ops');
    expect(row.notes).toBe('spoke to the manager');
  });

  it('upserts rather than accumulating rows for the same room type', async () => {
    await confirmAvailability(
      roomTypeId,
      { availableCount: 2, source: 'rm', confirmedByUserId: null },
      ACTOR,
    );
    const rows = await client`
      SELECT 1 FROM availability WHERE room_type_id = ${roomTypeId}
    `;
    expect(rows).toHaveLength(1);
  });

  it('writes an audit entry with the before and after counts', async () => {
    await confirmAvailability(
      roomTypeId,
      { availableCount: 9, source: 'ops', confirmedByUserId: null },
      ACTOR,
    );

    const [entry] = await client<{ action: string; before: unknown; after: unknown }[]>`
      SELECT action, before, after FROM audit_log
      WHERE actor_label = ${ACTOR.label} AND entity_type = 'availability'
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(entry.action).toBe('update');
    expect(entry.after).toMatchObject({ availableCount: 9, source: 'ops' });
  });

  it('rejects a negative or fractional count', async () => {
    await expect(
      confirmAvailability(
        roomTypeId,
        { availableCount: -1, source: 'ops', confirmedByUserId: null },
        ACTOR,
      ),
    ).rejects.toThrow(/non-negative integer/);

    await expect(
      confirmAvailability(
        roomTypeId,
        { availableCount: 1.5, source: 'ops', confirmedByUserId: null },
        ACTOR,
      ),
    ).rejects.toThrow(/non-negative integer/);
  });
});

describe('transitionListing()', () => {
  it('rejects draft -> live, so nothing reaches residents unverified', async () => {
    await expect(transitionListing(draftPropertyId, 'live', ACTOR)).rejects.toThrow(
      IllegalTransitionError,
    );

    // And the state must be untouched by the rejected attempt.
    const [row] = await client<{ listing_state: string }[]>`
      SELECT listing_state FROM properties WHERE id = ${draftPropertyId}
    `;
    expect(row.listing_state).toBe('draft');
  });

  it('walks draft -> submitted -> in_verification -> live and stamps published_at', async () => {
    await transitionListing(draftPropertyId, 'submitted', ACTOR);
    await transitionListing(draftPropertyId, 'in_verification', ACTOR);
    await transitionListing(draftPropertyId, 'live', ACTOR);

    const [row] = await client<{ listing_state: string; published_at: Date | null }[]>`
      SELECT listing_state, published_at FROM properties WHERE id = ${draftPropertyId}
    `;
    expect(row.listing_state).toBe('live');
    expect(row.published_at).not.toBeNull();
  });

  it('audits each transition with its from and to states', async () => {
    const entries = await client<{ before: unknown; after: unknown }[]>`
      SELECT before, after FROM audit_log
      WHERE actor_label = ${ACTOR.label}
        AND entity_type = 'properties'
        AND action = 'state_transition'
      ORDER BY created_at ASC
    `;
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries[0].before).toMatchObject({ state: 'draft' });
    expect(entries[0].after).toMatchObject({ state: 'submitted' });
  });

  it('records a reason when one is given', async () => {
    await transitionListing(draftPropertyId, 'suspended', ACTOR, 'trust incident');
    const [entry] = await client<{ after: { reason?: string } }[]>`
      SELECT after FROM audit_log
      WHERE actor_label = ${ACTOR.label} AND action = 'state_transition'
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(entry.after.reason).toBe('trust incident');
  });

  it('refuses to un-suspend directly — re-verification is required', async () => {
    await expect(transitionListing(draftPropertyId, 'live', ACTOR)).rejects.toThrow(
      IllegalTransitionError,
    );
  });

  it('throws for an unknown property', async () => {
    await expect(
      transitionListing('00000000-0000-0000-0000-000000000000', 'submitted', ACTOR),
    ).rejects.toThrow(/not found/);
  });
});

describe('updateProperty()', () => {
  it('applies a patch and audits only the changed fields', async () => {
    await updateProperty(
      livePropertyId,
      { name: 'Service Live Property (renamed)', locality: 'Koramangala' },
      ACTOR,
    );

    const detail = await getPropertyDetail(livePropertyId);
    expect(detail!.property.name).toBe('Service Live Property (renamed)');

    const [entry] = await client<{ after: Record<string, unknown> }[]>`
      SELECT after FROM audit_log
      WHERE actor_label = ${ACTOR.label} AND action = 'update'
        AND entity_type = 'properties'
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(Object.keys(entry.after).sort()).toEqual(['locality', 'name']);
  });

  it('writes a lat/lng patch as a 4326 point in the right axis order', async () => {
    await updateProperty(
      livePropertyId,
      { location: { lat: 18.5204, lng: 73.8567 } },
      ACTOR,
    );

    const [row] = await client<{ srid: number; lat: number; lng: number }[]>`
      SELECT ST_SRID(location) AS srid,
             ST_Y(location)::float8 AS lat,
             ST_X(location)::float8 AS lng
      FROM properties WHERE id = ${livePropertyId}
    `;
    expect(row.srid).toBe(4326);
    expect(row.lat).toBeCloseTo(18.5204, 3);
    expect(row.lng).toBeCloseTo(73.8567, 3);
  });

  it('can clear the location, removing it from proximity search', async () => {
    await updateProperty(livePropertyId, { location: null }, ACTOR);
    const detail = await getPropertyDetail(livePropertyId);
    expect(detail!.property.location).toBeNull();
  });

  it('throws for an unknown property', async () => {
    await expect(
      updateProperty('00000000-0000-0000-0000-000000000000', { name: 'x' }, ACTOR),
    ).rejects.toThrow(/not found/);
  });
});

describe('supporting queries', () => {
  it('lists distinct cities', async () => {
    const cities = await listPropertyCities();
    expect(cities).toContain('Bengaluru');
    expect(new Set(cities).size).toBe(cities.length);
  });

  it('counts properties by listing state', async () => {
    const counts = await countPropertiesByState();
    expect(Object.values(counts).every((v) => typeof v === 'number')).toBe(true);
  });
});
