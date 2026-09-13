import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CategoryBar } from '@/components/public/category-bar';
import { Icon } from '@/components/public/icons';
import { ListingCard } from '@/components/public/listing-card';
import { fromMajorUnits } from '@/lib/money';
import { absoluteUrl, pageTitle } from '@/lib/seo';
import {
  type SearchFilters,
  listLiveCities,
  listPublishedInstitutions,
  searchListings,
} from '@/lib/services/public-search';
import { primaryFilterAmenities } from '@/lib/taxonomy/amenities';

/**
 * Browse and filter live inventory (FR-01, FR-03, FR-04 entry point).
 *
 * Filters live in the URL as a GET form rather than in client state, so a
 * search is shareable, bookmarkable, and back-button-safe — and so an RM can
 * paste the exact search a resident described.
 */

export const metadata: Metadata = {
  title: pageTitle('Browse co-living and student housing'),
  description:
    'Search verified co-living and student housing across India by city, budget, room type and campus proximity.',
  alternates: { canonical: absoluteUrl('/search') },
};

type RawParams = {
  city?: string;
  type?: string;
  gender?: string;
  budget?: string;
  occupancy?: string;
  near?: string;
  radius?: string;
  sort?: string;
  page?: string;
  amenity?: string | string[];
};

/** Parse untrusted query parameters into typed filters, dropping anything odd. */
function toFilters(params: RawParams): SearchFilters {
  const amenityParam = params.amenity;
  const amenities = Array.isArray(amenityParam)
    ? amenityParam
    : amenityParam
      ? [amenityParam]
      : [];

  const budget = params.budget?.replace(/[,\s₹]/g, '');
  let maxRentMinor: number | undefined;
  if (budget && /^\d+(\.\d{1,2})?$/.test(budget)) {
    maxRentMinor = fromMajorUnits(budget, 'INR').amountMinor;
  }

  const occupancy = Number(params.occupancy);
  const radius = Number(params.radius);

  return {
    city: params.city || undefined,
    propertyType: (['pbsa', 'coliving', 'homeshare'] as const).find(
      (t) => t === params.type,
    ),
    genderPolicy: (['male_only', 'female_only'] as const).find(
      (g) => g === params.gender,
    ),
    maxRentMinor,
    maxOccupancy:
      Number.isInteger(occupancy) && occupancy > 0 && occupancy <= 12
        ? occupancy
        : undefined,
    amenities,
    institutionSlug: params.near || undefined,
    radiusKm:
      Number.isFinite(radius) && radius > 0 && radius <= 25 ? radius : undefined,
    sort: (['relevance', 'price_asc', 'price_desc', 'distance'] as const).find(
      (s) => s === params.sort,
    ),
    page: Number(params.page) || 1,
  };
}

