import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm';

import { type AuditActor, audit, auditTransition, diffFields } from '@/lib/audit';
import { db } from '@/lib/db';
import { availability, organizations, properties, roomTypes } from '@/lib/db/schema';
import {
  type ListingState,
  assertTransition,
  listingMachine,
} from '@/lib/state-machines';
import { slugify, uniqueSlug } from '@/lib/slug';
import { ageInDaysOrNull, isExpired, isoDate } from '@/lib/time';
import type { CreatePropertyInput } from '@/lib/validation/property';

/**
 * Property read and write operations for the ops console.
 *
 * Every mutation goes through here rather than touching `db` from a page, so
 * that three things cannot be forgotten: the listing state machine is enforced,
 * an audit entry is written, and `updatedAt` is set. A page that writes
 * directly gets none of those.
 */

export interface PropertyListFilters {
  city?: string;
  listingState?: ListingState | 'all';
  /** Matches name, slug or locality. */
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PropertyListRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  locality: string | null;
  propertyType: string;
  genderPolicy: string;
  listingState: string;
  verificationTier: string;
  organizationName: string;
  roomTypeCount: number;
  availableBeds: number;
  /** Null when no room type has ever had availability confirmed. */
  availabilityLastConfirmedAt: Date | null;
  /**
   * Derived server-side. Reading the clock during a component render is
   * impure, so age is computed here, once per request.
   */
  availabilityAgeDays: number | null;
  availabilityConfirmedOn: string | null;
  updatedAt: Date;
}

const DEFAULT_PAGE_SIZE = 25;

export async function listProperties(filters: PropertyListFilters = {}): Promise<{
  rows: PropertyListRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  const conditions = [isNull(properties.deletedAt)];

  if (filters.city && filters.city !== 'all') {
    conditions.push(eq(properties.city, filters.city));
  }
  if (filters.listingState && filters.listingState !== 'all') {
    conditions.push(eq(properties.listingState, filters.listingState));
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(properties.name, term),
        ilike(properties.slug, term),
        ilike(properties.locality, term),
      )!,
    );
  }

  const where = and(...conditions);

  // Aggregate room and bed counts in SQL. Doing it per row in JS would be one
  // query per property, which is how a 25-row list becomes 51 round trips.
  const rows = await db
    .select({
      id: properties.id,
      name: properties.name,
      slug: properties.slug,
      city: properties.city,
      locality: properties.locality,
      propertyType: properties.propertyType,
      genderPolicy: properties.genderPolicy,
      listingState: properties.listingState,
      verificationTier: properties.verificationTier,
      organizationName: organizations.name,
      roomTypeCount: sql<number>`count(distinct ${roomTypes.id})::int`,
      availableBeds: sql<number>`coalesce(sum(${availability.availableCount}), 0)::int`,
      availabilityLastConfirmedAt: sql<Date | null>`max(${availability.lastConfirmedAt})`,
      updatedAt: properties.updatedAt,
    })
    .from(properties)
    .innerJoin(organizations, eq(properties.organizationId, organizations.id))
    .leftJoin(
      roomTypes,
      and(eq(roomTypes.propertyId, properties.id), isNull(roomTypes.deletedAt)),
    )
    .leftJoin(availability, eq(availability.roomTypeId, roomTypes.id))
    .where(where)
    .groupBy(properties.id, organizations.name)
    .orderBy(desc(properties.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(properties)
    .where(where);

  // One clock read per request, shared across every row, so the whole page is
  // consistent and no component has to read the clock during render.
  const now = new Date();
  const decorated: PropertyListRow[] = rows.map((row) => ({
    ...row,
    availabilityAgeDays: ageInDaysOrNull(row.availabilityLastConfirmedAt, now),
    availabilityConfirmedOn: isoDate(row.availabilityLastConfirmedAt),
  }));

  return { rows: decorated, total: Number(total), page, pageSize };
}

export async function getPropertyDetail(id: string) {
  const rows = await db
    .select({
      property: properties,
      organizationName: organizations.name,
      organizationId: organizations.id,
    })
    .from(properties)
    .innerJoin(organizations, eq(properties.organizationId, organizations.id))
    .where(and(eq(properties.id, id), isNull(properties.deletedAt)))
    .limit(1);

  if (rows.length === 0) return null;

  const rooms = await db
    .select({
      roomType: roomTypes,
      availableCount: availability.availableCount,
      availabilitySource: availability.source,
      lastConfirmedAt: availability.lastConfirmedAt,
      availabilityNotes: availability.notes,
    })
    .from(roomTypes)
    .leftJoin(availability, eq(availability.roomTypeId, roomTypes.id))
    .where(and(eq(roomTypes.propertyId, id), isNull(roomTypes.deletedAt)))
    .orderBy(asc(roomTypes.occupancy));

  const now = new Date();

  return {
    ...rows[0],
    // Derived server-side for the same reason as the list: components must not
    // read the clock during render.
    verificationExpired: isExpired(rows[0].property.verificationExpiresAt, now),
    rooms: rooms.map((room) => ({
      ...room,
      availabilityAgeDays: ageInDaysOrNull(room.lastConfirmedAt, now),
      availabilityConfirmedOn: isoDate(room.lastConfirmedAt),
    })),
  };
}

/** Distinct cities with inventory, for the list filter. */
export async function listPropertyCities(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ city: properties.city })
    .from(properties)
    .where(isNull(properties.deletedAt))
    .orderBy(asc(properties.city));
  return rows.map((r) => r.city);
}

