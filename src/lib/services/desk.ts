import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { availability, notifications, properties, roomTypes } from '@/lib/db/schema';

/**
 * Read models for the relationship-manager desk.
 */

/** Live rooms an RM can shortlist or book, nearest-to-requirement first. */
export async function bookableRooms(city: string | null) {
  return db
    .select({
      propertyId: properties.id,
      propertyName: properties.name,
      locality: properties.locality,
      city: properties.city,
      genderPolicy: properties.genderPolicy,
      verificationTier: properties.verificationTier,
      roomTypeId: roomTypes.id,
      roomName: roomTypes.name,
      occupancy: roomTypes.occupancy,
      rentAmountMinor: roomTypes.rentAmountMinor,
      depositAmountMinor: roomTypes.depositAmountMinor,
      minTenureMonths: roomTypes.minTenureMonths,
      bedsFree: availability.availableCount,
      lastConfirmedAt: availability.lastConfirmedAt,
    })
    .from(roomTypes)
    .innerJoin(properties, eq(properties.id, roomTypes.propertyId))
    .leftJoin(availability, eq(availability.roomTypeId, roomTypes.id))
    .where(
      and(
        eq(properties.listingState, 'live'),
        isNull(properties.deletedAt),
        eq(roomTypes.isActive, true),
        isNull(roomTypes.deletedAt),
        city ? sql`lower(${properties.city}) = lower(${city})` : undefined,
      ),
    )
    .orderBy(asc(properties.name), asc(roomTypes.rentAmountMinor))
    .limit(200);
}

/** Recent outbound messages, for the outbox screen. */
export async function recentNotifications(limit = 150) {
  return db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}