export default async function SearchPage(props: { searchParams: Promise<RawParams> }) {
  const params = await props.searchParams;
  const filters = toFilters(params);

  const [{ rows, total, page, pageSize, institution }, cities, campuses] =
    await Promise.all([
      searchListings(filters),
      listLiveCities(),
      listPublishedInstitutions(),
    ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedAmenities = new Set(filters.amenities ?? []);
  const activeCount =
    [params.near, params.budget, params.occupancy].filter(Boolean).length +
    selectedAmenities.size;

  const heading = institution
    ? `Stays near ${institution.name}`
    : filters.city
      ? `Stays in ${filters.city}`
      : 'All verified stays';

  return (
    <main>
      <div className="border-line sticky top-20 z-30 border-b bg-white">
        <div className="container-page flex items-center gap-6">
          <div className="min-w-0 flex-1">
            <CategoryBar
              cities={cities}
              active={{
                type: params.type,
                gender: params.gender,
                occupancy: params.occupancy,
                city: params.city,
              }}
            />
          </div>

          <details className="group relative shrink-0">
            <summary className="border-line text-ink hover:border-ink flex cursor-pointer list-none items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition [&::-webkit-details-marker]:hidden">
              <Icon name="sliders" className="h-4 w-4" />
              Filters
              {activeCount > 0 && (
                <span className="bg-ink flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-white">
                  {activeCount}
                </span>
              )}
            </summary>
            <form
              method="get"
              className="border-line absolute right-0 z-40 mt-3 w-[min(92vw,420px)] space-y-5 rounded-2xl border bg-white p-6 shadow-(--shadow-lift)"
            >
              {params.type && <input type="hidden" name="type" value={params.type} />}
              {params.gender && (
                <input type="hidden" name="gender" value={params.gender} />
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="city" label="City">
                  <select
                    id="city"
                    name="city"
                    defaultValue={params.city ?? ''}
                    className="field"
                  >
                    <option value="">Any city</option>
                    {cities.map((entry) => (
                      <option key={entry.city} value={entry.city}>
                        {entry.city}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="budget" label="Max rent (₹)">
                  <input
                    id="budget"
                    name="budget"
                    inputMode="numeric"
                    placeholder="15000"
                    defaultValue={params.budget ?? ''}
                    className="field"
                  />
                </Field>
                <Field id="near" label="Near a campus">
                  <select
                    id="near"
                    name="near"
                    defaultValue={params.near ?? ''}
                    className="field"
                  >
                    <option value="">Anywhere</option>
                    {campuses.map((campus) => (
                      <option key={campus.slug} value={campus.slug}>
                        {campus.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="radius" label="Within">
                  <select
                    id="radius"
                    name="radius"
                    defaultValue={params.radius ?? '5'}
                    className="field"
                  >
                    {[2, 5, 10, 15].map((km) => (
                      <option key={km} value={km}>
                        {km} km
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="occupancy" label="Room sharing">
                  <select
                    id="occupancy"
                    name="occupancy"
                    defaultValue={params.occupancy ?? ''}
                    className="field"
                  >
                    <option value="">Any</option>
                    <option value="1">Private room</option>
                    <option value="2">Up to twin</option>
                    <option value="3">Up to triple</option>
                  </select>
                </Field>
                <Field id="sort" label="Sort by">
                  <select
                    id="sort"
                    name="sort"
                    defaultValue={params.sort ?? 'relevance'}
                    className="field"
                  >
                    <option value="relevance">Most relevant</option>
                    <option value="price_asc">Price: low to high</option>
                    <option value="price_desc">Price: high to low</option>
                    <option value="distance">Nearest campus</option>
                  </select>
                </Field>
              </div>

              <fieldset>
                <legend className="label">Must have</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {primaryFilterAmenities.map((amenity) => (
                    <label
                      key={amenity.slug}
                      className="chip has-[:checked]:border-ink has-[:checked]:bg-ink cursor-pointer has-[:checked]:text-white"
                    >
                      <input
                        type="checkbox"
                        name="amenity"
                        value={amenity.slug}
                        defaultChecked={selectedAmenities.has(amenity.slug)}
                        className="sr-only"
                      />
                      {amenity.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="border-line flex items-center justify-between border-t pt-5">
                <Link
                  href="/search"
                  className="text-ink text-sm font-semibold underline"
                >
                  Clear all
                </Link>
                <button type="submit" className="btn-primary px-6 py-3">
                  Show stays
                </button>
              </div>
            </form>
          </details>
        </div>
      </div>

      <div className="container-page pt-8">
        <h1 className="text-ink text-lg font-semibold">
          {total} {total === 1 ? 'stay' : 'stays'} · {heading}
          {institution && ` · within ${filters.radiusKm ?? 5} km`}
        </h1>

        {rows.length === 0 ? (
          <div className="border-line mt-8 rounded-2xl border px-6 py-16 text-center">
            <Icon name="search" className="text-brand-600 mx-auto h-10 w-10" />
            <p className="text-ink mt-5 text-2xl font-bold">No exact matches</p>
            <p className="text-ink-soft mx-auto mt-2 max-w-md">
              Try removing a filter, widening the radius or raising the budget — or tell
              us what you need and a relationship manager will look for you.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/enquiry" className="btn-primary">
                Find me a stay
              </Link>
              <Link href="/search" className="btn-secondary">
                Clear filters
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                showDistance={Boolean(institution)}
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <nav
            className="mt-12 flex items-center justify-center gap-3"
            aria-label="Pagination"
          >
            {page > 1 && (
              <Link
                href={pageHref(params, page - 1)}
                rel="prev"
                className="btn-secondary"
              >
                Previous
              </Link>
            )}
            <span className="text-ink-soft text-sm">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={pageHref(params, page + 1)}
                rel="next"
                className="btn-secondary"
              >
                Next
              </Link>
            )}
          </nav>
        )}

        {rows.length > 0 && (
          <div className="bg-sand mt-16 flex flex-col items-start justify-between gap-4 rounded-2xl p-8 sm:flex-row sm:items-center">
            <div>
              <p className="text-ink text-xl font-bold">
                Too many options? We’ll narrow it down.
              </p>
              <p className="text-ink-soft mt-1">
                A relationship manager confirms availability and calls you with the best
                two or three.
              </p>
            </div>
            <Link href="/enquiry" className="btn-primary shrink-0 px-6 py-3.5">
              Find me a stay
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Keep every active filter when paging. */
function pageHref(params: RawParams, page: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'page' || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) search.append(key, entry);
    } else {
      search.set(key, value);
    }
  }
  search.set('page', String(page));
  return `/search?${search.toString()}`;
}
