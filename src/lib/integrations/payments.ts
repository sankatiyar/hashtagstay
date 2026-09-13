import { createHmac, timingSafeEqual } from 'node:crypto';

import { serverEnv } from '@/lib/env';
import { absoluteUrl } from '@/lib/seo';

/**
 * Payment provider adapter (FR-20).
 *
 * Phase 1 collects **only the facilitation fee**. Rent and deposit go from the
 * resident to the operator directly, which keeps Sandy Stays outside
 * payment-aggregator regulation.
 *
 * Providers:
 *  - **Razorpay** when key id and secret are set: real payment links, refunds
 *    and signed webhooks.
 *  - **Test mode** otherwise (never in production): the link points at our own
 *    `/pay/[token]` page, which offers a "pay in test mode" button that runs the
 *    exact same capture path a Razorpay webhook would.
 *
 * The Razorpay calls follow its documented REST API but have not been exercised
 * against a live account yet; verify them the first time credentials exist.
 */

export type PaymentProvider = 'razorpay' | 'test';

export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

export function paymentProvider(): PaymentProvider {
  const e = serverEnv();
  if (e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET) return 'razorpay';
  if (e.NODE_ENV === 'production' && !e.DEMO_MODE) {
    throw new PaymentProviderError(
      'Payments are not configured: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET. ' +
        'Test-mode payments are disabled in production.',
    );
  }
  return 'test';
}

function razorpayAuth(): string {
  const e = serverEnv();
  return `Basic ${Buffer.from(`${e.RAZORPAY_KEY_ID}:${e.RAZORPAY_KEY_SECRET}`).toString('base64')}`;
}

export interface CreateLinkInput {
  paymentId: string;
  publicToken: string;
  amountMinor: number;
  currency: string;
  description: string;
  customer: { name: string | null; phone: string; email: string | null };
  expiresAt: Date;
}

export interface CreatedLink {
  provider: PaymentProvider;
  providerPaymentLinkId: string | null;
  /** Where the resident is sent. Always our own page first. */
  url: string;
  /** The provider's hosted checkout, if any. */
  providerUrl: string | null;
}

export async function createPaymentLink(input: CreateLinkInput): Promise<CreatedLink> {
  const provider = paymentProvider();
  const ownPage = absoluteUrl(`/pay/${input.publicToken}`);

  if (provider === 'test') {
    return { provider, providerPaymentLinkId: null, url: ownPage, providerUrl: null };
  }

  const response = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: { Authorization: razorpayAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: input.amountMinor,
      currency: input.currency,
      description: input.description,
      reference_id: input.paymentId,
      expire_by: Math.floor(input.expiresAt.getTime() / 1000),
      customer: {
        name: input.customer.name ?? undefined,
        contact: input.customer.phone,
        email: input.customer.email ?? undefined,
      },
      notify: { sms: false, email: false },
      callback_url: ownPage,
      callback_method: 'get',
      notes: { payment_id: input.paymentId },
    }),
  });

  if (!response.ok) {
    throw new PaymentProviderError(
      `Razorpay payment link failed (${response.status}): ${await response.text()}`,
    );
  }
  const body = (await response.json()) as { id: string; short_url: string };
  return {
    provider,
    providerPaymentLinkId: body.id,
    url: ownPage,
    providerUrl: body.short_url,
  };
}

export async function refundPayment(params: {
  providerPaymentId: string | null;
  amountMinor: number;
}): Promise<{ providerRefundId: string | null }> {
  const provider = paymentProvider();
  if (provider === 'test' || !params.providerPaymentId) {
    return { providerRefundId: provider === 'test' ? `test_rfnd_${Date.now()}` : null };
  }

  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${params.providerPaymentId}/refund`,
    {
      method: 'POST',
      headers: { Authorization: razorpayAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: params.amountMinor }),
    },
  );
  if (!response.ok) {
    throw new PaymentProviderError(
      `Razorpay refund failed (${response.status}): ${await response.text()}`,
    );
  }
  const body = (await response.json()) as { id: string };
  return { providerRefundId: body.id };
}

/**
 * Verify a Razorpay webhook: HMAC-SHA256 of the raw body with the webhook
 * secret, compared in constant time. Must be computed on the raw bytes — a
 * re-serialised JSON body will not match.
 */
export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = serverEnv().RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
