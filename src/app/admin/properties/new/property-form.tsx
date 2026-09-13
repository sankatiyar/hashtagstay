'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import {
  type AmenityCategory,
  HOUSE_RULES,
  amenitiesByCategory,
} from '@/lib/taxonomy/amenities';

import { type CreatePropertyState, createPropertyAction } from './actions';

const initial: CreatePropertyState = {};

const CATEGORY_LABELS: Record<AmenityCategory, string> = {
  essentials: 'Essentials',
  food: 'Food and kitchen',
  services: 'Services',
  safety: 'Safety',
  community: 'Community',
  accessibility: 'Accessibility',
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as AmenityCategory[];

export function PropertyForm({
  organizations,
  cities,
  action = createPropertyAction,
}: {
  organizations: { id: string; name: string }[];
  cities: string[];
  /** Defaults to the ops console action; the host portal passes its own. */
  action?: (
    state: CreatePropertyState,
    formData: FormData,
  ) => Promise<CreatePropertyState>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  // Room rows are client state so ops can add a second room type without a
  // round trip. One row is the minimum the schema accepts.
  const [roomCount, setRoomCount] = useState(1);

  const errors = state.errors ?? {};
  const values = (state.values ?? {}) as Record<string, string>;
  const submittedRooms = (state.values?.rooms as Record<string, string>[]) ?? [];
  const rowCount = Math.max(roomCount, submittedRooms.length || 1);

  const submittedAmenities = new Set(
    (state.values?.amenities as string[] | undefined) ?? [],
  );
  const submittedRules = new Set(
    (state.values?.houseRules as string[] | undefined) ?? [],
  );

  return (
    <form action={formAction} className="space-y-6">
      {errors._form && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errors._form}
        </p>
      )}

      <Section
        title="Operator and identity"
        hint="A property always belongs to one operator, so commission and statements have a single counterparty."
      >
        <Field label="Operator" error={errors.organizationId} htmlFor="organizationId">
          {/*
            `key` forces a remount when the submitted value changes.
            React applies `defaultValue` to a <select> only on mount, so
            without this a chosen operator is silently lost every time
            validation fails — and re-picking it is the most annoying possible
            thing to ask of someone who just filled in a long form.
          */}
          <select
            key={`org-${values.organizationId ?? ''}`}
            id="organizationId"
            name="organizationId"
            defaultValue={values.organizationId ?? ''}
            required
            className={inputClass(errors.organizationId)}
          >
            <option value="">Choose an operator…</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Property name" error={errors.name} htmlFor="name">
          <input
            id="name"
            name="name"
            required
            defaultValue={values.name ?? ''}
            placeholder="Nest Malleswaram"
            className={inputClass(errors.name)}
          />
        </Field>

        <Field
          label="URL slug"
          error={errors.slug}
          htmlFor="slug"
          hint="Leave blank to derive it from the name. Permanent once published — changing it breaks inbound links."
        >
          <input
            id="slug"
            name="slug"
            defaultValue={values.slug ?? ''}
            placeholder="nest-malleswaram"
            className={inputClass(errors.slug)}
          />
        </Field>

        <Field label="Description" error={errors.description} htmlFor="description">
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={values.description ?? ''}
            className={inputClass(errors.description)}
          />
        </Field>
      </Section>

      <Section title="Type and policy">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Inventory type"
            error={errors.propertyType}
            htmlFor="propertyType"
          >
            <select
              key={`type-${values.propertyType ?? ''}`}
              id="propertyType"
              name="propertyType"
              required
              defaultValue={values.propertyType ?? 'coliving'}
              className={inputClass(errors.propertyType)}
            >
              <option value="coliving">Co-living</option>
              <option value="pbsa">Student housing (PBSA)</option>
              <option value="homeshare">Home sharing</option>
            </select>
          </Field>

          <Field
            label="Who it accepts"
            error={errors.genderPolicy}
            htmlFor="genderPolicy"
          >
            <select
              key={`gender-${values.genderPolicy ?? ''}`}
              id="genderPolicy"
              name="genderPolicy"
              defaultValue={values.genderPolicy ?? 'any'}
              className={inputClass(errors.genderPolicy)}
            >
              <option value="any">Any gender</option>
              <option value="female_only">Women only</option>
              <option value="male_only">Men only</option>
              <option value="co_ed_segregated_floors">Co-ed, segregated floors</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section
        title="Address and location"
        hint="Coordinates are what make a property findable by campus proximity. Without them it is excluded from that search entirely."
      >
        <Field
          label="Address line 1"
          error={errors.addressLine1}
          htmlFor="addressLine1"
        >
          <input
            id="addressLine1"
            name="addressLine1"
            required
            defaultValue={values.addressLine1 ?? ''}
            className={inputClass(errors.addressLine1)}
          />
        </Field>

        <Field
          label="Address line 2"
          error={errors.addressLine2}
          htmlFor="addressLine2"
        >
          <input
            id="addressLine2"
            name="addressLine2"
            defaultValue={values.addressLine2 ?? ''}
            className={inputClass(errors.addressLine2)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Locality" error={errors.locality} htmlFor="locality">
            <input
              id="locality"
              name="locality"
              defaultValue={values.locality ?? ''}
              placeholder="Malleswaram"
              className={inputClass(errors.locality)}
            />
          </Field>

          <Field label="City" error={errors.city} htmlFor="city">
            <input
              id="city"
              name="city"
              required
              list="known-cities"
              defaultValue={values.city ?? ''}
              className={inputClass(errors.city)}
            />
            <datalist id="known-cities">
              {cities.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </Field>

          <Field label="State" error={errors.state} htmlFor="state">
            <input
              id="state"
              name="state"
              defaultValue={values.state ?? ''}
              className={inputClass(errors.state)}
            />
          </Field>

          <Field label="PIN code" error={errors.postalCode} htmlFor="postalCode">
            <input
              id="postalCode"
              name="postalCode"
              inputMode="numeric"
              defaultValue={values.postalCode ?? ''}
              placeholder="560003"
              className={inputClass(errors.postalCode)}
            />
          </Field>

          <Field
            label="Latitude"
            error={errors.latitude}
            htmlFor="latitude"
            hint="Latitude first, e.g. 13.0035"
          >
            <input
              id="latitude"
              name="latitude"
              inputMode="decimal"
              defaultValue={values.latitude ?? ''}
              placeholder="13.0035"
              className={inputClass(errors.latitude)}
            />
          </Field>

          <Field
            label="Longitude"
            error={errors.longitude}
            htmlFor="longitude"
            hint="Longitude second, e.g. 77.5712"
          >
            <input
              id="longitude"
              name="longitude"
              inputMode="decimal"
              defaultValue={values.longitude ?? ''}
              placeholder="77.5712"
              className={inputClass(errors.longitude)}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Room types and pricing"
        hint="At least one is required — a property cannot be listed without something to sell. Enter rent in rupees per month."
      >
        {errors.rooms && (
          <p role="alert" className="text-sm text-red-700">
            {errors.rooms}
          </p>
        )}

        <div className="space-y-4">
          {Array.from({ length: rowCount }, (_, index) => {
            const row = submittedRooms[index] ?? {};
            return (
              <fieldset key={index} className="rounded-lg border border-slate-200 p-4">
                <legend className="px-1 text-xs font-medium text-slate-500">
                  Room type {index + 1}
                </legend>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Name"
                    error={errors[`rooms.${index}.name`]}
                    htmlFor={`rooms.${index}.name`}
                  >
                    <input
                      id={`rooms.${index}.name`}
                      name={`rooms.${index}.name`}
                      defaultValue={row.name ?? ''}
                      placeholder="Single occupancy"
                      className={inputClass(errors[`rooms.${index}.name`])}
                    />
                  </Field>

                  <Field
                    label="Beds in the room"
                    error={errors[`rooms.${index}.occupancy`]}
                    htmlFor={`rooms.${index}.occupancy`}
                  >
                    <input
                      id={`rooms.${index}.occupancy`}
                      name={`rooms.${index}.occupancy`}
                      type="number"
                      min={1}
                      max={12}
                      defaultValue={row.occupancy ?? '1'}
                      className={inputClass(errors[`rooms.${index}.occupancy`])}
                    />
                  </Field>

                  <Field
                    label="Monthly rent (₹)"
                    error={errors[`rooms.${index}.rentAmountMinor`]}
                    htmlFor={`rooms.${index}.rentAmountMinor`}
                  >
                    <input
                      id={`rooms.${index}.rentAmountMinor`}
                      name={`rooms.${index}.rentAmountMinor`}
                      inputMode="decimal"
                      defaultValue={row.rentAmountMinor ?? ''}
                      placeholder="18000"
                      className={inputClass(errors[`rooms.${index}.rentAmountMinor`])}
                    />
                  </Field>

                  <Field
                    label="Deposit (₹)"
                    error={errors[`rooms.${index}.depositAmountMinor`]}
                    htmlFor={`rooms.${index}.depositAmountMinor`}
                  >
                    <input
                      id={`rooms.${index}.depositAmountMinor`}
                      name={`rooms.${index}.depositAmountMinor`}
                      inputMode="decimal"
                      defaultValue={row.depositAmountMinor ?? ''}
                      placeholder="36000"
                      className={inputClass(
                        errors[`rooms.${index}.depositAmountMinor`],
                      )}
                    />
                  </Field>

                  <Field
                    label="Minimum tenure (months)"
                    error={errors[`rooms.${index}.minTenureMonths`]}
                    htmlFor={`rooms.${index}.minTenureMonths`}
                  >
                    <input
                      id={`rooms.${index}.minTenureMonths`}
                      name={`rooms.${index}.minTenureMonths`}
                      type="number"
                      min={1}
                      max={36}
                      defaultValue={row.minTenureMonths ?? '3'}
                      className={inputClass(errors[`rooms.${index}.minTenureMonths`])}
                    />
                  </Field>

                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        name={`rooms.${index}.hasPrivateBathroom`}
                        defaultChecked={Boolean(row.hasPrivateBathroom)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Attached bathroom
                    </label>
                  </div>
                </div>
              </fieldset>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRoomCount((n) => Math.min(20, n + 1))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            Add another room type
          </button>
          {rowCount > 1 && (
            <button
              type="button"
              onClick={() => setRoomCount((n) => Math.max(1, n - 1))}
              className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
            >
              Remove last
            </button>
          )}
        </div>
      </Section>

      <Section
        title="Amenities"
        hint="Safety amenities carry extra weight in how a listing presents to solo and female residents."
      >
        <div className="space-y-4">
          {CATEGORIES.map((category) => (
            <div key={category}>
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                {CATEGORY_LABELS[category]}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {amenitiesByCategory(category).map((amenity) => (
                  <label
                    key={amenity.slug}
                    className="flex items-center gap-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      name="amenities"
                      value={amenity.slug}
                      defaultChecked={submittedAmenities.has(amenity.slug)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {amenity.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {errors.amenities && (
          <p role="alert" className="text-sm text-red-700">
            {errors.amenities}
          </p>
        )}
      </Section>

      <Section
        title="House rules"
        hint="A rule is something the property asks of a resident, not a feature it offers."
      >
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {HOUSE_RULES.map((rule) => (
            <label
              key={rule.slug}
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                name="houseRules"
                value={rule.slug}
                defaultChecked={submittedRules.has(rule.slug)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {rule.label}
            </label>
          ))}
        </div>
      </Section>

      <div className="flex items-center gap-3 border-t border-slate-200 pt-5">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create as draft'}
        </button>
        <Link
          href="/admin/properties"
          className="text-sm text-slate-500 hover:text-slate-800 hover:underline"
        >
          Cancel
        </Link>
        <p className="text-xs text-slate-500">
          Saved as a draft. It reaches residents only after verification.
        </p>
      </div>
    </form>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {hint && <p className="mt-0.5 mb-4 text-xs text-slate-500">{hint}</p>}
      <div className={hint ? 'space-y-4' : 'mt-4 space-y-4'}>{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-600">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass = (error?: string) =>
  `block w-full rounded-md border px-3 py-1.5 text-sm outline-none ${
    error
      ? 'border-red-400 focus:border-red-500'
      : 'border-slate-300 focus:border-slate-900'
  }`;
