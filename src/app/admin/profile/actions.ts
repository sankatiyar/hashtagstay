'use server';

import { revalidatePath } from 'next/cache';

import { type ActionResult, runAction } from '@/lib/action-result';
import { actorFor, requireStaff } from '@/lib/auth/guard';
import { updateStaffProfile } from '@/lib/services/staff';

export async function saveProfileAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireStaff();
    const list = (key: string) =>
      String(formData.get(key) ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    await updateStaffProfile(
      user.id,
      {
        phone: String(formData.get('phone') ?? '') || null,
        cities: list('cities'),
        languages: list('languages'),
        maxActiveLeads: Number(formData.get('maxActiveLeads')),
        isAcceptingLeads: formData.get('isAcceptingLeads') === 'on',
      },
      actorFor(user),
    );
    revalidatePath('/admin/profile');
    return { ok: 'Saved.' };
  });
}
