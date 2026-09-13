import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';

/**
 * Server-side analytics events (FR-08) — the source of truth for PRD §12 KPIs.
 *
 * GA4 sees page views; it cannot join a click to a booking that closed three
 * weeks later over the phone, which is the conversion this business runs on.
 * So every funnel step is recorded here, server-side, and the reports read from
 * this table. Tracking never throws: an analytics failure must not fail the
 * enquiry or booking it describes.
 */

export const EVENT_NAMES = [
  'lead.created',
  'lead.duplicate_merged',
  'lead.phone_verified',
  'lead.assigned',
  'lead.acknowledged',
  'lead.state_changed',
  'lead.sla_breached',
  'call.placed',
  'call.connected',
  'shortlist.shared',
  'shortlist.viewed',
  'booking.created',
  'booking.host_confirmed',
  'booking.payment_link_sent',
  'booking.confirmed',
  'booking.cancelled',
  'booking.moved_in',
  'payment.captured',
  'payment.refunded',
  'wishlist.added',
  'review.submitted',
  'ticket.opened',
  'host.signed_up',
  'listing.viewed',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export interface TrackInput {
  name: EventName;
  userId?: string | null;
  anonymousId?: string | null;
  leadId?: string | null;
  bookingId?: string | null;
  propertyId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  properties?: Record<string, unknown>;
}

export async function trackEvent(input: TrackInput): Promise<void> {
  try {
    await db.insert(events).values({
      name: input.name,
      userId: input.userId ?? null,
      anonymousId: input.anonymousId ?? null,
      leadId: input.leadId ?? null,
      bookingId: input.bookingId ?? null,
      propertyId: input.propertyId ?? null,
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,
      properties: input.properties ?? {},
    });
  } catch (error) {
    console.error('[events] failed to record', input.name, error);
  }
}
