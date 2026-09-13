'use server';

import { revalidatePath } from 'next/cache';

import { type ActionResult, runAction } from '@/lib/action-result';
import { actorFor, requirePermissionForAction } from '@/lib/auth/guard';
import {
  type CallDisposition,
  placeCall,
  recordDisposition,
} from '@/lib/services/calls';
import {
  addLeadNote,
  assignLead,
  scheduleFollowUp,
  transitionLead,
  updateRequirement,
} from '@/lib/services/leads';
import { createShortlist, shareShortlist } from '@/lib/services/shortlists';
import type { LeadState } from '@/lib/state-machines';

const leadIdOf = (formData: FormData) => String(formData.get('leadId') ?? '');
const refresh = (leadId: string) => {
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath('/admin/leads');
};

export async function placeCallAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('call:place');
    const leadId = leadIdOf(formData);
    const result = await placeCall(leadId, user, actorFor(user));
    refresh(leadId);
    return {
      ok:
        result.provider === 'test'
          ? `Test mode: call logged via ${result.maskedNumber}. Record the outcome below.`
          : `Your phone will ring now; the resident is connected on ${result.maskedNumber}.`,
    };
  });
}

export async function dispositionAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('call:place');
    const duration = Number(formData.get('durationMinutes'));
    await recordDisposition(
      String(formData.get('callId') ?? ''),
      {
        disposition: String(formData.get('disposition') ?? '') as CallDisposition,
        notes: String(formData.get('notes') ?? '') || null,
        durationSeconds:
          Number.isFinite(duration) && duration > 0 ? Math.round(duration * 60) : null,
      },
      user,
      actorFor(user),
    );
    refresh(leadIdOf(formData));
    return { ok: 'Call outcome saved.' };
  });
}

export async function noteAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('lead:edit');
    const leadId = leadIdOf(formData);
    await addLeadNote(leadId, String(formData.get('body') ?? ''), user, actorFor(user));
    refresh(leadId);
    return { ok: 'Note added.' };
  });
}

export async function followUpAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('lead:edit');
    const leadId = leadIdOf(formData);
    const value = String(formData.get('at') ?? '');
    await scheduleFollowUp(
      leadId,
      value ? new Date(`${value}:00+05:30`) : null,
      user,
      actorFor(user),
    );
    refresh(leadId);
    return { ok: value ? 'Follow-up scheduled.' : 'Follow-up cleared.' };
  });
}

export async function transitionAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('lead:edit');
    const leadId = leadIdOf(formData);
    const to = String(formData.get('to') ?? '') as LeadState;
    await transitionLead(leadId, to, user, actorFor(user), {
      lostReason: String(formData.get('lostReason') ?? '') || null,
      note: String(formData.get('note') ?? '') || null,
    });
    refresh(leadId);
    return { ok: `Moved to ${to.replaceAll('_', ' ')}.` };
  });
}

export async function assignAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('lead:assign');
    const leadId = leadIdOf(formData);
    await assignLead(
      leadId,
      String(formData.get('toUserId') ?? ''),
      user,
      actorFor(user),
    );
    refresh(leadId);
    return { ok: 'Lead assigned.' };
  });
}

export async function requirementAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('lead:edit');
    const leadId = leadIdOf(formData);
    const num = (key: string) => {
      const raw = String(formData.get(key) ?? '').replace(/[,\s₹]/g, '');
      return raw ? Number(raw) : null;
    };
    const moveIn = String(formData.get('moveInDate') ?? '');
    const gender = String(formData.get('genderPolicy') ?? '');
    await updateRequirement(
      leadId,
      {
        requirementCity: String(formData.get('city') ?? '') || null,
        budgetMaxRupees: num('budget'),
        requirementOccupancy: num('occupancy'),
        requirementGenderPolicy: (gender || null) as
          'any' | 'male_only' | 'female_only' | null,
        moveInDate: moveIn ? new Date(`${moveIn}T00:00:00+05:30`) : null,
        tenureMonths: num('tenureMonths'),
        requirementNotes: String(formData.get('notes') ?? '') || null,
      },
      user,
      actorFor(user),
    );
    refresh(leadId);
    return { ok: 'Requirement updated.' };
  });
}

export async function createShortlistAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('shortlist:create');
    const leadId = leadIdOf(formData);
    const items = formData
      .getAll('room')
      .map(String)
      .map((value) => {
        const [propertyId, roomTypeId] = value.split(':');
        return {
          propertyId,
          roomTypeId,
          rmNote: String(formData.get(`note:${value}`) ?? '') || null,
        };
      });
    await createShortlist(
      leadId,
      { items, message: String(formData.get('message') ?? '') || null },
      user,
      actorFor(user),
    );
    refresh(leadId);
    return { ok: 'Shortlist built. Send it to the resident when ready.' };
  });
}

export async function shareShortlistAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('shortlist:share');
    const result = await shareShortlist(
      String(formData.get('shortlistId') ?? ''),
      user,
      actorFor(user),
    );
    refresh(leadIdOf(formData));
    return { ok: `Shortlist sent (${result.delivery}).`, data: { url: result.url } };
  });
}
