import { and, eq, isNull } from 'drizzle-orm';

import { type AuditActor, audit } from '@/lib/audit';
import type { AuthenticatedUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { calls, leadActivities, leads, users } from '@/lib/db/schema';
import { placeMaskedCall } from '@/lib/integrations/telephony';
import { assertTransition, leadMachine } from '@/lib/state-machines';

import { trackEvent } from './events';
import { LeadError, canViewLead } from './leads';

/**
 * Click-to-call and call logging (FR-12).
 *
 * Placing a call is what stops the SLA clock, so `firstCallAttemptedAt` is set
 * here, at dial time — not when someone later remembers to log the outcome.
 */

export type CallDisposition =
  | 'connected'
  | 'no_answer'
  | 'busy'
  | 'invalid_number'
  | 'switched_off'
  | 'call_back_later'
  | 'wrong_person'
  | 'failed';

export async function placeCall(
  leadId: string,
  viewer: AuthenticatedUser,
  actor: AuditActor,
): Promise<{ callId: string; maskedNumber: string; provider: string }> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) throw new LeadError('Lead not found.');
  if (!canViewLead(viewer, lead))
    throw new LeadError('This lead is not assigned to you.');

  const [agent] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, viewer.id))
    .limit(1);
  if (!agent?.phone) {
    throw new LeadError(
      'Add your own mobile number to your staff profile first — the call rings you, then connects the resident.',
    );
  }

  const target = lead.guardianPhone ?? lead.contactPhone;
  const now = new Date();

  const [call] = await db
    .insert(calls)
    .values({
      leadId,
      agentUserId: viewer.id,
      direction: 'outbound',
      startedAt: now,
      // The recording disclosure plays on the connected leg; recorded here so
      // every recording is traceable to its announcement (DPDP).
      recordingConsentCaptured: now,
    })
    .returning({ id: calls.id });

  const placed = await placeMaskedCall({
    agentPhone: agent.phone,
    customerPhone: target,
    callId: call.id,
  });

  await db
    .update(calls)
    .set({
      provider: placed.provider,
      providerCallId: placed.providerCallId,
      maskedNumber: placed.maskedNumber,
      updatedAt: new Date(),
    })
    .where(eq(calls.id, call.id));

  const firstAttempt = lead.firstCallAttemptedAt === null;
  const moveToContacting = lead.state === 'assigned';
  if (moveToContacting) assertTransition(leadMachine, lead.state, 'contacting');

  await db
    .update(leads)
    .set({
      firstCallAttemptedAt: lead.firstCallAttemptedAt ?? now,
      contactAttemptCount: lead.contactAttemptCount + 1,
      lastContactedAt: now,
      state: moveToContacting ? 'contacting' : lead.state,
      updatedAt: now,
    })
    .where(eq(leads.id, leadId));

  await db.insert(leadActivities).values({
    leadId,
    actorUserId: viewer.id,
    kind: 'call',
    body: `Outbound call placed via ${placed.maskedNumber}`,
    detail: { callId: call.id, provider: placed.provider, firstAttempt },
  });
  await trackEvent({
    name: 'call.placed',
    leadId,
    userId: viewer.id,
    properties: { firstAttempt, provider: placed.provider },
  });
  await audit({
    actor,
    action: 'create',
    entityType: 'calls',
    entityId: call.id,
    after: { leadId, provider: placed.provider },
  });

  return {
    callId: call.id,
    maskedNumber: placed.maskedNumber,
    provider: placed.provider,
  };
}

export async function recordDisposition(
  callId: string,
  input: {
    disposition: CallDisposition;
    notes?: string | null;
    durationSeconds?: number | null;
  },
  viewer: AuthenticatedUser,
  actor: AuditActor,
): Promise<void> {
  const [call] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
  if (!call?.leadId) throw new LeadError('Call not found.');
  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, call.leadId))
    .limit(1);
  if (!lead || !canViewLead(viewer, lead))
    throw new LeadError('This lead is not assigned to you.');

  const now = new Date();
  const connected = input.disposition === 'connected';

  await db
    .update(calls)
    .set({
      disposition: input.disposition,
      notes: input.notes ?? null,
      durationSeconds: input.durationSeconds ?? null,
      answeredAt: connected
        ? (call.answeredAt ?? call.startedAt ?? now)
        : call.answeredAt,
      endedAt: call.endedAt ?? now,
      updatedAt: now,
    })
    .where(eq(calls.id, callId));

  if (connected) {
    await db
      .update(leads)
      .set({ firstCallConnectedAt: lead.firstCallConnectedAt ?? now, updatedAt: now })
      .where(and(eq(leads.id, lead.id), isNull(leads.firstCallConnectedAt)));
    await trackEvent({ name: 'call.connected', leadId: lead.id, userId: viewer.id });
  }

  await db.insert(leadActivities).values({
    leadId: lead.id,
    actorUserId: viewer.id,
    kind: 'call_outcome',
    body: input.notes ?? null,
    detail: {
      callId,
      disposition: input.disposition,
      durationSeconds: input.durationSeconds ?? null,
    },
  });
  await audit({
    actor,
    action: 'update',
    entityType: 'calls',
    entityId: callId,
    after: { disposition: input.disposition },
  });
}

/** Apply a provider status callback to a call row. Idempotent. */
export async function applyCallStatus(params: {
  providerCallId: string;
  status: string;
  durationSeconds?: number | null;
  recordingUrl?: string | null;
}): Promise<boolean> {
  const [call] = await db
    .select()
    .from(calls)
    .where(eq(calls.providerCallId, params.providerCallId))
    .limit(1);
  if (!call) return false;

  const status = params.status.toLowerCase();
  const disposition: CallDisposition | null =
    status === 'completed'
      ? 'connected'
      : status === 'no-answer'
        ? 'no_answer'
        : status === 'busy'
          ? 'busy'
          : status === 'failed'
            ? 'failed'
            : null;

  await db
    .update(calls)
    .set({
      disposition: call.disposition ?? disposition,
      durationSeconds: params.durationSeconds ?? call.durationSeconds,
      recordingPath: params.recordingUrl ?? call.recordingPath,
      endedAt: call.endedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(calls.id, call.id));
  return true;
}
