'use client';

import { useActionState } from 'react';

import { type LoginState, residentLoginAction } from '../actions';

const input =
  'mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900';

export function ResidentLoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    residentLoginAction,
    { step: 'phone', next },
  );

  return (
    <form
      action={action}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
    >
      <input type="hidden" name="next" value={next} />
      {state.step === 'phone' ? (
        <>
          <input type="hidden" name="intent" value="send" />
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
              Mobile number
            </label>
            <input
              id="phone"
              name="phone"
              inputMode="tel"
              autoComplete="tel"
              defaultValue={state.phone}
              placeholder="98765 43210"
              className={input}
            />
          </div>
          {state.error && (
            <p role="alert" className="text-xs text-red-700">
              {state.error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? 'Sending…' : 'Send code'}
          </button>
        </>
      ) : (
        <>
          <input type="hidden" name="phone" value={state.phone} />
          <p className="text-sm text-slate-600">
            Enter the code sent to {state.phone}.
          </p>
          {state.devCode && (
            <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Test mode — your code is <strong>{state.devCode}</strong>.
            </p>
          )}
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-slate-700">
              Code
            </label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className={`${input} tracking-widest`}
            />
          </div>
          {state.error && (
            <p role="alert" className="text-xs text-red-700">
              {state.error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              name="intent"
              value="verify"
              disabled={pending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {pending ? 'Checking…' : 'Sign in'}
            </button>
            <button
              type="submit"
              name="intent"
              value="resend"
              disabled={pending}
              className="text-sm text-slate-600 underline"
            >
              New code
            </button>
          </div>
        </>
      )}
    </form>
  );
}
