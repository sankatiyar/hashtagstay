'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import type { CreatePropertyState } from '@/app/admin/properties/new/actions';
import { type ActionResult, runAction } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertHostCan, hostForAction, signUpHost } from '@/lib/auth/host';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, destroyCurrentSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { normalizeIndianMobile } from '@/lib/phone';
import {
  confirmHostAvailability,
  declineHostAvailability,
} from '@/lib/services/bookings';
import { trackEvent } from '@/lib/services/events';
import {
  assertBookingInOrg,
  assertPropertyInOrg,
  assertRoomInOrg,
} from '@/lib/services/host-portal';
import {
  deletePhoto,
  setCoverPhoto,
  uploadDocument,
  uploadPropertyPhoto,
} from '@/lib/services/media';
import { confirmAvailability, createProperty } from '@/lib/services/properties';
import { requestVerification } from '@/lib/services/verification';
import {
  createPropertySchema,
  fieldErrors,
  parsePropertyForm,
} from '@/lib/validation/property';
import type { VerificationTier } from '@/lib/verification/rubric';

const hostActor = (ctx: Awaited<ReturnType<typeof hostForAction>>) => ({
  id: ctx.user.id,
  label: `host:${ctx.user.email ?? ctx.user.id}`,
});

export interface HostAuthState {
  error?: string;
}

export async function hostLoginAction(
  _p: HostAuthState,
  formData: FormData,
): Promise<HostAuthState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/host');

  const [user] = await db
    .select({
      id: users.id,
      audience: users.audience,
      passwordHash: users.passwordHash,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);
  const ok = await verifyPassword(password, user?.passwordHash ?? null);
  if (!ok || !user || user.audience !== 'host' || user.disabledAt) {
    await audit({
      actor: { id: null, label: email },
      action: 'login_failed',
      entityType: 'users',
      entityId: user?.id ?? null,
      after: { portal: 'host' },
    });
    return { error: 'Those credentials are not valid.' };
  }

  const h = await headers();
  await createSession({
    userId: user.id,
    audience: 'host',
    ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
  });
  await audit({
    actor: { id: user.id, label: email },
    action: 'login',
    entityType: 'users',
    entityId: user.id,
    after: { portal: 'host' },
  });
  redirect(next.startsWith('/host') ? next : '/host');
}

export async function hostSignupAction(
  _p: HostAuthState,
  formData: FormData,
): Promise<HostAuthState> {
  const phoneRaw = String(formData.get('phone') ?? '');
  const phone = phoneRaw ? normalizeIndianMobile(phoneRaw) : null;
  if (phoneRaw && !phone)
    return { error: 'Enter a valid 10-digit Indian mobile number.' };
  if (formData.get('terms') !== 'on')
    return { error: 'Please accept the operator terms to continue.' };

  let created: { userId: string; organizationId: string };
  try {
    created = await signUpHost({
      fullName: String(formData.get('fullName') ?? ''),
      email: String(formData.get('email') ?? ''),
      phone,
      password: String(formData.get('password') ?? ''),
      organizationName: String(formData.get('organizationName') ?? ''),
      legalName: String(formData.get('legalName') ?? ''),
      gstin: String(formData.get('gstin') ?? ''),
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not create your account.',
    };
  }

  const h = await headers();
  await createSession({
    userId: created.userId,
    audience: 'host',
    ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
  });
  await trackEvent({ name: 'host.signed_up', userId: created.userId });
  redirect('/host?welcome=1');
}

export async function hostSignOut(): Promise<void> {
  await destroyCurrentSession();
  redirect('/host/login');
}

export async function hostCreatePropertyAction(
  _p: CreatePropertyState,
  formData: FormData,
): Promise<CreatePropertyState> {
  const ctx = await hostForAction();
  assertHostCan(ctx, 'property:create');
  const raw = parsePropertyForm(formData);
  // A host can only create inventory for their own organization, whatever the form says.
  if (!ctx.memberships.some((m) => m.organizationId === raw.organizationId)) {
    raw.organizationId = ctx.organizationId;
  }
  const parsed = createPropertySchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  let createdId: string;
  try {
    createdId = (await createProperty(parsed.data, hostActor(ctx))).id;
  } catch (error) {
    return {
      errors: {
        _form:
          error instanceof Error ? error.message : 'Could not create the property.',
      },
      values: raw,
    };
  }
  revalidatePath('/host/properties');
  redirect(`/host/properties/${createdId}?created=1`);
}

export async function hostAvailabilityAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await hostForAction();
    assertHostCan(ctx, 'availability:edit');
    const roomTypeId = String(formData.get('roomTypeId') ?? '');
    await assertRoomInOrg(roomTypeId, ctx.organizationId);
    const count = Number(formData.get('availableCount'));
    const from = String(formData.get('availableFrom') ?? '');
    await confirmAvailability(
      roomTypeId,
      {
        availableCount: count,
        source: 'host',
        confirmedByUserId: ctx.user.id,
        availableFrom: from ? new Date(`${from}T00:00:00+05:30`) : null,
        notes: String(formData.get('notes') ?? '') || null,
      },
      hostActor(ctx),
    );
    revalidatePath(`/host/properties/${formData.get('propertyId')}`);
    revalidatePath('/host/properties');
    return {
      ok: 'Availability confirmed. Thank you — fresh availability is what gets beds booked.',
    };
  });
}

