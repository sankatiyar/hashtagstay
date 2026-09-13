import type { Metadata } from 'next';
import Link from 'next/link';

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
    [
      params.city,
      params.near,
      params.budget,
      params.type,
      params.gender,
      params.occupancy,
    ].filter(Boolean).length + selectedAmenities.size;

  const heading = institution
    ? `Stays near ${institution.name}`
    : filters.city
      ? `Stays in ${filters.city}`
      : 'Browse verified stays';

  return (
    <main>
      <section className="border-line bg-sand/50 border-b">
        <div className="container-page py-10">
          <p className="eyebrow">Search</p>
          <h1 className="font-display text-pine-950 mt-2 text-4xl font-semibold tracking-tight">
            {heading}
          </h1>
          <p className="text-ink-soft mt-2">
            {total} verified {total === 1 ? 'listing' : 'listings'}
            {institution && ` within ${filters.radiusKm ?? 5} km`}
            {activeCount > 0 &&
              ` · ${activeCount} ${activeCount === 1 ? 'filter' : 'filters'} applied`}
          </p>
        </div>
      </section>

      <div className="container-page grid gap-8 py-10 lg:grid-cols-[290px_1fr]">
        <form method="get" className="card h-fit space-y-5 p-5 lg:sticky lg:top-24">
          <div className="flex items-center justify-between">
            <p className="text-ink font-semibold">Filters</p>
            {activeCount > 0 && (
              <Link
                href="/search"
                className="text-pine-700 text-sm font-medium hover:underline"
              >
                Clear all
              </Link>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
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
                    {entry.city} ({entry.listingCount})
                  </option>
                ))}
              </select>
            </Field>

            <Field id="budget" label="Monthly budget (₹)">
              <input
                id="budget"
                name="budget"
                inputMode="numeric"
                placeholder="e.g. 15000"
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
                    {km} km of the campus
                  </option>
                ))}
              </select>
            </Field>

            <Field id="type" label="Kind of stay">
              <select
                id="type"
                name="type"
                defaultValue={params.type ?? ''}
                className="field"
              >
                <option value="">Any type</option>
                <option value="coliving">Co-living</option>
                <option value="pbsa">Student housing</option>
                <option value="homeshare">Home sharing</option>
              </select>
            </Field>

            <Field id="gender" label="I am looking for">
              <select
                id="gender"
                name="gender"
                defaultValue={params.gender ?? ''}
                className="field"
              >
                <option value="">No preference</option>
                <option value="female_only">Women-only accommodation</option>
                <option value="male_only">Men-only accommodation</option>
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
                <option value="2">Up to twin sharing</option>
                <option value="3">Up to triple sharing</option>
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
            <div className="mt-2 flex flex-wrap gap-2">
              {primaryFilterAmenities.map((amenity) => (
                <label
                  key={amenity.slug}
                  className="chip has-[:checked]:border-pine-600 has-[:checked]:bg-pine-800 cursor-pointer has-[:checked]:text-white"
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

          <button type="submit" className="btn-primary w-full py-3">
            Show stays
          </button>
        </form>

        <div className="min-w-0">
          {rows.length === 0 ? (
            <div className="card flex flex-col items-center px-6 py-16 text-center">
              <span className="bg-marigold-100 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl">
                🔍
              </span>
              <p className="font-display text-ink mt-5 text-2xl font-semibold">
                Nothing matches that search yet
              </p>
              <p className="text-ink-soft mt-2 max-w-md">
                We add verified inventory city by city. Widen the radius or raise the
                budget — or tell us what you need and a relationship manager will look
                for you.
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
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
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
              className="border-line mt-10 flex items-center justify-between gap-3 border-t pt-6 text-sm"
              aria-label="Pagination"
            >
              <p className="text-ink-soft">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={pageHref(params, page - 1)}
                    rel="prev"
                    className="btn-secondary"
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={pageHref(params, page + 1)}
                    rel="next"
                    className="btn-primary"
                  >
                    Next page
                  </Link>
                )}
              </div>
            </nav>
          )}

          {rows.length > 0 && (
            <div className="bg-pine-900 mt-12 flex flex-col items-start justify-between gap-4 rounded-3xl p-8 text-white sm:flex-row sm:items-center">
              <div>
                <p className="font-display text-2xl font-semibold">
                  Too many options? We’ll narrow it down.
                </p>
                <p className="text-pine-100/80 mt-1">
                  A relationship manager confirms availability and calls you with the
                  best two or three.
                </p>
              </div>
              <Link href="/enquiry" className="btn-accent shrink-0">
                Find me a stay
              </Link>
            </div>
          )}
        </div>
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
  children: React.ReactNode;
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
