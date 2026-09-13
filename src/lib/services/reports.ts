import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  bookings,
  calls,
  leads,
  marketingSpend,
  payments,
  shortlists,
  staffRoles,
  users,
} from '@/lib/db/schema';

/**
 * Admin reporting (FR-28) — the PRD §12 KPIs, computed from operational tables
 * rather than a separate analytics store so the numbers cannot drift from what
 * actually happened.
 */

export interface Period {
  from: Date;
  to: Date;
}

export function periodFromParams(
  params: { from?: string; to?: string },
  now = new Date(),
): Period {
  const to = params.to ? new Date(`${params.to}T23:59:59+05:30`) : now;
  const from = params.from
    ? new Date(`${params.from}T00:00:00+05:30`)
    : new Date(to.getTime() - 30 * 86_400_000);
  return { from, to };
}

const pct = (part: number, whole: number) => (whole > 0 ? part / whole : null);

export async function funnelReport(period: Period) {
  const inPeriod = and(
    gte(leads.createdAt, period.from),
    lt(leads.createdAt, period.to),
  );

  const [leadRow] = await db
    .select({
      created: sql<number>`count(*)::int`,
      verified: sql<number>`count(*) FILTER (WHERE ${leads.phoneVerifiedAt} IS NOT NULL)::int`,
      assigned: sql<number>`count(*) FILTER (WHERE ${leads.assignedToUserId} IS NOT NULL)::int`,
      called: sql<number>`count(*) FILTER (WHERE ${leads.firstCallAttemptedAt} IS NOT NULL)::int`,
      connected: sql<number>`count(*) FILTER (WHERE ${leads.firstCallConnectedAt} IS NOT NULL)::int`,
      calledWithinSla: sql<number>`count(*) FILTER (WHERE ${leads.firstCallAttemptedAt} IS NOT NULL AND ${leads.firstCallAttemptedAt} <= ${leads.slaFirstCallDueAt})::int`,
      won: sql<number>`count(*) FILTER (WHERE ${leads.state} = 'won')::int`,
      lost: sql<number>`count(*) FILTER (WHERE ${leads.state} = 'lost')::int`,
      disqualified: sql<number>`count(*) FILTER (WHERE ${leads.state} = 'disqualified')::int`,
      medianMinutesToFirstCall: sql<
        number | null
      >`percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (${leads.firstCallAttemptedAt} - ${leads.createdAt})) / 60) FILTER (WHERE ${leads.firstCallAttemptedAt} IS NOT NULL)`,
    })
    .from(leads)
    .where(inPeriod);

  const [shortlistRow] = await db
    .select({
      leadsWithShortlist: sql<number>`count(DISTINCT ${shortlists.leadId})::int`,
    })
    .from(shortlists)
    .innerJoin(leads, eq(leads.id, shortlists.leadId))
    .where(and(inPeriod, isNotNull(shortlists.sharedAt)));

  const [bookingRow] = await db
    .select({
      leadsWithBooking: sql<number>`count(DISTINCT ${bookings.leadId})::int`,
    })
    .from(bookings)
    .innerJoin(leads, eq(leads.id, bookings.leadId))
    .where(inPeriod);

  const created = leadRow?.created ?? 0;
  const steps = [
    { key: 'created', label: 'Enquiries', value: created },
    { key: 'verified', label: 'Phone verified', value: leadRow?.verified ?? 0 },
    { key: 'called', label: 'Called', value: leadRow?.called ?? 0 },
    { key: 'connected', label: 'Connected on a call', value: leadRow?.connected ?? 0 },
    {
      key: 'shortlisted',
      label: 'Shortlist sent',
      value: shortlistRow?.leadsWithShortlist ?? 0,
    },
    {
      key: 'booking',
      label: 'Booking started',
      value: bookingRow?.leadsWithBooking ?? 0,
    },
    { key: 'won', label: 'Booked (fee paid)', value: leadRow?.won ?? 0 },
  ].map((step) => ({ ...step, ofCreated: pct(step.value, created) }));

  return {
    steps,
    lost: leadRow?.lost ?? 0,
    disqualified: leadRow?.disqualified ?? 0,
    slaAdherence: pct(leadRow?.calledWithinSla ?? 0, leadRow?.called ?? 0),
    medianMinutesToFirstCall:
      leadRow?.medianMinutesToFirstCall === null ||
      leadRow?.medianMinutesToFirstCall === undefined
        ? null
        : Number(leadRow.medianMinutesToFirstCall),
    callConnectRate: pct(leadRow?.connected ?? 0, leadRow?.called ?? 0),
    leadToBooking: pct(leadRow?.won ?? 0, created),
  };
}

