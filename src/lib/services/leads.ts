import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';

import {
  cleanAttribution,
  inferChannel,
  type AttributionInput,
} from '@/lib/attribution';
import { type AuditActor, audit, auditTransition } from '@/lib/audit';
import type { AuthenticatedUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { findOrCreateResident } from '@/lib/auth/resident';
import { db } from '@/lib/db';
import {
  bookings,
  calls,
  institutions,
  leadActivities,
  leads,
  properties,
  shortlists,
  users,
} from '@/lib/db/schema';
import { newReference } from '@/lib/ids';
import { phoneChannel, sendNotification } from '@/lib/integrations/messaging';
import { fromMajorUnits } from '@/lib/money';
import { firstCallDueAt, responsePromise, slaStatus, type SlaStatus } from '@/lib/sla';
import { type LeadState, assertTransition, leadMachine } from '@/lib/state-machines';

import { recordConsent } from './consent';
import { trackEvent } from './events';
import { markAssigned, pickAssignee } from './routing';

/**
 * Leads: capture (FR-06, FR-07) and the desk workflow (FR-10, FR-11, FR-13).
 *
 * The rules that matter:
 *  - Attribution and the requirement are snapshotted at creation.
 *  - One person, one open lead. A repeat enquiry from the same number within
 *    30 days is merged into the open lead as an activity rather than creating
 *    a second one that two RMs then both call.
 *  - Every lead gets an automatic acknowledgement immediately — the honest
 *    guarantee behind the five-minute SLA, worded to match desk hours.
 *  - Leads are routed on arrival; anything that cannot be routed waits in the
 *    unassigned queue for an RM lead.
 */

export const CLOSED_LEAD_STATES: readonly LeadState[] = ['won', 'lost', 'disqualified'];
const DEDUPE_WINDOW_DAYS = 30;

export class LeadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadError';
  }
}

export interface EnquiryInput {
  name: string;
  /** Canonical E.164 — verified by OTP before this is called. */
  phone: string;
  phoneVerified: boolean;
  email?: string | null;
  city?: string | null;
  budgetMaxRupees?: number | null;
  propertyType?: 'pbsa' | 'coliving' | 'homeshare' | null;
  occupancy?: number | null;
  genderPolicy?: 'any' | 'male_only' | 'female_only' | null;
  moveInDate?: Date | null;
  tenureMonths?: number | null;
  institutionSlug?: string | null;
  listingSlug?: string | null;
  notes?: string | null;
  preferredLanguage?: string;
  isUnder18?: boolean;
  guardianName?: string | null;
  guardianPhone?: string | null;
  marketingConsent?: boolean;
  attribution: AttributionInput;
  channelOverride?: 'click_to_call' | 'whatsapp' | 'offline' | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  siteHost?: string;
}

export interface EnquiryResult {
  leadId: string;
  reference: string;
  merged: boolean;
  assignedToUserId: string | null;
  responsePromise: string;
}

