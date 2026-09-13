import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BookingStateBadge, istDateTime } from '@/components/admin/status';
import { requireStaff } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { format, money } from '@/lib/money';
import { listBookings } from '@/lib/services/bookings';
import { isoDate } from '@/lib/time';

export const metadata = {
  title: 'Bookings · Sandy Stays ops',
  robots: { index: false, follow: false },
};

const STATES = [
  'open',
  'all',
  'pending_host_confirmation',
  'fee_pending',
  'confirmed',
  'moved_in',
  'completed',
  'cancelled',
  'refunded',
] as const;

export default async function BookingsPage(props: {
  searchParams: Promise<{ state?: string }>;
}) {
  const user = await requireStaff('/admin/bookings');
  const seeAll = can(user.roles, 'lead:view_all') || can(user.roles, 'payment:view');
  if (!seeAll && !can(user.roles, 'booking:create')) redirect('/admin/denied');

  const { state } = await props.searchParams;
  const filter = STATES.find((s) => s === state) ?? 'open';
  const rows = await listBookings({
    state: filter as never,
    closedByUserId: seeAll ? undefined : user.id,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Bookings
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {seeAll ? 'All bookings.' : 'Bookings you closed.'} A resident is never
          charged before the operator confirms.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {STATES.map((s) => (
          <Link
            key={s}
            href={`/admin/bookings?state=${s}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${filter === s ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
          >
            {s.replaceAll('_', ' ')}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          No bookings here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Booking</th>
                <th className="px-4 py-2.5">Stay</th>
                <th className="px-4 py-2.5">Resident</th>
                <th className="px-4 py-2.5 text-right">Rent</th>
                <th className="px-4 py-2.5 text-right">Fee</th>
                <th className="px-4 py-2.5">State</th>
                <th className="px-4 py-2.5">RM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/bookings/${b.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {b.reference}
                    </Link>
                    <p className="text-xs text-slate-500">{istDateTime(b.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{b.propertyName}</p>
                    <p className="text-xs text-slate-500">
                      {b.roomName} · move-in {isoDate(b.moveInDate)} · {b.tenureMonths}{' '}
                      mo
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {b.leadId ? (
                      <Link
                        href={`/admin/leads/${b.leadId}`}
                        className="hover:underline"
                      >
                        {b.residentName ?? b.leadReference}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {format(money(b.monthlyRentAmountMinor, 'INR'))}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {b.facilitationFeeAmountMinor !== null
                      ? format(money(b.facilitationFeeAmountMinor, 'INR'), {
                          showDecimals: true,
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <BookingStateBadge state={b.state} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{b.rmName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
