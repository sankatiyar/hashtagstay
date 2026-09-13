import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { type AuditActor, audit } from '@/lib/audit';
import type { AuthenticatedUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  leadActivities,
  leads,
  media,
  properties,
  roomTypes,
  shortlistItems,
  shortlists,
  users,
} from '@/lib/db/schema';
import { newPublicToken } from '@/lib/ids';
import { phoneChannel, sendNotification } from '@/lib/integrations/messaging';
import { absoluteUrl } from '@/lib/seo';
import { assertTransition, canTransition, leadMachine } from '@/lib/state-machines';
import { isoDate } from '@/lib/time';

import { trackEvent } from './events';
import { LeadError, canViewLead } from './leads';

/**
 * Shortlists (PRD Journey A step 5; FR-14): the RM's curated two or three
 * options, sent to the resident as a link.
 *
 * Prices are snapshotted when the shortlist is built. If an operator changes
 * rent afterwards, the resident still sees what they were quoted, and the desk
 * can see that the quote has gone stale rather than silently honouring or
 * withdrawing it.
 */

const LINK_VALID_DAYS = 7;
const MAX_ITEMS = 5;

export async function createShortlist(
  leadId: string,
  input: {
    items: { propertyId: string; roomTypeId: string | null; rmNote?: string | null }[];
    message?: string | null;
  },
  viewer: AuthenticatedUser,
  actor: AuditActor,
): Promise<{ shortlistId: string; publicToken: string }> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) throw new LeadError('Lead not found.');
  if (!canViewLead(viewer, lead))
    throw new LeadError('This lead is not assigned to you.');

  const unique = input.items.filter(
    (item, index, all) =>
      all.findIndex(
        (x) => x.propertyId === item.propertyId && x.roomTypeId === item.roomTypeId,
      ) === index,
  );
  if (unique.length === 0)
    throw new LeadError('Add at least one stay to the shortlist.');
  if (unique.length > MAX_ITEMS) {
    throw new LeadError(
      `Keep a shortlist to ${MAX_ITEMS} stays or fewer — a long list is not curation.`,
    );
  }

  const propertyRows = await db
    .select({
      id: properties.id,
      state: properties.listingState,
      name: properties.name,
    })
    .from(properties)
    .where(
      inArray(
        properties.id,
        unique.map((i) => i.propertyId),
      ),
    );
  for (const item of unique) {
    const property = propertyRows.find((p) => p.id === item.propertyId);
    if (!property) throw new LeadError('One of the stays no longer exists.');
    if (property.state !== 'live') {
      throw new LeadError(
        `${property.name} is not live, so it cannot be offered to a resident.`,
      );
    }
  }

  const roomIds = unique
    .map((i) => i.roomTypeId)
    .filter((id): id is string => Boolean(id));
  const roomRows = roomIds.length
    ? await db.select().from(roomTypes).where(inArray(roomTypes.id, roomIds))
    : [];

  const cheapestByProperty = await db
    .select({
      propertyId: roomTypes.propertyId,
      rent: sql<number>`min(${roomTypes.rentAmountMinor})::int`,
    })
    .from(roomTypes)
    .where(
      and(
        inArray(
          roomTypes.propertyId,
          unique.map((i) => i.propertyId),
        ),
        eq(roomTypes.isActive, true),
        isNull(roomTypes.deletedAt),
      ),
    )
    .groupBy(roomTypes.propertyId);

  const publicToken = newPublicToken();
  const expiresAt = new Date(Date.now() + LINK_VALID_DAYS * 86_400_000);

  const shortlistId = await db.transaction(async (tx) => {
    const [shortlist] = await tx
      .insert(shortlists)
      .values({
        leadId,
        createdByUserId: viewer.id,
        publicToken,
        expiresAt,
        message: input.message?.trim() || null,
      })
      .returning({ id: shortlists.id });

    for (const [index, item] of unique.entries()) {
      const room = roomRows.find((r) => r.id === item.roomTypeId);
      if (item.roomTypeId && (!room || room.propertyId !== item.propertyId)) {
        throw new LeadError('A selected room does not belong to its property.');
      }
      const rent =
        room?.rentAmountMinor ??
        cheapestByProperty.find((c) => c.propertyId === item.propertyId)?.rent ??
        null;
      await tx.insert(shortlistItems).values({
        shortlistId: shortlist.id,
        propertyId: item.propertyId,
        roomTypeId: item.roomTypeId,
        sortOrder: index,
        rmNote: item.rmNote?.trim() || null,
        quotedRentAmountMinor: rent,
        quotedRentCurrency: rent === null ? null : 'INR',
        quotedDepositAmountMinor: room?.depositAmountMinor ?? null,
        quotedDepositCurrency: room?.depositAmountMinor ? 'INR' : null,
      });
    }
    return shortlist.id;
  });

  await db.insert(leadActivities).values({
    leadId,
    actorUserId: viewer.id,
    kind: 'shortlist_created',
    body: `Shortlist of ${unique.length} ${unique.length === 1 ? 'stay' : 'stays'} built`,
    detail: { shortlistId },
  });
  await audit({
    actor,
    action: 'create',
    entityType: 'shortlists',
    entityId: shortlistId,
    after: { leadId, items: unique.length },
  });

  return { shortlistId, publicToken };
}

