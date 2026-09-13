import { and, desc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm';

import { type AuditActor, audit, auditTransition } from '@/lib/audit';
import { can } from '@/lib/auth/permissions';
import type { AuthenticatedUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  bookings,
  feeRules,
  leadActivities,
  leads,
  organizations,
  payments,
  properties,
  roomTypes,
  taxDocuments,
  users,
} from '@/lib/db/schema';
import {
  type CancelReason,
  type FeeKind,
  type FeeRule,
  computeFee,
  facilitationFeeRefund,
  gstBreakdown,
  selectRule,
  stateCodeFor,
} from '@/lib/fees';
import { newPublicToken, newReference } from '@/lib/ids';
import { phoneChannel, sendNotification } from '@/lib/integrations/messaging';
import { createPaymentLink, refundPayment } from '@/lib/integrations/payments';
import { format, money } from '@/lib/money';
import { absoluteUrl } from '@/lib/seo';
import {
  BOOKING_STATES_ALLOWING_PAYMENT,
  type BookingState,
  assertTransition,
  bookingMachine,
  canTransition,
  leadMachine,
} from '@/lib/state-machines';
import { isoDate } from '@/lib/time';

import { trackEvent } from './events';
import { issueTaxDocument, issuerDetails } from './invoices';
import { LeadError, canViewLead } from './leads';

/**
 * Bookings, fees and payments (FR-20 to FR-23; Journey A steps 7–8).
 *
 * The sequence is fixed by the booking machine and cannot be skipped:
 *
 *   initiated → pending_host_confirmation → fee_pending → confirmed → moved_in → completed
 *
 * The resident is never charged before the operator has confirmed the bed.
 * Availability is advisory, and charging first is how an aggregator sells a
 * room that is already occupied.
 *
 * Only HashtagStay's facilitation fee is collected. Rent and deposit are paid
 * to the operator directly, as the booking records.
 */

export class BookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingError';
  }
}

const PAYMENT_LINK_VALID_HOURS = 48;

async function loadRules(kind: FeeKind): Promise<FeeRule[]> {
  const rows = await db.select().from(feeRules).where(eq(feeRules.kind, kind));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    basis: r.basis,
    flatAmountMinor: r.flatAmountMinor,
    rateBps: r.rateBps,
    minAmountMinor: r.minAmountMinor,
    maxAmountMinor: r.maxAmountMinor,
    propertyType: r.propertyType,
    city: r.city,
    organizationId: r.organizationId,
    priority: r.priority,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    taxRateBps: r.taxRateBps,
  }));
}

/** Quote both fees for a prospective booking, without writing anything. */
export async function quoteFees(params: {
  propertyType: string;
  city: string;
  organizationId: string;
  commissionRateBps: number | null;
  monthlyRentMinor: number;
  tenureMonths: number;
  at?: Date;
}) {
  const at = params.at ?? new Date();
  const [facilitationRules, commissionRules] = await Promise.all([
    loadRules('facilitation_fee'),
    loadRules('renting_commission'),
  ]);
  const context = {
    propertyType: params.propertyType,
    city: params.city,
    organizationId: params.organizationId,
    at,
  };
  const facilitation = selectRule(facilitationRules, {
    ...context,
    kind: 'facilitation_fee',
  });
  const commission = selectRule(commissionRules, {
    ...context,
    kind: 'renting_commission',
  });
  if (!facilitation) {
    throw new BookingError(
      'No facilitation fee rule applies. Set one up in Fee rules first.',
    );
  }

  const bookingShape = {
    monthlyRentMinor: params.monthlyRentMinor,
    tenureMonths: params.tenureMonths,
  };
  return {
    facilitation: {
      rule: facilitation,
      amountMinor: computeFee(facilitation, bookingShape),
      taxRateBps: facilitation.taxRateBps ?? 1800,
    },
    commission: commission
      ? {
          rule: commission,
          amountMinor: computeFee(commission, bookingShape, params.commissionRateBps),
          taxRateBps: commission.taxRateBps ?? 1800,
        }
      : null,
  };
}

