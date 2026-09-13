import { relations, sql } from 'drizzle-orm';
import {
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
  callDirectionEnum,
  callDispositionEnum,
  genderPolicyEnum,
  leadChannelEnum,
  leadLostReasonEnum,
  leadStateEnum,
  propertyTypeEnum,
} from './enums';
import { institutions, properties, roomTypes } from './supply';

/**
 * A lead: someone who enquired. The single most important table in the product,
 * because the PRD's whole thesis is that human closure converts better than
 * self-serve, and this row is what the RM desk works.
 *
 * Two things are captured at insert time and can never be reconstructed later:
 *
 * 1. **Attribution.** §12 asks for cost-per-lead by channel and lead-to-booking
 *    conversion. If utm/gclid/fbclid/referrer/landing page are not persisted on
 *    the row at creation, no later work recovers them (build plan concern #7).
 *
 * 2. **The requirement snapshot.** What the resident asked for *at enquiry* —
 *    budget, city, dates — denormalised onto the lead rather than referenced.
 *    An RM renegotiates budget during the call, and we still need to know what
 *    they originally wanted to measure whether we matched it.
 */
export const leads = pgTable(
  'leads',
  {
    id: primaryId(),

    /** Short human-quotable reference used on calls and in WhatsApp. */
    reference: text().notNull().unique(),

    /**
     * Set once the enquirer verifies their phone via OTP. Null for an
     * unverified submission, which we keep but deprioritise — an open enquiry
     * form on an India-targeted property site draws heavy bot traffic, and RM
     * minutes are the most expensive resource in the business (concern #8).
     */
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),

    contactName: text(),
    /** E.164. Duplicated from users because a lead may precede verification. */
    contactPhone: text().notNull(),
    contactEmail: text(),
    phoneVerifiedAt: tsColumn(),

    /**
     * True when the enquirer is under 18 and a guardian's contact was collected
     * instead. Gates outbound contact until guardian consent is recorded
     * (DPDP §9).
     */
    guardianName: text(),
    guardianPhone: text(),

    // --- Requirement snapshot ---------------------------------------------
    requirementCity: text(),
    requirementCountry: text().default('IN'),
    /** Budget ceiling per month, as stated by the resident. */
    budgetMaxAmountMinor: amountMinor(),
    budgetCurrency: currencyCode(),
    requirementPropertyType: propertyTypeEnum(),
    requirementOccupancy: smallint(),
    requirementGenderPolicy: genderPolicyEnum(),
    /** Target move-in, and tenure in months. */
    moveInDate: tsColumn(),
    tenureMonths: smallint(),
    /** Set when the enquiry came through a university landing page. */
    institutionId: uuid().references(() => institutions.id, {
      onDelete: 'set null',
    }),
    /** Anything the resident typed free-form. */
    requirementNotes: text(),
    /** ISO 639-1 code of the language the resident wants to be called in (FR-10). */
    preferredLanguage: text().notNull().default('en'),

    // --- Attribution (write-once, at insert) -------------------------------
    channel: leadChannelEnum().notNull().default('direct'),
    utmSource: text(),
    utmMedium: text(),
    utmCampaign: text(),
    utmTerm: text(),
    utmContent: text(),
    /** Google / Meta click identifiers, for offline conversion upload. */
    gclid: text(),
    fbclid: text(),
    referrerUrl: text(),
    landingPagePath: text(),
    /** Partner (university, agent, corporate) that submitted or referred it. */
    partnerId: uuid(),

    // --- Desk workflow -----------------------------------------------------
    state: leadStateEnum().notNull().default('new'),
    lostReason: leadLostReasonEnum(),
    assignedToUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    assignedAt: tsColumn(),

    /**
     * SLA deadline for the first human call attempt. The PRD's 5-minute target
     * is a staffing commitment software can only measure and escalate — the
     * real guarantee to the resident is the automated acknowledgement below
     * (build plan concern #2).
     */
    slaFirstCallDueAt: tsColumn(),
    firstCallAttemptedAt: tsColumn(),
    firstCallConnectedAt: tsColumn(),
    /** When the sub-60-second automated WhatsApp/SMS acknowledgement went out. */
    acknowledgedAt: tsColumn(),
    slaBreachedAt: tsColumn(),

    contactAttemptCount: integer().notNull().default(0),
    lastContactedAt: tsColumn(),
    nextFollowUpAt: tsColumn(),

    ...timestamps(),
  },
  (t) => [
    index('leads_state_idx').on(t.state),
    index('leads_assigned_idx').on(t.assignedToUserId, t.state),
    index('leads_phone_idx').on(t.contactPhone),
    index('leads_created_idx').on(t.createdAt),
    index('leads_city_idx').on(t.requirementCity),
    // The RM queue's hot query: unworked leads whose SLA is closest to expiry.
    index('leads_sla_open_idx')
      .on(t.slaFirstCallDueAt)
      .where(sql`${t.firstCallAttemptedAt} IS NULL`),
    // Attribution reporting rolls up by campaign over a date range.
    index('leads_attribution_idx').on(t.utmSource, t.utmCampaign, t.createdAt),
  ],
);

