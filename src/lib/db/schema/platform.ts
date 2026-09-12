import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth';
import { primaryId, timestamps, tsColumn } from './columns';
import {
  auditActionEnum,
  consentActorEnum,
  consentPurposeEnum,
  consentStateEnum,
  dsrKindEnum,
  dsrStateEnum,
  notificationChannelEnum,
  notificationStateEnum,
  ticketPriorityEnum,
  ticketStateEnum,
} from './enums';

/**
 * Audit trail. The PRD's §9 asks for a "full audit trail of lead status
 * changes, bookings, fee calculations, and payouts" but states no requirement
 * for how — this is it.
 *
 * Append-only and never updated. `before`/`after` hold only the changed fields,
 * not whole rows, so the log stays readable and doesn't duplicate PII
 * needlessly. Bulk PII exports are audited explicitly (`export`) because
 * "someone downloaded the lead list" is the event you most want to reconstruct
 * after an incident.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: primaryId(),
    /** Null for system/cron actors; otherwise the staff or host user. */
    actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Denormalised so the log survives anonymisation of the user row. */
    actorLabel: text(),

    action: auditActionEnum().notNull(),
    /** Table name of the affected record, e.g. "bookings". */
    entityType: text().notNull(),
    entityId: uuid(),

    before: jsonb().$type<Record<string, unknown>>(),
    after: jsonb().$type<Record<string, unknown>>(),

    ipAddress: text(),
    userAgent: text(),
    /** Groups every write made in one request/transaction. */
    requestId: text(),

    createdAt: tsColumn().notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_entity_idx').on(t.entityType, t.entityId, t.createdAt),
    index('audit_log_actor_idx').on(t.actorUserId, t.createdAt),
    index('audit_log_action_idx').on(t.action, t.createdAt),
    index('audit_log_request_idx').on(t.requestId),
  ],
);

/**
 * Consent records under the DPDP Act.
 *
 * One row per purpose per grant, never mutated — a withdrawal is a new row with
 * `state = 'withdrawn'`, so the history of what someone agreed to and when
 * stays intact. `policyVersion` is stamped at grant time precisely so a later
 * policy change cannot retroactively claim consent under terms the person never
 * saw.
 *
 * `actor = 'guardian'` covers DPDP §9: an under-18 enquirer's consent must come
 * from a verifiable guardian, which for student housing is a real and recurring
 * case, not an edge one.
 */
export const consents = pgTable(
  'consents',
  {
    id: primaryId(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Set when consent was captured before an account existed (an enquiry). */
    leadId: uuid(),
    /** Phone/email the consent was captured against, for pre-account cases. */
    subjectIdentifier: text(),

    purpose: consentPurposeEnum().notNull(),
    state: consentStateEnum().notNull().default('granted'),
    actor: consentActorEnum().notNull().default('self'),

    policyVersion: text().notNull(),
    /** Verbatim text shown at capture time — the evidence, not a reference. */
    noticeText: text(),

    ipAddress: text(),
    userAgent: text(),
    /** Where it was captured: enquiry_form | call_announcement | portal. */
    capturedVia: text(),

    grantedAt: tsColumn().notNull().defaultNow(),
    withdrawnAt: tsColumn(),

    createdAt: tsColumn().notNull().defaultNow(),
  },
  (t) => [
    index('consents_user_purpose_idx').on(t.userId, t.purpose),
    index('consents_subject_idx').on(t.subjectIdentifier, t.purpose),
    index('consents_lead_idx').on(t.leadId),
  ],
);

/**
 * Data-subject requests (access / correction / erasure / withdrawal). The DPDP
 * Act gives data principals these rights on a clock, so they need to be tracked
 * as work items with a due date rather than handled ad hoc over email.
 */
export const dataSubjectRequests = pgTable(
  'data_subject_requests',
  {
    id: primaryId(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    subjectIdentifier: text().notNull(),

    kind: dsrKindEnum().notNull(),
    state: dsrStateEnum().notNull().default('received'),

    requestNote: text(),
    /** Statutory response deadline. */
    dueAt: tsColumn(),

    handledByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    resolutionNote: text(),
    completedAt: tsColumn(),
    /** Storage path of the export produced for an access request. */
    exportPath: text(),

    ...timestamps(),
  },
  (t) => [
    index('dsr_state_idx').on(t.state, t.dueAt),
    index('dsr_subject_idx').on(t.subjectIdentifier),
  ],
);

/**
 * Message templates. WhatsApp Business requires every proactive template to be
 * pre-approved by Meta, so `providerTemplateName` and `approvalState` mirror
 * that external lifecycle — we cannot send a template that Meta has not cleared,
 * and discovering that at send time is too late.
 */
export const notificationTemplates = pgTable(
  'notification_templates',
  {
    id: primaryId(),
    /** Internal key referenced from code, e.g. "lead.acknowledgement". */
    key: text().notNull(),
    channel: notificationChannelEnum().notNull(),
    locale: text().notNull().default('en-IN'),

    subject: text(),
    body: text().notNull(),
    /** Names of the variables the body interpolates, for validation. */
    variables: text().array(),

    /** Meta/BSP template name and approval state, for WhatsApp. */
    providerTemplateName: text(),
    approvalState: text(),

    isActive: boolean().notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex('notification_templates_key_key').on(t.key, t.channel, t.locale)],
);

/**
 * Sent-message log. Also the suppression record: a notification we chose *not*
 * to send because consent was withdrawn is stored as `suppressed`, which is the
 * evidence that we honoured the withdrawal.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    templateId: uuid().references(() => notificationTemplates.id),
    templateKey: text(),

    channel: notificationChannelEnum().notNull(),
    state: notificationStateEnum().notNull().default('queued'),

    recipientUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Phone or email actually dispatched to. */
    recipientAddress: text().notNull(),

    /** Loose references — a notification may relate to a lead or a booking. */
    leadId: uuid(),
    bookingId: uuid(),

    renderedBody: text(),
    variables: jsonb().$type<Record<string, unknown>>(),

    provider: text(),
    providerMessageId: text(),
    providerStatus: text(),

    queuedAt: tsColumn().notNull().defaultNow(),
    sentAt: tsColumn(),
    deliveredAt: tsColumn(),
    failedAt: tsColumn(),
    failureReason: text(),
    /** Why it was deliberately not sent (e.g. "marketing consent withdrawn"). */
    suppressionReason: text(),

    attemptCount: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index('notifications_recipient_idx').on(t.recipientUserId, t.queuedAt),
    index('notifications_lead_idx').on(t.leadId),
    index('notifications_state_idx').on(t.state, t.queuedAt),
    index('notifications_provider_msg_idx').on(t.providerMessageId),
  ],
);

