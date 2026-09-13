import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { type AuditActor, audit } from '@/lib/audit';
import { can } from '@/lib/auth/permissions';
import type { AuthenticatedUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  bookings,
  properties,
  supportTickets,
  ticketMessages,
  users,
} from '@/lib/db/schema';
import { newReference } from '@/lib/ids';
import { sendNotification } from '@/lib/integrations/messaging';
import { absoluteUrl } from '@/lib/seo';

import { trackEvent } from './events';

/**
 * Support and safety (FR-25).
 *
 * Safety incidents are not ordinary tickets with a red label. They get a
 * fifteen-minute first-response target around the clock — not desk hours —
 * because the PRD positions safety for solo and female residents as the core
 * differentiator, and a safety report at 2am is exactly when it matters.
 */

export type TicketPriority = 'low' | 'normal' | 'high' | 'safety_critical';
export type TicketState =
  | 'open'
  | 'in_progress'
  | 'waiting_on_resident'
  | 'waiting_on_host'
  | 'resolved'
  | 'closed';

export const TICKET_CATEGORIES = [
  { value: 'safety', label: 'I feel unsafe / safety concern' },
  { value: 'booking', label: 'A booking or payment' },
  { value: 'property_issue', label: 'A problem at the property' },
  { value: 'refund', label: 'Refund or cancellation' },
  { value: 'account', label: 'My account or data' },
  { value: 'other', label: 'Something else' },
] as const;

const RESPONSE_MINUTES: Record<TicketPriority, number> = {
  safety_critical: 15,
  high: 60,
  normal: 240,
  low: 1440,
};

export function respondByFor(priority: TicketPriority, from = new Date()): Date {
  return new Date(from.getTime() + RESPONSE_MINUTES[priority] * 60_000);
}

export function priorityForCategory(category: string): TicketPriority {
  if (category === 'safety') return 'safety_critical';
  if (category === 'refund' || category === 'booking') return 'high';
  return 'normal';
}

export class TicketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TicketError';
  }
}

export async function openTicket(input: {
  subject: string;
  body: string;
  category: string;
  raisedByUserId?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  bookingId?: string | null;
  propertyId?: string | null;
  authorKind: 'resident' | 'host';
}): Promise<{ ticketId: string; reference: string; priority: TicketPriority }> {
  if (input.subject.trim().length < 3 || input.body.trim().length < 5) {
    throw new TicketError('Tell us a little more so we can help.');
  }
  const priority = priorityForCategory(input.category);
  const now = new Date();
  const reference = newReference('ticket');

  let propertyId = input.propertyId ?? null;
  if (input.bookingId && !propertyId) {
    const [booking] = await db
      .select({ propertyId: bookings.propertyId })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId));
    propertyId = booking?.propertyId ?? null;
  }

  const [ticket] = await db
    .insert(supportTickets)
    .values({
      reference,
      raisedByUserId: input.raisedByUserId ?? null,
      contactPhone: input.contactPhone ?? null,
      contactEmail: input.contactEmail ?? null,
      bookingId: input.bookingId ?? null,
      propertyId,
      subject: input.subject.trim().slice(0, 200),
      body: input.body.trim().slice(0, 5000),
      category: input.category,
      priority,
      state: 'open',
      respondBy: respondByFor(priority, now),
    })
    .returning({ id: supportTickets.id });

  await db.insert(ticketMessages).values({
    ticketId: ticket.id,
    authorUserId: input.raisedByUserId ?? null,
    authorKind: input.authorKind,
    body: input.body.trim().slice(0, 5000),
  });
  await trackEvent({
    name: 'ticket.opened',
    userId: input.raisedByUserId,
    properties: { category: input.category, priority },
  });
  return { ticketId: ticket.id, reference, priority };
}

