import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Every state machine in the product is declared here as a Postgres enum, so an
 * illegal value cannot reach the database even if application code has a bug.
 * Transition *legality* is enforced in `lib/state-machines`; this file only
 * enumerates the reachable states.
 *
 * Adding a value to a pg enum is online and cheap. Removing or reordering one is
 * not — append, never reorder.
 */

// ---------------------------------------------------------------------------
// Identity & access
// ---------------------------------------------------------------------------

/**
 * Three audiences share one user table (see build plan, Auth row). `resident`
 * authenticates by phone OTP, `host` by email+password, `staff` by email plus
 * mandatory TOTP. The audience decides which auth flows are even offered.
 */
export const userAudienceEnum = pgEnum('user_audience', ['resident', 'host', 'staff']);

/**
 * Internal staff roles. Deliberately granular: the PRD's §9 RBAC requirement and
 * the audit trail are worthless if everyone internal is an "admin".
 *
 *  - `rm`            — works their own assigned lead queue, can call and shortlist
 *  - `rm_lead`       — reassigns leads, sees desk-wide SLA breaches
 *  - `ops`           — creates/edits inventory, chases stale availability
 *  - `verifier`      — the only role that may approve a verification tier
 *  - `finance`       — reads payments, invoices and host statements; issues refunds
 *  - `super_admin`   — user administration and fee-rule changes
 *
 * `verifier` is separated from `ops` on purpose: the person who lists a property
 * must not be the person who certifies it, or the "Verified" badge means nothing.
 */
export const staffRoleEnum = pgEnum('staff_role', [
  'rm',
  'rm_lead',
  'ops',
  'verifier',
  'finance',
  'super_admin',
]);

/** Role of a user within a supply-side organization. */
export const orgMemberRoleEnum = pgEnum('org_member_role', [
  'owner',
  'manager',
  'viewer',
]);

// ---------------------------------------------------------------------------
// Supply
// ---------------------------------------------------------------------------

/** PRD §4 "Inventory Categories". */
export const propertyTypeEnum = pgEnum('property_type', [
  'pbsa', // Purpose-Built Student Accommodation
  'coliving', // Managed co-living operator stock
  'homeshare', // Individual host: room or whole unit
]);

/** Who a property will accept. Drives the FR-01 gender-preference filter. */
export const genderPolicyEnum = pgEnum('gender_policy', [
  'any',
  'male_only',
  'female_only',
  'co_ed_segregated_floors',
]);

/** Listing lifecycle (build plan, Listing state machine). */
export const listingStateEnum = pgEnum('listing_state', [
  'draft',
  'submitted',
  'in_verification',
  'changes_requested',
  'live',
  'paused', // Host/ops temporarily out of inventory
  'suspended', // Platform-initiated, e.g. a trust incident
  'archived',
]);

/**
 * Verification tiers. The PRD's single "Verified" badge (FR-24) is a liability
 * word — these tiers each get a visible, legally-reviewed definition on the
 * listing so we never imply more diligence than we actually did.
 */
export const verificationTierEnum = pgEnum('verification_tier', [
  'none',
  'documents_checked', // Ownership/lease proof + ID reviewed
  'photos_verified', // Media confirmed to depict this property
  'onground_audited', // A person from our side physically visited
]);

export const verificationStateEnum = pgEnum('verification_state', [
  'pending',
  'docs_received',
  'in_review',
  'approved',
  'rejected',
  'expired',
]);

/** What a verification record is about. */
export const verificationSubjectEnum = pgEnum('verification_subject', [
  'organization',
  'property',
]);

/**
 * Provenance of an availability figure. Availability is *advisory* in Phase 1
 * (see build plan concern #4) — knowing who last asserted a count, and when, is
 * what lets an RM decide whether to re-confirm with the host before promising it.
 */
export const availabilitySourceEnum = pgEnum('availability_source', [
  'host', // Host updated it themselves in the portal
  'rm', // An RM confirmed it on a call
  'ops', // Ops entered/corrected it
  'import', // Bulk sheet or feed — least trustworthy
]);

/** Moderation gate on host-supplied media (photos are routinely lifted). */
export const mediaModerationStateEnum = pgEnum('media_moderation_state', [
  'pending',
  'approved',
  'rejected_duplicate', // Perceptual hash matched another property
  'rejected_quality',
  'rejected_other',
]);

export const mediaKindEnum = pgEnum('media_kind', ['image', 'video', 'floor_plan']);

// ---------------------------------------------------------------------------
// Demand
// ---------------------------------------------------------------------------

/** Lead lifecycle (build plan, Lead state machine). */
export const leadStateEnum = pgEnum('lead_state', [
  'new',
  'assigned',
  'contacting',
  'qualified',
  'shortlist_shared',
  'negotiating',
  'booking_initiated',
  'won',
  'lost',
  'disqualified', // Bot, test, competitor, duplicate — never a real resident
  'nurture', // Real but not ready (e.g. intake is 6 months out)
]);

/** Why a lead ended without a booking. Required on entry to `lost`. */
export const leadLostReasonEnum = pgEnum('lead_lost_reason', [
  'no_inventory_match',
  'budget_too_low',
  'unreachable',
  'booked_elsewhere',
  'plans_changed',
  'price_objection',
  'location_objection',
  'other',
]);

/** How the lead first reached us. Complements the free-form UTM block. */
export const leadChannelEnum = pgEnum('lead_channel', [
  'organic_search',
  'paid_search',
  'paid_social',
  'organic_social',
  'direct',
  'referral',
  'partner', // University, agent, corporate
  'whatsapp',
  'click_to_call',
  'offline', // RM logged a walk-in/inbound manually
]);

