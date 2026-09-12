'use server';

import { revalidatePath } from 'next/cache';

import { actorFor, requirePermissionForAction } from '@/lib/auth/guard';
import { confirmAvailability, transitionListing } from '@/lib/services/properties';
import { IllegalTransitionError, type ListingState } from '@/lib/state-machines';

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

/**
 * Move a listing to another lifecycle state.
 *
 * `property:publish` is required to reach `live`, and only the verifier role
 * holds it — publishing *is* what approval performs. Every other transition
 * needs `property:edit`.
 */
export async function transitionListingAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get('propertyId') ?? '');
  const to = String(formData.get('to') ?? '') as ListingState;
  const reason = String(formData.get('reason') ?? '').trim() || undefined;

  if (!id || !to) {
    return { error: 'Missing property or target state.' };
  }

  const permission =
    to === 'live'
      ? 'property:publish'
      : to === 'suspended'
        ? 'property:suspend'
        : 'property:edit';

  try {
    const user = await requirePermissionForAction(permission);
    await transitionListing(id, to, actorFor(user), reason);
  } catch (error) {
    if (error instanceof IllegalTransitionError) {
      // The machine's message names the legal transitions, which is exactly
      // what the operator needs to know.
      return { error: error.message };
    }
    return {
      error: error instanceof Error ? error.message : 'Could not change the state.',
    };
  }

  revalidatePath(`/admin/properties/${id}`);
  revalidatePath('/admin/properties');
  return { ok: true };
}

/**
 * Record a confirmed bed count.
 *
 * Source is fixed to `ops` here and `confirmedBy` to the acting user: an ops
 * user confirming from this screen is the provenance, and letting the form
 * choose would make the freshness signal meaningless.
 */
export async function confirmAvailabilityAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const roomTypeId = String(formData.get('roomTypeId') ?? '');
  const raw = String(formData.get('availableCount') ?? '');
  const notes = String(formData.get('notes') ?? '').trim() || null;

  const availableCount = Number(raw);
  if (!roomTypeId || !Number.isInteger(availableCount) || availableCount < 0) {
    return { error: 'Enter a whole number of available beds, zero or more.' };
  }

  try {
    const user = await requirePermissionForAction('availability:edit');
    await confirmAvailability(
      roomTypeId,
      {
        availableCount,
        source: 'ops',
        confirmedByUserId: user.id,
        notes,
      },
      actorFor(user),
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not record availability.',
    };
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath('/admin/properties');
  revalidatePath('/admin/stale');
  return { ok: true };
}