async function loadBookingContext(bookingId: string) {
  const [row] = await db
    .select({
      booking: bookings,
      lead: leads,
      property: properties,
      room: roomTypes,
      organization: organizations,
      rmName: users.fullName,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .innerJoin(organizations, eq(organizations.id, bookings.organizationId))
    .leftJoin(leads, eq(leads.id, bookings.leadId))
    .leftJoin(roomTypes, eq(roomTypes.id, bookings.roomTypeId))
    .leftJoin(users, eq(users.id, bookings.closedByUserId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) throw new BookingError('Booking not found.');
  return row;
}

function assertDeskAccess(
  viewer: Pick<AuthenticatedUser, 'id' | 'roles'> | null,
  lead: { assignedToUserId: string | null } | null,
) {
  if (!viewer) return;
  if (can(viewer.roles, 'lead:view_all')) return;
  if (lead && canViewLead(viewer, lead)) return;
  throw new BookingError('This booking belongs to a lead that is not assigned to you.');
}

async function moveBooking(
  bookingId: string,
  from: BookingState,
  to: BookingState,
  set: Record<string, unknown>,
  actor: AuditActor,
  reason?: string | null,
) {
  assertTransition(bookingMachine, from, to);
  const updated = await db
    .update(bookings)
    .set({ ...set, state: to, updatedAt: new Date() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.state, from)))
    .returning({ id: bookings.id });
  if (updated.length === 0) {
    // Someone else moved it first — a double click or a racing webhook.
    throw new BookingError(
      'This booking changed in the meantime. Refresh and try again.',
    );
  }
  await auditTransition({
    actor,
    entityType: 'bookings',
    entityId: bookingId,
    from,
    to,
    reason,
  });
}

async function nudgeLead(
  leadId: string | null,
  to: 'booking_initiated' | 'won' | 'negotiating',
  actor: AuditActor,
) {
  if (!leadId) return;
  const [lead] = await db
    .select({ state: leads.state })
    .from(leads)
    .where(eq(leads.id, leadId));
  if (!lead) return;
  const path =
    to === 'booking_initiated' &&
    !canTransition(leadMachine, lead.state, to) &&
    canTransition(leadMachine, lead.state, 'negotiating')
      ? (['negotiating', to] as const)
      : ([to] as const);

  let from = lead.state;
  for (const next of path) {
    if (!canTransition(leadMachine, from, next)) return;
    from = next;
  }
  await db
    .update(leads)
    .set({ state: to, updatedAt: new Date() })
    .where(eq(leads.id, leadId));
  await db.insert(leadActivities).values({
    leadId,
    actorUserId: actor.id,
    kind: 'state_change',
    detail: { from: lead.state, to, automatic: true },
  });
}

// ---------------------------------------------------------------------------

export async function createBooking(
  leadId: string,
  input: {
    propertyId: string;
    roomTypeId: string;
    moveInDate: Date;
    tenureMonths: number;
    monthlyRentRupees?: number | null;
    depositRupees?: number | null;
  },
  viewer: AuthenticatedUser,
  actor: AuditActor,
): Promise<{ bookingId: string; reference: string }> {
  if (!can(viewer.roles, 'booking:create'))
    throw new BookingError('You cannot create bookings.');
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) throw new LeadError('Lead not found.');
  assertDeskAccess(viewer, lead);
  if (['won', 'lost', 'disqualified'].includes(lead.state)) {
    throw new BookingError('This lead is closed. Reopen it before booking.');
  }

  const [target] = await db
    .select({ property: properties, room: roomTypes, organization: organizations })
    .from(roomTypes)
    .innerJoin(properties, eq(properties.id, roomTypes.propertyId))
    .innerJoin(organizations, eq(organizations.id, properties.organizationId))
    .where(and(eq(roomTypes.id, input.roomTypeId), eq(properties.id, input.propertyId)))
    .limit(1);
  if (!target) throw new BookingError('That room does not belong to that property.');
  if (target.property.listingState !== 'live') {
    throw new BookingError('Only live listings can be booked.');
  }
  if (
    !Number.isInteger(input.tenureMonths) ||
    input.tenureMonths < target.room.minTenureMonths
  ) {
    throw new BookingError(
      `The operator’s minimum stay for this room is ${target.room.minTenureMonths} months.`,
    );
  }
  if (input.moveInDate.getTime() < Date.now() - 86_400_000) {
    throw new BookingError('Move-in cannot be in the past.');
  }

  // The agreed rent can differ from the listed rent after negotiation.
  const monthlyRentMinor = input.monthlyRentRupees
    ? Math.round(input.monthlyRentRupees * 100)
    : target.room.rentAmountMinor;
  const depositMinor =
    input.depositRupees !== undefined && input.depositRupees !== null
      ? Math.round(input.depositRupees * 100)
      : target.room.depositAmountMinor;

  const quote = await quoteFees({
    propertyType: target.property.propertyType,
    city: target.property.city,
    organizationId: target.organization.id,
    commissionRateBps: target.organization.commissionRateBps,
    monthlyRentMinor,
    tenureMonths: input.tenureMonths,
  });

  const reference = newReference('booking');
  const [booking] = await db
    .insert(bookings)
    .values({
      reference,
      leadId,
      residentUserId: lead.userId,
      propertyId: target.property.id,
      roomTypeId: target.room.id,
      organizationId: target.organization.id,
      closedByUserId: viewer.id,
      state: 'initiated',
      moveInDate: input.moveInDate,
      tenureMonths: input.tenureMonths,
      monthlyRentAmountMinor: monthlyRentMinor,
      monthlyRentCurrency: 'INR',
      depositAmountMinor: depositMinor,
      depositCurrency: depositMinor === null ? null : 'INR',
      grossValueAmountMinor: monthlyRentMinor * input.tenureMonths,
      grossValueCurrency: 'INR',
      // Snapshotted: editing a fee rule later never rewrites this booking.
      facilitationFeeAmountMinor: quote.facilitation.amountMinor,
      facilitationFeeCurrency: 'INR',
      facilitationFeeRuleId: quote.facilitation.rule.id,
      hostCommissionAmountMinor: quote.commission?.amountMinor ?? null,
      hostCommissionCurrency: quote.commission ? 'INR' : null,
      hostCommissionRuleId: quote.commission?.rule.id ?? null,
    })
    .returning({ id: bookings.id });

  await nudgeLead(leadId, 'booking_initiated', actor);
  await db.insert(leadActivities).values({
    leadId,
    actorUserId: viewer.id,
    kind: 'booking_created',
    body: `Booking ${reference} started for ${target.property.name}`,
    detail: { bookingId: booking.id },
  });
  await audit({
    actor,
    action: 'create',
    entityType: 'bookings',
    entityId: booking.id,
    after: {
      reference,
      propertyId: target.property.id,
      monthlyRentMinor,
      facilitationFeeMinor: quote.facilitation.amountMinor,
      hostCommissionMinor: quote.commission?.amountMinor ?? null,
    },
  });
  await trackEvent({
    name: 'booking.created',
    bookingId: booking.id,
    leadId,
    propertyId: target.property.id,
    userId: viewer.id,
  });

  return { bookingId: booking.id, reference };
}

/** Ask the operator to confirm the bed is genuinely free. */
export async function requestHostConfirmation(
  bookingId: string,
  viewer: AuthenticatedUser,
  actor: AuditActor,
): Promise<void> {
  const ctx = await loadBookingContext(bookingId);
  assertDeskAccess(viewer, ctx.lead);
  const now = new Date();
  await moveBooking(
    bookingId,
    ctx.booking.state,
    'pending_host_confirmation',
    {
      hostConfirmationRequestedAt: now,
    },
    actor,
  );

  const variables = {
    reference: ctx.booking.reference,
    property: ctx.property.name,
    room: ctx.room?.name ?? 'Room',
    move_in: isoDate(ctx.booking.moveInDate) ?? '',
    tenure: ctx.booking.tenureMonths,
    url: absoluteUrl(`/host/bookings/${bookingId}`),
  };
  if (ctx.organization.contactPhone) {
    await sendNotification({
      templateKey: 'booking.host_confirmation_request',
      channel: 'sms',
      to: ctx.organization.contactPhone,
      variables,
      bookingId,
    });
  }
  if (ctx.organization.contactEmail) {
    await sendNotification({
      templateKey: 'booking.host_confirmation_request',
      channel: 'email',
      to: ctx.organization.contactEmail,
      variables,
      bookingId,
    });
  }
}

/**
 * Record the operator's confirmation. Either the host clicks it in the portal,
 * or an RM records it after confirming on a call — both are real sources, and
 * which one is kept in the audit trail.
 */
export async function confirmHostAvailability(
  bookingId: string,
  params: { confirmedByUserId: string; via: 'host_portal' | 'rm_call' },
  actor: AuditActor,
): Promise<void> {
  const ctx = await loadBookingContext(bookingId);
  await moveBooking(
    bookingId,
    ctx.booking.state,
    'fee_pending',
    { hostConfirmedAt: new Date(), hostConfirmedByUserId: params.confirmedByUserId },
    actor,
    `Host confirmed via ${params.via}`,
  );
  if (ctx.lead) {
    await db.insert(leadActivities).values({
      leadId: ctx.lead.id,
      actorUserId: params.confirmedByUserId,
      kind: 'host_confirmed',
      body: `${ctx.property.name} confirmed the bed (${params.via.replace('_', ' ')})`,
      detail: { bookingId },
    });
  }
  await trackEvent({
    name: 'booking.host_confirmed',
    bookingId,
    properties: { via: params.via },
  });
}

/** Operator says the bed is not available after all. */
export async function declineHostAvailability(
  bookingId: string,
  params: { byUserId: string; note?: string | null },
  actor: AuditActor,
): Promise<void> {
  const ctx = await loadBookingContext(bookingId);
  await moveBooking(
    bookingId,
    ctx.booking.state,
    'cancelled',
    {
      cancelReason: 'host_unavailable',
      cancelledAt: new Date(),
    },
    actor,
    params.note ?? 'Host unavailable',
  );
  await nudgeLead(ctx.lead?.id ?? null, 'negotiating', actor);
  if (ctx.lead) {
    await db.insert(leadActivities).values({
      leadId: ctx.lead.id,
      actorUserId: params.byUserId,
      kind: 'host_declined',
      body: `${ctx.property.name} could not confirm the bed. ${params.note ?? ''}`.trim(),
      detail: { bookingId },
    });
  }
  await trackEvent({
    name: 'booking.cancelled',
    bookingId,
    properties: { reason: 'host_unavailable' },
  });
}

/** Create (or reuse) the fee payment and send the link (FR-14, FR-20). */
export async function sendPaymentLink(
  bookingId: string,
  viewer: AuthenticatedUser,
  actor: AuditActor,
): Promise<{ url: string; delivery: string }> {
  if (!can(viewer.roles, 'payment:create_link')) {
    throw new BookingError('You cannot send payment links.');
  }
  const ctx = await loadBookingContext(bookingId);
  assertDeskAccess(viewer, ctx.lead);
  if (!BOOKING_STATES_ALLOWING_PAYMENT.includes(ctx.booking.state)) {
    throw new BookingError(
      ctx.booking.state === 'pending_host_confirmation' ||
        ctx.booking.state === 'initiated'
        ? 'The operator has not confirmed the bed yet. A resident is never charged before that.'
        : 'This booking is not awaiting payment.',
    );
  }
  if (!ctx.lead) throw new BookingError('This booking has no resident contact.');

  const taxable = ctx.booking.facilitationFeeAmountMinor ?? 0;
  const [rule] = ctx.booking.facilitationFeeRuleId
    ? await db
        .select()
        .from(feeRules)
        .where(eq(feeRules.id, ctx.booking.facilitationFeeRuleId))
    : [];
  const placeOfSupply = stateCodeFor(ctx.property.state) ?? issuerDetails().stateCode;
  const gst = gstBreakdown({
    taxableMinor: taxable,
    taxRateBps: rule?.taxRateBps ?? 1800,
    supplierStateCode: issuerDetails().stateCode,
    placeOfSupplyStateCode: placeOfSupply,
  });

  const [existing] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, bookingId),
        inArray(payments.state, ['created', 'pending']),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(1);

  let payment = existing;
  if (!payment) {
    [payment] = await db
      .insert(payments)
      .values({
        bookingId,
        payerUserId: ctx.lead.userId,
        purpose: 'facilitation_fee',
        state: 'created',
        grossAmountMinor: gst.totalMinor,
        grossCurrency: 'INR',
        taxAmountMinor: gst.taxMinor,
        publicToken: newPublicToken(),
      })
      .returning();
  }

  const expiresAt = new Date(Date.now() + PAYMENT_LINK_VALID_HOURS * 3_600_000);
  const link = await createPaymentLink({
    paymentId: payment.id,
    publicToken: payment.publicToken!,
    amountMinor: payment.grossAmountMinor,
    currency: 'INR',
    description: `HashtagStay facilitation fee — booking ${ctx.booking.reference}`,
    customer: {
      name: ctx.lead.contactName,
      phone: ctx.lead.contactPhone,
      email: ctx.lead.contactEmail,
    },
    expiresAt,
  });

  await db
    .update(payments)
    .set({
      state: 'pending',
      provider: link.provider === 'test' ? 'test' : 'razorpay',
      providerPaymentLinkId: link.providerPaymentLinkId,
      paymentLinkUrl: link.providerUrl ?? link.url,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));

  const sent = await sendNotification({
    templateKey: 'booking.payment_link',
    channel: phoneChannel(),
    to: ctx.lead.guardianPhone ?? ctx.lead.contactPhone,
    variables: {
      name: ctx.lead.contactName?.split(' ')[0] ?? 'there',
      property: ctx.property.name,
      amount: format(money(payment.grossAmountMinor, 'INR'), { showDecimals: true }),
      url: link.url,
    },
    bookingId,
    leadId: ctx.lead.id,
    recipientUserId: ctx.lead.userId,
  });

  await db.insert(leadActivities).values({
    leadId: ctx.lead.id,
    actorUserId: viewer.id,
    kind: 'payment_link_sent',
    body: `Payment link for ${format(money(payment.grossAmountMinor, 'INR'), { showDecimals: true })} sent (${sent.state})`,
    detail: { bookingId, paymentId: payment.id, url: link.url },
  });
  await audit({
    actor,
    action: 'create',
    entityType: 'payments',
    entityId: payment.id,
    after: {
      bookingId,
      grossAmountMinor: payment.grossAmountMinor,
      provider: link.provider,
    },
  });
  await trackEvent({
    name: 'booking.payment_link_sent',
    bookingId,
    leadId: ctx.lead.id,
  });

  return { url: link.url, delivery: sent.state };
}

