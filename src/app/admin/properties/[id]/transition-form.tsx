'use client';

import { useActionState } from 'react';

import { type ActionResult, transitionListingAction } from './actions';

const initial: ActionResult = {};

/**
 * Transitions that change what residents can see, or that close a listing, ask
 * for a reason. The audit trail is much less useful when every suspension says
 * only "suspended".
 */
const REASON_REQUIRED = new Set(['suspended', 'changes_requested', 'archived']);

const LABELS: Record<string, string> = {
  submitted: 'Submit for verification',
  in_verification: 'Send to verification',
  changes_requested: 'Request changes',
  live: 'Publish (go live)',
  paused: 'Pause listing',
  suspended: 'Suspend listing',
  archived: 'Archive',
  draft: 'Return to draft',
};

export function TransitionForm({
  propertyId,
  to,
  disabled,
  disabledReason,
}: {
  propertyId: string;
  to: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(transitionListingAction, initial);

  const needsReason = REASON_REQUIRED.has(to);
  const destructive = to === 'suspended' || to === 'archived';

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="to" value={to} />

      {needsReason && !disabled && (
        <input
          name="reason"
          required
          placeholder="Reason (recorded in the audit trail)"
          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-900"
        />
      )}

      <button
        type="submit"
        disabled={disabled || pending}
        title={disabledReason}
        className={`w-full rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
          destructive
            ? 'border border-red-300 text-red-700 hover:bg-red-50'
            : to === 'live'
              ? 'bg-slate-900 text-white hover:bg-slate-800'
              : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
        }`}
      >
        {pending ? 'Working…' : (LABELS[to] ?? to)}
      </button>

      {disabledReason && <p className="text-xs text-slate-500">{disabledReason}</p>}

      {state.error && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
