import { NextResponse } from 'next/server';

import { handleRazorpayWebhook } from '@/lib/services/payments';

/**
 * Razorpay webhook. The raw body is read as text because the signature is an
 * HMAC over the exact bytes sent; parsing and re-serialising JSON would change
 * them and every signature would fail.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleRazorpayWebhook({
    rawBody,
    signature: request.headers.get('x-razorpay-signature'),
    eventId: request.headers.get('x-razorpay-event-id'),
  });
  return NextResponse.json({ message: result.message }, { status: result.status });
}