export async function shareShortlist(
  shortlistId: string,
  viewer: AuthenticatedUser,
  actor: AuditActor,
): Promise<{ url: string; delivery: string }> {
  const [row] = await db
    .select({ shortlist: shortlists, lead: leads })
    .from(shortlists)
    .innerJoin(leads, eq(leads.id, shortlists.leadId))
    .where(eq(shortlists.id, shortlistId))
    .limit(1);
  if (!row) throw new LeadError('Shortlist not found.');
  if (!canViewLead(viewer, row.lead))
    throw new LeadError('This lead is not assigned to you.');

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(shortlistItems)
    .where(eq(shortlistItems.shortlistId, shortlistId));

  const url = absoluteUrl(`/s/${row.shortlist.publicToken}`);
  const [rm] = await db
    .select({ name: users.fullName })
    .from(users)
    .where(eq(users.id, viewer.id));

  const sent = await sendNotification({
    templateKey: 'shortlist.shared',
    channel: phoneChannel(),
    to: row.lead.guardianPhone ?? row.lead.contactPhone,
    variables: {
      name: row.lead.contactName?.split(' ')[0] ?? 'there',
      rm_name: rm?.name?.split(' ')[0] ?? 'Your relationship manager',
      count,
      url,
      expires: isoDate(row.shortlist.expiresAt) ?? 'soon',
    },
    leadId: row.lead.id,
    recipientUserId: row.lead.userId,
  });

  const now = new Date();
  await db
    .update(shortlists)
    .set({ sharedAt: row.shortlist.sharedAt ?? now, updatedAt: now })
    .where(eq(shortlists.id, shortlistId));

  // Sending a shortlist straight after the discovery call qualifies the lead
  // implicitly. Without walking through `qualified`, the lead stalls in
  // `contacting`, never reaches `won`, and the §12 funnel undercounts.
  const path =
    row.lead.state === 'contacting'
      ? (['qualified', 'shortlist_shared'] as const)
      : (['shortlist_shared'] as const);
  let from = row.lead.state;
  const walkable = path.every((next) => {
    const ok = canTransition(leadMachine, from, next);
    from = next;
    return ok;
  });
  if (walkable) {
    assertTransition(
      leadMachine,
      path.length === 2 ? 'qualified' : row.lead.state,
      'shortlist_shared',
    );
    await db
      .update(leads)
      .set({ state: 'shortlist_shared', updatedAt: now })
      .where(eq(leads.id, row.lead.id));
  }

  await db.insert(leadActivities).values({
    leadId: row.lead.id,
    actorUserId: viewer.id,
    kind: 'shortlist_shared',
    body: `Shortlist sent (${sent.state})`,
    detail: { shortlistId, notificationId: sent.notificationId, url },
  });
  await audit({
    actor,
    action: 'update',
    entityType: 'shortlists',
    entityId: shortlistId,
    after: { shared: true, delivery: sent.state },
  });
  await trackEvent({
    name: 'shortlist.shared',
    leadId: row.lead.id,
    properties: { count },
  });

  return { url, delivery: sent.state };
}