/**
 * Append-only activity stream on a lead: notes, state transitions, messages
 * sent, calls placed. Append-only because it doubles as the dispute record for
 * "what did the RM actually promise", and because §9 requires a full audit
 * trail of lead status changes.
 */
export const leadActivities = pgTable(
  'lead_activities',
  {
    id: primaryId(),
    leadId: uuid()
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    /** Null for system-generated entries (SLA breach, auto-acknowledgement). */
    actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),

    /** e.g. note | state_change | call | message | shortlist_shared | assignment */
    kind: text().notNull(),
    body: text(),
    /** Structured detail — previous/next state, template id, provider ids. */
    detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),

    createdAt: tsColumn().notNull().defaultNow(),
  },
  (t) => [
    index('lead_activities_lead_idx').on(t.leadId, t.createdAt),
    index('lead_activities_kind_idx').on(t.kind),
  ],
);

/**
 * Call log (FR-12). Recording URLs live here, but note the compliance coupling:
 * a recording is only lawful with disclosed consent, so a row here should always
 * have a corresponding `call_recording` consent record for the resident.
 *
 * `maskedNumber` is the number the resident actually saw. Storing it matters for
 * dispute resolution and proves the masking layer was in the path — the control
 * that stops a host's real number leaking and the booking going off-platform.
 */
export const calls = pgTable(
  'calls',
  {
    id: primaryId(),
    leadId: uuid().references(() => leads.id, { onDelete: 'set null' }),
    agentUserId: uuid().references(() => users.id, { onDelete: 'set null' }),

    direction: callDirectionEnum().notNull(),
    disposition: callDispositionEnum(),

    /** Provider's own call id, for reconciliation against their billing. */
    providerCallId: text().unique(),
    provider: text(),
    /** The masked/virtual number presented, never a party's real number. */
    maskedNumber: text(),

    startedAt: tsColumn(),
    answeredAt: tsColumn(),
    endedAt: tsColumn(),
    durationSeconds: integer(),

    recordingPath: text(),
    /** Whether the consent announcement actually played on this leg. */
    recordingConsentCaptured: tsColumn(),

    notes: text(),
    ...timestamps(),
  },
  (t) => [
    index('calls_lead_idx').on(t.leadId, t.startedAt),
    index('calls_agent_idx').on(t.agentUserId, t.startedAt),
  ],
);

/**
 * An RM-curated set of 2–3 properties sent to a resident.
 *
 * This is the product's differentiating artifact: the PRD's §7 Journey A step 5
 * is precisely "RM shares 2–3 curated options", and no off-the-shelf CRM can
 * build it because it needs live inventory. `publicToken` makes it shareable
 * over WhatsApp without the resident needing an account.
 */