export async function countPropertiesByState(): Promise<Record<string, number>> {
  const rows = await db
    .select({ state: properties.listingState, value: count() })
    .from(properties)
    .where(isNull(properties.deletedAt))
    .groupBy(properties.listingState);
  return Object.fromEntries(rows.map((r) => [r.state, Number(r.value)]));
}

/**
 * Inventory whose availability has not been confirmed recently.
 *
 * This is the stale-inventory work queue, and in practice the largest recurring
 * ops cost: chasing operators to confirm a price or a bed count. Availability
 * is advisory, so age is the signal.
 */
export async function listStaleInventory(olderThanDays = 14) {
  const now = new Date();

  if (!Number.isInteger(olderThanDays) || olderThanDays < 0) {
    throw new Error('olderThanDays must be a non-negative integer');
  }

  /**
   * The cutoff is computed in SQL rather than passed as a JS `Date`.
   *
   * Interpolating a Date into a `sql` template sends it as
   * `Sat Aug 29 2026 12:03:51 GMT-0700 (Pacific Daylight Time)` — the result of
   * `Date.prototype.toString()` — which Postgres cannot parse, so the query
   * fails at runtime while typechecking perfectly. Using `now()` with an
   * interval also removes any clock skew between the app and the database.
   */
  const cutoff = sql`now() - make_interval(days => ${olderThanDays})`;

  const rows = await db
    .select({
      propertyId: properties.id,
      propertyName: properties.name,
      city: properties.city,
      listingState: properties.listingState,
      lastConfirmedAt: sql<Date | null>`max(${availability.lastConfirmedAt})`,
      source: sql<string | null>`min(${availability.source}::text)`,
    })
    .from(properties)
    .innerJoin(roomTypes, eq(roomTypes.propertyId, properties.id))
    .leftJoin(availability, eq(availability.roomTypeId, roomTypes.id))
    .where(
      and(
        isNull(properties.deletedAt),
        inArray(properties.listingState, ['live', 'paused']),
      ),
    )
    .groupBy(properties.id)
    .having(
      sql`max(${availability.lastConfirmedAt}) IS NULL OR max(${availability.lastConfirmedAt}) < ${cutoff}`,
    )
    .orderBy(sql`max(${availability.lastConfirmedAt}) asc nulls first`);

  return rows.map((row) => ({
    ...row,
    ageDays: ageInDaysOrNull(row.lastConfirmedAt, now),
    confirmedOn: isoDate(row.lastConfirmedAt),
  }));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a property together with its room types and initial availability.
 *
 * Wrapped in a transaction because a property with no room types is not a
 * listable thing: a partial insert would leave inventory that cannot be
 * verified or sold, and someone would have to find and finish it by hand.
 *
 * The slug is resolved inside the transaction against currently-taken values.
 * That still races two concurrent creates of the same name, which is why the
 * unique index on `properties.slug` is the real guarantee — the retry loop just
 * makes the common case pleasant.
 */
export async function createProperty(
  input: CreatePropertyInput,
  actor: AuditActor,
): Promise<{ id: string; slug: string }> {
  const desiredBase = input.slug ?? slugify(input.name);
  if (!desiredBase) {
    throw new Error(
      'Could not derive a URL slug from that name. Enter one explicitly — this ' +
        'happens when the name contains no Latin letters or digits.',
    );
  }

  const location =
    input.latitude !== undefined && input.longitude !== undefined
      ? { x: Number(input.longitude), y: Number(input.latitude) }
      : null;

  const created = await db.transaction(async (tx) => {
    // Only slugs sharing the base can collide, so this stays a narrow scan.
    const taken = await tx
      .select({ slug: properties.slug })
      .from(properties)
      .where(ilike(properties.slug, `${desiredBase}%`));

    const slug = uniqueSlug(
      desiredBase,
      taken.map((row) => row.slug),
    );

    const [property] = await tx
      .insert(properties)
      .values({
        organizationId: input.organizationId,
        name: input.name,
        slug,
        description: input.description ?? null,
        propertyType: input.propertyType,
        genderPolicy: input.genderPolicy,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        locality: input.locality ?? null,
        city: input.city,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
        country: 'IN',
        location,
        amenities: input.amenities,
        houseRules: input.houseRules,
        // Always starts as a draft. Nothing reaches residents without passing
        // verification, and the listing machine has no draft -> live edge.
        listingState: 'draft',
        lastReviewedAt: new Date(),
      })
      .returning({ id: properties.id, slug: properties.slug });

    for (const room of input.rooms) {
      const [roomRow] = await tx
        .insert(roomTypes)
        .values({
          propertyId: property.id,
          name: room.name,
          occupancy: room.occupancy,
          hasPrivateBathroom: room.hasPrivateBathroom,
          rentAmountMinor: room.rentAmountMinor!,
          rentCurrency: 'INR',
          depositAmountMinor: room.depositAmountMinor,
          depositCurrency: room.depositAmountMinor === null ? null : 'INR',
          minTenureMonths: room.minTenureMonths,
          amenities: [],
        })
        .returning({ id: roomTypes.id });

      // Seed availability at zero rather than leaving no row. "Never confirmed"
      // is the honest starting state and puts the property straight into the
      // ops queue to be confirmed with the operator.
      await tx.insert(availability).values({
        roomTypeId: roomRow.id,
        availableCount: 0,
        source: 'ops',
        confirmedBy: actor.id,
        lastConfirmedAt: new Date(),
        notes: 'Created in the ops console; bed count not yet confirmed.',
      });
    }

    return property;
  });

  await audit({
    actor,
    action: 'create',
    entityType: 'properties',
    entityId: created.id,
    after: {
      name: input.name,
      slug: created.slug,
      city: input.city,
      propertyType: input.propertyType,
      roomTypeCount: input.rooms.length,
      listingState: 'draft',
    },
  });

  return created;
}

/** Operators available to attach a property to, for the create form. */
export async function listOrganizationOptions(): Promise<
  { id: string; name: string }[]
> {
  return db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(and(isNull(organizations.deletedAt), isNull(organizations.suspendedAt)))
    .orderBy(asc(organizations.name));
}

export interface UpdatePropertyInput {
  name?: string;
  description?: string | null;
  addressLine1?: string;
  addressLine2?: string | null;
  locality?: string | null;
  city?: string;
  state?: string | null;
  postalCode?: string | null;
  genderPolicy?: 'any' | 'male_only' | 'female_only' | 'co_ed_segregated_floors';
  amenities?: string[];
  houseRules?: string[];
  /** Longitude/latitude. Written as a 4326 point; see src/lib/geo. */
  location?: { lat: number; lng: number } | null;
}

export async function updateProperty(
  id: string,
  input: UpdatePropertyInput,
  actor: AuditActor,
): Promise<void> {
  const [before] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);

  if (!before) {
    throw new Error(`Property ${id} not found`);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (key === 'location') {
      const point = value as { lat: number; lng: number } | null;
      patch.location = point ? { x: point.lng, y: point.lat } : null;
      continue;
    }
    patch[key] = value;
  }

  const [after] = await db
    .update(properties)
    .set(patch)
    .where(eq(properties.id, id))
    .returning();

  const changed = diffFields(
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
  );

  await audit({
    actor,
    action: 'update',
    entityType: 'properties',
    entityId: id,
    before: changed.before,
    after: changed.after,
  });
}

