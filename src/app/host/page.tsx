import Link from 'next/link';

import { BookingStateBadge } from '@/components/admin/status';
import { ListingStateBadge } from '@/components/ui/badge';
import { requireHost } from '@/lib/auth/host';
import { format, money } from '@/lib/money';
import { listBookings } from '@/lib/services/bookings';
import { hostPerformance, listHostProperties } from '@/lib/services/host-portal';
import { isoDate } from '@/lib/time';

export default async function HostDashboard(props: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const ctx = await requireHost('/host');
  const { welcome } = await props.searchParams;
  const [propertyRows, pending, recent, performance] = await Promise.all([
    listHostProperties(ctx.organizationId),
    listBookings({
      organizationId: ctx.organizationId,
      state: 'pending_host_confirmation',
    }),
    listBookings({ organizationId: ctx.organizationId, state: 'all' }),
    hostPerformance(ctx.organizationId),
  ]);
  const live = propertyRows.filter((p) => p.listingState === 'live').length;

  return (
    <div className="space-y-6">
      {welcome && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <p className="font-semibold">Welcome to Sandy Stays.</p>
          <p className="mt-1">
            Next: add your first property, upload photos and ownership documents, then
            send it for verification. It goes live once verified.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {ctx.organizationName}
          </h1>
          <p className="text-sm text-slate-500">
            {propertyRows.length} properties · {live} live
          </p>
        </div>
        <Link
          href="/host/properties/new"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add property
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Needs your confirmation
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Nothing waiting. We will text you when a resident is ready to book.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {pending.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span>
                  {b.propertyName} · {b.roomName} · move-in {isoDate(b.moveInDate)}
                </span>
                <Link
                  href={`/host/bookings/${b.id}`}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-white"
                >
                  Confirm or decline
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <h2 className="font-semibold text-slate-900">Last 30 days</h2>
        <table className="mt-3 w-full min-w-[520px]">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th>Property</th>
              <th className="text-right">Listing views</th>
              <th className="text-right">Shortlisted for residents</th>
              <th className="text-right">Booking requests</th>
              <th className="text-right">Confirmed</th>
            </tr>
          </thead>
          <tbody>
            {performance.map((p) => (
              <tr key={p.propertyId} className="border-t border-slate-100">
                <td className="py-1.5">{p.name}</td>
                <td className="text-right tabular-nums">{p.views}</td>
                <td className="text-right tabular-nums">{p.shortlisted}</td>
                <td className="text-right tabular-nums">{p.bookingRequests}</td>
                <td className="text-right tabular-nums">{p.confirmed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
          <h2 className="font-semibold text-slate-900">Properties</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {propertyRows.slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/host/properties/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>
                <ListingStateBadge state={p.listingState} />
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
          <h2 className="font-semibold text-slate-900">Recent bookings</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {recent.slice(0, 6).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/host/bookings/${b.id}`} className="hover:underline">
                  {b.reference} · {b.propertyName} ·{' '}
                  {format(money(b.monthlyRentAmountMinor, 'INR'))}
                </Link>
                <BookingStateBadge state={b.state} />
              </li>
            ))}
            {recent.length === 0 && (
              <li className="py-2 text-slate-500">No bookings yet.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
