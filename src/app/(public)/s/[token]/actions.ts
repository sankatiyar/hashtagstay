'use server';

import { revalidatePath } from 'next/cache';

import { type ActionResult, runAction } from '@/lib/action-result';
import { recordShortlistInterest } from '@/lib/services/shortlists';

export async function markInterest(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const token = String(formData.get('token') ?? '');
  const itemId = String(formData.get('itemId') ?? '');
  const interest =
    formData.get('interest') === 'not_interested' ? 'not_interested' : 'interested';
  return runAction(async () => {
    const ok = await recordShortlistInterest(token, itemId, interest);
    if (!ok) return { error: 'This shortlist has expired.' };
    revalidatePath(`/s/${token}`);
    return {
      ok:
        interest === 'interested'
          ? 'Noted — your relationship manager will follow up.'
          : 'Noted.',
    };
  });
}
