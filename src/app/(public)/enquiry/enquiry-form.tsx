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

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
      {message}
    </p>
  ) : null;
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label} {hint && <span className="text-ink-soft font-normal">{hint}</span>}
      </label>
      {children}
      <FieldError message={error} />
    </div>
  );
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
      <div className="card overflow-hidden">
        <div className="bg-pine-800 px-7 py-8 text-white">
          <span className="bg-marigold-400 text-pine-950 flex h-12 w-12 items-center justify-center rounded-2xl text-xl">
            ✓
          </span>
          <h2 className="font-display mt-5 text-3xl font-semibold">
            {state.merged ? 'Added to your open enquiry' : 'Enquiry received'}
          </h2>
          <p className="text-pine-100/85 mt-2">
            Reference <strong className="text-white">{state.reference}</strong>
          </p>
        </div>
        <div className="p-7">
          <p className="text-ink leading-relaxed">
            A relationship manager will call you {state.responsePromise}. We’ve sent a
            confirmation to your phone.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/account" className="btn-primary">
              Track your enquiry
            </Link>
            <Link href="/search" className="btn-secondary">
              Keep browsing
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state.step === 'verify') {
    return (
      <form action={formAction} className="card space-y-6 p-7">
        {Object.entries(values).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <div>
          <p className="eyebrow">Step 2 of 2</p>
          <h2 className="font-display text-ink mt-2 text-3xl font-semibold">
            Check your phone
          </h2>
          <p className="text-ink-soft mt-2">
            We sent a 6-digit code to{' '}
            <strong className="text-ink">{state.destination ?? values.phone}</strong>.
            It confirms the number is yours before a relationship manager calls.
          </p>
        </div>

        {state.devCode && (
          <p className="border-marigold-300 bg-marigold-50 text-marigold-700 rounded-xl border border-dashed px-4 py-3 text-sm">
            Demo mode — SMS isn’t connected yet, so your code is{' '}
            <strong className="tracking-widest">{state.devCode}</strong>.
          </p>
        )}

        <Field id="code" label="Verification code" error={errors.code ?? errors.phone}>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="field max-w-52 text-center text-2xl font-semibold tracking-[0.4em]"
          />
        </Field>
        <FieldError message={errors._form} />

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            name="intent"
            value="verify"
            disabled={pending}
            className="btn-primary py-3"
          >
            {pending ? 'Checking…' : 'Verify and send enquiry'}
          </button>
          <button
            type="submit"
            name="intent"
            value="resend"
            disabled={pending}
            className="text-pine-700 text-sm font-medium hover:underline"
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
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors._form}
        </p>
      )}

      <section className="card space-y-5 p-6 sm:p-7">
        <h2 className="font-display text-ink text-xl font-semibold">About you</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="name" label="Full name" error={errors.name}>
            <input
              id="name"
              name="name"
              defaultValue={values.name}
              autoComplete="name"
              className="field"
            />
          </Field>
          <Field id="phone" label="Mobile number" error={errors.phone}>
            <input
              id="phone"
              name="phone"
              defaultValue={values.phone}
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              className="field"
            />
          </Field>
          <Field id="email" label="Email" hint="(optional)" error={errors.email}>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={values.email}
              autoComplete="email"
              className="field"
            />
          </Field>
          <Field id="preferredLanguage" label="Call me in">
            <select
              id="preferredLanguage"
              name="preferredLanguage"
              defaultValue={values.preferredLanguage ?? 'en'}
              className="field"
            >
              {LANGUAGES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <label className="text-ink flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="isUnder18"
            checked={under18}
            onChange={(event) => setUnder18(event.target.checked)}
            className="border-line accent-pine-700 mt-0.5 h-4 w-4 rounded"
          />
          I am under 18
        </label>

        {under18 && (
          <div className="border-marigold-200 bg-marigold-50 grid gap-5 rounded-2xl border p-5 sm:grid-cols-2">
            <p className="text-marigold-700 text-sm sm:col-span-2">
              Indian data protection law needs a parent or guardian’s consent for anyone
              under 18. We’ll contact them rather than you.
            </p>
            <Field
              id="guardianName"
              label="Parent or guardian’s name"
              error={errors.guardianName}
            >
              <input
                id="guardianName"
                name="guardianName"
                defaultValue={values.guardianName}
                className="field"
              />
            </Field>
            <Field
              id="guardianPhone"
              label="Their mobile number"
              error={errors.guardianPhone}
            >
              <input
                id="guardianPhone"
                name="guardianPhone"
                defaultValue={values.guardianPhone}
                inputMode="tel"
                className="field"
              />
            </Field>
          </div>
        )}
      </section>

      <section className="card space-y-5 p-6 sm:p-7">
        <h2 className="font-display text-ink text-xl font-semibold">
          What you’re looking for
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="city" label="City">
            <input
              id="city"
              name="city"
              list="enquiry-cities"
              defaultValue={values.city}
              className="field"
            />
            <datalist id="enquiry-cities">
              {cities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field id="budget" label="Monthly budget (₹)" error={errors.budget}>
            <input
              id="budget"
              name="budget"
              inputMode="numeric"
              defaultValue={values.budget}
              placeholder="15000"
              className="field"
            />
          </Field>
          <Field id="moveInDate" label="Move-in date" error={errors.moveInDate}>
            <input
              id="moveInDate"
              name="moveInDate"
              type="date"
              defaultValue={values.moveInDate}
              className="field"
            />
          </Field>
          <Field id="tenureMonths" label="How long">
            <select
              id="tenureMonths"
              name="tenureMonths"
              defaultValue={values.tenureMonths ?? ''}
              className="field"
            >
              <option value="">Not sure yet</option>
              <option value="3">3 months</option>
              <option value="6">6 months</option>
              <option value="11">11 months</option>
              <option value="12">A year or more</option>
            </select>
          </Field>
          <Field id="occupancy" label="Room sharing">
            <select
              id="occupancy"
              name="occupancy"
              defaultValue={values.occupancy ?? ''}
              className="field"
            >
              <option value="">No preference</option>
              <option value="1">Private room</option>
              <option value="2">Twin sharing</option>
              <option value="3">Triple sharing</option>
            </select>
          </Field>
          <Field id="genderPolicy" label="Accommodation type">
            <select
              id="genderPolicy"
              name="genderPolicy"
              defaultValue={values.genderPolicy ?? ''}
              className="field"
            >
              <option value="">No preference</option>
              <option value="female_only">Women-only</option>
              <option value="male_only">Men-only</option>
              <option value="any">Mixed is fine</option>
            </select>
          </Field>
          <Field id="propertyType" label="Kind of stay">
            <select
              id="propertyType"
              name="propertyType"
              defaultValue={values.propertyType ?? ''}
              className="field"
            >
              <option value="">Any</option>
              <option value="coliving">Co-living</option>
              <option value="pbsa">Student housing</option>
              <option value="homeshare">Home sharing</option>
            </select>
          </Field>
        </div>
        <Field id="notes" label="Anything else we should know">
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={values.notes}
            placeholder="e.g. close to campus, vegetarian food, need parking"
            className="field"
          />
        </Field>
      </section>

      <section className="card space-y-4 p-6 text-sm sm:p-7">
        <label className="text-ink flex items-start gap-3">
          <input
            type="checkbox"
            name="consentContact"
            defaultChecked={values.consentContact === 'on'}
            className="border-line accent-pine-700 mt-0.5 h-4 w-4 rounded"
          />
          <span>{contactNotice}</span>
        </label>
        <FieldError message={errors.consentContact} />
        <p className="text-ink-soft pl-7 text-xs leading-relaxed">{recordingNotice}</p>
        <label className="text-ink flex items-start gap-3">
          <input
            type="checkbox"
            name="consentMarketing"
            defaultChecked={values.consentMarketing === 'on'}
            className="border-line accent-pine-700 mt-0.5 h-4 w-4 rounded"
          />
          <span>Send me new stays and offers (optional).</span>
        </label>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary py-3.5 text-base sm:px-8"
        >
          {pending ? 'Sending code…' : 'Continue — verify my number'}
        </button>
        <p className="text-ink-soft text-sm">
          Free. We never share your number with an operator.
        </p>
      </div>
    </form>
  );
}
