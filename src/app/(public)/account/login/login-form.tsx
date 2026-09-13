'use client';

import { useActionState } from 'react';

import { type LoginState, residentLoginAction } from '../actions';

export function ResidentLoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    residentLoginAction,
    { step: 'phone', next },
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      {state.step === 'phone' ? (
        <>
          <input type="hidden" name="intent" value="send" />
          <div>
            <label htmlFor="phone" className="label">
              Mobile number
            </label>
            <div className="relative">
              <span className="text-ink-soft pointer-events-none absolute top-1/2 left-3.5 mt-0.5 -translate-y-1/2 text-sm">
                +91
              </span>
              <input
                id="phone"
                name="phone"
                inputMode="tel"
                autoComplete="tel"
                defaultValue={state.phone}
                placeholder="98765 43210"
                className="field pl-12"
              />
            </div>
          </div>
          {state.error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {state.error}
            </p>
          )}
          <button type="submit" disabled={pending} className="btn-primary w-full py-3">
            {pending ? 'Sending…' : 'Send code'}
          </button>
        </>
      ) : (
        <>
          <input type="hidden" name="phone" value={state.phone} />
          <p className="text-ink-soft text-sm">
            Enter the code sent to <strong className="text-ink">{state.phone}</strong>.
          </p>
          {state.devCode && (
            <p className="border-peach-300 bg-peach-50 text-peach-700 rounded-xl border border-dashed px-4 py-3 text-sm">
              Demo mode — SMS isn’t connected, so your code is{' '}
              <strong className="tracking-widest">{state.devCode}</strong>.
            </p>
          )}
          <div>
            <label htmlFor="code" className="label">
              Code
            </label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="field text-center text-2xl font-semibold tracking-[0.4em]"
            />
          </div>
          {state.error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {state.error}
            </p>
          )}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              name="intent"
              value="verify"
              disabled={pending}
              className="btn-primary flex-1 py-3"
            >
              {pending ? 'Checking…' : 'Sign in'}
            </button>
            <button
              type="submit"
              name="intent"
              value="resend"
              disabled={pending}
              className="text-brand-700 text-sm font-medium hover:underline"
            >
              New code
            </button>
          </div>
        </>
      )}
    </form>
  );
}
