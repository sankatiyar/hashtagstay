import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';

import { type AuditActor, audit } from '@/lib/audit';
import { db } from '@/lib/db';
import {
  bookings,
  leads,
  properties,
  reviews,
  users,
  wishlistItems,
} from '@/lib/db/schema';

import { trackEvent } from './events';

/**
 * Reviews (FR-27) and the resident wishlist (FR-04).
 *
 * A review can only come from a booking that reached move-in, one per booking,
 * and appears only after moderation. That is what separates a review from an
 * anonymous comment box: every published review is from someone we know
 * stayed there.
 */

export class ReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewError';
  }
}

async function residentOwnsBooking(
  bookingId: string,
  userId: string,
  phone: string | null,
) {
  const [row] = await db
    .select({ booking: bookings })
    .from(bookings)
    .leftJoin(leads, eq(leads.id, bookings.leadId))
    .where(
      and(
        eq(bookings.id, bookingId),
        phone
          ? or(eq(bookings.residentUserId, userId), eq(leads.contactPhone, phone))
          : eq(bookings.residentUserId, userId),
      ),
    )
    .limit(1);
  return row?.booking ?? null;
}

export async function reviewEligibility(
  bookingId: string,
  userId: string,
  phone: string | null,
) {
  const booking = await residentOwnsBooking(bookingId, userId, phone);
  if (!booking) return { eligible: false as const, reason: 'Booking not found.' };
  if (!['moved_in', 'completed'].includes(booking.state)) {
    return {
      eligible: false as const,
      reason: 'You can review a stay once you have moved in.',
    };
  }
  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.bookingId, bookingId));
  if (existing)
    return { eligible: false as const, reason: 'You have already reviewed this stay.' };
  return { eligible: true as const, booking };
}

export async function submitReview(input: {
  bookingId: string;
  userId: string;
  phone: string | null;
  rating: number;
  safetyRating?: number | null;
  title?: string | null;
  body: string;
}): Promise<string> {
  const check = await reviewEligibility(input.bookingId, input.userId, input.phone);
  if (!check.eligible) throw new ReviewError(check.reason);
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new ReviewError('Choose a rating from 1 to 5.');
  }
  if (
    input.safetyRating != null &&
    (input.safetyRating < 1 || input.safetyRating > 5)
  ) {
    throw new ReviewError('Choose a safety rating from 1 to 5.');
  }
  if (input.body.trim().length < 20) {
    throw new ReviewError(
      'Write at least a couple of sentences — it helps the next resident.',
    );
  }

  const [row] = await db
    .insert(reviews)
    .values({
      bookingId: input.bookingId,
      propertyId: check.booking.propertyId,
      residentUserId: input.userId,
      rating: input.rating,
      safetyRating: input.safetyRating ?? null,
      title: input.title?.trim().slice(0, 120) || null,
      body: input.body.trim().slice(0, 4000),
    })
    .returning({ id: reviews.id });

  await trackEvent({
    name: 'review.submitted',
    bookingId: input.bookingId,
    propertyId: check.booking.propertyId,
    userId: input.userId,
  });
  return row.id;
}

export async function moderateReview(
  reviewId: string,
  decision: 'published' | 'rejected',
  note: string | null,
  actor: AuditActor & { id: string },
): Promise<void> {
  const [before] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
  if (!before) throw new ReviewError('Review not found.');
  await db
    .update(reviews)
    .set({
      moderationState: decision,
      moderatedBy: actor.id,
      moderatedAt: new Date(),
      moderationNote: note,
      updatedAt: new Date(),
    })
    .where(eq(reviews.id, reviewId));
  await audit({
    actor,
    action: 'state_transition',
    entityType: 'reviews',
    entityId: reviewId,
    before: { state: before.moderationState },
    after: { state: decision, note },
  });
}

export async function listReviewsForModeration() {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      safetyRating: reviews.safetyRating,
      title: reviews.title,
      body: reviews.body,
      moderationState: reviews.moderationState,
      createdAt: reviews.createdAt,
      propertyName: properties.name,
      residentName: users.fullName,
    })
    .from(reviews)
    .innerJoin(properties, eq(properties.id, reviews.propertyId))
    .leftJoin(users, eq(users.id, reviews.residentUserId))
    .orderBy(
      sql`(${reviews.moderationState} = 'pending') desc`,
      desc(reviews.createdAt),
    )
    .limit(200);
}

export async function publishedReviews(propertyId: string) {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      safetyRating: reviews.safetyRating,
      title: reviews.title,
      body: reviews.body,
      createdAt: reviews.createdAt,
      residentName: users.fullName,
    })
    .from(reviews)
    .leftJoin(users, eq(users.id, reviews.residentUserId))
    .where(
      and(eq(reviews.propertyId, propertyId), eq(reviews.moderationState, 'published')),
    )
    .orderBy(desc(reviews.createdAt))
    .limit(50);

  const count = rows.length;
  const average = count ? rows.reduce((sum, r) => sum + r.rating, 0) / count : null;
  const safetyRows = rows.filter((r) => r.safetyRating !== null);
  const safetyAverage = safetyRows.length
    ? safetyRows.reduce((sum, r) => sum + (r.safetyRating ?? 0), 0) / safetyRows.length
    : null;
  return {
    reviews: rows.map((r) => ({
      ...r,
      residentName: r.residentName?.split(' ')[0] ?? 'Resident',
    })),
    count,
    average,
    safetyAverage,
  };
}

// --- Wishlist --------------------------------------------------------------

export async function toggleWishlist(
  userId: string,
  propertyId: string,
): Promise<boolean> {
  const [existing] = await db
    .select({ id: wishlistItems.id })
    .from(wishlistItems)
    .where(
      and(eq(wishlistItems.userId, userId), eq(wishlistItems.propertyId, propertyId)),
    );
  if (existing) {
    await db.delete(wishlistItems).where(eq(wishlistItems.id, existing.id));
    return false;
  }
  await db.insert(wishlistItems).values({ userId, propertyId }).onConflictDoNothing();
  await trackEvent({ name: 'wishlist.added', userId, propertyId });
  return true;
}

export async function wishlistPropertyIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ propertyId: wishlistItems.propertyId })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId));
  return new Set(rows.map((r) => r.propertyId));
}

export async function listWishlist(userId: string) {
  return db
    .select({
      propertyId: properties.id,
      name: properties.name,
      slug: properties.slug,
      city: properties.city,
      locality: properties.locality,
      listingState: properties.listingState,
      savedAt: wishlistItems.createdAt,
    })
    .from(wishlistItems)
    .innerJoin(properties, eq(properties.id, wishlistItems.propertyId))
    .where(eq(wishlistItems.userId, userId))
    .orderBy(desc(wishlistItems.createdAt));
}

export { inArray };