/**
 * Move a listing through its lifecycle.
 *
 * The transition is validated before the write, so an illegal move is rejected
 * rather than persisted and later discovered. `draft -> live` in particular is
 * not a legal transition: nothing reaches residents without passing
 * verification.
 */
export async function transitionListing(
  id: string,
  to: ListingState,
  actor: AuditActor,
  reason?: string,
): Promise<void> {
  const [current] = await db
    .select({ state: properties.listingState })
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);

  if (!current) {
    throw new Error(`Property ${id} not found`);
  }

  // Throws IllegalTransitionError with the allowed set named in the message.
  assertTransition(listingMachine, current.state, to);

  const patch: Record<string, unknown> = {
    listingState: to,
    updatedAt: new Date(),
  };
  if (to === 'live') {
    patch.publishedAt = new Date();
  }
  if (to === 'suspended') {
    patch.suspendedAt = new Date();
  }

  await db.update(properties).set(patch).where(eq(properties.id, id));

  await auditTransition({
    actor,
    entityType: 'properties',
    entityId: id,
    from: current.state,
    to,
    reason,
  });
}

/**
 * Record an availability count against a room type.
 *
 * `source` and `confirmedBy` are required rather than optional: a bed count
 * with no provenance is what makes a stale calendar indistinguishable from a
 * fresh one, and the whole advisory-availability design depends on knowing who
 * said what, when.
 */
