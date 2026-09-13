'use server';

import { revalidatePath } from 'next/cache';

import { type ActionResult, runAction } from '@/lib/action-result';
import { actorFor, requirePermissionForAction } from '@/lib/auth/guard';
import { type TicketState, replyToTicket } from '@/lib/services/tickets';

export async function staffReplyAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('ticket:respond');
    const ticketId = String(formData.get('ticketId') ?? '');
    const nextState = String(formData.get('nextState') ?? '') as TicketState | '';
    await replyToTicket(
      ticketId,
      {
        body: String(formData.get('body') ?? ''),
        isInternal: formData.get('isInternal') === 'on',
        nextState: nextState || undefined,
      },
      user,
      actorFor(user),
    );
    revalidatePath(`/admin/tickets/${ticketId}`);
    revalidatePath('/admin/tickets');
    return { ok: 'Saved.' };
  });
}
