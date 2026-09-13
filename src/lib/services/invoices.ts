import { desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { taxDocumentCounters, taxDocuments } from '@/lib/db/schema';
import { serverEnv } from '@/lib/env';
import {
  financialYear,
  formatDocumentNumber,
  gstBreakdown,
  type GstBreakdown,
} from '@/lib/fees';

/**
 * GST tax documents.
 *
 * Invoice numbers are gapless within a series and financial year. The counter
 * row is locked with SELECT ... FOR UPDATE inside the same transaction as the
 * insert, so two concurrent payments cannot take the same number and a rolled
 * back insert does not burn one.
 *
 * An issued invoice is never edited. A refund issues a credit note that
 * references it.
 *
 * Without COMPANY_GSTIN and COMPANY_STATE_CODE configured, documents are issued
 * in a clearly marked TEST series outside production, and refused in
 * production.
 */

/**
 * SAC for accommodation reservation / facilitation services. Confirm the exact
 * code with the company's chartered accountant before issuing real invoices.
 */
export const FACILITATION_SAC = '998552';

export class InvoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvoiceError';
  }
}

function issuer(): {
  series: string;
  gstin: string | null;
  stateCode: string;
  isTest: boolean;
} {
  const e = serverEnv();
  if (e.COMPANY_GSTIN && e.COMPANY_STATE_CODE) {
    return {
      series: 'HS',
      gstin: e.COMPANY_GSTIN,
      stateCode: e.COMPANY_STATE_CODE,
      isTest: false,
    };
  }
  if (e.NODE_ENV === 'production' && !e.DEMO_MODE) {
    throw new InvoiceError(
      'Invoicing is not configured: set COMPANY_GSTIN and COMPANY_STATE_CODE before issuing tax invoices.',
    );
  }
  return { series: 'TEST', gstin: null, stateCode: '29', isTest: true };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function nextSerial(tx: Tx, series: string, fy: string): Promise<number> {
  await tx
    .insert(taxDocumentCounters)
    .values({ series, financialYear: fy, lastSerial: 0 })
    .onConflictDoNothing();

  const locked = await tx.execute<{ last_serial: number }>(
    sql`SELECT last_serial FROM tax_document_counters
        WHERE series = ${series} AND financial_year = ${fy}
        FOR UPDATE`,
  );
  const current = Number(locked[0]?.last_serial ?? 0);
  const next = current + 1;

  await tx
    .update(taxDocumentCounters)
    .set({ lastSerial: next })
    .where(sql`series = ${series} AND financial_year = ${fy}`);
  return next;
}

export interface IssueInput {
  documentType: 'tax_invoice' | 'credit_note';
  bookingId: string | null;
  paymentId: string | null;
  revisesDocumentId?: string | null;
  billedToName: string;
  billedToGstin?: string | null;
  billedToAddress?: string | null;
  placeOfSupplyStateCode: string;
  taxableMinor: number;
  taxRateBps: number;
  sacCode?: string;
  issuedAt?: Date;
}

export async function issueTaxDocument(input: IssueInput): Promise<{
  id: string;
  documentNumber: string;
  breakdown: GstBreakdown;
  isTest: boolean;
}> {
  if (input.taxableMinor <= 0) {
    throw new InvoiceError('A tax document needs a positive taxable amount.');
  }
  const company = issuer();
  const issuedAt = input.issuedAt ?? new Date();
  const fy = financialYear(issuedAt);
  const breakdown = gstBreakdown({
    taxableMinor: input.taxableMinor,
    taxRateBps: input.taxRateBps,
    supplierStateCode: company.stateCode,
    placeOfSupplyStateCode: input.placeOfSupplyStateCode,
  });

  // Credit notes use their own series so the invoice sequence stays unbroken.
  const series =
    input.documentType === 'credit_note' ? `${company.series}CN` : company.series;

  const result = await db.transaction(async (tx) => {
    const serial = await nextSerial(tx, series, fy);
    const documentNumber = formatDocumentNumber(series, fy, serial);
    const [row] = await tx
      .insert(taxDocuments)
      .values({
        documentType: input.documentType,
        series,
        financialYear: fy,
        serialNumber: serial,
        documentNumber,
        bookingId: input.bookingId,
        paymentId: input.paymentId,
        revisesDocumentId: input.revisesDocumentId ?? null,
        billedToName: input.billedToName,
        billedToGstin: input.billedToGstin ?? null,
        billedToAddress: input.billedToAddress ?? null,
        placeOfSupplyStateCode: input.placeOfSupplyStateCode,
        supplyType: breakdown.supplyType,
        sacCode: input.sacCode ?? FACILITATION_SAC,
        taxableAmountMinor: breakdown.taxableMinor,
        cgstAmountMinor: breakdown.cgstMinor,
        sgstAmountMinor: breakdown.sgstMinor,
        igstAmountMinor: breakdown.igstMinor,
        totalAmountMinor: breakdown.totalMinor,
        currency: 'INR',
        taxRateBps: input.taxRateBps,
        issuedAt,
      })
      .returning({ id: taxDocuments.id });
    return { id: row.id, documentNumber };
  });

  return { ...result, breakdown, isTest: company.isTest };
}

export async function getTaxDocument(id: string) {
  const [row] = await db
    .select()
    .from(taxDocuments)
    .where(eq(taxDocuments.id, id))
    .limit(1);
  return row ?? null;
}

export async function listTaxDocumentsForBooking(bookingId: string) {
  return db
    .select()
    .from(taxDocuments)
    .where(eq(taxDocuments.bookingId, bookingId))
    .orderBy(desc(taxDocuments.issuedAt));
}

export function issuerDetails() {
  const company = issuer();
  return {
    name: 'Sandy Stays',
    gstin: company.gstin,
    stateCode: company.stateCode,
    isTest: company.isTest,
  };
}
