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

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {institution
          ? `Stays near ${institution.name}`
          : filters.city
            ? `Stays in ${filters.city}`
            : 'Browse stays'}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {total} verified {total === 1 ? 'listing' : 'listings'}
        {institution && ` within ${filters.radiusKm ?? 5} km`}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        <form
          method="get"
          className="h-fit space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm"
        >
          <div>
            <label htmlFor="city" className="block text-xs font-medium text-slate-700">
              City
            </label>
            <select
              id="city"
              name="city"
              defaultValue={params.city ?? ''}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="">Any city</option>
              {cities.map((entry) => (
                <option key={entry.city} value={entry.city}>
                  {entry.city} ({entry.listingCount})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="near" className="block text-xs font-medium text-slate-700">
              Near a campus
            </label>
            <select
              id="near"
              name="near"
              defaultValue={params.near ?? ''}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="">Anywhere</option>
              {campuses.map((campus) => (
                <option key={campus.slug} value={campus.slug}>
                  {campus.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="radius"
              className="block text-xs font-medium text-slate-700"
            >
              Within
            </label>
            <select
              id="radius"
              name="radius"
              defaultValue={params.radius ?? '5'}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
            >
              {[2, 5, 10, 15].map((km) => (
                <option key={km} value={km}>
                  {km} km
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="budget"
              className="block text-xs font-medium text-slate-700"
            >
              Monthly budget (₹)
            </label>
            <input
              id="budget"
              name="budget"
              inputMode="numeric"
              placeholder="15000"
              defaultValue={params.budget ?? ''}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
            />
          </div>

          <div>
            <label htmlFor="type" className="block text-xs font-medium text-slate-700">
              Type
            </label>
            <select
              id="type"
              name="type"
              defaultValue={params.type ?? ''}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="">Any type</option>
              <option value="coliving">Co-living</option>
              <option value="pbsa">Student housing</option>
              <option value="homeshare">Home sharing</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="gender"
              className="block text-xs font-medium text-slate-700"
            >
              I am looking for
            </label>
            <select
              id="gender"
              name="gender"
              defaultValue={params.gender ?? ''}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="">No preference</option>
              <option value="female_only">Women-only accommodation</option>
              <option value="male_only">Men-only accommodation</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="occupancy"
              className="block text-xs font-medium text-slate-700"
            >
              Room sharing
            </label>
            <select
              id="occupancy"
              name="occupancy"
              defaultValue={params.occupancy ?? ''}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="">Any</option>
              <option value="1">Private room</option>
              <option value="2">Up to twin sharing</option>
              <option value="3">Up to triple sharing</option>
            </select>
          </div>

          <fieldset>
            <legend className="text-xs font-medium text-slate-700">Must have</legend>
            <div className="mt-2 space-y-1.5">
              {primaryFilterAmenities.map((amenity) => (
                <label
                  key={amenity.slug}
                  className="flex items-center gap-2 text-slate-700"
                >
                  <input
                    type="checkbox"
                    name="amenity"
                    value={amenity.slug}
                    defaultChecked={selectedAmenities.has(amenity.slug)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {amenity.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="sort" className="block text-xs font-medium text-slate-700">
              Sort by
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={params.sort ?? 'relevance'}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="relevance">Most relevant</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="distance">Nearest campus</option>
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Apply
            </button>
            <Link
              href="/search"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-600 hover:bg-slate-100"
            >
              Reset
            </Link>
          </div>
        </form>

        <div>
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
              <p className="font-medium text-slate-800">
                Nothing matches that search yet.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                We are adding verified inventory city by city. Widen the radius or raise
                the budget, or{' '}
                <Link href="/enquiry" className="text-slate-900 underline">
                  tell us what you need
                </Link>{' '}
                and a relationship manager will look for you.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
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
            <nav className="mt-6 flex items-center justify-between text-sm">
              <p className="text-slate-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={pageHref(params, page - 1)}
                    rel="prev"
                    className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={pageHref(params, page + 1)}
                    rel="next"
                    className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
                  >
                    Next
                  </Link>
                )}
              </div>
            </nav>
          )}
        </div>
      </div>
    </main>
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