/** Public shortlist page data. Expired links return `expired`, unknown ones null. */
export async function getPublicShortlist(token: string) {
  const [row] = await db
    .select({
      shortlist: shortlists,
      contactName: leads.contactName,
      leadId: leads.id,
      rmName: users.fullName,
    })
    .from(shortlists)
    .innerJoin(leads, eq(leads.id, shortlists.leadId))
    .leftJoin(users, eq(users.id, shortlists.createdByUserId))
    .where(eq(shortlists.publicToken, token))
    .limit(1);

  if (!row) return null;
  if (row.shortlist.expiresAt && row.shortlist.expiresAt.getTime() < Date.now()) {
    return { expired: true as const, rmName: row.rmName };
  }

  const items = await db
    .select({
      id: shortlistItems.id,
      rmNote: shortlistItems.rmNote,
      residentInterest: shortlistItems.residentInterest,
      quotedRentAmountMinor: shortlistItems.quotedRentAmountMinor,
      quotedDepositAmountMinor: shortlistItems.quotedDepositAmountMinor,
      propertyName: properties.name,
      propertySlug: properties.slug,
      propertyState: properties.listingState,
      locality: properties.locality,
      city: properties.city,
      verificationTier: properties.verificationTier,
      genderPolicy: properties.genderPolicy,
      propertyType: properties.propertyType,
      amenities: properties.amenities,
      roomName: roomTypes.name,
      occupancy: roomTypes.occupancy,
      currentRentAmountMinor: roomTypes.rentAmountMinor,
      coverPath: sql<string | null>`(
        SELECT ${media.storagePath} FROM ${media}
        WHERE ${media.propertyId} = ${properties.id}
          AND ${media.moderationState} = 'approved' AND ${media.deletedAt} IS NULL
        ORDER BY ${media.sortOrder} ASC LIMIT 1
      )`,
    })
    .from(shortlistItems)
    .innerJoin(properties, eq(properties.id, shortlistItems.propertyId))
    .leftJoin(roomTypes, eq(roomTypes.id, shortlistItems.roomTypeId))
    .where(eq(shortlistItems.shortlistId, row.shortlist.id))
    .orderBy(asc(shortlistItems.sortOrder));

  return { expired: false as const, ...row, items };
}

/** Record a view. The first view is an event; repeat views only count. */
export async function recordShortlistView(token: string): Promise<void> {
  const [row] = await db
    .select({
      id: shortlists.id,
      leadId: shortlists.leadId,
      firstViewedAt: shortlists.firstViewedAt,
    })
    .from(shortlists)
    .where(eq(shortlists.publicToken, token))
    .limit(1);
  if (!row) return;

  await db
    .update(shortlists)
    .set({
      viewCount: sql`${shortlists.viewCount} + 1`,
      firstViewedAt: row.firstViewedAt ?? new Date(),
    })
    .where(eq(shortlists.id, row.id));

  if (!row.firstViewedAt) {
    await db.insert(leadActivities).values({
      leadId: row.leadId,
      kind: 'shortlist_viewed',
      body: 'Resident opened the shortlist',
      detail: { shortlistId: row.id },
    });
    await trackEvent({ name: 'shortlist.viewed', leadId: row.leadId });
  }
}

/** Resident reaction to an item ("interested" / "not for me"), shown to the RM. */
export async function recordShortlistInterest(
  token: string,
  itemId: string,
  interest: 'interested' | 'not_interested',
): Promise<boolean> {
  const [row] = await db
    .select({
      shortlistId: shortlists.id,
      leadId: shortlists.leadId,
      expiresAt: shortlists.expiresAt,
    })
    .from(shortlists)
    .where(eq(shortlists.publicToken, token))
    .limit(1);
  if (!row || (row.expiresAt && row.expiresAt.getTime() < Date.now())) return false;

  const updated = await db
    .update(shortlistItems)
    .set({ residentInterest: interest, updatedAt: new Date() })
    .where(
      and(
        eq(shortlistItems.id, itemId),
        eq(shortlistItems.shortlistId, row.shortlistId),
      ),
    )
    .returning({ id: shortlistItems.id });
  if (updated.length === 0) return false;

  await db.insert(leadActivities).values({
    leadId: row.leadId,
    kind: 'shortlist_interest',
    body:
      interest === 'interested'
        ? 'Resident marked a stay as interested'
        : 'Resident passed on a stay',
    detail: { itemId, interest },
  });
  return true;
}