export async function confirmAvailability(
  roomTypeId: string,
  input: {
    availableCount: number;
    source: 'host' | 'rm' | 'ops' | 'import';
    confirmedByUserId: string | null;
    availableFrom?: Date | null;
    notes?: string | null;
  },
  actor: AuditActor,
): Promise<void> {
  if (!Number.isInteger(input.availableCount) || input.availableCount < 0) {
    throw new Error('availableCount must be a non-negative integer');
  }

  const [before] = await db
    .select()
    .from(availability)
    .where(eq(availability.roomTypeId, roomTypeId))
    .limit(1);

  const now = new Date();

  await db
    .insert(availability)
    .values({
      roomTypeId,
      availableCount: input.availableCount,
      availableFrom: input.availableFrom ?? null,
      source: input.source,
      confirmedBy: input.confirmedByUserId,
      lastConfirmedAt: now,
      notes: input.notes ?? null,
    })
    .onConflictDoUpdate({
      target: availability.roomTypeId,
      set: {
        availableCount: input.availableCount,
        availableFrom: input.availableFrom ?? null,
        source: input.source,
        confirmedBy: input.confirmedByUserId,
        lastConfirmedAt: now,
        notes: input.notes ?? null,
        updatedAt: now,
      },
    });

  await audit({
    actor,
    action: before ? 'update' : 'create',
    entityType: 'availability',
    entityId: roomTypeId,
    before: before
      ? { availableCount: before.availableCount, source: before.source }
      : null,
    after: { availableCount: input.availableCount, source: input.source },
  });
}
