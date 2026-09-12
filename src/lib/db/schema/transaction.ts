import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth';
import { amountMinor, currencyCode, primaryId, timestamps, tsColumn } from './columns';
import {
  bookingCancelReasonEnum,
  bookingStateEnum,
  feeBasisEnum,
  feeKindEnum,
  feePayerEnum,
  gstSupplyTypeEnum,
  paymentPurposeEnum,
  paymentStateEnum,
  propertyTypeEnum,
  taxDocumentTypeEnum,
} from './enums';
import { leads } from './demand';
import { organizations, properties, roomTypes } from './supply';

/**
 * Fee rules (FR-21). Scoped by inventory type, city and/or operator, with
 * effective dates so a rate change never rewrites history on past bookings.
 *
 * Rates are integer **basis points**, not floats: 850 = 8.50%. A float rate
 * multiplied across thousands of bookings is how reported revenue stops
 * matching invoiced revenue.
 */
export const feeRules = pgTable(
  'fee_rules',
  {
    id: primaryId(),
    kind: feeKindEnum().notNull(),
    payer: feePayerEnum().notNull(),
    basis: feeBasisEnum().notNull(),

    /** For `flat`: the fixed amount. Null for percentage bases. */
    flatAmountMinor: amountMinor(),
    flatCurrency: currencyCode(),
    /** For percentage bases: rate in basis points. Null for `flat`. */
    rateBps: integer(),

    /** Optional caps, applied after the percentage calculation. */
    minAmountMinor: amountMinor(),
    maxAmountMinor: amountMinor(),

    // --- Scope. All null = the global default for this kind. ---------------
    propertyType: propertyTypeEnum(),
    city: text(),
    organizationId: uuid().references(() => organizations.id, {
      onDelete: 'cascade',
    }),

    /**
     * Higher wins when several rules match, so a negotiated operator-specific
     * rate beats a city rate beats the global default. Explicit rather than
     * inferred from which columns are non-null, because "most specific wins"
     * gets ambiguous fast.
     */
    priority: smallint().notNull().default(0),

    effectiveFrom: tsColumn().notNull().defaultNow(),
    effectiveTo: tsColumn(),

    /** GST rate applicable to this fee, in basis points (1800 = 18%). */
    taxRateBps: integer(),

    createdBy: uuid().references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    index('fee_rules_lookup_idx').on(t.kind, t.priority),
    index('fee_rules_org_idx').on(t.organizationId),
    index('fee_rules_active_idx')
      .on(t.kind, t.effectiveFrom)
      .where(sql`${t.effectiveTo} IS NULL`),
  ],
);

/**
 * A booking.
 *
 * Phase 1 money flow is **facilitation fee only**: we collect our own fee from
 * the resident, and rent plus deposit are paid resident → host off-platform.
 * `grossValue*` is therefore a *recorded* figure for GBV reporting (§12) and
 * for computing host commission — not an amount that passes through us. Keeping
 * that distinction explicit is what keeps us out of payment-aggregator
 * territory.
 *
 * The fee is **snapshotted** onto the row at calculation time. Recomputing it
 * later from `feeRules` would silently change a booking's economics whenever a
 * rate is edited.
 */