/**
 * Support and trust-and-safety tickets.
 *
 * `safety_critical` priority is not decoration: §12 lists "safety-incident
 * response time" as a KPI, and the PRD positions safety as the core
 * differentiator for solo and female residents. Those tickets need their own
 * SLA clock, which is what `respondBy` and `firstRespondedAt` measure.
 */
export const supportTickets = pgTable(
  'support_tickets',
  {
    id: primaryId(),
    reference: text().notNull().unique(),

    raisedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Contact details for a reporter without an account. */
    contactPhone: text(),
    contactEmail: text(),

    leadId: uuid(),
    bookingId: uuid(),
    propertyId: uuid(),

    subject: text().notNull(),
    body: text(),
    category: text(),

    state: ticketStateEnum().notNull().default('open'),
    priority: ticketPriorityEnum().notNull().default('normal'),

    assignedToUserId: uuid().references(() => users.id, { onDelete: 'set null' }),

    /** SLA target for first human response; tighter for safety_critical. */
    respondBy: tsColumn(),
    firstRespondedAt: tsColumn(),
    resolvedAt: tsColumn(),
    closedAt: tsColumn(),
    resolutionNote: text(),

    ...timestamps(),
  },
  (t) => [
    index('support_tickets_state_idx').on(t.state, t.priority),
    index('support_tickets_assigned_idx').on(t.assignedToUserId),
    // Safety incidents awaiting a first response — the queue that must never
    // have anything sitting in it.
    index('support_tickets_safety_open_idx')
      .on(t.respondBy)
      .where(sql`${t.priority} = 'safety_critical' AND ${t.firstRespondedAt} IS NULL`),
  ],
);

/**
 * Append-only analytics event stream, and the source of truth for every §12
 * KPI.
 *
 * Separate from GA4 on purpose: GA4 cannot join a pageview to a booking that
 * closed three weeks later over the phone, which is exactly the conversion the
 * business runs on. Anything we need to report must be emitted here, and the
 * verification rule is that every KPI in §12 resolves to a real query over this
 * table — a metric with no query means its instrumentation is missing.
 */
export const events = pgTable(
  'events',
  {
    id: primaryId(),
    /** Dotted name, e.g. "lead.created", "call.connected", "booking.confirmed". */
    name: text().notNull(),

    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Anonymous visitor id, for pre-identification funnel steps. */
    anonymousId: text(),
    sessionId: text(),

    leadId: uuid(),
    bookingId: uuid(),
    propertyId: uuid(),

    /** Attribution carried on the event for channel-level rollups. */
    utmSource: text(),
    utmMedium: text(),
    utmCampaign: text(),

    properties: jsonb().$type<Record<string, unknown>>().notNull().default({}),

    occurredAt: tsColumn().notNull().defaultNow(),
    createdAt: tsColumn().notNull().defaultNow(),
  },
  (t) => [
    index('events_name_occurred_idx').on(t.name, t.occurredAt),
    index('events_lead_idx').on(t.leadId),
    index('events_booking_idx').on(t.bookingId),
    index('events_attribution_idx').on(t.utmSource, t.utmCampaign, t.occurredAt),
  ],
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(users, { fields: [auditLog.actorUserId], references: [users.id] }),
}));

export const consentsRelations = relations(consents, ({ one }) => ({
  user: one(users, { fields: [consents.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  template: one(notificationTemplates, {
    fields: [notifications.templateId],
    references: [notificationTemplates.id],
  }),
  recipient: one(users, {
    fields: [notifications.recipientUserId],
    references: [users.id],
  }),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one }) => ({
  raisedBy: one(users, {
    fields: [supportTickets.raisedByUserId],
    references: [users.id],
  }),
  assignedTo: one(users, {
    fields: [supportTickets.assignedToUserId],
    references: [users.id],
  }),
}));