/**
 * Apply a captured payment: confirm the booking, issue the GST invoice, close
 * the lead as won, and tell both sides (FR-22).
 *
 * Idempotent on the payment row, because providers redeliver webhooks and a
 * resident can refresh the success page.
 */
export async function applyCapturedPayment(params: {
  paymentId: string;
  providerPaymentId: string | null;
  method?: string | null;
  payload?: Record<string, unknown> | null;
  actor: AuditActor;
}): Promise<{ alreadyApplied: boolean; bookingId: string | null }> {
  const now = new Date();
  const captured = await db
    .update(payments)
    .set({
      state: 'captured',
      paidAt: now,
      providerPaymentId: params.providerPaymentId,
      method: params.method ?? null,
      providerPayload: params.payload ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(payments.id, params.paymentId),
        inArray(payments.state, ['created', 'pending']),
      ),
    )
    .returning();

  if (captured.length === 0) {
    const [row] = await db
      .select({ bookingId: payments.bookingId })
      .from(payments)
      .where(eq(payments.id, params.paymentId));
    return { alreadyApplied: true, bookingId: row?.bookingId ?? null };
  }
  const payment = captured[0];
  await trackEvent({
    name: 'payment.captured',
    bookingId: payment.bookingId,
    properties: { amountMinor: payment.grossAmountMinor },
  });
  if (!payment.bookingId) return { alreadyApplied: false, bookingId: null };

  const ctx = await loadBookingContext(payment.bookingId);
  if (ctx.booking.state === 'fee_pending') {
    await moveBooking(
      ctx.booking.id,
      'fee_pending',
      'confirmed',
      { confirmedAt: now },
      params.actor,
      'Facilitation fee captured',
    );
  }

  const [rule] = ctx.booking.facilitationFeeRuleId
    ? await db
        .select()
        .from(feeRules)
        .where(eq(feeRules.id, ctx.booking.facilitationFeeRuleId))
    : [];
  const invoice = await issueTaxDocument({
    documentType: 'tax_invoice',
    bookingId: ctx.booking.id,
    paymentId: payment.id,
    billedToName: ctx.lead?.contactName ?? 'Resident',
    placeOfSupplyStateCode:
      stateCodeFor(ctx.property.state) ?? issuerDetails().stateCode,
    taxableMinor: ctx.booking.facilitationFeeAmountMinor ?? 0,
    taxRateBps: rule?.taxRateBps ?? 1800,
    issuedAt: now,
  });

  await nudgeLead(ctx.lead?.id ?? null, 'won', params.actor);

  const common = {
    reference: ctx.booking.reference,
    property: ctx.property.name,
    room: ctx.room?.name ?? 'Room',
    move_in: isoDate(ctx.booking.moveInDate) ?? '',
  };
  if (ctx.lead) {
    await sendNotification({
      templateKey: 'booking.confirmed_resident',
      channel: phoneChannel(),
      to: ctx.lead.guardianPhone ?? ctx.lead.contactPhone,
      variables: {
        ...common,
        rm_name: ctx.rmName?.split(' ')[0] ?? 'your relationship manager',
        support_url: absoluteUrl('/account'),
      },
      bookingId: ctx.booking.id,
      leadId: ctx.lead.id,
      recipientUserId: ctx.lead.userId,
    });
    if (ctx.lead.contactEmail) {
      await sendNotification({
        templateKey: 'booking.confirmed_resident',
        channel: 'email',
        to: ctx.lead.contactEmail,
        variables: {
          ...common,
          rm_name: ctx.rmName?.split(' ')[0] ?? 'your relationship manager',
          support_url: absoluteUrl('/account'),
        },
        bookingId: ctx.booking.id,
      });
    }
    await db.insert(leadActivities).values({
      leadId: ctx.lead.id,
      kind: 'booking_confirmed',
      body: `Fee paid. Booking ${ctx.booking.reference} confirmed. Invoice ${invoice.documentNumber}.`,
      detail: { bookingId: ctx.booking.id, invoiceId: invoice.id },
    });
  }

  const hostVars = {
    ...common,
    resident: ctx.lead?.contactName ?? 'The resident',
    tenure: ctx.booking.tenureMonths,
  };
  if (ctx.organization.contactPhone) {
    await sendNotification({
      templateKey: 'booking.confirmed_host',
      channel: 'sms',
      to: ctx.organization.contactPhone,
      variables: hostVars,
      bookingId: ctx.booking.id,
    });
  }
  if (ctx.organization.contactEmail) {
    await sendNotification({
      templateKey: 'booking.confirmed_host',
      channel: 'email',
      to: ctx.organization.contactEmail,
      variables: hostVars,
      bookingId: ctx.booking.id,
    });
  }

  await trackEvent({
    name: 'booking.confirmed',
    bookingId: ctx.booking.id,
    leadId: ctx.lead?.id,
    propertyId: ctx.property.id,
  });
  return { alreadyApplied: false, bookingId: ctx.booking.id };
}

