import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  availability,
  bookings,
  events,
  properties,
  roomTypes,
  shortlistItems,
} from '@/lib/db/schema';

/**
 * Read models for the host portal (FR-15, FR-17, Journey B step 6). Every query
 * takes the organization id explicitly, so a host can only ever read their own
 * organization's data.
 */

export class HostScopeError extends Error {
  constructor() {
    super('That does not belong to your organization.');
    this.name = 'HostScopeError';
  }
}

export async function assertPropertyInOrg(propertyId: string, organizationId: string) {
  const [row] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.id, propertyId),
        eq(properties.organizationId, organizationId),
        isNull(properties.deletedAt),
      ),
    );
  if (!row) throw new HostScopeError();
}

export async function assertRoomInOrg(roomTypeId: string, organizationId: string) {
  const [row] = await db
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .innerJoin(properties, eq(properties.id, roomTypes.propertyId))
    .where(
      and(eq(roomTypes.id, roomTypeId), eq(properties.organizationId, organizationId)),
    );
  if (!row) throw new HostScopeError();
}

export async function assertBookingInOrg(bookingId: string, organizationId: string) {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(eq(bookings.id, bookingId), eq(bookings.organizationId, organizationId)),
    );
  if (!row) throw new HostScopeError();
}

export async function listHostProperties(organizationId: string) {
  return db
    .select({
      id: properties.id,
      name: properties.name,
      slug: properties.slug,
      city: properties.city,
      locality: properties.locality,
      listingState: properties.listingState,
      verificationTier: properties.verificationTier,
      roomTypeCount: sql<number>`count(distinct ${roomTypes.id})::int`,
      bedsFree: sql<number>`coalesce(sum(${availability.availableCount}), 0)::int`,
      lastConfirmedAt: sql<Date | null>`max(${availability.lastConfirmedAt})`,
    })
    .from(properties)
    .leftJoin(
      roomTypes,
      and(eq(roomTypes.propertyId, properties.id), isNull(roomTypes.deletedAt)),
    )
    .leftJoin(availability, eq(availability.roomTypeId, roomTypes.id))
    .where(
      and(eq(properties.organizationId, organizationId), isNull(properties.deletedAt)),
    )
    .groupBy(properties.id)
    .orderBy(desc(properties.updatedAt));
}

/** Views, shortlist appearances and bookings per property over the last 30 days. */
export async function hostPerformance(organizationId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const owned = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(
      and(eq(properties.organizationId, organizationId), isNull(properties.deletedAt)),
    );
  const ids = owned.map((p) => p.id);
  if (ids.length === 0) return [];

  const [views, shortlisted, booked] = await Promise.all([
    db
      .select({ propertyId: events.propertyId, count: sql<number>`count(*)::int` })
      .from(events)
      .where(
        and(
          eq(events.name, 'listing.viewed'),
          inArray(events.propertyId, ids),
          gte(events.occurredAt, since),
        ),
      )
      .groupBy(events.propertyId),
    db
      .select({
        propertyId: shortlistItems.propertyId,
        count: sql<number>`count(*)::int`,
      })
      .from(shortlistItems)
      .where(
        and(
          inArray(shortlistItems.propertyId, ids),
          gte(shortlistItems.createdAt, since),
        ),
      )
      .groupBy(shortlistItems.propertyId),
    db
      .select({
        propertyId: bookings.propertyId,
        requests: sql<number>`count(*)::int`,
        confirmed: sql<number>`count(*) FILTER (WHERE ${bookings.state} IN ('confirmed','moved_in','completed'))::int`,
      })
      .from(bookings)
      .where(and(inArray(bookings.propertyId, ids), gte(bookings.createdAt, since)))
      .groupBy(bookings.propertyId),
  ]);

  return owned.map((p) => {
    const v = views.find((r) => r.propertyId === p.id)?.count ?? 0;
    const s = shortlisted.find((r) => r.propertyId === p.id)?.count ?? 0;
    const b = booked.find((r) => r.propertyId === p.id);
    return {
      propertyId: p.id,
      name: p.name,
      views: v,
      shortlisted: s,
      bookingRequests: b?.requests ?? 0,
      confirmed: b?.confirmed ?? 0,
      conversion: v > 0 ? (b?.confirmed ?? 0) / v : null,
    };
  });
}