export async function createEnquiry(input: EnquiryInput): Promise<EnquiryResult> {
  if (input.isUnder18 && (!input.guardianName || !input.guardianPhone)) {
    throw new LeadError(
      'Enquirers under 18 need a parent or guardian’s name and phone number, and their consent.',
    );
  }

  const now = new Date();
  const attribution = cleanAttribution(input.attribution);
  const channel = input.channelOverride ?? inferChannel(attribution, input.siteHost);

  const [institution, listing] = await Promise.all([
    input.institutionSlug
      ? db
          .select({
            id: institutions.id,
            name: institutions.name,
            city: institutions.city,
          })
          .from(institutions)
          .where(eq(institutions.slug, input.institutionSlug))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    input.listingSlug
      ? db
          .select({ id: properties.id, name: properties.name, city: properties.city })
          .from(properties)
          .where(eq(properties.slug, input.listingSlug))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const city = input.city || listing?.city || institution?.city || null;
  const resident = input.phoneVerified
    ? await findOrCreateResident({
        phone: input.phone,
        name: input.name,
        email: input.email,
      })
    : null;

  const noteParts = [
    input.notes?.trim(),
    listing ? `Enquired about ${listing.name}.` : null,
    input.isUnder18 ? 'Enquirer is under 18 — contact the guardian.' : null,
  ].filter(Boolean);

  // --- Merge into an open lead for the same person -------------------------
  const windowStart = new Date(now.getTime() - DEDUPE_WINDOW_DAYS * 86_400_000);
  const [open] = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.contactPhone, input.phone),
        notInArray(leads.state, [...CLOSED_LEAD_STATES]),
        gt(leads.createdAt, windowStart),
      ),
    )
    .orderBy(desc(leads.createdAt))
    .limit(1);

  if (open) {
    await db.insert(leadActivities).values({
      leadId: open.id,
      kind: 'duplicate_enquiry',
      body: noteParts.join(' ') || 'Submitted another enquiry.',
      detail: {
        listing: listing?.name ?? null,
        institution: institution?.name ?? null,
        channel,
        ...attribution,
      },
    });
    await db
      .update(leads)
      .set({
        phoneVerifiedAt: open.phoneVerifiedAt ?? (input.phoneVerified ? now : null),
        userId: open.userId ?? resident?.id ?? null,
        updatedAt: now,
      })
      .where(eq(leads.id, open.id));
    await trackEvent({
      name: 'lead.duplicate_merged',
      leadId: open.id,
      propertyId: listing?.id,
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
    });
    return {
      leadId: open.id,
      reference: open.reference,
      merged: true,
      assignedToUserId: open.assignedToUserId,
      responsePromise: responsePromise(now),
    };
  }

  // --- New lead --------------------------------------------------------------
  const reference = newReference('lead');
  const [lead] = await db
    .insert(leads)
    .values({
      reference,
      userId: resident?.id ?? null,
      contactName: input.name.trim(),
      contactPhone: input.phone,
      contactEmail: input.email?.trim() || null,
      phoneVerifiedAt: input.phoneVerified ? now : null,
      guardianName: input.isUnder18 ? (input.guardianName ?? null) : null,
      guardianPhone: input.isUnder18 ? (input.guardianPhone ?? null) : null,
      requirementCity: city,
      budgetMaxAmountMinor:
        input.budgetMaxRupees && input.budgetMaxRupees > 0
          ? fromMajorUnits(String(Math.round(input.budgetMaxRupees)), 'INR').amountMinor
          : null,
      budgetCurrency: input.budgetMaxRupees ? 'INR' : null,
      requirementPropertyType: input.propertyType ?? null,
      requirementOccupancy: input.occupancy ?? null,
      requirementGenderPolicy: input.genderPolicy ?? null,
      moveInDate: input.moveInDate ?? null,
      tenureMonths: input.tenureMonths ?? null,
      institutionId: institution?.id ?? null,
      requirementNotes: noteParts.join(' ') || null,
      preferredLanguage: input.preferredLanguage ?? 'en',
      channel,
      ...attribution,
      state: 'new',
      slaFirstCallDueAt: firstCallDueAt(now),
    })
    .returning();

  await db.insert(leadActivities).values({
    leadId: lead.id,
    kind: 'created',
    body: listing ? `Enquiry about ${listing.name}` : 'New enquiry',
    detail: { channel, listingId: listing?.id ?? null, ...attribution },
  });

  // Consent, stamped with the policy version. Under-18: the guardian consents.
  const actor = input.isUnder18 ? 'guardian' : 'self';
  const consentBase = {
    subjectIdentifier: input.phone,
    userId: resident?.id ?? null,
    leadId: lead.id,
    actor,
    capturedVia: 'enquiry_form',
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  } as const;
  await recordConsent({ ...consentBase, purpose: 'data_processing' });
  await recordConsent({ ...consentBase, purpose: 'lead_contact' });
  await recordConsent({ ...consentBase, purpose: 'call_recording' });
  if (input.marketingConsent) {
    await recordConsent({ ...consentBase, purpose: 'marketing' });
  }

  await trackEvent({
    name: 'lead.created',
    leadId: lead.id,
    userId: resident?.id,
    propertyId: listing?.id,
    utmSource: attribution.utmSource,
    utmMedium: attribution.utmMedium,
    utmCampaign: attribution.utmCampaign,
    properties: { channel, city, phoneVerified: input.phoneVerified },
  });
  if (input.phoneVerified) {
    await trackEvent({ name: 'lead.phone_verified', leadId: lead.id });
  }

  await audit({
    actor: { id: resident?.id ?? null, label: `enquiry:${input.phone.slice(-4)}` },
    action: 'create',
    entityType: 'leads',
    entityId: lead.id,
    after: { reference, channel, city, state: 'new' },
  });

  // --- Route ---------------------------------------------------------------
  const decision = await pickAssignee({ city, language: lead.preferredLanguage });
  let assignedTo: string | null = null;
  if (decision) {
    assignedTo = decision.userId;
    await db
      .update(leads)
      .set({
        state: 'assigned',
        assignedToUserId: decision.userId,
        assignedAt: now,
        updatedAt: now,
      })
      .where(eq(leads.id, lead.id));
    await markAssigned(decision.userId);
    await db.insert(leadActivities).values({
      leadId: lead.id,
      kind: 'assignment',
      body: 'Assigned automatically',
      detail: {
        toUserId: decision.userId,
        matchLevel: decision.matchLevel,
        automatic: true,
      },
    });
    await trackEvent({
      name: 'lead.assigned',
      leadId: lead.id,
      properties: { matchLevel: decision.matchLevel, automatic: true },
    });
  }

  // --- Acknowledge ---------------------------------------------------------
  const promise = responsePromise(now);
  const ackTo =
    input.isUnder18 && input.guardianPhone ? input.guardianPhone : input.phone;
  const ack = await sendNotification({
    templateKey: 'lead.acknowledgement',
    channel: phoneChannel(),
    to: ackTo,
    variables: {
      name:
        (input.isUnder18 ? input.guardianName : input.name)?.split(' ')[0] ?? 'there',
      reference,
      when: promise,
    },
    leadId: lead.id,
    recipientUserId: resident?.id ?? null,
  });
  if (ack.state === 'sent') {
    await db
      .update(leads)
      .set({ acknowledgedAt: new Date() })
      .where(eq(leads.id, lead.id));
    await trackEvent({ name: 'lead.acknowledged', leadId: lead.id });
  }

  return {
    leadId: lead.id,
    reference,
    merged: false,
    assignedToUserId: assignedTo,
    responsePromise: promise,
  };
}

