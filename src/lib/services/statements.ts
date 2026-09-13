import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { bookings, hostStatements, organizations, properties } from '@/lib/db/schema';
import { gstBreakdown, stateCodeFor } from '@/lib/fees';

import { issueTaxDocument, issuerDetails } from './invoices';

/**
 * Monthly host statements (FR-18).
 *
 * Phase 1 never holds the operator's money, so there is no payout to deduct
 * from. Instead each operator gets a monthly statement of commission owed on
 * bookings confirmed in the period, with a GST invoice for that commission.
 *
 * A statement is regenerated freely until it is issued; after that it is frozen,
 * because the invoice behind it cannot change.
 */

const COMMISSION_TAX_BPS = 1800;
const COUNTED_STATES = ['confirmed', 'moved_in', 'completed'] as const;

/** First instant of a calendar month in IST, as UTC. */
export function monthStartIst(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0) - 330 * 60_000);
}

/** The IST calendar month before `now`. */
export function previousMonth(now = new Date()): { start: Date; end: Date } {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth();
  return {
    start: monthStartIst(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1),
    end: monthStartIst(year, month),
  };
}

export async function generateStatements(params: {
  periodStart: Date;
  periodEnd: Date;
  issue?: boolean;
}): Promise<
  {
    organizationId: string;
    bookings: number;
    commissionMinor: number;
    issued: boolean;
  }[]
> {
  const totals = await db
    .select({
      organizationId: bookings.organizationId,
      bookingCount: sql<number>`count(*)::int`,
      gbv: sql<number>`coalesce(sum(${bookings.grossValueAmountMinor}), 0)::bigint`,
      commission: sql<number>`coalesce(sum(${bookings.hostCommissionAmountMinor}), 0)::bigint`,
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.state, [...COUNTED_STATES]),
        gte(bookings.confirmedAt, params.periodStart),
        lt(bookings.confirmedAt, params.periodEnd),
      ),
    )
    .groupBy(bookings.organizationId);

  const results = [];
  for (const total of totals) {
    const commission = Number(total.commission);
    const [existing] = await db
      .select()
      .from(hostStatements)
      .where(
        and(
          eq(hostStatements.organizationId, total.organizationId),
          eq(hostStatements.periodStart, params.periodStart),
        ),
      )
      .limit(1);

    if (existing?.issuedAt) {
      results.push({
        organizationId: total.organizationId,
        bookings: existing.bookingCount,
        commissionMinor: existing.commissionAmountMinor,
        issued: true,
      });
      continue;
    }

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, total.organizationId));
    const [firstProperty] = await db
      .select({ state: properties.state })
      .from(properties)
      .where(eq(properties.organizationId, total.organizationId))
      .orderBy(asc(properties.createdAt))
      .limit(1);
    const placeOfSupply =
      stateCodeFor(firstProperty?.state) ?? issuerDetails().stateCode;
    const gst = gstBreakdown({
      taxableMinor: commission,
      taxRateBps: COMMISSION_TAX_BPS,
      supplierStateCode: issuerDetails().stateCode,
      placeOfSupplyStateCode: placeOfSupply,
    });

    const values = {
      organizationId: total.organizationId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      bookingCount: total.bookingCount,
      grossBookingValueMinor: Number(total.gbv),
      commissionAmountMinor: commission,
      taxAmountMinor: gst.taxMinor,
      totalPayableMinor: gst.totalMinor,
      currency: 'INR',
      updatedAt: new Date(),
    };

    const [statement] = existing
      ? await db
          .update(hostStatements)
          .set(values)
          .where(eq(hostStatements.id, existing.id))
          .returning()
      : await db.insert(hostStatements).values(values).returning();

    let issued = false;
    if (params.issue && commission > 0 && org) {
      const invoice = await issueTaxDocument({
        documentType: 'tax_invoice',
        bookingId: null,
        paymentId: null,
        billedToName: org.legalName ?? org.name,
        billedToGstin: org.gstin,
        placeOfSupplyStateCode: placeOfSupply,
        taxableMinor: commission,
        taxRateBps: COMMISSION_TAX_BPS,
      });
      await db
        .update(hostStatements)
        .set({ taxDocumentId: invoice.id, issuedAt: new Date() })
        .where(eq(hostStatements.id, statement.id));
      issued = true;
    }
    results.push({
      organizationId: total.organizationId,
      bookings: total.bookingCount,
      commissionMinor: commission,
      issued,
    });
  }
  return results;
}

export async function listStatements(organizationId?: string) {
  return db
    .select({
      statement: hostStatements,
      organizationName: organizations.name,
    })
    .from(hostStatements)
    .innerJoin(organizations, eq(organizations.id, hostStatements.organizationId))
    .where(
      organizationId ? eq(hostStatements.organizationId, organizationId) : undefined,
    )
    .orderBy(desc(hostStatements.periodStart));
}

export async function markStatementSettled(statementId: string): Promise<void> {
  await db
    .update(hostStatements)
    .set({ settledAt: new Date(), updatedAt: new Date() })
    .where(eq(hostStatements.id, statementId));
}

/** Bookings behind a statement, for the host's line-item view. */
export async function statementLines(
  organizationId: string,
  periodStart: Date,
  periodEnd: Date,
) {
  return db
    .select({
      reference: bookings.reference,
      propertyName: properties.name,
      confirmedAt: bookings.confirmedAt,
      monthlyRentAmountMinor: bookings.monthlyRentAmountMinor,
      tenureMonths: bookings.tenureMonths,
      hostCommissionAmountMinor: bookings.hostCommissionAmountMinor,
      state: bookings.state,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(
      and(
        eq(bookings.organizationId, organizationId),
        inArray(bookings.state, [...COUNTED_STATES]),
        gte(bookings.confirmedAt, periodStart),
        lt(bookings.confirmedAt, periodEnd),
      ),
    )
    .orderBy(asc(bookings.confirmedAt));
}
