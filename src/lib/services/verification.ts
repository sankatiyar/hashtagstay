import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { type AuditActor, audit, auditTransition } from '@/lib/audit';
import { SEPARATION_OF_DUTIES, type StaffRole } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { properties, verifications } from '@/lib/db/schema';
import {
  type ListingState,
  assertTransition,
  listingMachine,
  verificationMachine,
} from '@/lib/state-machines';
import {
  type Checklist,
  type VerificationTier,
  canGrant,
  expiryFor,
} from '@/lib/verification/rubric';

/**
 * Verification workflow.
 *
 * This is the mechanism behind the platform's central trust claim, so three
 * things are enforced here rather than left to the UI:
 *
 *  1. **Separation of duties.** Whoever submitted a listing cannot certify it,
 *     even holding both roles. A badge signed by its own author is not a trust
 *     signal.
 *  2. **The rubric decides the tier, not the reviewer.** A tier can only be
 *     granted when every cumulative checklist item it requires actually passes.
 *  3. **Every grant expires.** An on-ground audit from two years ago must stop
 *     presenting as current.
 */

export class VerificationError extends Error {
  constructor(
    message: string,
    readonly reason:
      'not_found' | 'separation_of_duties' | 'insufficient_checklist' | 'wrong_state',
  ) {
    super(message);
    this.name = 'VerificationError';
  }
}

/** The verification currently in flight for a property, if any. */
export async function getActiveVerification(propertyId: string) {
  const [row] = await db
    .select()
    .from(verifications)
    .where(
      and(
        eq(verifications.subject, 'property'),
        eq(verifications.subjectId, propertyId),
        inArray(verifications.state, ['pending', 'docs_received', 'in_review']),
      ),
    )
    .orderBy(desc(verifications.createdAt))
    .limit(1);

  return row ?? null;
}

/** Full history, so a reviewer can see what was checked before. */
export async function listVerificationHistory(propertyId: string) {
  return db
    .select()
    .from(verifications)
    .where(
      and(
        eq(verifications.subject, 'property'),
        eq(verifications.subjectId, propertyId),
      ),
    )
    .orderBy(desc(verifications.createdAt));
}

/**
 * Open a verification and move the listing into `in_verification`.
 *
 * Records who asked, which is what the separation-of-duties check later
 * compares against.
 */
export async function requestVerification(
  propertyId: string,
  requestedTier: VerificationTier,
  actor: AuditActor & { id: string },
): Promise<{ verificationId: string }> {
  const existing = await getActiveVerification(propertyId);
  if (existing) {
    return { verificationId: existing.id };
  }

  const [property] = await db
    .select({ state: properties.listingState })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  if (!property) {
    throw new VerificationError(`Property ${propertyId} not found`, 'not_found');
  }

  /**
   * The path the listing takes to reach `in_verification`.
   *
   * A draft cannot jump straight there — the machine routes it through
   * `submitted`, which is a real state meaning "ops says it is ready, nobody
   * has picked it up yet" and is what the queue's awaiting-review group shows.
   * Rather than make ops click twice for one intent, walk the legal path and
   * audit each hop, so the history records both.
   */
  const path: ListingState[] =
    property.state === 'in_verification'
      ? []
      : property.state === 'draft'
        ? ['submitted', 'in_verification']
        : ['in_verification'];

  const created = await db.transaction(async (tx) => {
    const [verification] = await tx
      .insert(verifications)
      .values({
        subject: 'property',
        subjectId: propertyId,
        requestedTier,
        state: 'docs_received',
        requestedByUserId: actor.id,
        checklist: {},
      })
      .returning({ id: verifications.id });

    // Validate every hop before writing anything. A property already live can
    // be re-verified when its badge expires, and the machine permits
    // live -> in_verification without knocking it off the site.
    let from = property.state;
    for (const to of path) {
      assertTransition(listingMachine, from, to);
      from = to;
    }

    if (path.length > 0) {
      await tx
        .update(properties)
        .set({ listingState: path[path.length - 1], updatedAt: new Date() })
        .where(eq(properties.id, propertyId));
    }

    return verification;
  });

  await audit({
    actor,
    action: 'create',
    entityType: 'verifications',
    entityId: created.id,
    after: { subjectId: propertyId, requestedTier, state: 'docs_received' },
  });

  // Audit each hop separately so the trail shows the route taken, not just the
  // destination.
  let auditedFrom = property.state;
  for (const to of path) {
    await auditTransition({
      actor,
      entityType: 'properties',
      entityId: propertyId,
      from: auditedFrom,
      to,
      reason: `Verification requested (${requestedTier})`,
    });
    auditedFrom = to;
  }

  return { verificationId: created.id };
}