// ---------------------------------------------------------------------------
// Desk: visibility and queue
// ---------------------------------------------------------------------------

export function canViewLead(
  viewer: Pick<AuthenticatedUser, 'id' | 'roles'>,
  lead: { assignedToUserId: string | null },
): boolean {
  if (can(viewer.roles, 'lead:view_all')) return true;
  return can(viewer.roles, 'lead:view_assigned') && lead.assignedToUserId === viewer.id;
}

export type QueueScope = 'mine' | 'unassigned' | 'all' | 'breached' | 'follow_up';

export interface QueueRow {
  id: string;
  reference: string;
  contactName: string | null;
  requirementCity: string | null;
  budgetMaxAmountMinor: number | null;
  moveInDate: Date | null;
  channel: string;
  state: string;
  assignedToUserId: string | null;
  assignedToName: string | null;
  createdAt: Date;
  slaFirstCallDueAt: Date | null;
  firstCallAttemptedAt: Date | null;
  nextFollowUpAt: Date | null;
  phoneVerified: boolean;
  sla: SlaStatus;
}

export async function listLeadQueue(
  viewer: Pick<AuthenticatedUser, 'id' | 'roles'>,
  options: { scope: QueueScope; state?: string; now?: Date } = { scope: 'mine' },
): Promise<QueueRow[]> {
  const now = options.now ?? new Date();
  const seeAll = can(viewer.roles, 'lead:view_all');
  const conditions = [];

  // An RM without view_all only ever sees their own leads, whatever scope asked.
  if (!seeAll || options.scope === 'mine') {
    conditions.push(eq(leads.assignedToUserId, viewer.id));
  }
  if (options.scope === 'unassigned' && seeAll) {
    conditions.push(isNull(leads.assignedToUserId));
  }
  if (options.scope === 'breached') {
    conditions.push(
      isNull(leads.firstCallAttemptedAt),
      lt(leads.slaFirstCallDueAt, now),
      notInArray(leads.state, [...CLOSED_LEAD_STATES]),
    );
  }
  if (options.scope === 'follow_up') {
    conditions.push(lt(leads.nextFollowUpAt, new Date(now.getTime() + 86_400_000)));
  }
  if (options.state && options.state !== 'open' && options.state !== 'all') {
    conditions.push(eq(leads.state, options.state as LeadState));
  } else if (options.state !== 'all') {
    conditions.push(notInArray(leads.state, [...CLOSED_LEAD_STATES]));
  }

  const rows = await db
    .select({
      id: leads.id,
      reference: leads.reference,
      contactName: leads.contactName,
      requirementCity: leads.requirementCity,
      budgetMaxAmountMinor: leads.budgetMaxAmountMinor,
      moveInDate: leads.moveInDate,
      channel: leads.channel,
      state: leads.state,
      assignedToUserId: leads.assignedToUserId,
      assignedToName: users.fullName,
      createdAt: leads.createdAt,
      slaFirstCallDueAt: leads.slaFirstCallDueAt,
      firstCallAttemptedAt: leads.firstCallAttemptedAt,
      nextFollowUpAt: leads.nextFollowUpAt,
      phoneVerifiedAt: leads.phoneVerifiedAt,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedToUserId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      // Unworked leads closest to breach first, then follow-ups, then newest.
      sql`(${leads.firstCallAttemptedAt} IS NULL) desc`,
      asc(leads.slaFirstCallDueAt),
      asc(leads.nextFollowUpAt),
      desc(leads.createdAt),
    )
    .limit(200);

  return rows.map(({ phoneVerifiedAt, ...row }) => ({
    ...row,
    phoneVerified: phoneVerifiedAt !== null,
    sla: slaStatus({
      dueAt: row.slaFirstCallDueAt,
      firstCallAttemptedAt: row.firstCallAttemptedAt,
      now,
    }),
  }));
}

export async function queueCounts(
  viewer: Pick<AuthenticatedUser, 'id' | 'roles'>,
  now = new Date(),
) {
  const seeAll = can(viewer.roles, 'lead:view_all');
  const open = notInArray(leads.state, [...CLOSED_LEAD_STATES]);
  const mine = eq(leads.assignedToUserId, viewer.id);
  const scope = seeAll ? open : and(open, mine);

  const [row] = await db
    .select({
      mine: sql<number>`count(*) FILTER (WHERE ${leads.assignedToUserId} = ${viewer.id})::int`,
      unassigned: sql<number>`count(*) FILTER (WHERE ${leads.assignedToUserId} IS NULL)::int`,
      all: sql<number>`count(*)::int`,
      breached: sql<number>`count(*) FILTER (WHERE ${leads.firstCallAttemptedAt} IS NULL AND ${leads.slaFirstCallDueAt} < ${now})::int`,
      followUp: sql<number>`count(*) FILTER (WHERE ${leads.nextFollowUpAt} < ${new Date(now.getTime() + 86_400_000)})::int`,
    })
    .from(leads)
    .where(scope);
  return row;
}

// ---------------------------------------------------------------------------
// Desk: workspace
// ---------------------------------------------------------------------------

export async function getLeadWorkspace(
  leadId: string,
  viewer: Pick<AuthenticatedUser, 'id' | 'roles'>,
) {
  const [lead] = await db
    .select({
      lead: leads,
      assignedToName: users.fullName,
      institutionName: institutions.name,
      institutionSlug: institutions.slug,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedToUserId))
    .leftJoin(institutions, eq(institutions.id, leads.institutionId))
    .where(eq(leads.id, leadId))
    .limit(1);

  if (!lead) return null;
  if (!canViewLead(viewer, lead.lead)) return 'forbidden' as const;

  const [activities, callRows, shortlistRows, bookingRows] = await Promise.all([
    db
      .select({
        id: leadActivities.id,
        kind: leadActivities.kind,
        body: leadActivities.body,
        detail: leadActivities.detail,
        createdAt: leadActivities.createdAt,
        actorName: users.fullName,
      })
      .from(leadActivities)
      .leftJoin(users, eq(users.id, leadActivities.actorUserId))
      .where(eq(leadActivities.leadId, leadId))
      .orderBy(desc(leadActivities.createdAt))
      .limit(100),
    db
      .select()
      .from(calls)
      .where(eq(calls.leadId, leadId))
      .orderBy(desc(calls.createdAt)),
    db
      .select()
      .from(shortlists)
      .where(eq(shortlists.leadId, leadId))
      .orderBy(desc(shortlists.createdAt)),
    db
      .select({
        id: bookings.id,
        reference: bookings.reference,
        state: bookings.state,
        propertyName: properties.name,
        moveInDate: bookings.moveInDate,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .where(eq(bookings.leadId, leadId))
      .orderBy(desc(bookings.createdAt)),
  ]);

  return {
    ...lead,
    activities,
    calls: callRows,
    shortlists: shortlistRows,
    bookings: bookingRows,
    sla: slaStatus({
      dueAt: lead.lead.slaFirstCallDueAt,
      firstCallAttemptedAt: lead.lead.firstCallAttemptedAt,
    }),
  };
}

async function loadLeadForWrite(
  leadId: string,
  viewer: Pick<AuthenticatedUser, 'id' | 'roles'>,
) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) throw new LeadError('Lead not found.');
  if (!canViewLead(viewer, lead))
    throw new LeadError('This lead is not assigned to you.');
  return lead;
}

export async function assignLead(
  leadId: string,
  toUserId: string,
  viewer: AuthenticatedUser,
  actor: AuditActor,
): Promise<void> {
  if (!can(viewer.roles, 'lead:assign') && !can(viewer.roles, 'lead:reassign')) {
    throw new LeadError('Assigning leads needs the RM lead role.');
  }
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) throw new LeadError('Lead not found.');
  if (CLOSED_LEAD_STATES.includes(lead.state)) {
    throw new LeadError('A closed lead cannot be reassigned.');
  }

  const now = new Date();
  const nextState: LeadState = lead.state === 'new' ? 'assigned' : lead.state;
  if (nextState !== lead.state) assertTransition(leadMachine, lead.state, nextState);

  await db
    .update(leads)
    .set({
      assignedToUserId: toUserId,
      assignedAt: now,
      state: nextState,
      updatedAt: now,
    })
    .where(eq(leads.id, leadId));
  await markAssigned(toUserId);
  await db.insert(leadActivities).values({
    leadId,
    actorUserId: actor.id,
    kind: 'assignment',
    body: lead.assignedToUserId ? 'Reassigned' : 'Assigned',
    detail: { fromUserId: lead.assignedToUserId, toUserId, automatic: false },
  });
  await audit({
    actor,
    action: 'update',
    entityType: 'leads',
    entityId: leadId,
    before: { assignedToUserId: lead.assignedToUserId, state: lead.state },
    after: { assignedToUserId: toUserId, state: nextState },
  });
  await trackEvent({ name: 'lead.assigned', leadId, properties: { automatic: false } });
}

