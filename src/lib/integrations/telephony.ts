import { createHmac, timingSafeEqual } from 'node:crypto';

import { serverEnv } from '@/lib/env';
import { absoluteUrl } from '@/lib/seo';

/**
 * Telephony adapter (FR-12): click-to-call with number masking and recording.
 *
 * Masking is the revenue control, not a nicety. Both legs connect to a virtual
 * number, so neither the resident nor the operator ever learns the other's real
 * number and the booking cannot quietly move off-platform.
 *
 * Providers:
 *  - **Exotel** when configured: the documented "connect two numbers" API,
 *    which rings the agent first and bridges to the customer on the caller ID,
 *    with a status callback. Implemented against Exotel's published API but not
 *    yet exercised against a live account.
 *  - **Test mode** otherwise (never in production): records the call with a
 *    simulated masked number so the desk workflow — dispositions, SLA, activity
 *    history — can be used end to end.
 */

export type TelephonyProvider = 'exotel' | 'test';

export class TelephonyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelephonyError';
  }
}

export function telephonyProvider(): TelephonyProvider {
  const e = serverEnv();
  if (
    e.TELEPHONY_PROVIDER === 'exotel' &&
    e.TELEPHONY_API_KEY &&
    e.TELEPHONY_API_TOKEN &&
    e.TELEPHONY_ACCOUNT_SID &&
    e.TELEPHONY_CALLER_ID
  ) {
    return 'exotel';
  }
  if (e.NODE_ENV === 'production' && !e.DEMO_MODE) {
    throw new TelephonyError(
      'Click-to-call is not configured: set the TELEPHONY_* variables. Test-mode ' +
        'calling is disabled in production.',
    );
  }
  return 'test';
}

export interface PlacedCall {
  provider: TelephonyProvider;
  providerCallId: string;
  /** The virtual number both parties see. Never either party's real number. */
  maskedNumber: string;
}

export async function placeMaskedCall(params: {
  agentPhone: string;
  customerPhone: string;
  callId: string;
}): Promise<PlacedCall> {
  const provider = telephonyProvider();

  if (provider === 'test') {
    return {
      provider,
      providerCallId: `test_call_${params.callId}`,
      maskedNumber: '+91 80 4000 0000 (test)',
    };
  }

  const e = serverEnv();
  const url = `https://api.exotel.com/v1/Accounts/${e.TELEPHONY_ACCOUNT_SID}/Calls/connect.json`;
  const form = new URLSearchParams({
    From: params.agentPhone,
    To: params.customerPhone,
    CallerId: e.TELEPHONY_CALLER_ID!,
    Record: 'true',
    StatusCallback: absoluteUrl('/api/webhooks/telephony'),
    CustomField: params.callId,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${e.TELEPHONY_API_KEY}:${e.TELEPHONY_API_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  if (!response.ok) {
    throw new TelephonyError(
      `Exotel call failed (${response.status}): ${await response.text()}`,
    );
  }
  const body = (await response.json()) as { Call?: { Sid?: string } };
  return {
    provider,
    providerCallId: body.Call?.Sid ?? `exotel_${params.callId}`,
    maskedNumber: e.TELEPHONY_CALLER_ID!,
  };
}

/** Shared-secret HMAC check for the telephony status callback. */
export function verifyTelephonySignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = serverEnv().TELEPHONY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