/** Cancel with the facilitation-fee refund policy applied (FR-23). */
export async function cancelBooking(
  bookingId: string,
  input: { reason: CancelReason; note?: string | null },
  viewer: Pick<AuthenticatedUser, 'id' | 'roles'> | null,
  actor: AuditActor,
): Promise<{ refundMinor: number; explanation: string }> {
  const ctx = await loadBookingContext(bookingId);
  if (viewer) {
    const own = ctx.lead ? canViewLead(viewer, ctx.lead) : false;
    if (!can(viewer.roles, 'booking:cancel') && !own) {
      throw new BookingError('You cannot cancel this booking.');
    }
  }
  if (!canTransition(bookingMachine, ctx.booking.state, 'cancelled')) {
    throw new BookingError(
      ctx.booking.state === 'moved_in'
        ? 'The resident has moved in. Problems after move-in are handled as a support ticket with the operator.'
        : 'This booking can no longer be cancelled.',
    );
  }

  const now = new Date();
  const [paid] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.state, 'captured')))
    .limit(1);

  const decision = facilitationFeeRefund({
    paidMinor: paid?.grossAmountMinor ?? 0,
    reason: input.reason,
    moveInDate: ctx.booking.moveInDate,
    now,
    policy:
      (ctx.booking.cancellationPolicy as {
        fullRefundDaysBeforeMoveIn?: number;
      } | null) ?? null,
  });

  await moveBooking(
    bookingId,
    ctx.booking.state,
    'cancelled',
    {
      cancelReason: input.reason,
      cancelledAt: now,
    },
    actor,
    input.note ?? input.reason,
  );

  // Cancel any unpaid payment so its link stops working.
  await db
    .update(payments)
    .set({
      state: 'failed',
      failedAt: now,
      failureReason: 'Booking cancelled',
      updatedAt: now,
    })
    .where(
      and(
        eq(payments.bookingId, bookingId),
        inArray(payments.state, ['created', 'pending']),
      ),
    );

  if (paid && decision.refundMinor > 0) {
    const refund = await refundPayment({
      providerPaymentId: paid.providerPaymentId,
      amountMinor: decision.refundMinor,
    });
    await db
      .update(payments)
      .set({
        state:
          decision.refundMinor >= paid.grossAmountMinor
            ? 'refunded'
            : 'partially_refunded',
        refundedAmountMinor: decision.refundMinor,
        refundedAt: now,
        providerRefundId: refund.providerRefundId,
        updatedAt: now,
      })
      .where(eq(payments.id, paid.id));

    const [rule] = ctx.booking.facilitationFeeRuleId
      ? await db
          .select()
          .from(feeRules)
          .where(eq(feeRules.id, ctx.booking.facilitationFeeRuleId))
      : [];
    const taxRateBps = rule?.taxRateBps ?? 1800;
    const taxable = Math.round((decision.refundMinor * 10_000) / (10_000 + taxRateBps));
    const [original] = await db
      .select({ id: taxDocuments.id })
      .from(taxDocuments)
      .where(
        and(
          eq(taxDocuments.bookingId, bookingId),
          eq(taxDocuments.documentType, 'tax_invoice'),
        ),
      )
      .limit(1);

    await issueTaxDocument({
      documentType: 'credit_note',
      bookingId,
      paymentId: paid.id,
      revisesDocumentId: original?.id ?? null,
      billedToName: ctx.lead?.contactName ?? 'Resident',
      placeOfSupplyStateCode:
        stateCodeFor(ctx.property.state) ?? issuerDetails().stateCode,
      taxableMinor: taxable,
      taxRateBps,
    });

    await moveBooking(
      bookingId,
      'cancelled',
      'refunded',
      {},
      actor,
      'Facilitation fee refunded',
    );
    await trackEvent({
      name: 'payment.refunded',
      bookingId,
      properties: { refundMinor: decision.refundMinor },
    });
  }

  await nudgeLead(ctx.lead?.id ?? null, 'negotiating', actor);

  if (ctx.lead) {
    await sendNotification({
      templateKey: 'booking.cancelled',
      channel: phoneChannel(),
      to: ctx.lead.guardianPhone ?? ctx.lead.contactPhone,
      variables: {
        reference: ctx.booking.reference,
        property: ctx.property.name,
        refund_note:
          decision.refundMinor > 0
            ? `Your facilitation fee of ${format(money(decision.refundMinor, 'INR'), { showDecimals: true })} is being refunded to your original payment method.`
            : decision.explanation,
      },
      bookingId,
      leadId: ctx.lead.id,
    });
    await db.insert(leadActivities).values({
      leadId: ctx.lead.id,
      actorUserId: actor.id,
      kind: 'booking_cancelled',
      body: `Booking ${ctx.booking.reference} cancelled. ${decision.explanation}`,
      detail: { bookingId, reason: input.reason, refundMinor: decision.refundMinor },
    });
  }
  await trackEvent({
    name: 'booking.cancelled',
    bookingId,
    properties: { reason: input.reason },
  });
  return decision;
}

