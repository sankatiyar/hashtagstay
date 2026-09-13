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
import {
  amountMinor,
  currencyCode,
  deletedAt,
  pointColumn,
  primaryId,
  timestamps,
  tsColumn,
} from './columns';
import {
  availabilitySourceEnum,
  genderPolicyEnum,
  listingStateEnum,
  mediaKindEnum,
  mediaModerationStateEnum,
  orgMemberRoleEnum,
  propertyTypeEnum,
  verificationStateEnum,
  verificationSubjectEnum,
  verificationTierEnum,
} from './enums';

/**
 * Supply-side organization: a co-living operator, PBSA operator, or an
 * individual owner listing under their own name. Every property belongs to one,
 * even a single-room homeshare host, so commission terms and payout statements
 * have exactly one counterparty.
 */
export const organizations = pgTable(
  'organizations',
  {
    id: primaryId(),
    name: text().notNull(),
    /** URL-safe identifier used in the host portal and internal tooling. */
    slug: text().notNull().unique(),
    legalName: text(),
    /** Host's GSTIN, if registered — needed to bill commission correctly. */
    gstin: text(),
    panNumber: text(),

    contactEmail: text(),
    /** Never rendered to residents. Reaching a host is always via masked call. */
    contactPhone: text(),

    /**
     * Commission rate agreed with this operator, in basis points (850 = 8.5%).
     * Integer bps rather than a float percentage so the fee engine stays exact.
     * Null means "fall back to the applicable fee rule".
     */
    commissionRateBps: integer(),

    verificationTier: verificationTierEnum().notNull().default('none'),
    verifiedAt: tsColumn(),

    onboardedBy: uuid().references(() => users.id),
    suspendedAt: tsColumn(),
    suspensionReason: text(),

    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index('organizations_tier_idx').on(t.verificationTier)],
);

/** Membership linking a host user to an organization. */
export const orgMembers = pgTable(
  'org_members',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgMemberRoleEnum().notNull().default('manager'),
    invitedBy: uuid().references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('org_members_org_user_key').on(t.organizationId, t.userId),
    index('org_members_user_idx').on(t.userId),
  ],
);

/**
 * Universities and colleges, seeded per anchor city. Exists as its own table
 * (rather than a free-text field on properties) because FR-03 proximity search
 * is the student wedge: "PG near VIT Vellore" is the actual query, and it needs
 * a real coordinate to measure from.
 */
export const institutions = pgTable(
  'institutions',
  {
    id: primaryId(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    /** Common alternative names students search for, e.g. "DU" for Delhi University. */
    aliases: text().array(),
    city: text().notNull(),
    state: text(),
    country: text().notNull().default('IN'),
    location: pointColumn().notNull(),
    /** Drives the programmatic landing pages in M2. */
    isPublished: boolean().notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index('institutions_city_idx').on(t.city),
    // GiST index on the point column — without this, proximity search degrades
    // to a full scan and the §9 sub-3-second target is unreachable.
    index('institutions_location_idx').using('gist', t.location),
  ],
);

/**
 * A physical property. Rooms and pricing live in `roomTypes`, because a single
 * co-living building sells several distinct products (single/double/triple) at
 * different prices, and a resident searches across those, not across buildings.
 */
export const properties = pgTable(
  'properties',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),

    name: text().notNull(),
    /** Stable, SEO-facing slug. Never regenerated after publish — it is a URL. */
    slug: text().notNull().unique(),
    description: text(),

    propertyType: propertyTypeEnum().notNull(),
    genderPolicy: genderPolicyEnum().notNull().default('any'),

    addressLine1: text().notNull(),
    addressLine2: text(),
    locality: text(),
    city: text().notNull(),
    state: text(),
    postalCode: text(),
    country: text().notNull().default('IN'),
    location: pointColumn(),

    /**
     * Amenity slugs (wifi, ac, laundry, meals, housekeeping, power_backup...).
     * jsonb array rather than a join table: amenities are read as a set for
     * filtering and display, never joined or aggregated on their own.
     */
    amenities: jsonb().$type<string[]>().notNull().default([]),
    houseRules: jsonb().$type<string[]>().notNull().default([]),

    listingState: listingStateEnum().notNull().default('draft'),
    publishedAt: tsColumn(),

    /**
     * Who entered this property. Needed for separation of duties: the person
     * who created or submitted a listing must not be the person who certifies
     * it, and that check needs an identity to compare against rather than a
     * scan of the audit log.
     */
    createdByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),

    verificationTier: verificationTierEnum().notNull().default('none'),
    verifiedAt: tsColumn(),
    /** Verification expires; a badge from 2026 must not still show in 2029. */
    verificationExpiresAt: tsColumn(),

    /**
     * Ops-facing freshness marker. When inventory data was last confirmed with
     * the operator at all — distinct from per-room availability confirmation.
     * Drives the stale-inventory work queue.
     */
    lastReviewedAt: tsColumn(),

    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('properties_org_idx').on(t.organizationId),
    index('properties_city_idx').on(t.city),
    index('properties_state_idx').on(t.listingState),
    index('properties_location_idx').using('gist', t.location),
    // Only live listings are ever searched; a partial index keeps the hot path
    // small as archived and draft inventory accumulates.
    index('properties_live_city_idx')
      .on(t.city, t.propertyType)
      .where(sql`${t.listingState} = 'live'`),
  ],
);