export async function transitionLead(
  leadId: string,
  to: LeadState,
  viewer: AuthenticatedUser,
  actor: AuditActor,
  options: { lostReason?: string | null; note?: string | null } = {},
): Promise<void> {
  const lead = await loadLeadForWrite(leadId, viewer);
  if (to === 'disqualified' && !can(viewer.roles, 'lead:disqualify')) {
    throw new LeadError('You cannot disqualify leads.');
  }
  if (to === 'lost' && !options.lostReason) {
    throw new LeadError(
      'Choose why the lead was lost — the funnel report depends on it.',
    );
  }
  assertTransition(leadMachine, lead.state, to);

  const now = new Date();
  await db
    .update(leads)
    .set({
      state: to,
      lostReason: to === 'lost' ? (options.lostReason as never) : lead.lostReason,
      updatedAt: now,
    })
    .where(eq(leads.id, leadId));
  await db.insert(leadActivities).values({
    leadId,
    actorUserId: actor.id,
    kind: 'state_change',
    body: options.note ?? null,
    detail: { from: lead.state, to, lostReason: options.lostReason ?? null },
  });
  await auditTransition({
    actor,
    entityType: 'leads',
    entityId: leadId,
    from: lead.state,
    to,
    reason: options.lostReason ?? options.note ?? null,
  });
  await trackEvent({
    name: 'lead.state_changed',
    leadId,
    properties: { from: lead.state, to },
  });
}

