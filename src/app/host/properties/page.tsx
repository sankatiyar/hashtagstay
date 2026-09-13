import Link from 'next/link';

import {
  FreshnessBadge,
  ListingStateBadge,
  VerificationBadge,
} from '@/components/ui/badge';
import { requireHost } from '@/lib/auth/host';
import { ageInDaysOrNull } from '@/lib/time';
import { listHostProperties } from '@/lib/services/host-portal';

export default async function HostPropertiesPage() {
  const ctx = await requireHost('/host/properties');
  const rows = await listHostProperties(ctx.organizationId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Properties
        </h1>
        <Link
          href="/host/properties/new"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add property
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          No properties yet.{' '}
          <Link href="/host/properties/new" className="underline">
            Add your first
          </Link>
          .
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {rows.map((p) => (
            <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <Link
                href={`/host/properties/${p.id}`}
                className="font-semibold text-slate-900 hover:underline"
              >
                {p.name}
              </Link>
              <p className="text-sm text-slate-500">
                {p.locality ? `${p.locality}, ` : ''}
                {p.city} · {p.roomTypeCount} room types · {p.bedsFree} beds free
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ListingStateBadge state={p.listingState} />
                <VerificationBadge tier={p.verificationTier} />
                <FreshnessBadge ageDays={ageInDaysOrNull(p.lastConfirmedAt)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