/** Save checklist progress without deciding anything. */
export async function saveChecklist(
  verificationId: string,
  checklist: Checklist,
  evidencePaths: string[] | null,
  actor: AuditActor,
): Promise<void> {
  const [before] = await db
    .select({ checklist: verifications.checklist, state: verifications.state })
    .from(verifications)
    .where(eq(verifications.id, verificationId))
    .limit(1);

  if (!before) {
    throw new VerificationError('Verification not found', 'not_found');
  }

  // `in_review` means someone is actively working it. Only advance, never
  // regress a decided record back into review by saving notes on it.
  const nextState =
    before.state === 'approved' || before.state === 'rejected'
      ? before.state
      : 'in_review';

  if (nextState !== before.state) {
    assertTransition(verificationMachine, before.state, nextState);
  }

  await db
    .update(verifications)
    .set({
      checklist,
      evidencePaths: evidencePaths ?? undefined,
      state: nextState,
      updatedAt: new Date(),
    })
    .where(eq(verifications.id, verificationId));

  await audit({
    actor,
    action: 'update',
    entityType: 'verifications',
    entityId: verificationId,
    before: { checklist: before.checklist },
    after: { checklist },
  });
}

/**
 * Grant a tier and take the listing live.
 *
 * Publishing *is* what approval performs — the listing machine reaches `live`
 * only from `in_verification` — so the two happen together rather than leaving
 * approved inventory stranded for someone else to publish.
 */
