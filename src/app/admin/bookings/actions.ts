'use server';

import { revalidatePath } from 'next/cache';

import { type ActionResult, runAction } from '@/lib/action-result';
import { actorFor, requirePermissionForAction } from '@/lib/auth/guard';
import { type CancelReason } from '@/lib/fees';
import {
  cancelBooking,
  completeBooking,
  confirmHostAvailability,
  createBooking,
  declineHostAvailability,
  markMovedIn,
  requestHostConfirmation,
  sendPaymentLink,
} from '@/lib/services/bookings';

function refresh(bookingId: string | null, leadId: string | null) {
  revalidatePath('/admin/bookings');
  if (bookingId) revalidatePath(`/admin/bookings/${bookingId}`);
  if (leadId) revalidatePath(`/admin/leads/${leadId}`);
}

export async function createBookingAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('booking:create');
    const leadId = String(formData.get('leadId') ?? '');
    const [propertyId, roomTypeId] = String(formData.get('room') ?? '').split(':');
    const moveIn = String(formData.get('moveInDate') ?? '');
    if (!propertyId || !roomTypeId) return { error: 'Choose a room.' };
    if (!moveIn) return { error: 'Choose a move-in date.' };
    const rent = String(formData.get('monthlyRent') ?? '').replace(/[,\s₹]/g, '');
    const deposit = String(formData.get('deposit') ?? '').replace(/[,\s₹]/g, '');

    const result = await createBooking(
      leadId,
      {
        propertyId,
        roomTypeId,
        moveInDate: new Date(`${moveIn}T00:00:00+05:30`),
        tenureMonths: Number(formData.get('tenureMonths')),
        monthlyRentRupees: rent ? Number(rent) : null,
        depositRupees: deposit ? Number(deposit) : null,
      },
      user,
      actorFor(user),
    );
    refresh(result.bookingId, leadId);
    return {
      ok: `Booking ${result.reference} started. Next: ask the operator to confirm.`,
    };
  });
}

export async function requestHostConfirmationAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('booking:request_host_confirmation');
    const bookingId = String(formData.get('bookingId') ?? '');
    await requestHostConfirmation(bookingId, user, actorFor(user));
    refresh(bookingId, String(formData.get('leadId') ?? '') || null);
    return { ok: 'Operator asked to confirm the bed.' };
  });
}

export async function confirmHostOnCallAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('booking:request_host_confirmation');
    const bookingId = String(formData.get('bookingId') ?? '');
    await confirmHostAvailability(
      bookingId,
      { confirmedByUserId: user.id, via: 'rm_call' },
      actorFor(user),
    );
    refresh(bookingId, String(formData.get('leadId') ?? '') || null);
    return { ok: 'Operator confirmation recorded. You can now send the payment link.' };
  });
}

export async function declineHostAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('booking:request_host_confirmation');
    const bookingId = String(formData.get('bookingId') ?? '');
    await declineHostAvailability(
      bookingId,
      { byUserId: user.id, note: String(formData.get('note') ?? '') || null },
      actorFor(user),
    );
    refresh(bookingId, String(formData.get('leadId') ?? '') || null);
    return { ok: 'Recorded. The lead is back in negotiation.' };
  });
}

export async function sendPaymentLinkAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('payment:create_link');
    const bookingId = String(formData.get('bookingId') ?? '');
    const result = await sendPaymentLink(bookingId, user, actorFor(user));
    refresh(bookingId, String(formData.get('leadId') ?? '') || null);
    return { ok: `Payment link sent (${result.delivery}).`, data: { url: result.url } };
  });
}

export async function cancelBookingAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('booking:create');
    const bookingId = String(formData.get('bookingId') ?? '');
    const decision = await cancelBooking(
      bookingId,
      {
        reason: String(formData.get('reason') ?? 'other') as CancelReason,
        note: String(formData.get('note') ?? '') || null,
      },
      user,
      actorFor(user),
    );
    refresh(bookingId, String(formData.get('leadId') ?? '') || null);
    return { ok: `Cancelled. ${decision.explanation}` };
  });
}

export async function markMovedInAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('booking:create');
    const bookingId = String(formData.get('bookingId') ?? '');
    await markMovedIn(bookingId, actorFor(user));
    refresh(bookingId, String(formData.get('leadId') ?? '') || null);
    return { ok: 'Marked as moved in.' };
  });
}

export async function completeBookingAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('booking:create');
    const bookingId = String(formData.get('bookingId') ?? '');
    await completeBooking(bookingId, actorFor(user));
    refresh(bookingId, String(formData.get('leadId') ?? '') || null);
    return { ok: 'Booking completed.' };
  });
}
