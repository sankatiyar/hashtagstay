import Link from 'next/link';

import {
  FreshnessBadge,
  ListingStateBadge,
  VerificationBadge,
  genderPolicyLabel,
  propertyTypeLabel,
} from '@/components/ui/badge';
import { requirePermission } from '@/lib/auth/guard';
import {
  listProperties,
  listPropertyCities,
  type PropertyListFilters,
} from '@/lib/services/properties';
import { listingMachine } from '@/lib/state-machines';

export const metadata = {
  title: 'Inventory · #HashtagStay ops',
  robots: { index: false, follow: false },
};

const LISTING_STATES = Object.keys(listingMachine.transitions);

export default async function PropertiesPage(props: {
  searchParams: Promise<{
    city?: string;
    state?: string;
    q?: string;
    page?: string;
  }>;
}) {
  await requirePermission('property:edit', { returnTo: '/admin/properties' });

  const params = await props.searchParams;

  const filters: PropertyListFilters = {
    city: params.city,
    listingState: (params.state as PropertyListFilters['listingState']) ?? 'all',
    search: params.q,
    page: params.page ? Number(params.page) : 1,
  };

  const [{ rows, total, page, pageSize }, cities] = await Promise.all([
    listProperties(filters),
    listPropertyCities(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Inventory
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {total} {total === 1 ? 'property' : 'properties'}
          </p>
        </div>
        <Link
          href="/admin/properties/new"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Add property
        </Link>
      </div>

      {/* GET form so filters live in the URL and are shareable and bookmarkable. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="block text-xs font-medium text-slate-600">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Name, slug or locality"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-900"
          />
        </div>

        <div>
          <label htmlFor="city" className="block text-xs font-medium text-slate-600">
            City
          </label>
          <select
            id="city"
            name="city"
            defaultValue={params.city ?? 'all'}
            className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-900"
          >
            <option value="all">All cities</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="state" className="block text-xs font-medium text-slate-600">
            Listing state
          </label>
          <select
            id="state"
            name="state"
            defaultValue={params.state ?? 'all'}
            className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-900"
          >
            <option value="all">All states</option>
            {LISTING_STATES.map((state) => (
              <option key={state} value={state}>
                {state.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Apply
        </button>
        {(params.q || params.city || params.state) && (
          <Link
            href="/admin/properties"
            className="px-2 py-1.5 text-sm text-slate-500 underline hover:text-slate-800"
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-700">No properties match.</p>
          <p className="mt-1 text-sm text-slate-500">
            Adjust the filters, or add the first property for this city.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Property</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">State</th>
                <th className="px-4 py-2.5">Verification</th>
                <th className="px-4 py-2.5 text-right">Rooms</th>
                <th className="px-4 py-2.5 text-right">Beds free</th>
                <th className="px-4 py-2.5">Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/properties/${row.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {row.locality ? `${row.locality}, ` : ''}
                      {row.city} · {row.organizationName}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{propertyTypeLabel(row.propertyType)}</p>
                    <p className="text-xs text-slate-500">
                      {genderPolicyLabel(row.genderPolicy)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <ListingStateBadge state={row.listingState} />
                  </td>
                  <td className="px-4 py-3">
                    <VerificationBadge tier={row.verificationTier} />
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {row.roomTypeCount}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {row.availableBeds}
                  </td>
                  <td className="px-4 py-3">
                    <FreshnessBadge
                      ageDays={row.availabilityAgeDays}
                      confirmedOn={row.availabilityConfirmedOn}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          <p className="text-slate-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildPageHref(params, page - 1)}
                className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildPageHref(params, page + 1)}
                className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
              >
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

/** Preserve active filters when paging. */
function buildPageHref(
  params: { city?: string; state?: string; q?: string },
  page: number,
): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.city) search.set('city', params.city);
  if (params.state) search.set('state', params.state);
  search.set('page', String(page));
  return `/admin/properties?${search.toString()}`;
}