export async function addLeadNote(
  leadId: string,
  body: string,
  viewer: AuthenticatedUser,
  actor: AuditActor,
): Promise<void> {
  if (!body.trim()) throw new LeadError('Write a note first.');
  await loadLeadForWrite(leadId, viewer);
  await db.insert(leadActivities).values({
    leadId,
    actorUserId: actor.id,
    kind: 'note',
    body: body.trim().slice(0, 4000),
  });
  await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, leadId));
}

export async function scheduleFollowUp(
  leadId: string,
  at: Date | null,
  viewer: AuthenticatedUser,
  actor: AuditActor,
): Promise<void> {
  await loadLeadForWrite(leadId, viewer);
  await db
    .update(leads)
    .set({ nextFollowUpAt: at, updatedAt: new Date() })
    .where(eq(leads.id, leadId));
  await db.insert(leadActivities).values({
    leadId,
    actorUserId: actor.id,
    kind: 'follow_up',
    body: at ? `Follow-up scheduled for ${at.toISOString()}` : 'Follow-up cleared',
    detail: { at: at?.toISOString() ?? null },
  });
}

export async function updateRequirement(
  leadId: string,
  patch: {
    requirementCity?: string | null;
    budgetMaxRupees?: number | null;
    requirementOccupancy?: number | null;
    requirementGenderPolicy?: 'any' | 'male_only' | 'female_only' | null;
    moveInDate?: Date | null;
    tenureMonths?: number | null;
    requirementNotes?: string | null;
  },
  viewer: AuthenticatedUser,
  actor: AuditActor,
): Promise<void> {
  const lead = await loadLeadForWrite(leadId, viewer);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.requirementCity !== undefined) set.requirementCity = patch.requirementCity;
  if (patch.budgetMaxRupees !== undefined) {
    set.budgetMaxAmountMinor = patch.budgetMaxRupees
      ? fromMajorUnits(String(Math.round(patch.budgetMaxRupees)), 'INR').amountMinor
      : null;
    set.budgetCurrency = patch.budgetMaxRupees ? 'INR' : null;
  }
  if (patch.requirementOccupancy !== undefined)
    set.requirementOccupancy = patch.requirementOccupancy;
  if (patch.requirementGenderPolicy !== undefined)
    set.requirementGenderPolicy = patch.requirementGenderPolicy;
  if (patch.moveInDate !== undefined) set.moveInDate = patch.moveInDate;
  if (patch.tenureMonths !== undefined) set.tenureMonths = patch.tenureMonths;
  if (patch.requirementNotes !== undefined)
    set.requirementNotes = patch.requirementNotes;

  await db.update(leads).set(set).where(eq(leads.id, leadId));
  await db.insert(leadActivities).values({
    leadId,
    actorUserId: actor.id,
    kind: 'requirement_updated',
    detail: {
      before: { city: lead.requirementCity, budget: lead.budgetMaxAmountMinor },
      patch,
    },
  });
}