export async function hostUploadPhotos(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await hostForAction();
    assertHostCan(ctx, 'media:upload');
    const propertyId = String(formData.get('propertyId') ?? '');
    await assertPropertyInOrg(propertyId, ctx.organizationId);
    const files = formData
      .getAll('photos')
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return { error: 'Choose at least one image.' };
    let duplicates = 0;
    for (const file of files) {
      const result = await uploadPropertyPhoto({
        propertyId,
        bytes: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type,
        uploadedBy: ctx.user.id,
        autoApprove: false,
        actor: hostActor(ctx),
      });
      if (result.state === 'rejected_duplicate') duplicates += 1;
    }
    revalidatePath(`/host/properties/${propertyId}`);
    return {
      ok: `${files.length} uploaded for review${duplicates ? `; ${duplicates} rejected as copies of another listing's photos` : ''}.`,
    };
  });
}

export async function hostPhotoCommand(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await hostForAction();
    assertHostCan(ctx, 'media:upload');
    const propertyId = String(formData.get('propertyId') ?? '');
    await assertPropertyInOrg(propertyId, ctx.organizationId);
    const mediaId = String(formData.get('mediaId') ?? '');
    if (formData.get('command') === 'delete')
      await deletePhoto(mediaId, hostActor(ctx));
    else await setCoverPhoto(propertyId, mediaId);
    revalidatePath(`/host/properties/${propertyId}`);
    return { ok: 'Updated.' };
  });
}

export async function hostUploadDocument(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await hostForAction();
    assertHostCan(ctx, 'media:upload');
    const propertyId = String(formData.get('propertyId') ?? '');
    await assertPropertyInOrg(propertyId, ctx.organizationId);
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file.' };
    await uploadDocument({
      organizationId: ctx.organizationId,
      propertyId,
      kind: String(formData.get('kind') ?? 'other'),
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type,
      uploadedBy: ctx.user.id,
      actor: hostActor(ctx),
    });
    revalidatePath(`/host/properties/${propertyId}`);
    return { ok: 'Document uploaded. Only our verification team can see it.' };
  });
}

export async function hostRequestVerification(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await hostForAction();
    assertHostCan(ctx, 'property:submit_for_verification');
    const propertyId = String(formData.get('propertyId') ?? '');
    await assertPropertyInOrg(propertyId, ctx.organizationId);
    const tier = String(
      formData.get('tier') ?? 'documents_checked',
    ) as VerificationTier;
    await requestVerification(propertyId, tier, hostActor(ctx));
    revalidatePath(`/host/properties/${propertyId}`);
    return {
      ok: 'Sent to our verification team. Your listing goes live once it passes.',
    };
  });
}

export async function hostConfirmBooking(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await hostForAction();
    const bookingId = String(formData.get('bookingId') ?? '');
    await assertBookingInOrg(bookingId, ctx.organizationId);
    await confirmHostAvailability(
      bookingId,
      { confirmedByUserId: ctx.user.id, via: 'host_portal' },
      hostActor(ctx),
    );
    revalidatePath('/host/bookings');
    revalidatePath(`/host/bookings/${bookingId}`);
    revalidatePath('/host');
    return {
      ok: 'Confirmed. The resident will now be asked to pay the facilitation fee.',
    };
  });
}

export async function hostDeclineBooking(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await hostForAction();
    const bookingId = String(formData.get('bookingId') ?? '');
    await assertBookingInOrg(bookingId, ctx.organizationId);
    await declineHostAvailability(
      bookingId,
      { byUserId: ctx.user.id, note: String(formData.get('note') ?? '') || null },
      hostActor(ctx),
    );
    revalidatePath('/host/bookings');
    revalidatePath(`/host/bookings/${bookingId}`);
    return { ok: 'Declined. We will offer the resident other options.' };
  });
}