export const shortlists = pgTable(
  'shortlists',
  {
    id: primaryId(),
    leadId: uuid()
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    createdByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),

    /** Unguessable token for the public shortlist URL. */
    publicToken: text().notNull().unique(),
    /** Shortlist links expire — stale prices must not stay quotable forever. */
    expiresAt: tsColumn(),

    message: text(),
    sharedAt: tsColumn(),
    firstViewedAt: tsColumn(),
    viewCount: integer().notNull().default(0),

    ...timestamps(),
  },
  (t) => [index('shortlists_lead_idx').on(t.leadId)],
);

/**
 * A property/room on a shortlist, with the price **snapshotted** at share time.
 *
 * The snapshot is deliberate: if an operator raises rent after we quoted, the
 * resident must still see what we told them, and we need to know what was
 * promised. Reading today's price off `roomTypes` at render time would silently
 * rewrite history.
 */
export const shortlistItems = pgTable(
  'shortlist_items',
  {
    id: primaryId(),
    shortlistId: uuid()
      .notNull()
      .references(() => shortlists.id, { onDelete: 'cascade' }),
    propertyId: uuid()
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    roomTypeId: uuid().references(() => roomTypes.id, { onDelete: 'restrict' }),

    sortOrder: smallint().notNull().default(0),
    /** Why the RM picked this one — shown to the resident. */
    rmNote: text(),

    quotedRentAmountMinor: amountMinor(),
    quotedRentCurrency: currencyCode(),
    quotedDepositAmountMinor: amountMinor(),
    quotedDepositCurrency: currencyCode(),

    /** Resident's reaction, captured by the RM on the follow-up call. */
    residentInterest: text(),

    ...timestamps(),
  },
  (t) => [
    uniqueIndex('shortlist_items_unique').on(t.shortlistId, t.propertyId, t.roomTypeId),
    index('shortlist_items_shortlist_idx').on(t.shortlistId, t.sortOrder),
  ],
);

/** Resident-saved properties (FR-04). Distinct from an RM-built shortlist. */
export const wishlistItems = pgTable(
  'wishlist_items',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    propertyId: uuid()
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    createdAt: tsColumn().notNull().defaultNow(),
  },
  (t) => [uniqueIndex('wishlist_items_unique').on(t.userId, t.propertyId)],
);

export const leadsRelations = relations(leads, ({ one, many }) => ({
  assignedTo: one(users, {
    fields: [leads.assignedToUserId],
    references: [users.id],
  }),
  institution: one(institutions, {
    fields: [leads.institutionId],
    references: [institutions.id],
  }),
  activities: many(leadActivities),
  calls: many(calls),
  shortlists: many(shortlists),
}));

export const leadActivitiesRelations = relations(leadActivities, ({ one }) => ({
  lead: one(leads, { fields: [leadActivities.leadId], references: [leads.id] }),
  actor: one(users, {
    fields: [leadActivities.actorUserId],
    references: [users.id],
  }),
}));

export const callsRelations = relations(calls, ({ one }) => ({
  lead: one(leads, { fields: [calls.leadId], references: [leads.id] }),
  agent: one(users, { fields: [calls.agentUserId], references: [users.id] }),
}));

export const shortlistsRelations = relations(shortlists, ({ one, many }) => ({
  lead: one(leads, { fields: [shortlists.leadId], references: [leads.id] }),
  items: many(shortlistItems),
}));

export const shortlistItemsRelations = relations(shortlistItems, ({ one }) => ({
  shortlist: one(shortlists, {
    fields: [shortlistItems.shortlistId],
    references: [shortlists.id],
  }),
  property: one(properties, {
    fields: [shortlistItems.propertyId],
    references: [properties.id],
  }),
  roomType: one(roomTypes, {
    fields: [shortlistItems.roomTypeId],
    references: [roomTypes.id],
  }),
}));