/** Call direction and outcome, for FR-12 logging and RM performance reporting. */
export const callDirectionEnum = pgEnum('call_direction', ['inbound', 'outbound']);

export const callDispositionEnum = pgEnum('call_disposition', [
  'connected',
  'no_answer',
  'busy',
  'invalid_number',
  'switched_off',
  'call_back_later',
  'wrong_person',
  'failed', // Provider-side failure, not the resident's fault
]);

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

/**
 * Booking lifecycle (build plan, Booking state machine).
 *
 * `pending_host_confirmation` exists because availability is advisory: we do not
 * take a fee until the host has confirmed the bed is genuinely free. Skipping
 * this state is how an aggregator sells a filled room and loses its brand.
 */
export const bookingStateEnum = pgEnum('booking_state', [
  'initiated',
  'pending_host_confirmation',
  'fee_pending',
  'confirmed',
  'moved_in',
  'completed',
  'cancelled',
  'refunded',
]);

export const bookingCancelReasonEnum = pgEnum('booking_cancel_reason', [
  'host_unavailable', // Host could not confirm after all
  'resident_withdrew',
  'payment_failed',
  'verification_failed',
  'duplicate',
  'other',
]);

/** How a fee is computed. Phase 1 settles on one of these per rule. */
export const feeBasisEnum = pgEnum('fee_basis', [
  'flat', // e.g. a fixed facilitation fee per booking
  'percent_of_gbv', // Commission on gross booking value
  'percent_of_monthly_rent',
]);

/** Who bears a fee. PRD §4 "Revenue Model". */
export const feePayerEnum = pgEnum('fee_payer', ['resident', 'host']);

export const feeKindEnum = pgEnum('fee_kind', [
  'facilitation_fee', // Charged to resident at booking (the only one we collect in Phase 1)
  'renting_commission', // Charged to host, invoiced monthly
  'service_fee', // Host value-added services
  'access_to_market_fee', // Host subscription/tiered placement
]);

/** Payment lifecycle, mirroring what Razorpay webhooks can tell us. */
export const paymentStateEnum = pgEnum('payment_state', [
  'created',
  'pending', // Link sent, awaiting the resident
  'authorized',
  'captured',
  'failed',
  'refund_pending',
  'refunded',
  'partially_refunded',
]);

export const paymentPurposeEnum = pgEnum('payment_purpose', [
  'facilitation_fee',
  'service_fee',
]);

/**
 * Indian GST document types. `tax_invoice` for a normal fee; `credit_note` for a
 * refund — a GST invoice is never edited or deleted after issue, it is reversed.
 */
export const taxDocumentTypeEnum = pgEnum('tax_document_type', [
  'tax_invoice',
  'credit_note',
]);

/** GST supply classification, which decides CGST+SGST vs IGST split. */
export const gstSupplyTypeEnum = pgEnum('gst_supply_type', [
  'intra_state', // CGST + SGST
  'inter_state', // IGST
  'export_of_service', // Zero-rated — relevant once we bill overseas students
]);

// ---------------------------------------------------------------------------
// Cross-cutting
// ---------------------------------------------------------------------------

/**
 * DPDP Act purposes. Consent is recorded per purpose with a policy version, so
 * that a later policy change does not retroactively claim consent we never had.
 */
export const consentPurposeEnum = pgEnum('consent_purpose', [
  'lead_contact', // We may call/WhatsApp you about your enquiry
  'call_recording', // FR-12 — must be disclosed per call
  'marketing', // Separate and genuinely optional
  'data_processing', // Baseline processing notice
  'partner_sharing', // Sharing a lead with a named operator
]);

export const consentStateEnum = pgEnum('consent_state', ['granted', 'withdrawn']);

/**
 * Who supplied the consent. `guardian` covers the DPDP §9 under-18 path — a
 * material share of student-housing enquirers are 17 (build plan concern #5).
 */
export const consentActorEnum = pgEnum('consent_actor', ['self', 'guardian']);

/** Data-subject request types under the DPDP Act. */
export const dsrKindEnum = pgEnum('dsr_kind', [
  'access',
  'correction',
  'erasure',
  'consent_withdrawal',
]);

export const dsrStateEnum = pgEnum('dsr_state', [
  'received',
  'verifying_identity',
  'in_progress',
  'completed',
  'rejected',
]);

/** Outbound message channels. */
export const notificationChannelEnum = pgEnum('notification_channel', [
  'email',
  'sms',
  'whatsapp',
  'push', // Phase 2, native apps
]);

export const notificationStateEnum = pgEnum('notification_state', [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'suppressed', // Consent withdrawn or hard-bounced — deliberately not sent
]);

/** Support and trust-and-safety. */
export const ticketStateEnum = pgEnum('ticket_state', [
  'open',
  'in_progress',
  'waiting_on_resident',
  'waiting_on_host',
  'resolved',
  'closed',
]);

export const ticketPriorityEnum = pgEnum('ticket_priority', [
  'low',
  'normal',
  'high',
  'safety_critical', // Drives the §12 safety-incident response-time KPI
]);

/** Audit actions. Coarse by design — the diff carries the detail. */
export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
  'state_transition',
  'login',
  'login_failed',
  'permission_denied',
  'export', // Someone pulled PII out of the system — always audited
  'impersonate',
]);