/**
 * A sellable room product within a property. Price lives here, not on the
 * property, and always as a money column pair.
 */
export const roomTypes = pgTable(
  'room_types',
  {
    id: primaryId(),
    propertyId: uuid()
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    name: text().notNull(),
    /** Beds in the room: 1 = single, 2 = double/twin-sharing, etc. */
    occupancy: smallint().notNull().default(1),
    hasPrivateBathroom: boolean().notNull().default(false),
    areaSqft: integer(),

    /** Monthly rent. */
    rentAmountMinor: amountMinor().notNull(),
    rentCurrency: currencyCode().notNull().default('INR'),
    /** Refundable security deposit, as quoted by the operator. */
    depositAmountMinor: amountMinor(),
    depositCurrency: currencyCode(),

    /** Operator's minimum tenure. A key filter for digital nomads vs students. */
    minTenureMonths: smallint().notNull().default(1),
    maxTenureMonths: smallint(),

    /** Room-level extras beyond the property's shared amenities. */
    amenities: jsonb().$type<string[]>().notNull().default([]),

    isActive: boolean().notNull().default(true),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('room_types_property_idx').on(t.propertyId),
    index('room_types_rent_idx').on(t.rentAmountMinor),
  ],
);

/**
 * Availability — deliberately **advisory**, not authoritative.
 *
 * Small regional operators will not keep a calendar current, so a count here is
 * a claim with a provenance and an age, not a guarantee. `lastConfirmedAt` plus
 * `source` is what lets an RM decide whether to re-confirm with the host before
 * promising a bed, and it is why the booking state machine has an explicit
 * `pending_host_confirmation` step (build plan concern #4).
 *
 * One row per room type per date-less "current" snapshot in Phase 1; a
 * date-ranged calendar arrives with the host portal in M5.
 */
export const availability = pgTable(
  'availability',
  {
    id: primaryId(),
    roomTypeId: uuid()
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'cascade' }),

    availableCount: integer().notNull().default(0),
    /** Earliest date the operator says a bed can be occupied. */
    availableFrom: tsColumn(),

    source: availabilitySourceEnum().notNull(),
    /** Who asserted it — an RM, an ops user, or the host themselves. */
    confirmedBy: uuid().references(() => users.id),
    lastConfirmedAt: tsColumn().notNull().defaultNow(),

    notes: text(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('availability_room_type_key').on(t.roomTypeId),
    // Ops queue: find the stalest inventory first.
    index('availability_confirmed_idx').on(t.lastConfirmedAt),
  ],
);