export const bookings = pgTable(
  'bookings',
  {
    id: primaryId(),
    /** Human-quotable reference, shared with resident and host. */
    reference: text().notNull().unique(),

    leadId: uuid().references(() => leads.id, { onDelete: 'set null' }),
    residentUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    propertyId: uuid()
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    roomTypeId: uuid().references(() => roomTypes.id, { onDelete: 'restrict' }),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),

    /** RM who closed it — feeds the §12 "bookings per RM" metric. */
    closedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),

    state: bookingStateEnum().notNull().default('initiated'),
    cancelReason: bookingCancelReasonEnum(),

    moveInDate: tsColumn().notNull(),
    tenureMonths: smallint().notNull(),

    /** Agreed monthly rent and deposit, as confirmed on the closing call. */
    monthlyRentAmountMinor: amountMinor().notNull(),
    monthlyRentCurrency: currencyCode().notNull().default('INR'),
    depositAmountMinor: amountMinor(),
    depositCurrency: currencyCode(),

    /** Recorded gross booking value (rent × tenure). Reporting only. */
    grossValueAmountMinor: amountMinor(),
    grossValueCurrency: currencyCode(),

    // --- Fee snapshot ------------------------------------------------------
    facilitationFeeAmountMinor: amountMinor(),
    facilitationFeeCurrency: currencyCode(),
    facilitationFeeRuleId: uuid().references(() => feeRules.id),
    /** Host commission we will invoice on the monthly statement. */
    hostCommissionAmountMinor: amountMinor(),
    hostCommissionCurrency: currencyCode(),
    hostCommissionRuleId: uuid().references(() => feeRules.id),

    // --- The host-confirmation gate ---------------------------------------
    /**
     * Availability is advisory, so we do not take a fee until the host has
     * confirmed the bed is genuinely free. Skipping this is how an aggregator
     * sells a filled room (build plan concern #4).
     */
    hostConfirmationRequestedAt: tsColumn(),
    hostConfirmedAt: tsColumn(),
    hostConfirmedByUserId: uuid().references(() => users.id, {
      onDelete: 'set null',
    }),

    confirmedAt: tsColumn(),
    movedInAt: tsColumn(),
    completedAt: tsColumn(),
    cancelledAt: tsColumn(),

    /** Cancellation/refund terms captured from the operator at booking time. */
    cancellationPolicy: jsonb().$type<Record<string, unknown>>(),

    ...timestamps(),
  },
  (t) => [
    index('bookings_state_idx').on(t.state),
    index('bookings_property_idx').on(t.propertyId),
    index('bookings_org_idx').on(t.organizationId),
    index('bookings_lead_idx').on(t.leadId),
    index('bookings_created_idx').on(t.createdAt),
    index('bookings_closed_by_idx').on(t.closedByUserId, t.createdAt),
  ],
);

/**
 * Payments. Phase 1 only ever charges the facilitation fee.
 *
 * `providerPaymentId` is unique so a duplicated webhook delivery cannot create a
 * second payment row — Razorpay retries, and idempotency has to live in the
 * schema, not only in handler code.
 */
export const payments = pgTable(
  'payments',
  {
    id: primaryId(),
    bookingId: uuid().references(() => bookings.id, { onDelete: 'set null' }),
    payerUserId: uuid().references(() => users.id, { onDelete: 'set null' }),

    purpose: paymentPurposeEnum().notNull().default('facilitation_fee'),
    state: paymentStateEnum().notNull().default('created'),

    grossAmountMinor: amountMinor().notNull(),
    grossCurrency: currencyCode().notNull().default('INR'),
    /** Tax component within the gross, for the invoice breakdown. */
    taxAmountMinor: amountMinor(),

    provider: text().notNull().default('razorpay'),
    providerOrderId: text(),
    providerPaymentId: text().unique(),
    providerPaymentLinkId: text(),
    /** The link an RM sent from the CRM (FR-14). */
    paymentLinkUrl: text(),
    method: text(),

    paidAt: tsColumn(),
    failedAt: tsColumn(),
    failureReason: text(),

    refundedAmountMinor: amountMinor(),
    refundedAt: tsColumn(),
    providerRefundId: text(),

    /** Raw provider payload, retained for reconciliation and dispute evidence. */
    providerPayload: jsonb().$type<Record<string, unknown>>(),

    ...timestamps(),
  },
  (t) => [
    index('payments_booking_idx').on(t.bookingId),
    index('payments_state_idx').on(t.state),
    index('payments_paid_idx').on(t.paidAt),
  ],
);

/**
 * Webhook receipts. Every inbound provider callback is recorded before it is
 * processed, keyed by the provider's own event id.
 *
 * This is the idempotency backstop: Razorpay and telephony providers both
 * redeliver, and "process once" has to be enforced by a unique constraint
 * rather than by hoping the handler is fast enough.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: primaryId(),
    provider: text().notNull(),
    /** Provider's event id. Unique per provider — the idempotency key. */
    providerEventId: text().notNull(),
    eventType: text(),
    signatureValid: boolean().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    processedAt: tsColumn(),
    processingError: text(),
    receivedAt: tsColumn().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('webhook_events_provider_event_key').on(t.provider, t.providerEventId),
    index('webhook_events_unprocessed_idx')
      .on(t.receivedAt)
      .where(sql`${t.processedAt} IS NULL`),
  ],
);

/**
 * GST tax documents (build plan concern #6, absent from the PRD entirely).
 *
 * Charging an Indian resident a facilitation fee obliges us to issue a
 * compliant tax invoice. Two constraints drive this table's shape:
 *
 *   - The serial number must be **gapless** per series per financial year,
 *     which is why it is an integer we allocate transactionally rather than a
 *     formatted string we hope is sequential. It cannot be retrofitted.
 *   - An issued invoice is never edited or deleted. A refund produces a
 *     `credit_note` that references the original.
 */
