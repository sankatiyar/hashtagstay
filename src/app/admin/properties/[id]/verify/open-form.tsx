'use client';

import { useActionState } from 'react';

import { TIER_LABELS } from '@/lib/verification/rubric';

import { type VerifyState, requestVerificationAction } from './actions';

const initial: VerifyState = {};

const TIERS = ['documents_checked', 'photos_verified', 'onground_audited'] as const;

export function OpenVerificationForm({ propertyId }: { propertyId: string }) {
  const [state, formAction, pending] = useActionState(
    requestVerificationAction,
    initial,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="propertyId" value={propertyId} />

      <div>
        <label htmlFor="tier" className="block text-xs font-medium text-slate-600">
          Tier to aim for
        </label>
        <select
          id="tier"
          name="tier"
          defaultValue="documents_checked"
          className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-900"
        >
          {TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {TIER_LABELS[tier]}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? 'Opening…' : 'Open verification'}
      </button>

      {state.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
