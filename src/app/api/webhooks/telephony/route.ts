import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { webhookEvents } from '@/lib/db/schema';
import { verifyTelephonySignature } from '@/lib/integrations/telephony';
import { applyCallStatus } from '@/lib/services/calls';

/**
 * Telephony status callback (FR-12). Exotel posts form-encoded call status,
 * duration and recording URL. Receipts are recorded before processing and
 * de-duplicated on the provider's call id and status.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const valid = verifyTelephonySignature(
    rawBody,
    request.headers.get('x-hashtagstay-signature'),
  );
  const form = new URLSearchParams(rawBody);

  const callSid = form.get('CallSid');
  const status = form.get('Status') ?? form.get('CallStatus') ?? 'unknown';
  if (!callSid)
    return NextResponse.json({ message: 'Missing CallSid' }, { status: 400 });

  const inserted = await db
    .insert(webhookEvents)
    .values({
      provider: 'telephony',
      providerEventId: `${callSid}:${status}`,
      eventType: status,
      signatureValid: valid,
      payload: Object.fromEntries(form.entries()),
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) return NextResponse.json({ message: 'Duplicate' });
  if (!valid)
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });

  const duration = Number(form.get('DialCallDuration') ?? form.get('Duration'));
  await applyCallStatus({
    providerCallId: callSid,
    status,
    durationSeconds: Number.isFinite(duration) ? duration : null,
    recordingUrl: form.get('RecordingUrl'),
  });
  return NextResponse.json({ message: 'Processed' });
}