export async function revenueReport(period: Period) {
  const confirmedInPeriod = and(
    inArray(bookings.state, ['confirmed', 'moved_in', 'completed']),
    gte(bookings.confirmedAt, period.from),
    lt(bookings.confirmedAt, period.to),
  );

  const [bookingRow] = await db
    .select({
      bookings: sql<number>`count(*)::int`,
      gbv: sql<number>`coalesce(sum(${bookings.grossValueAmountMinor}), 0)::bigint`,
      facilitationFees: sql<number>`coalesce(sum(${bookings.facilitationFeeAmountMinor}), 0)::bigint`,
      commission: sql<number>`coalesce(sum(${bookings.hostCommissionAmountMinor}), 0)::bigint`,
    })
    .from(bookings)
    .where(confirmedInPeriod);

  const [paymentRow] = await db
    .select({
      captured: sql<number>`coalesce(sum(${payments.grossAmountMinor}) FILTER (WHERE ${payments.state} IN ('captured','refunded','partially_refunded')), 0)::bigint`,
      tax: sql<number>`coalesce(sum(${payments.taxAmountMinor}) FILTER (WHERE ${payments.state} IN ('captured','refunded','partially_refunded')), 0)::bigint`,
      refunded: sql<number>`coalesce(sum(${payments.refundedAmountMinor}), 0)::bigint`,
    })
    .from(payments)
    .where(and(gte(payments.paidAt, period.from), lt(payments.paidAt, period.to)));

  const gbv = Number(bookingRow?.gbv ?? 0);
  const fees = Number(bookingRow?.facilitationFees ?? 0);
  const commission = Number(bookingRow?.commission ?? 0);

  return {
    confirmedBookings: bookingRow?.bookings ?? 0,
    gbvMinor: gbv,
    facilitationFeesMinor: fees,
    hostCommissionMinor: commission,
    netRevenueMinor: fees + commission - Number(paymentRow?.refunded ?? 0),
    cashCollectedMinor: Number(paymentRow?.captured ?? 0),
    gstCollectedMinor: Number(paymentRow?.tax ?? 0),
    refundedMinor: Number(paymentRow?.refunded ?? 0),
    takeRate: pct(fees + commission, gbv),
  };
}

export async function channelReport(period: Period) {
  const leadRows = await db
    .select({
      channel: leads.channel,
      leads: sql<number>`count(*)::int`,
      won: sql<number>`count(*) FILTER (WHERE ${leads.state} = 'won')::int`,
    })
    .from(leads)
    .where(and(gte(leads.createdAt, period.from), lt(leads.createdAt, period.to)))
    .groupBy(leads.channel);

  // Spend overlapping the period, prorated by the fraction of each entry inside it.
  const spendRows = await db
    .select({
      channel: marketingSpend.channel,
      spend: sql<number>`coalesce(sum(
        ${marketingSpend.amountMinor}::numeric *
        greatest(0, extract(epoch FROM (least(${marketingSpend.periodEnd}, ${period.to}) - greatest(${marketingSpend.periodStart}, ${period.from}))))
        / nullif(extract(epoch FROM (${marketingSpend.periodEnd} - ${marketingSpend.periodStart})), 0)
      ), 0)::bigint`,
    })
    .from(marketingSpend)
    .where(
      and(
        lt(marketingSpend.periodStart, period.to),
        gte(marketingSpend.periodEnd, period.from),
      ),
    )
    .groupBy(marketingSpend.channel);

  const channels = new Set([
    ...leadRows.map((r) => r.channel),
    ...spendRows.map((r) => r.channel),
  ]);
  return [...channels]
    .map((channel) => {
      const l = leadRows.find((r) => r.channel === channel);
      const spend = Number(spendRows.find((r) => r.channel === channel)?.spend ?? 0);
      const count = l?.leads ?? 0;
      const won = l?.won ?? 0;
      return {
        channel,
        leads: count,
        bookings: won,
        spendMinor: spend,
        costPerLeadMinor: count > 0 && spend > 0 ? Math.round(spend / count) : null,
        costPerBookingMinor: won > 0 && spend > 0 ? Math.round(spend / won) : null,
        conversion: pct(won, count),
      };
    })
    .sort((a, b) => b.leads - a.leads);
}

