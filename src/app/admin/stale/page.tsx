import Link from 'next/link';

import { FreshnessBadge, ListingStateBadge } from '@/components/ui/badge';
import { requirePermission } from '@/lib/auth/guard';
import { listStaleInventory } from '@/lib/services/properties';

export const metadata = {
  title: 'Needs confirming · #HashtagStay ops',
  robots: { index: false, follow: false },
};

/**
 * The stale-inventory work queue.
 *
 * In practice this is the largest recurring operational cost of running an
 * aggregator: chasing operators to confirm a bed count or a price. It is a
 * first-class screen rather than a report because the work is daily, and
 * because availability being advisory means age is the only quality signal we
 * have.
 */
export default async function StaleInventoryPage() {
  await requirePermission('availability:edit', { returnTo: '/admin/stale' });

  const rows = await listStaleInventory(14);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Needs confirming
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Live or paused inventory whose availability has not been confirmed in 14 days.
          Oldest first.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-10 text-center">
          <p className="text-sm font-medium text-emerald-800">
            Everything is confirmed within the last 14 days.
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            This queue being empty is the goal, not a sign it is broken.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Property</th>
                <th className="px-4 py-2.5">City</th>
                <th className="px-4 py-2.5">State</th>
                <th className="px-4 py-2.5">Last confirmed</th>
                <th className="px-4 py-2.5">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.propertyId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/properties/${row.propertyId}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {row.propertyName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.city}</td>
                  <td className="px-4 py-3">
                    <ListingStateBadge state={row.listingState} />
                  </td>
                  <td className="px-4 py-3">
                    <FreshnessBadge
                      ageDays={row.ageDays}
                      confirmedOn={row.confirmedOn}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
