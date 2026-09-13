import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  bookings,
  feeRules,
  leads,
  payments,
  properties,
  roomTypes,
  webhookEvents,
} from '@/lib/db/schema';
import { gstBreakdown, stateCodeFor } from '@/lib/fees';
import { paymentProvider, verifyRazorpaySignature } from '@/lib/integrations/payments';

import { applyCapturedPayment } from './bookings';
import { issuerDetails } from './invoices';

/**
 * The resident-facing payment page and provider webhooks.
 */

export async function getPaymentPage(token: string) {
  const [row] = await db
    .select({
      payment: payments,
      booking: bookings,
      propertyName: properties.name,
      propertyState: properties.state,
      city: properties.city,
      roomName: roomTypes.name,
      residentName: leads.contactName,
    })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .leftJoin(roomTypes, eq(roomTypes.id, bookings.roomTypeId))
    .leftJoin(leads, eq(leads.id, bookings.leadId))
    .where(eq(payments.publicToken, token))
    .limit(1);
  if (!row) return null;

  const [rule] = row.booking.facilitationFeeRuleId
    ? await db
        .select()
        .from(feeRules)
        .where(eq(feeRules.id, row.booking.facilitationFeeRuleId))
    : [];
  const gst = gstBreakdown({
    taxableMinor: row.booking.facilitationFeeAmountMinor ?? 0,
    taxRateBps: rule?.taxRateBps ?? 1800,
    supplierStateCode: issuerDetails().stateCode,
    placeOfSupplyStateCode:
      stateCodeFor(row.propertyState) ?? issuerDetails().stateCode,
  });

  let provider: 'razorpay' | 'test' | 'unavailable';
  try {
    provider = paymentProvider();
  } catch {
    provider = 'unavailable';
  }
  return { ...row, gst, provider };
}

/**
 * Test-mode payment. Runs the same capture path a Razorpay webhook would, so
 * confirmation, invoicing, lead closure and notifications are all exercised.
 * Refused whenever a real provider is configured or in production.
 */
export async function captureTestPayment(
  token: string,
): Promise<{ bookingId: string | null }> {
  if (paymentProvider() !== 'test') {
    throw new Error(
      'Test payments are only available when no payment provider is configured.',
    );
  }
  const [row] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.publicToken, token)))
    .limit(1);
  if (!row) throw new Error('Payment not found.');

  const result = await applyCapturedPayment({
    paymentId: row.id,
    providerPaymentId: `test_pay_${row.id}`,
    method: 'test',
    payload: { mode: 'test' },
    actor: { id: null, label: 'resident:test-payment' },
  });
  return { bookingId: result.bookingId };
}

interface RazorpayEvent {
  event: string;
  payload?: {
    payment?: {
      entity?: { id: string; method?: string; notes?: Record<string, string> };
    };
    payment_link?: { entity?: { id: string; reference_id?: string } };
  };
}

/**
 * Razorpay webhook. The receipt is written before processing, keyed by the
 * provider's event id, so a redelivered event is recognised by a unique
 * constraint rather than by handler timing.
 */
export async function handleRazorpayWebhook(params: {
  rawBody: string;
  signature: string | null;
  eventId: string | null;
}): Promise<{ status: number; message: string }> {
  const valid = verifyRazorpaySignature(params.rawBody, params.signature);
  let parsed: RazorpayEvent;
  try {
    parsed = JSON.parse(params.rawBody) as RazorpayEvent;
  } catch {
    return { status: 400, message: 'Malformed body' };
  }

  const eventId =
    params.eventId ??
    `${parsed.event}:${parsed.payload?.payment?.entity?.id ?? Date.now()}`;
  const inserted = await db
    .insert(webhookEvents)
    .values({
      provider: 'razorpay',
      providerEventId: eventId,
      eventType: parsed.event,
      signatureValid: valid,
      payload: parsed as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0)
    return { status: 200, message: 'Duplicate delivery ignored' };
  if (!valid) return { status: 401, message: 'Invalid signature' };

  const receiptId = inserted[0].id;
  try {
    if (parsed.event === 'payment_link.paid' || parsed.event === 'payment.captured') {
      const linkRef = parsed.payload?.payment_link?.entity?.reference_id;
      const noteRef = parsed.payload?.payment?.entity?.notes?.payment_id;
      const paymentId = linkRef ?? noteRef;
      if (paymentId) {
        await applyCapturedPayment({
          paymentId,
          providerPaymentId: parsed.payload?.payment?.entity?.id ?? null,
          method: parsed.payload?.payment?.entity?.method ?? null,
          payload: parsed as unknown as Record<string, unknown>,
          actor: { id: null, label: 'webhook:razorpay' },
        });
      }
    }
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, receiptId));
    return { status: 200, message: 'Processed' };
  } catch (error) {
    await db
      .update(webhookEvents)
      .set({ processingError: error instanceof Error ? error.message : String(error) })
      .where(eq(webhookEvents.id, receiptId));
    return { status: 500, message: 'Processing failed; will be retried' };
  }
}