export const taxDocuments = pgTable(
  'tax_documents',
  {
    id: primaryId(),
    documentType: taxDocumentTypeEnum().notNull().default('tax_invoice'),

    /** e.g. "HS/26-27" — series is scoped to the financial year. */
    series: text().notNull(),
    financialYear: text().notNull(),
    serialNumber: integer().notNull(),
    /** Rendered document number, derived from the three fields above. */
    documentNumber: text().notNull().unique(),

    bookingId: uuid().references(() => bookings.id, { onDelete: 'restrict' }),
    paymentId: uuid().references(() => payments.id, { onDelete: 'restrict' }),
    /** For a credit note: the invoice being reversed. */
    revisesDocumentId: uuid(),

    // Counterparty details, snapshotted — an invoice must not change when a
    // user later edits their profile.
    billedToName: text().notNull(),
    billedToGstin: text(),
    billedToAddress: text(),
    placeOfSupplyStateCode: text().notNull(),
    supplyType: gstSupplyTypeEnum().notNull(),

    /** Service Accounting Code for the fee. */
    sacCode: text(),

    taxableAmountMinor: amountMinor().notNull(),
    cgstAmountMinor: amountMinor(),
    sgstAmountMinor: amountMinor(),
    igstAmountMinor: amountMinor(),
    totalAmountMinor: amountMinor().notNull(),
    currency: currencyCode().notNull().default('INR'),
    taxRateBps: integer().notNull(),

    issuedAt: tsColumn().notNull().defaultNow(),
    /** Storage path of the rendered PDF. */
    pdfPath: text(),

    ...timestamps(),
  },
  (t) => [
    uniqueIndex('tax_documents_serial_key').on(
      t.series,
      t.financialYear,
      t.serialNumber,
    ),
    index('tax_documents_booking_idx').on(t.bookingId),
    index('tax_documents_issued_idx').on(t.issuedAt),
  ],
);

/**
 * Monthly commission statement per operator. This is how the host side of the
 * revenue model settles in Phase 1: we invoice commission on completed bookings
 * rather than deducting it from money we hold, because we never hold it.
 */
export const hostStatements = pgTable(
  'host_statements',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),

    periodStart: tsColumn().notNull(),
    periodEnd: tsColumn().notNull(),

    bookingCount: integer().notNull().default(0),
    grossBookingValueMinor: amountMinor(),
    commissionAmountMinor: amountMinor().notNull(),
    taxAmountMinor: amountMinor(),
    totalPayableMinor: amountMinor().notNull(),
    currency: currencyCode().notNull().default('INR'),

    taxDocumentId: uuid().references(() => taxDocuments.id),
    issuedAt: tsColumn(),
    settledAt: tsColumn(),

    ...timestamps(),
  },
  (t) => [
    uniqueIndex('host_statements_period_key').on(t.organizationId, t.periodStart),
    index('host_statements_org_idx').on(t.organizationId),
  ],
);

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  lead: one(leads, { fields: [bookings.leadId], references: [leads.id] }),
  property: one(properties, {
    fields: [bookings.propertyId],
    references: [properties.id],
  }),
  roomType: one(roomTypes, {
    fields: [bookings.roomTypeId],
    references: [roomTypes.id],
  }),
  organization: one(organizations, {
    fields: [bookings.organizationId],
    references: [organizations.id],
  }),
  payments: many(payments),
  taxDocuments: many(taxDocuments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  booking: one(bookings, {
    fields: [payments.bookingId],
    references: [bookings.id],
  }),
}));

export const taxDocumentsRelations = relations(taxDocuments, ({ one }) => ({
  booking: one(bookings, {
    fields: [taxDocuments.bookingId],
    references: [bookings.id],
  }),
  payment: one(payments, {
    fields: [taxDocuments.paymentId],
    references: [payments.id],
  }),
}));

export const feeRulesRelations = relations(feeRules, ({ one }) => ({
  organization: one(organizations, {
    fields: [feeRules.organizationId],
    references: [organizations.id],
  }),
}));

export const hostStatementsRelations = relations(hostStatements, ({ one }) => ({
  organization: one(organizations, {
    fields: [hostStatements.organizationId],
    references: [organizations.id],
  }),
}));