export async function approveVerification(
  verificationId: string,
  tier: VerificationTier,
  actor: AuditActor & { id: string; roles: readonly StaffRole[] },
  note?: string,
): Promise<void> {
  const [record] = await db
    .select()
    .from(verifications)
    .where(eq(verifications.id, verificationId))
    .limit(1);

  if (!record) {
    throw new VerificationError('Verification not found', 'not_found');
  }
  if (record.state === 'approved') {
    throw new VerificationError(
      'This verification is already approved.',
      'wrong_state',
    );
  }

  const [property] = await db
    .select({
      id: properties.id,
      state: properties.listingState,
      createdByUserId: properties.createdByUserId,
    })
    .from(properties)
    .where(eq(properties.id, record.subjectId))
    .limit(1);

  if (!property) {
    throw new VerificationError('Property not found', 'not_found');
  }

  // Whoever submitted it, or entered it, cannot be the one to certify it.
  const submittedBy = record.requestedByUserId ?? property.createdByUserId;
  const allowed = SEPARATION_OF_DUTIES.canApproveVerification({
    actorUserId: actor.id,
    actorRoles: actor.roles,
    submittedByUserId: submittedBy,
  });
  if (!allowed.allowed) {
    throw new VerificationError(
      allowed.reason ?? 'You cannot approve this verification.',
      'separation_of_duties',
    );
  }

  // The rubric decides, not the reviewer's confidence.
  const grant = canGrant(tier, record.checklist as Checklist);
  if (!grant.ok) {
    throw new VerificationError(
      `Cannot grant "${tier}" yet. Still outstanding: ${grant.missing
        .map((item) => item.label)
        .join(', ')}.`,
      'insufficient_checklist',
    );
  }

  const now = new Date();
  const expiresAt = expiryFor(tier, now);

  // Publishing only makes sense from in_verification; a paused or suspended
  // listing gets its badge without being forced back onto the site.
  const shouldPublish = property.state === 'in_verification';
  let publishedTo: ListingState | null = null;

  await db.transaction(async (tx) => {
    await tx
      .update(verifications)
      .set({
        state: 'approved',
        grantedTier: tier,
        reviewedBy: actor.id,
        reviewedAt: now,
        decisionNote: note ?? null,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(verifications.id, verificationId));

    await tx
      .update(properties)
      .set({
        verificationTier: tier,
        verifiedAt: now,
        verificationExpiresAt: expiresAt,
        lastReviewedAt: now,
        ...(shouldPublish ? { listingState: 'live' as const, publishedAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(properties.id, property.id));

    if (shouldPublish) {
      assertTransition(listingMachine, property.state, 'live');
      publishedTo = 'live';
    }
  });

  await audit({
    actor,
    action: 'state_transition',
    entityType: 'verifications',
    entityId: verificationId,
    before: { state: record.state, grantedTier: record.grantedTier },
    after: { state: 'approved', grantedTier: tier, expiresAt, note: note ?? null },
  });

  if (publishedTo) {
    await auditTransition({
      actor,
      entityType: 'properties',
      entityId: property.id,
      from: property.state,
      to: publishedTo,
      reason: `Verification approved at ${tier}`,
    });
  }
}

/**
 * Reject, sending the listing back for changes rather than leaving it stuck in
 * verification where nobody owns it.
 */
export async function rejectVerification(
  verificationId: string,
  note: string,
  actor: AuditActor & { id: string; roles: readonly StaffRole[] },
): Promise<void> {
  if (!note.trim()) {
    throw new VerificationError(
      'A rejection needs a reason — the operator has to know what to fix.',
      'wrong_state',
    );
  }

  const [record] = await db
    .select()
    .from(verifications)
    .where(eq(verifications.id, verificationId))
    .limit(1);

  if (!record) {
    throw new VerificationError('Verification not found', 'not_found');
  }

  const [property] = await db
    .select({ id: properties.id, state: properties.listingState })
    .from(properties)
    .where(eq(properties.id, record.subjectId))
    .limit(1);

  if (!property) {
    throw new VerificationError('Property not found', 'not_found');
  }

  const now = new Date();
  const sendBack = property.state === 'in_verification';

  await db.transaction(async (tx) => {
    assertTransition(verificationMachine, record.state, 'rejected');

    await tx
      .update(verifications)
      .set({
        state: 'rejected',
        reviewedBy: actor.id,
        reviewedAt: now,
        decisionNote: note,
        updatedAt: now,
      })
      .where(eq(verifications.id, verificationId));

    if (sendBack) {
      assertTransition(listingMachine, property.state, 'changes_requested');
      await tx
        .update(properties)
        .set({ listingState: 'changes_requested', updatedAt: now })
        .where(eq(properties.id, property.id));
    }
  });

  await audit({
    actor,
    action: 'state_transition',
    entityType: 'verifications',
    entityId: verificationId,
    before: { state: record.state },
    after: { state: 'rejected', note },
  });

  if (sendBack) {
    await auditTransition({
      actor,
      entityType: 'properties',
      entityId: property.id,
      from: property.state,
      to: 'changes_requested',
      reason: note,
    });
  }
}

/**
 * Expire granted verifications whose date has passed.
 *
 * Intended for a scheduled job. Deliberately does **not** unpublish the
 * listing: an expired badge means "we no longer vouch for this", not "this
 * property vanished", and pulling live inventory automatically would be a
 * bigger business decision than a cron job should make. The listing keeps
 * selling with a visibly expired badge until someone re-verifies it.
 */
export async function expireLapsedVerifications(): Promise<string[]> {
  // One statement, and `now()` is evaluated by the database rather than passed
  // from the app — a scheduled job on a host with a skewed clock should not be
  // able to expire badges early or late.
  const expired = await db
    .update(verifications)
    .set({ state: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(verifications.state, 'approved'),
        sql`${verifications.expiresAt} IS NOT NULL`,
        sql`${verifications.expiresAt} < now()`,
      ),
    )
    .returning({ id: verifications.id, subjectId: verifications.subjectId });

  for (const row of expired) {
    await audit({
      actor: { id: null, label: 'system:expire-verifications' },
      action: 'state_transition',
      entityType: 'verifications',
      entityId: row.id,
      before: { state: 'approved' },
      after: { state: 'expired', subjectId: row.subjectId },
    });
  }

  return expired.map((row) => row.id);
}
