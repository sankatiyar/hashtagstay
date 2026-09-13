import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth';
import { amountMinor, currencyCode, primaryId, timestamps, tsColumn } from './columns';
import { leadChannelEnum } from './enums';
import { supportTickets } from './platform';
import { organizations, properties } from './supply';
import { bookings } from './transaction';

/**
 * Operational tables added for the full Phase 1 workflow: desk routing,
 * marketing spend (for cost-per-lead), reviews, gapless invoice numbering,
 * ticket conversations and verification documents.
 */

/**
 * Per-RM routing profile (FR-10: route by geography, language and load).
 *
 * Kept off `users` because it only applies to desk staff, and because an RM
 * pausing their intake ("on a call, at lunch") is operational state that
 * changes many times a day.
 */
export const staffProfiles = pgTable('staff_profiles', {
  id: primaryId(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Cities this RM covers. Empty means "any city". */
  cities: text()
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** ISO 639-1 codes the RM can hold a sales call in. */
  languages: text()
    .array()
    .notNull()
    .default(sql`'{en,hi}'::text[]`),
  /** Open leads beyond which the RM is skipped by routing. */
  maxActiveLeads: integer().notNull().default(40),
  isAcceptingLeads: boolean().notNull().default(true),
  /** Round-robin tiebreak so equal-load RMs share new leads fairly. */
  lastAssignedAt: tsColumn(),
  ...timestamps(),
});

/**
 * Marketing spend, entered by finance or marketing per channel and period.
 *
 * Needed because cost-per-lead (PRD §12) is spend divided by leads, and the ad
 * platforms are not integrated. Manual entry keeps the KPI honest rather than
 * inventing a number.
 */
export const marketingSpend = pgTable(
  'marketing_spend',
  {
    id: primaryId(),
    channel: leadChannelEnum().notNull(),
    utmSource: text(),
    utmCampaign: text(),
    periodStart: tsColumn().notNull(),
    periodEnd: tsColumn().notNull(),
    amountMinor: amountMinor().notNull(),
    currency: currencyCode().notNull().default('INR'),
    notes: text(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [index('marketing_spend_channel_idx').on(t.channel, t.periodStart)],
);

/**
 * Resident reviews (FR-27).
 *
 * One per booking, and only from a booking that reached move-in: a review from
 * someone who never stayed is noise at best and a manipulation vector at
 * worst. Published only after moderation.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: primaryId(),
    bookingId: uuid()
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    propertyId: uuid()
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    residentUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    rating: smallint().notNull(),
    /** Separate safety score, because that is what solo residents search on. */
    safetyRating: smallint(),
    title: text(),
    body: text().notNull(),
    /** pending | published | rejected */
    moderationState: text().notNull().default('pending'),
    moderatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    moderatedAt: tsColumn(),
    moderationNote: text(),
    ...timestamps(),
  },
  (t) => [
    index('reviews_property_idx').on(t.propertyId, t.moderationState),
    check('reviews_rating_range', sql`${t.rating} BETWEEN 1 AND 5`),
    check(
      'reviews_safety_rating_range',
      sql`${t.safetyRating} IS NULL OR ${t.safetyRating} BETWEEN 1 AND 5`,
    ),
  ],
);

/**
 * Gapless GST invoice numbering.
 *
 * A row per series per financial year, locked with SELECT ... FOR UPDATE when
 * an invoice is issued. A sequence cannot be used: sequences skip values on
 * rollback, and a gap in a GST invoice series is a compliance finding.
 */
export const taxDocumentCounters = pgTable(
  'tax_document_counters',
  {
    series: text().notNull(),
    financialYear: text().notNull(),
    lastSerial: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.series, t.financialYear] })],
);

/** Conversation on a support ticket (FR-25). */
export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: primaryId(),
    ticketId: uuid()
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    authorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** resident | host | staff | system */
    authorKind: text().notNull(),
    body: text().notNull(),
    /** Internal staff notes are never shown to the resident or host. */
    isInternal: boolean().notNull().default(false),
    createdAt: tsColumn().notNull().defaultNow(),
  },
  (t) => [index('ticket_messages_ticket_idx').on(t.ticketId, t.createdAt)],
);

/**
 * Verification documents uploaded by a host or ops (FR-16): ownership or lease
 * proof, ID, registration certificates. Evidence for the verifier.
 */
export const propertyDocuments = pgTable(
  'property_documents',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    propertyId: uuid().references(() => properties.id, { onDelete: 'cascade' }),
    /** ownership_proof | lease | id_proof | registration | other */
    kind: text().notNull(),
    fileName: text().notNull(),
    contentType: text().notNull(),
    byteSize: integer().notNull(),
    storagePath: text().notNull(),
    uploadedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: tsColumn().notNull().defaultNow(),
  },
  (t) => [
    index('property_documents_property_idx').on(t.propertyId),
    index('property_documents_org_idx').on(t.organizationId),
    uniqueIndex('property_documents_path_key').on(t.storagePath),
  ],
);

export const staffProfilesRelations = relations(staffProfiles, ({ one }) => ({
  user: one(users, { fields: [staffProfiles.userId], references: [users.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  booking: one(bookings, { fields: [reviews.bookingId], references: [bookings.id] }),
  property: one(properties, {
    fields: [reviews.propertyId],
    references: [properties.id],
  }),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [ticketMessages.ticketId],
    references: [supportTickets.id],
  }),
}));
