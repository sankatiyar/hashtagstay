import {
  cancelBookingAction,
  completeBookingAction,
  confirmHostOnCallAction,
  declineHostAction,
  markMovedInAction,
  requestHostConfirmationAction,
  sendPaymentLinkAction,
} from '@/app/admin/bookings/actions';
import { CANCEL_REASONS } from '@/components/admin/status';
import { ActionForm } from '@/components/ui/action-form';
import { canTransition, bookingMachine, type BookingState } from '@/lib/state-machines';

/**
 * The next legal steps for a booking, driven by the booking machine so the
 * screen can never offer a move the service would refuse — in particular, no
 * payment link before the operator confirms.
 */
export function BookingControls({
  bookingId,
  leadId,
  state,
}: {
  bookingId: string;
  leadId: string | null;
  state: BookingState;
}) {
  const hidden = (
    <>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="leadId" value={leadId ?? ''} />
    </>
  );

  return (
    <div className="space-y-3">
      {state === 'initiated' && (
        <ActionForm
          action={requestHostConfirmationAction}
          submitLabel="Ask operator to confirm the bed"
        >
          {hidden}
        </ActionForm>
      )}

      {state === 'pending_host_confirmation' && (
        <>
          <p className="text-xs text-slate-500">
            Waiting for the operator. They can confirm in the host portal, or record it
            here once they confirm on a call.
          </p>
          <ActionForm
            action={confirmHostOnCallAction}
            submitLabel="Operator confirmed on a call"
          >
            {hidden}
          </ActionForm>
          <ActionForm
            action={declineHostAction}
            submitLabel="Operator cannot host"
            tone="danger"
            confirmMessage="Cancel this booking because the operator cannot host?"
          >
            {hidden}
            <input
              name="note"
              placeholder="What the operator said"
              className="block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </ActionForm>
        </>
      )}

      {state === 'fee_pending' && (
        <ActionForm
          action={sendPaymentLinkAction}
          submitLabel="Send payment link to resident"
        >
          {hidden}
        </ActionForm>
      )}

      {state === 'confirmed' && (
        <ActionForm action={markMovedInAction} submitLabel="Mark moved in">
          {hidden}
        </ActionForm>
      )}

      {state === 'moved_in' && (
        <ActionForm
          action={completeBookingAction}
          submitLabel="Complete booking"
          tone="secondary"
        >
          {hidden}
        </ActionForm>
      )}

      {canTransition(bookingMachine, state, 'cancelled') && (
        <details className="rounded-md border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm text-red-700">
            Cancel booking
          </summary>
          <ActionForm
            action={cancelBookingAction}
            submitLabel="Cancel booking"
            tone="danger"
            className="mt-3 space-y-2"
            confirmMessage="Cancel this booking? Any refund due is issued automatically."
          >
            {hidden}
            <select
              name="reason"
              className="block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              {CANCEL_REASONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              name="note"
              placeholder="Note (recorded in the audit trail)"
              className="block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </ActionForm>
        </details>
      )}
    </div>
  );
}
