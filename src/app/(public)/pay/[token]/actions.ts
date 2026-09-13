'use server';

import { revalidatePath } from 'next/cache';

import { type ActionResult, runAction } from '@/lib/action-result';
import { captureTestPayment } from '@/lib/services/payments';

export async function payInTestMode(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const token = String(formData.get('token') ?? '');
  return runAction(async () => {
    await captureTestPayment(token);
    revalidatePath(`/pay/${token}`);
    return { ok: 'Payment recorded. Your booking is confirmed.' };
  });
}
