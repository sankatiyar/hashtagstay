'use client';

import { useActionState } from 'react';

import { type HostAuthState, hostLoginAction, hostSignupAction } from './actions';

const input =
  'mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900';

export function HostLoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<HostAuthState, FormData>(
    hostLoginAction,
    {},
  );
  return (
    <form
      action={action}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
    >
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium text-slate-700">
        Email
        <input name="email" type="email" autoComplete="username" className={input} />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className={input}
        />
      </label>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export function HostSignupForm() {
  const [state, action, pending] = useActionState<HostAuthState, FormData>(
    hostSignupAction,
    {},
  );
  return (
    <form
      action={action}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Your name
          <input name="fullName" autoComplete="name" className={input} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Mobile
          <input name="phone" inputMode="tel" className={input} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input name="email" type="email" autoComplete="email" className={input} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password (12+ characters)
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            className={input}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Business or property name
          <input name="organizationName" className={input} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Registered legal name (optional)
          <input name="legalName" className={input} />
        </label>
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          GSTIN (optional)
          <input name="gstin" className={input} />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="terms" className="mt-0.5 h-4 w-4" />I confirm I
        have the right to let these rooms, and I agree that Sandy Stays verifies
        listings before they go live and charges a commission on bookings it brings.
      </label>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? 'Creating account…' : 'Create host account'}
      </button>
    </form>
  );
}
