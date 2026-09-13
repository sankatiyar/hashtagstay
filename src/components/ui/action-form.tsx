'use client';

import { type ReactNode, useActionState } from 'react';

import { type ActionResult, initialActionResult } from '@/lib/action-result';

type Tone = 'primary' | 'secondary' | 'danger' | 'link';

const BUTTON: Record<Tone, string> = {
  primary:
    'rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800',
  secondary:
    'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100',
  danger:
    'rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50',
  link: 'text-sm text-slate-600 underline hover:text-slate-900',
};

/**
 * A form bound to a server action returning `ActionResult`, with pending state
 * and inline feedback. Used for every mutation in the console and portals.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  tone = 'primary',
  className = 'space-y-3',
  confirmMessage,
  disabled,
  inline = false,
}: {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  tone?: Tone;
  className?: string;
  confirmMessage?: string;
  disabled?: boolean;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionResult);

  return (
    <form
      action={formAction}
      className={inline ? 'inline-flex flex-wrap items-center gap-2' : className}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {children}
      <div className={inline ? 'contents' : 'flex flex-wrap items-center gap-3'}>
        <button
          type="submit"
          disabled={pending || disabled}
          className={`${BUTTON[tone]} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {pending ? (pendingLabel ?? 'Working…') : submitLabel}
        </button>
        {state.error && (
          <p role="alert" className="text-xs text-red-700">
            {state.error}
          </p>
        )}
        {state.ok && !pending && (
          <p aria-live="polite" className="text-xs text-emerald-700">
            {state.ok}
          </p>
        )}
        {state.data?.url && !pending && (
          <a
            href={state.data.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs break-all text-slate-700 underline"
          >
            {state.data.url}
          </a>
        )}
      </div>
    </form>
  );
}