export async function markMovedIn(bookingId: string, actor: AuditActor): Promise<void> {
  const ctx = await loadBookingContext(bookingId);
  await moveBooking(
    bookingId,
    ctx.booking.state,
    'moved_in',
    { movedInAt: new Date() },
    actor,
  );
  await trackEvent({ name: 'booking.moved_in', bookingId });
}

export async function completeBooking(
  bookingId: string,
  actor: AuditActor,
): Promise<void> {
  const ctx = await loadBookingContext(bookingId);
  await moveBooking(
    bookingId,
    ctx.booking.state,
    'completed',
    { completedAt: new Date() },
    actor,
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getBookingDetail(bookingId: string) {
  const ctx = await loadBookingContext(bookingId);
  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.bookingId, bookingId))
    .orderBy(desc(payments.createdAt));
  return { ...ctx, payments: paymentRows };
}

export interface BookingListFilters {
  state?: BookingState | 'open' | 'all';
  organizationId?: string;
  residentUserId?: string;
  closedByUserId?: string;
  from?: Date;
  to?: Date;
}

export async function listBookings(filters: BookingListFilters = {}) {
  const conditions = [];
  if (filters.state === 'open') {
    conditions.push(
      inArray(bookings.state, [
        'initiated',
        'pending_host_confirmation',
        'fee_pending',
        'confirmed',
      ]),
    );
  } else if (filters.state && filters.state !== 'all') {
    conditions.push(eq(bookings.state, filters.state));
  }
  if (filters.organizationId)
    conditions.push(eq(bookings.organizationId, filters.organizationId));
  if (filters.residentUserId)
    conditions.push(eq(bookings.residentUserId, filters.residentUserId));
  if (filters.closedByUserId)
    conditions.push(eq(bookings.closedByUserId, filters.closedByUserId));
  if (filters.from) conditions.push(gte(bookings.createdAt, filters.from));
  if (filters.to) conditions.push(lt(bookings.createdAt, filters.to));

  return db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      state: bookings.state,
      moveInDate: bookings.moveInDate,
      tenureMonths: bookings.tenureMonths,
      monthlyRentAmountMinor: bookings.monthlyRentAmountMinor,
      facilitationFeeAmountMinor: bookings.facilitationFeeAmountMinor,
      hostCommissionAmountMinor: bookings.hostCommissionAmountMinor,
      createdAt: bookings.createdAt,
      confirmedAt: bookings.confirmedAt,
      propertyName: properties.name,
      propertySlug: properties.slug,
      city: properties.city,
      roomName: roomTypes.name,
      residentName: leads.contactName,
      leadReference: leads.reference,
      leadId: leads.id,
      rmName: users.fullName,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .leftJoin(roomTypes, eq(roomTypes.id, bookings.roomTypeId))
    .leftJoin(leads, eq(leads.id, bookings.leadId))
    .leftJoin(users, eq(users.id, bookings.closedByUserId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bookings.createdAt))
    .limit(300);
}

/** Bookings visible to a resident: theirs by account or by lead phone. */
export async function listBookingsForResident(userId: string, phone: string | null) {
  const rows = await db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      state: bookings.state,
      moveInDate: bookings.moveInDate,
      tenureMonths: bookings.tenureMonths,
      monthlyRentAmountMinor: bookings.monthlyRentAmountMinor,
      propertyName: properties.name,
      propertySlug: properties.slug,
      propertyId: properties.id,
      roomName: roomTypes.name,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .leftJoin(roomTypes, eq(roomTypes.id, bookings.roomTypeId))
    .leftJoin(leads, eq(leads.id, bookings.leadId))
    .where(
      phone
        ? or(eq(bookings.residentUserId, userId), eq(leads.contactPhone, phone))
        : eq(bookings.residentUserId, userId),
    )
    .orderBy(desc(bookings.createdAt));
  return rows;
}

export { isNull };
