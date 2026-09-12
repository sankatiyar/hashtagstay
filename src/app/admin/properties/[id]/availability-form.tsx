'use client';

import { useActionState } from 'react';

import { type ActionResult, confirmAvailabilityAction } from './actions';

const initial: ActionResult = {};

/**
 * Records a confirmed bed count. Submitting it always refreshes
 * `lastConfirmedAt`, even when the number is unchanged — "I checked and it is
 * still 3" is exactly the information the freshness signal needs.
 */
export function AvailabilityForm({
  propertyId,
  roomTypeId,
  currentCount,
}: {
  propertyId: string;
  roomTypeId: string;
  currentCount: number;
}) {
  const [state, formAction, pending] = useActionState(
    confirmAvailabilityAction,
    initial,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="roomTypeId" value={roomTypeId} />

      <div>
        <label
          htmlFor={`count-${roomTypeId}`}
          className="block text-xs font-medium text-slate-600"
        >
          Beds free
        </label>
        <input
          id={`count-${roomTypeId}`}
          name="availableCount"
          type="number"
          min={0}
          step={1}
          defaultValue={currentCount}
          className="mt-1 w-24 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-slate-900"
        />
      </div>

      <div className="min-w-40 flex-1">
        <label
          htmlFor={`notes-${roomTypeId}`}
          className="block text-xs font-medium text-slate-600"
        >
          Note (optional)
        </label>
        <input
          id={`notes-${roomTypeId}`}
          name="notes"
          placeholder="e.g. spoke to manager, 2 vacating end of month"
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-900"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Confirm'}
      </button>

      {state.ok && !pending && (
        <p aria-live="polite" className="text-xs text-emerald-700">
          Recorded.
        </p>
      )}
      {state.error && (
        <p role="alert" aria-live="polite" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
