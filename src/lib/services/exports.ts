import { and, asc, eq, gte, lt } from 'drizzle-orm';

import { type AuditActor, audit } from '@/lib/audit';
import { db } from '@/lib/db';
import {
  bookings,
  leads,
  payments,
  properties,
  taxDocuments,
  users,
} from '@/lib/db/schema';

import type { Period } from './reports';

/**
 * MIS exports (FR-30) as CSV.
 *
 * Every export is audited, because a bulk download of resident contact details
 * is the event you most need to reconstruct after an incident. Phone numbers
 * are masked in the lead export unless the export is explicitly for PII.
 */

export type ExportKind = 'leads' | 'bookings' | 'payments' | 'invoices';

/**
 * CSV cell escaping, including formula-injection defence: a cell beginning with
 * = + - @ is prefixed so a spreadsheet does not execute a resident-supplied name
 * like `=HYPERLINK(...)` when finance opens the file.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\r\n');
}

const rupees = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? '' : (minor / 100).toFixed(2);

const maskTail = (phone: string | null) => (phone ? `••••••${phone.slice(-4)}` : '');

export async function buildExport(
  kind: ExportKind,
  period: Period,
  options: { includePii: boolean },
  actor: AuditActor,
): Promise<{ fileName: string; csv: string; rowCount: number }> {
  let headers: string[];
  let rows: unknown[][];

  if (kind === 'leads') {
    const data = await db
      .select({ lead: leads, rm: users.fullName })
      .from(leads)
      .leftJoin(users, eq(users.id, leads.assignedToUserId))
      .where(and(gte(leads.createdAt, period.from), lt(leads.createdAt, period.to)))
      .orderBy(asc(leads.createdAt));
    headers = [
      'reference',
      'created_at',
      'name',
      'phone',
      'city',
      'budget_inr',
      'channel',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'state',
      'lost_reason',
      'assigned_rm',
      'sla_due_at',
      'first_call_at',
      'sla_met',
    ];
    rows = data.map(({ lead, rm }) => [
      lead.reference,
      lead.createdAt,
      lead.contactName,
      options.includePii ? lead.contactPhone : maskTail(lead.contactPhone),
      lead.requirementCity,
      rupees(lead.budgetMaxAmountMinor),
      lead.channel,
      lead.utmSource,
      lead.utmMedium,
      lead.utmCampaign,
      lead.state,
      lead.lostReason,
      rm,
      lead.slaFirstCallDueAt,
      lead.firstCallAttemptedAt,
      lead.firstCallAttemptedAt && lead.slaFirstCallDueAt
        ? lead.firstCallAttemptedAt.getTime() <= lead.slaFirstCallDueAt.getTime()
        : '',
    ]);
  } else if (kind === 'bookings') {
    const data = await db
      .select({
        booking: bookings,
        property: properties.name,
        city: properties.city,
        rm: users.fullName,
      })
      .from(bookings)
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .leftJoin(users, eq(users.id, bookings.closedByUserId))
      .where(
        and(gte(bookings.createdAt, period.from), lt(bookings.createdAt, period.to)),
      )
      .orderBy(asc(bookings.createdAt));
    headers = [
      'reference',
      'created_at',
      'state',
      'property',
      'city',
      'move_in',
      'tenure_months',
      'monthly_rent_inr',
      'gbv_inr',
      'facilitation_fee_inr',
      'host_commission_inr',
      'closed_by',
      'confirmed_at',
      'cancel_reason',
    ];
    rows = data.map(({ booking, property, city, rm }) => [
      booking.reference,
      booking.createdAt,
      booking.state,
      property,
      city,
      booking.moveInDate,
      booking.tenureMonths,
      rupees(booking.monthlyRentAmountMinor),
      rupees(booking.grossValueAmountMinor),
      rupees(booking.facilitationFeeAmountMinor),
      rupees(booking.hostCommissionAmountMinor),
      rm,
      booking.confirmedAt,
      booking.cancelReason,
    ]);
  } else if (kind === 'payments') {
    const data = await db
      .select({ payment: payments, reference: bookings.reference })
      .from(payments)
      .leftJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(
        and(gte(payments.createdAt, period.from), lt(payments.createdAt, period.to)),
      )
      .orderBy(asc(payments.createdAt));
    headers = [
      'booking',
      'created_at',
      'state',
      'provider',
      'provider_payment_id',
      'gross_inr',
      'gst_inr',
      'paid_at',
      'refunded_inr',
      'refunded_at',
    ];
    rows = data.map(({ payment, reference }) => [
      reference,
      payment.createdAt,
      payment.state,
      payment.provider,
      payment.providerPaymentId,
      rupees(payment.grossAmountMinor),
      rupees(payment.taxAmountMinor),
      payment.paidAt,
      rupees(payment.refundedAmountMinor),
      payment.refundedAt,
    ]);
  } else {
    const data = await db
      .select()
      .from(taxDocuments)
      .where(
        and(
          gte(taxDocuments.issuedAt, period.from),
          lt(taxDocuments.issuedAt, period.to),
        ),
      )
      .orderBy(asc(taxDocuments.series), asc(taxDocuments.serialNumber));
    headers = [
      'document_number',
      'type',
      'issued_at',
      'billed_to',
      'billed_to_gstin',
      'place_of_supply',
      'supply_type',
      'sac',
      'taxable_inr',
      'cgst_inr',
      'sgst_inr',
      'igst_inr',
      'total_inr',
    ];
    rows = data.map((doc) => [
      doc.documentNumber,
      doc.documentType,
      doc.issuedAt,
      doc.billedToName,
      doc.billedToGstin,
      doc.placeOfSupplyStateCode,
      doc.supplyType,
      doc.sacCode,
      rupees(doc.taxableAmountMinor),
      rupees(doc.cgstAmountMinor),
      rupees(doc.sgstAmountMinor),
      rupees(doc.igstAmountMinor),
      rupees(doc.totalAmountMinor),
    ]);
  }

  await audit({
    actor,
    action: 'export',
    entityType: kind,
    after: {
      rows: rows.length,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      includePii: options.includePii,
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    fileName: `hashtagstay-${kind}-${stamp}.csv`,
    csv: toCsv(headers, rows),
    rowCount: rows.length,
  };
}
