'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { type ActionResult, initialActionResult } from '@/lib/action-result';

/**
 * Save-to-shortlist toggle (FR-04). Signed-out visitors get a sign-in link
 * rather than a button that fails, since a saved stay needs an account to live in.
 */
function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M12 20s-7.5-4.6-9.2-9.1C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.5 1.1 4.8 2.8 1.3-1.7 2.8-2.8 4.8-2.8 3.3 0 5.6 3.1 4.4 6.4C19.5 15.4 12 20 12 20Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
        className="btn-secondary w-full"
      >
        <Heart filled={false} /> Save
      </Link>
    );
  }

  const isSaved = state.ok ? state.ok.startsWith('Saved') : saved;
  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="propertyId" value={propertyId} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={isSaved}
        className={`btn-secondary w-full ${isSaved ? 'border-clay-500/40 text-clay-500' : ''}`}
      >
        <Heart filled={isSaved} /> {isSaved ? 'Saved' : 'Save for later'}
      </button>
      {state.error && (
        <p className="mt-2 text-center text-xs text-red-700">
          {state.error}{' '}
          {state.error.toLowerCase().includes('sign in') && (
            <Link
              href={`/account/login?next=${encodeURIComponent(returnTo)}`}
              className="font-semibold underline"
            >
              Sign in
            </Link>
          )}
        </p>
      )}
    </form>
  );
}