/** Staff RMs available for manual assignment. */
export async function listAssignableStaff() {
  return db
    .select({ id: users.id, name: users.fullName, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.audience, 'staff'),
        isNull(users.disabledAt),
        sql`EXISTS (SELECT 1 FROM staff_roles sr WHERE sr.user_id = ${users.id} AND sr.role IN ('rm','rm_lead') AND sr.revoked_at IS NULL)`,
      ),
    )
    .orderBy(asc(users.fullName));
}

/**
 * Record SLA breaches for unworked leads past their deadline (FR-13). Run by the
 * scheduled job; idempotent because it only touches leads not yet marked.
 */
export async function markSlaBreaches(now = new Date()): Promise<string[]> {
  const breached = await db
    .update(leads)
    .set({ slaBreachedAt: now, updatedAt: now })
    .where(
      and(
        isNull(leads.firstCallAttemptedAt),
        isNull(leads.slaBreachedAt),
        lt(leads.slaFirstCallDueAt, now),
        notInArray(leads.state, [...CLOSED_LEAD_STATES]),
      ),
    )
    .returning({ id: leads.id, assignedToUserId: leads.assignedToUserId });

  for (const row of breached) {
    await db.insert(leadActivities).values({
      leadId: row.id,
      kind: 'sla_breach',
      body: 'First-call deadline passed without a call attempt.',
      detail: { assignedToUserId: row.assignedToUserId },
    });
    await trackEvent({ name: 'lead.sla_breached', leadId: row.id });
  }
  return breached.map((r) => r.id);
}

/** Leads for a resident's own account page. */
export async function listLeadsForResident(userId: string, phone: string | null) {
  return db
    .select({
      id: leads.id,
      reference: leads.reference,
      state: leads.state,
      requirementCity: leads.requirementCity,
      createdAt: leads.createdAt,
      assignedToName: users.fullName,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedToUserId))
    .where(
      phone
        ? or(eq(leads.userId, userId), eq(leads.contactPhone, phone))
        : eq(leads.userId, userId),
    )
    .orderBy(desc(leads.createdAt));
}

export { inArray };
