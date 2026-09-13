'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { type ActionResult, runAction } from '@/lib/action-result';
import {
  findOrCreateResident,
  getCurrentResident,
  signInResident,
} from '@/lib/auth/resident';
import { destroyCurrentSession } from '@/lib/auth/session';
import { requestOtp, verifyOtp } from '@/lib/services/otp';
import { submitReview, toggleWishlist } from '@/lib/services/reviews';
import { openTicket, residentReply } from '@/lib/services/tickets';

export interface LoginState {
  step: 'phone' | 'code';
  phone?: string;
  error?: string;
  devCode?: string;
  next?: string;
}

export async function residentLoginAction(
  previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const intent = String(formData.get('intent') ?? 'send');
  const phone = String(formData.get('phone') ?? previous.phone ?? '');
  const next = String(formData.get('next') ?? '/account');

  if (intent === 'send' || intent === 'resend') {
    const result = await requestOtp({ phone, purpose: 'login' });
    if (!result.ok)
      return {
        step: intent === 'resend' ? 'code' : 'phone',
        phone,
        error: result.message,
        next,
      };
    return { step: 'code', phone: result.destination, devCode: result.devCode, next };
  }

  const verified = await verifyOtp({
    phone,
    purpose: 'login',
    code: String(formData.get('code') ?? ''),
  });
  if (!verified.ok) return { step: 'code', phone, error: verified.message, next };

  const h = await headers();
  const resident = await findOrCreateResident({ phone: verified.destination });
  await signInResident({
    userId: resident.id,
    ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
  });
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/account');
}

export async function residentSignOut(): Promise<void> {
  await destroyCurrentSession();
  redirect('/');
}

export async function toggleWishlistAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const resident = await getCurrentResident();
    if (!resident) return { error: 'Sign in with your phone to save stays.' };
    const saved = await toggleWishlist(
      resident.id,
      String(formData.get('propertyId') ?? ''),
    );
    revalidatePath('/account');
    return { ok: saved ? 'Saved to your shortlist.' : 'Removed.' };
  });
}

export async function raiseTicketAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const resident = await getCurrentResident();
    if (!resident) return { error: 'Please sign in again.' };
    const result = await openTicket({
      subject: String(formData.get('subject') ?? ''),
      body: String(formData.get('body') ?? ''),
      category: String(formData.get('category') ?? 'other'),
      bookingId: String(formData.get('bookingId') ?? '') || null,
      raisedByUserId: resident.id,
      contactPhone: resident.phone,
      contactEmail: resident.email,
      authorKind: 'resident',
    });
    revalidatePath('/account/support');
    return {
      ok:
        result.priority === 'safety_critical'
          ? `Request ${result.reference} raised as a safety concern. Our team responds within 15 minutes, day or night. If you are in immediate danger call 112.`
          : `Request ${result.reference} raised. We will get back to you soon.`,
    };
  });
}

export async function replyTicketAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const resident = await getCurrentResident();
    if (!resident) return { error: 'Please sign in again.' };
    const ticketId = String(formData.get('ticketId') ?? '');
    await residentReply(ticketId, resident.id, String(formData.get('body') ?? ''));
    revalidatePath(`/account/support/${ticketId}`);
    return { ok: 'Sent.' };
  });
}

export async function submitReviewAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const resident = await getCurrentResident();
    if (!resident) return { error: 'Please sign in again.' };
    const safety = String(formData.get('safetyRating') ?? '');
    await submitReview({
      bookingId: String(formData.get('bookingId') ?? ''),
      userId: resident.id,
      phone: resident.phone,
      rating: Number(formData.get('rating')),
      safetyRating: safety ? Number(safety) : null,
      title: String(formData.get('title') ?? ''),
      body: String(formData.get('body') ?? ''),
    });
    revalidatePath('/account');
    return { ok: 'Thank you. Your review will appear once our team has checked it.' };
  });
}