export async function listTicketQueue(filters: {
  scope: 'open' | 'safety' | 'mine' | 'all';
  viewerId: string;
}) {
  const conditions = [];
  if (filters.scope === 'safety') {
    conditions.push(
      eq(supportTickets.priority, 'safety_critical'),
      inArray(supportTickets.state, [
        'open',
        'in_progress',
        'waiting_on_host',
        'waiting_on_resident',
      ]),
    );
  } else if (filters.scope === 'open') {
    conditions.push(
      inArray(supportTickets.state, [
        'open',
        'in_progress',
        'waiting_on_host',
        'waiting_on_resident',
      ]),
    );
  } else if (filters.scope === 'mine') {
    conditions.push(
      eq(supportTickets.assignedToUserId, filters.viewerId),
      inArray(supportTickets.state, [
        'open',
        'in_progress',
        'waiting_on_host',
        'waiting_on_resident',
      ]),
    );
  }

  return db
    .select({
      id: supportTickets.id,
      reference: supportTickets.reference,
      subject: supportTickets.subject,
      category: supportTickets.category,
      priority: supportTickets.priority,
      state: supportTickets.state,
      respondBy: supportTickets.respondBy,
      firstRespondedAt: supportTickets.firstRespondedAt,
      createdAt: supportTickets.createdAt,
      assignedToName: users.fullName,
      propertyName: properties.name,
    })
    .from(supportTickets)
    .leftJoin(users, eq(users.id, supportTickets.assignedToUserId))
    .leftJoin(properties, eq(properties.id, supportTickets.propertyId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      sql`(${supportTickets.priority} = 'safety_critical') desc`,
      sql`(${supportTickets.firstRespondedAt} IS NULL) desc`,
      asc(supportTickets.respondBy),
      desc(supportTickets.createdAt),
    )
    .limit(200);
}

export async function getTicket(
  ticketId: string,
  options: { includeInternal: boolean },
) {
  const [ticket] = await db
    .select({
      ticket: supportTickets,
      propertyName: properties.name,
      assignedToName: users.fullName,
    })
    .from(supportTickets)
    .leftJoin(properties, eq(properties.id, supportTickets.propertyId))
    .leftJoin(users, eq(users.id, supportTickets.assignedToUserId))
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (!ticket) return null;

  const messages = await db
    .select({
      id: ticketMessages.id,
      body: ticketMessages.body,
      authorKind: ticketMessages.authorKind,
      isInternal: ticketMessages.isInternal,
      createdAt: ticketMessages.createdAt,
      authorName: users.fullName,
    })
    .from(ticketMessages)
    .leftJoin(users, eq(users.id, ticketMessages.authorUserId))
    .where(
      options.includeInternal
        ? eq(ticketMessages.ticketId, ticketId)
        : and(
            eq(ticketMessages.ticketId, ticketId),
            eq(ticketMessages.isInternal, false),
          ),
    )
    .orderBy(asc(ticketMessages.createdAt));

  return { ...ticket, messages };
}

export async function replyToTicket(
  ticketId: string,
  input: { body: string; isInternal?: boolean; nextState?: TicketState },
  viewer: AuthenticatedUser,
  actor: AuditActor,
): Promise<void> {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId));
  if (!ticket) throw new TicketError('Ticket not found.');
  if (!can(viewer.roles, 'ticket:respond'))
    throw new TicketError('You cannot respond to tickets.');
  if (
    ticket.priority === 'safety_critical' &&
    !can(viewer.roles, 'ticket:handle_safety_incident')
  ) {
    throw new TicketError(
      'Safety incidents are handled by the trust and safety roles.',
    );
  }
  if (!input.body.trim()) throw new TicketError('Write a reply first.');

  const now = new Date();
  await db.insert(ticketMessages).values({
    ticketId,
    authorUserId: viewer.id,
    authorKind: 'staff',
    body: input.body.trim().slice(0, 5000),
    isInternal: input.isInternal ?? false,
  });

  const isPublicReply = !input.isInternal;
  const nextState =
    input.nextState ?? (ticket.state === 'open' ? 'in_progress' : ticket.state);
  await db
    .update(supportTickets)
    .set({
      state: nextState,
      assignedToUserId: ticket.assignedToUserId ?? viewer.id,
      firstRespondedAt: ticket.firstRespondedAt ?? (isPublicReply ? now : null),
      resolvedAt: nextState === 'resolved' ? now : ticket.resolvedAt,
      closedAt: nextState === 'closed' ? now : ticket.closedAt,
      updatedAt: now,
    })
    .where(eq(supportTickets.id, ticketId));

  if (isPublicReply) {
    const summary = input.body.trim().slice(0, 120);
    const vars = {
      reference: ticket.reference,
      summary,
      url: absoluteUrl('/account/support'),
    };
    if (ticket.contactPhone) {
      await sendNotification({
        templateKey: 'ticket.update',
        channel: 'sms',
        to: ticket.contactPhone,
        variables: vars,
        recipientUserId: ticket.raisedByUserId,
      });
    }
    if (ticket.contactEmail) {
      await sendNotification({
        templateKey: 'ticket.update',
        channel: 'email',
        to: ticket.contactEmail,
        variables: vars,
        recipientUserId: ticket.raisedByUserId,
      });
    }
  }

  await audit({
    actor,
    action: 'update',
    entityType: 'support_tickets',
    entityId: ticketId,
    before: { state: ticket.state },
    after: { state: nextState, internal: input.isInternal ?? false },
  });
}

/** Resident follow-up on their own ticket. */
export async function residentReply(
  ticketId: string,
  userId: string,
  body: string,
): Promise<void> {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(
      and(eq(supportTickets.id, ticketId), eq(supportTickets.raisedByUserId, userId)),
    );
  if (!ticket) throw new TicketError('Ticket not found.');
  if (!body.trim()) throw new TicketError('Write a message first.');
  await db.insert(ticketMessages).values({
    ticketId,
    authorUserId: userId,
    authorKind: 'resident',
    body: body.trim().slice(0, 5000),
  });
  await db
    .update(supportTickets)
    .set({
      state:
        ticket.state === 'waiting_on_resident' || ticket.state === 'resolved'
          ? 'open'
          : ticket.state,
      updatedAt: new Date(),
    })
    .where(eq(supportTickets.id, ticketId));
}

export async function listTicketsForUser(userId: string) {
  return db
    .select({
      id: supportTickets.id,
      reference: supportTickets.reference,
      subject: supportTickets.subject,
      state: supportTickets.state,
      priority: supportTickets.priority,
      createdAt: supportTickets.createdAt,
    })
    .from(supportTickets)
    .where(eq(supportTickets.raisedByUserId, userId))
    .orderBy(desc(supportTickets.createdAt));
}

export async function ticketCounts(now = new Date()) {
  const [row] = await db
    .select({
      open: sql<number>`count(*) FILTER (WHERE ${supportTickets.state} IN ('open','in_progress','waiting_on_host','waiting_on_resident'))::int`,
      safetyOpen: sql<number>`count(*) FILTER (WHERE ${supportTickets.priority} = 'safety_critical' AND ${supportTickets.state} IN ('open','in_progress','waiting_on_host','waiting_on_resident'))::int`,
      overdue: sql<number>`count(*) FILTER (WHERE ${supportTickets.firstRespondedAt} IS NULL AND ${supportTickets.respondBy} < ${now})::int`,
    })
    .from(supportTickets);
  return row;
}

export { isNull, lt, or };
