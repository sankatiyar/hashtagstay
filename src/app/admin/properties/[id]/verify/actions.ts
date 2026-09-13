'use server';

import { revalidatePath } from 'next/cache';

import { actorFor, requirePermissionForAction } from '@/lib/auth/guard';
import {
  VerificationError,
  approveVerification,
  rejectVerification,
  requestVerification,
  saveChecklist,
} from '@/lib/services/verification';
import { IllegalTransitionError } from '@/lib/state-machines';
import {
  type Checklist,
  type ChecklistOutcome,
  RUBRIC,
  type VerificationTier,
  TIER_ORDER,
} from '@/lib/verification/rubric';

export interface VerifyState {
  error?: string;
  ok?: string;
}

const OUTCOMES: ChecklistOutcome[] = ['pass', 'fail', 'not_applicable'];

/** Read the rubric out of the form, ignoring anything not in the taxonomy. */
function readChecklist(formData: FormData): Checklist {
  const checklist: Checklist = {};
  for (const item of RUBRIC) {
    const raw = String(formData.get(`item.${item.key}`) ?? '');
    if (OUTCOMES.includes(raw as ChecklistOutcome)) {
      checklist[item.key] = raw as ChecklistOutcome;
    }
  }
  return checklist;
}

function readTier(formData: FormData): VerificationTier | null {
  const raw = String(formData.get('tier') ?? '');
  return TIER_ORDER.includes(raw as VerificationTier)
    ? (raw as VerificationTier)
    : null;
}

function describe(error: unknown): string {
  if (error instanceof VerificationError || error instanceof IllegalTransitionError) {
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export async function requestVerificationAction(
  _previous: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const tier = readTier(formData) ?? 'documents_checked';

  try {
    const user = await requirePermissionForAction('verification:request');
    await requestVerification(propertyId, tier, { ...actorFor(user), id: user.id });
  } catch (error) {
    return { error: describe(error) };
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath(`/admin/properties/${propertyId}/verify`);
  revalidatePath('/admin/verification');
  return { ok: 'Verification opened.' };
}

export async function saveChecklistAction(
  _previous: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const verificationId = String(formData.get('verificationId') ?? '');

  try {
    const user = await requirePermissionForAction('verification:review');
    await saveChecklist(verificationId, readChecklist(formData), null, actorFor(user));
  } catch (error) {
    return { error: describe(error) };
  }

  revalidatePath(`/admin/properties/${propertyId}/verify`);
  return { ok: 'Progress saved.' };
}

export async function approveVerificationAction(
  _previous: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const verificationId = String(formData.get('verificationId') ?? '');
  const note = String(formData.get('note') ?? '').trim() || undefined;
  const tier = readTier(formData);

  if (!tier || tier === 'none') {
    return { error: 'Choose which tier to grant.' };
  }

  try {
    const user = await requirePermissionForAction('verification:approve');
    // Save the checklist first so the decision is evaluated against exactly
    // what the reviewer is looking at, not against an earlier save.
    await saveChecklist(verificationId, readChecklist(formData), null, actorFor(user));
    await approveVerification(
      verificationId,
      tier,
      { ...actorFor(user), id: user.id, roles: user.roles },
      note,
    );
  } catch (error) {
    return { error: describe(error) };
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath(`/admin/properties/${propertyId}/verify`);
  revalidatePath('/admin/verification');
  revalidatePath('/admin/properties');
  revalidatePath('/admin');
  return { ok: `Approved at ${tier.replaceAll('_', ' ')} and published.` };
}

export async function rejectVerificationAction(
  _previous: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const verificationId = String(formData.get('verificationId') ?? '');
  const note = String(formData.get('note') ?? '');

  try {
    const user = await requirePermissionForAction('verification:approve');
    await saveChecklist(verificationId, readChecklist(formData), null, actorFor(user));
    await rejectVerification(verificationId, note, {
      ...actorFor(user),
      id: user.id,
      roles: user.roles,
    });
  } catch (error) {
    return { error: describe(error) };
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath(`/admin/properties/${propertyId}/verify`);
  revalidatePath('/admin/verification');
  return { ok: 'Sent back for changes.' };
}
