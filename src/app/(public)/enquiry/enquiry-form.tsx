'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { type EnquiryState, enquiryAction } from './actions';

const LANGUAGES = [
  ['en', 'English'],
  ['hi', 'Hindi'],
  ['kn', 'Kannada'],
  ['mr', 'Marathi'],
  ['ta', 'Tamil'],
  ['te', 'Telugu'],
  ['bn', 'Bengali'],
] as const;

const input =
  'mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900';

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-1 text-xs text-red-700">
      {message}
    </p>
  ) : null;
}

export function EnquiryForm({
  listing,
  near,
  city,
  cities,
  contactNotice,
  recordingNotice,
}: {
  listing: string | null;
  near: string | null;
  city: string | null;
  cities: string[];
  contactNotice: string;
  recordingNotice: string;
}) {
  const [state, formAction, pending] = useActionState<EnquiryState, FormData>(
    enquiryAction,
    {
      step: 'details',
      values: { listing: listing ?? '', near: near ?? '', city: city ?? '' },
    },
  );
  const values = state.values ?? {};
  const errors = state.errors ?? {};
  const [under18, setUnder18] = useState(values.isUnder18 === 'on');

  if (state.step === 'done') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-lg font-semibold text-emerald-900">
          {state.merged
            ? 'We have added this to your open enquiry'
            : 'Enquiry received'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-emerald-900">
          Your reference is <strong>{state.reference}</strong>. A relationship manager
          will call you {state.responsePromise}. We have sent a confirmation to your
          phone.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/account"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Track your enquiry
          </Link>
          <Link
            href="/search"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Keep browsing
          </Link>
        </div>
      </div>
    );
  }

  if (state.step === 'verify') {
    return (
      <form
        action={formAction}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
      >
        {Object.entries(values).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Check your phone</h2>
          <p className="mt-1 text-sm text-slate-600">
            We sent a 6-digit code to {state.destination ?? values.phone}. It confirms
            the number is yours before a relationship manager calls.
          </p>
        </div>

        {state.devCode && (
          <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Test mode — SMS is not configured, so your code is{' '}
            <strong>{state.devCode}</strong>.
          </p>
        )}

        <div>
          <label htmlFor="code" className="block text-sm font-medium text-slate-700">
            Verification code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className={`${input} max-w-40 text-lg tracking-widest`}
          />
          <FieldError message={errors.code ?? errors.phone} />
        </div>
        <FieldError message={errors._form} />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            name="intent"
            value="verify"
            disabled={pending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? 'Checking…' : 'Verify and send enquiry'}
          </button>
          <button
            type="submit"
            name="intent"
            value="resend"
            disabled={pending}
            className="text-sm text-slate-600 underline hover:text-slate-900"
          >
            Send a new code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="intent" value="send" />
      <input type="hidden" name="listing" value={values.listing ?? ''} />
      <input type="hidden" name="near" value={values.near ?? ''} />

      {errors._form && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors._form}
        </p>
      )}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">About you</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">
              Full name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={values.name}
              autoComplete="name"
              className={input}
            />
            <FieldError message={errors.name} />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
              Mobile number
            </label>
            <input
              id="phone"
              name="phone"
              defaultValue={values.phone}
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              className={input}
            />
            <FieldError message={errors.phone} />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={values.email}
              autoComplete="email"
              className={input}
            />
            <FieldError message={errors.email} />
          </div>
          <div>
            <label
              htmlFor="preferredLanguage"
              className="block text-sm font-medium text-slate-700"
            >
              Call me in
            </label>
            <select
              id="preferredLanguage"
              name="preferredLanguage"
              defaultValue={values.preferredLanguage ?? 'en'}
              className={input}
            >
              {LANGUAGES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="isUnder18"
            checked={under18}
            onChange={(event) => setUnder18(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          I am under 18
        </label>

        {under18 && (
          <div className="grid gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:grid-cols-2">
            <p className="text-sm text-amber-900 sm:col-span-2">
              Indian data protection law needs a parent or guardian’s consent for anyone
              under 18. We will contact them rather than you.
            </p>
            <div>
              <label
                htmlFor="guardianName"
                className="block text-sm font-medium text-slate-700"
              >
                Parent or guardian’s name
              </label>
              <input
                id="guardianName"
                name="guardianName"
                defaultValue={values.guardianName}
                className={input}
              />
              <FieldError message={errors.guardianName} />
            </div>
            <div>
              <label
                htmlFor="guardianPhone"
                className="block text-sm font-medium text-slate-700"
              >
                Their mobile number
              </label>
              <input
                id="guardianPhone"
                name="guardianPhone"
                defaultValue={values.guardianPhone}
                inputMode="tel"
                className={input}
              />
              <FieldError message={errors.guardianPhone} />
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          What you are looking for
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-slate-700">
              City
            </label>
            <input
              id="city"
              name="city"
              list="enquiry-cities"
              defaultValue={values.city}
              className={input}
            />
            <datalist id="enquiry-cities">
              {cities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label
              htmlFor="budget"
              className="block text-sm font-medium text-slate-700"
            >
              Monthly budget (₹)
            </label>
            <input
              id="budget"
              name="budget"
              inputMode="numeric"
              defaultValue={values.budget}
              placeholder="15000"
              className={input}
            />
            <FieldError message={errors.budget} />
          </div>
          <div>
            <label
              htmlFor="moveInDate"
              className="block text-sm font-medium text-slate-700"
            >
              Move-in date
            </label>
            <input
              id="moveInDate"
              name="moveInDate"
              type="date"
              defaultValue={values.moveInDate}
              className={input}
            />
            <FieldError message={errors.moveInDate} />
          </div>
          <div>
            <label
              htmlFor="tenureMonths"
              className="block text-sm font-medium text-slate-700"
            >
              How long
            </label>
            <select
              id="tenureMonths"
              name="tenureMonths"
              defaultValue={values.tenureMonths ?? ''}
              className={input}
            >
              <option value="">Not sure yet</option>
              <option value="3">3 months</option>
              <option value="6">6 months</option>
              <option value="11">11 months</option>
              <option value="12">A year or more</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="occupancy"
              className="block text-sm font-medium text-slate-700"
            >
              Room sharing
            </label>
            <select
              id="occupancy"
              name="occupancy"
              defaultValue={values.occupancy ?? ''}
              className={input}
            >
              <option value="">No preference</option>
              <option value="1">Private room</option>
              <option value="2">Twin sharing</option>
              <option value="3">Triple sharing</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="genderPolicy"
              className="block text-sm font-medium text-slate-700"
            >
              Accommodation type
            </label>
            <select
              id="genderPolicy"
              name="genderPolicy"
              defaultValue={values.genderPolicy ?? ''}
              className={input}
            >
              <option value="">No preference</option>
              <option value="female_only">Women-only</option>
              <option value="male_only">Men-only</option>
              <option value="any">Mixed is fine</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="propertyType"
              className="block text-sm font-medium text-slate-700"
            >
              Kind of stay
            </label>
            <select
              id="propertyType"
              name="propertyType"
              defaultValue={values.propertyType ?? ''}
              className={input}
            >
              <option value="">Any</option>
              <option value="coliving">Co-living</option>
              <option value="pbsa">Student housing</option>
              <option value="homeshare">Home sharing</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-slate-700">
            Anything else we should know
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={values.notes}
            placeholder="e.g. close to campus, vegetarian food, need parking"
            className={input}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <label className="flex items-start gap-2 text-slate-700">
          <input
            type="checkbox"
            name="consentContact"
            defaultChecked={values.consentContact === 'on'}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span>{contactNotice}</span>
        </label>
        <FieldError message={errors.consentContact} />
        <p className="pl-6 text-xs text-slate-500">{recordingNotice}</p>
        <label className="flex items-start gap-2 text-slate-700">
          <input
            type="checkbox"
            name="consentMarketing"
            defaultChecked={values.consentMarketing === 'on'}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span>Send me new stays and offers (optional).</span>
        </label>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'Sending code…' : 'Continue — verify my number'}
      </button>
      <p className="text-xs text-slate-500">
        Enquiring is free. We never share your number with an operator.
      </p>
    </form>
  );
}