export async function lostReasonReport(period: Period) {
  return db
    .select({ reason: leads.lostReason, count: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(
        eq(leads.state, 'lost'),
        gte(leads.createdAt, period.from),
        lt(leads.createdAt, period.to),
      ),
    )
    .groupBy(leads.lostReason)
    .orderBy(desc(sql`count(*)`));
}

export async function rmPerformanceReport(period: Period) {
  const rms = await db
    .selectDistinct({ id: users.id, name: users.fullName })
    .from(users)
    .innerJoin(staffRoles, eq(staffRoles.userId, users.id))
    .where(
      and(inArray(staffRoles.role, ['rm', 'rm_lead']), eq(users.audience, 'staff')),
    );

  const leadStats = await db
    .select({
      userId: leads.assignedToUserId,
      assigned: sql<number>`count(*)::int`,
      withinSla: sql<number>`count(*) FILTER (WHERE ${leads.firstCallAttemptedAt} <= ${leads.slaFirstCallDueAt})::int`,
      called: sql<number>`count(*) FILTER (WHERE ${leads.firstCallAttemptedAt} IS NOT NULL)::int`,
      won: sql<number>`count(*) FILTER (WHERE ${leads.state} = 'won')::int`,
    })
    .from(leads)
    .where(
      and(
        gte(leads.createdAt, period.from),
        lt(leads.createdAt, period.to),
        isNotNull(leads.assignedToUserId),
      ),
    )
    .groupBy(leads.assignedToUserId);

  const callStats = await db
    .select({
      userId: calls.agentUserId,
      calls: sql<number>`count(*)::int`,
      connected: sql<number>`count(*) FILTER (WHERE ${calls.disposition} = 'connected')::int`,
      talkSeconds: sql<number>`coalesce(sum(${calls.durationSeconds}), 0)::int`,
    })
    .from(calls)
    .where(and(gte(calls.createdAt, period.from), lt(calls.createdAt, period.to)))
    .groupBy(calls.agentUserId);

  const bookingStats = await db
    .select({
      userId: bookings.closedByUserId,
      confirmed: sql<number>`count(*) FILTER (WHERE ${bookings.state} IN ('confirmed','moved_in','completed'))::int`,
      fees: sql<number>`coalesce(sum(${bookings.facilitationFeeAmountMinor}) FILTER (WHERE ${bookings.state} IN ('confirmed','moved_in','completed')), 0)::bigint`,
    })
    .from(bookings)
    .where(and(gte(bookings.createdAt, period.from), lt(bookings.createdAt, period.to)))
    .groupBy(bookings.closedByUserId);

  return rms
    .map((rm) => {
      const l = leadStats.find((s) => s.userId === rm.id);
      const c = callStats.find((s) => s.userId === rm.id);
      const b = bookingStats.find((s) => s.userId === rm.id);
      return {
        userId: rm.id,
        name: rm.name ?? 'Unnamed',
        assigned: l?.assigned ?? 0,
        slaAdherence: pct(l?.withinSla ?? 0, l?.called ?? 0),
        calls: c?.calls ?? 0,
        connectRate: pct(c?.connected ?? 0, c?.calls ?? 0),
        talkMinutes: Math.round((c?.talkSeconds ?? 0) / 60),
        bookings: b?.confirmed ?? 0,
        feesMinor: Number(b?.fees ?? 0),
        conversion: pct(l?.won ?? 0, l?.assigned ?? 0),
      };
    })
    .sort((a, b) => b.bookings - a.bookings || b.assigned - a.assigned);
}

export async function listSpend() {
  return db
    .select()
    .from(marketingSpend)
    .orderBy(desc(marketingSpend.periodStart))
    .limit(100);
}

export async function addSpend(input: {
  channel: typeof marketingSpend.$inferInsert.channel;
  utmCampaign?: string | null;
  periodStart: Date;
  periodEnd: Date;
  amountMinor: number;
  notes?: string | null;
  createdBy: string;
}) {
  if (input.periodEnd.getTime() <= input.periodStart.getTime()) {
    throw new Error('The period must end after it starts.');
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('Enter a positive amount.');
  }
  await db.insert(marketingSpend).values({
    channel: input.channel,
    utmCampaign: input.utmCampaign ?? null,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    amountMinor: input.amountMinor,
    notes: input.notes ?? null,
    createdBy: input.createdBy,
  });
}