/**
 * Property media. `perceptualHash` exists because host-supplied photos are
 * routinely lifted from competitor listings; a near-duplicate across two
 * unrelated properties is the signal that catches it (build plan concern #13).
 */
export const media = pgTable(
  'media',
  {
    id: primaryId(),
    propertyId: uuid()
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    roomTypeId: uuid().references(() => roomTypes.id, { onDelete: 'cascade' }),

    kind: mediaKindEnum().notNull().default('image'),
    /** Path within the Supabase Storage bucket, not a full URL. */
    storagePath: text().notNull(),
    altText: text(),
    width: integer(),
    height: integer(),
    byteSize: integer(),

    /** Display order within the gallery; lowest first. */
    sortOrder: smallint().notNull().default(0),

    moderationState: mediaModerationStateEnum().notNull().default('pending'),
    moderatedBy: uuid().references(() => users.id),
    moderatedAt: tsColumn(),
    moderationNote: text(),

    /** 64-bit dHash as hex. Compared by Hamming distance to find near-dupes. */
    perceptualHash: text(),

    uploadedBy: uuid().references(() => users.id),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('media_property_idx').on(t.propertyId, t.sortOrder),
    index('media_moderation_idx').on(t.moderationState),
    index('media_phash_idx').on(t.perceptualHash),
  ],
);

/**
 * Verification records. Tiered on purpose: "Verified" as a single undefined
 * badge implies we stand behind the property and is a liability word, so each
 * tier carries an explicit, legally-reviewable checklist and an expiry
 * (build plan concern #9).
 *
 * Approval is restricted to the `verifier` role, which is deliberately separate
 * from `ops` — the person who lists a property must not be the person who
 * certifies it.
 */
export const verifications = pgTable(
  'verifications',
  {
    id: primaryId(),
    subject: verificationSubjectEnum().notNull(),
    /** Points at organizations.id or properties.id per `subject`. */
    subjectId: uuid().notNull(),

    requestedTier: verificationTierEnum().notNull(),
    grantedTier: verificationTierEnum(),
    state: verificationStateEnum().notNull().default('pending'),

    /**
     * Who asked for this verification. Compared against the reviewer so a
     * listing cannot be certified by the person who submitted it — a badge
     * signed by its own author is not a trust signal.
     */
    requestedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),

    /**
     * Checklist outcome, one entry per rubric item, e.g.
     * `{ ownership_proof: 'pass', id_proof: 'pass', photos_match: 'fail' }`.
     * Stored as jsonb so the rubric can evolve without a migration per change.
     */
    checklist: jsonb().$type<Record<string, string>>().notNull().default({}),
    /** Storage paths of evidence documents (lease, ID, site-visit photos). */
    evidencePaths: text().array(),

    reviewedBy: uuid().references(() => users.id),
    reviewedAt: tsColumn(),
    decisionNote: text(),
    expiresAt: tsColumn(),

    ...timestamps(),
  },
  (t) => [
    index('verifications_subject_idx').on(t.subject, t.subjectId),
    index('verifications_state_idx').on(t.state),
  ],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(orgMembers),
  properties: many(properties),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [orgMembers.userId], references: [users.id] }),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [properties.organizationId],
    references: [organizations.id],
  }),
  roomTypes: many(roomTypes),
  media: many(media),
}));

export const roomTypesRelations = relations(roomTypes, ({ one, many }) => ({
  property: one(properties, {
    fields: [roomTypes.propertyId],
    references: [properties.id],
  }),
  availability: one(availability),
  media: many(media),
}));

export const availabilityRelations = relations(availability, ({ one }) => ({
  roomType: one(roomTypes, {
    fields: [availability.roomTypeId],
    references: [roomTypes.id],
  }),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  property: one(properties, {
    fields: [media.propertyId],
    references: [properties.id],
  }),
  roomType: one(roomTypes, {
    fields: [media.roomTypeId],
    references: [roomTypes.id],
  }),
}));
