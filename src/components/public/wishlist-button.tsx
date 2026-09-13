'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { type ActionResult, initialActionResult } from '@/lib/action-result';

/**
 * Save-to-shortlist toggle (FR-04). Signed-out visitors get a sign-in link
 * rather than a button that fails, since a saved stay needs an account to live in.
 */
export function WishlistButton({
  propertyId,
  saved,
  signedIn,
  action,
  returnTo,
}: {
  propertyId: string;
  saved: boolean;
  signedIn: boolean;
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  returnTo: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionResult);

  if (!signedIn) {
    return (
      <Link
        href={`/account/login?next=${encodeURIComponent(returnTo)}`}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
      >
        ♡ Save
      </Link>
    );
  }

  const isSaved = state.ok ? state.ok.startsWith('Saved') : saved;
  return (
    <form action={formAction}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={isSaved}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
      >
        {isSaved ? '♥ Saved' : '♡ Save'}
      </button>
      {state.error && <p className="mt-1 text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
