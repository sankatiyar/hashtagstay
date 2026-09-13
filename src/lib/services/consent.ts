import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { consents } from '@/lib/db/schema';
import { serverEnv } from '@/lib/env';

/**
 * DPDP consent records.
 *
 * Append-only: a withdrawal is a new row, so the history of what someone agreed
 * to, under which policy version, stays intact. The verbatim notice text is
 * stored with each grant because "they ticked a box" is not evidence of what
 * the box said.
 */

export type ConsentPurpose =
  | 'lead_contact'
  | 'call_recording'
  | 'marketing'
  | 'data_processing'
  | 'partner_sharing';

export const CONSENT_NOTICES: Record<ConsentPurpose, string> = {
  lead_contact:
    'Sandy Stays may call, WhatsApp and SMS me about this enquiry, and share my requirement (not my contact details) with operators who may have a suitable stay.',
  call_recording:
    'Calls with Sandy Stays may be recorded for quality, training and to resolve disputes.',
  marketing:
    'Sandy Stays may send me offers and updates about new stays. I can unsubscribe at any time.',
  data_processing:
    'Sandy Stays will process the details I provide to find me accommodation, as described in the privacy notice.',
  partner_sharing:
    'Sandy Stays may share my name and requirement with a named operator to arrange a visit or booking.',
};

export interface RecordConsentInput {
  purpose: ConsentPurpose;
  subjectIdentifier: string;
  userId?: string | null;
  leadId?: string | null;
  actor?: 'self' | 'guardian';
  capturedVia: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Defaults to the canonical notice for the purpose. */
  noticeText?: string;
}

export async function recordConsent(input: RecordConsentInput): Promise<string> {
  const [row] = await db
    .insert(consents)
    .values({
      purpose: input.purpose,
      state: 'granted',
      actor: input.actor ?? 'self',
      subjectIdentifier: input.subjectIdentifier,
      userId: input.userId ?? null,
      leadId: input.leadId ?? null,
      policyVersion: serverEnv().PRIVACY_POLICY_VERSION,
      noticeText: input.noticeText ?? CONSENT_NOTICES[input.purpose],
      capturedVia: input.capturedVia,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    })
    .returning({ id: consents.id });
  return row.id;
}

export async function withdrawConsent(input: {
  purpose: ConsentPurpose;
  subjectIdentifier: string;
  userId?: string | null;
  capturedVia: string;
}): Promise<void> {
  const now = new Date();
  await db.insert(consents).values({
    purpose: input.purpose,
    state: 'withdrawn',
    subjectIdentifier: input.subjectIdentifier,
    userId: input.userId ?? null,
    policyVersion: serverEnv().PRIVACY_POLICY_VERSION,
    capturedVia: input.capturedVia,
    grantedAt: now,
    withdrawnAt: now,
  });
}

/** The most recent state for a subject and purpose, or null if never recorded. */
export async function latestConsentState(
  subjectIdentifier: string,
  purpose: ConsentPurpose,
): Promise<'granted' | 'withdrawn' | null> {
  const [row] = await db
    .select({ state: consents.state })
    .from(consents)
    .where(
      and(
        eq(consents.subjectIdentifier, subjectIdentifier),
        eq(consents.purpose, purpose),
      ),
    )
    .orderBy(desc(consents.createdAt))
    .limit(1);
  return row?.state ?? null;
}
