import Link from 'next/link';

import { BookingStateBadge } from '@/components/admin/status';
import { requireHost } from '@/lib/auth/host';
import { format, money } from '@/lib/money';
import { listBookings } from '@/lib/services/bookings';
import { isoDate } from '@/lib/time';

export default async function HostBookingsPage() {
  const ctx = await requireHost('/host/bookings');
  const rows = await listBookings({ organizationId: ctx.organizationId, state: 'all' });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Bookings
        </h1>
        <p className="text-sm text-slate-500">
          Residents pay rent and deposit to you directly. HashtagStay’s commission
          appears on your monthly statement.
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          No bookings yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Booking</th>
                <th className="px-4 py-2.5">Room</th>
                <th className="px-4 py-2.5">Move-in</th>
                <th className="px-4 py-2.5 text-right">Rent</th>
                <th className="px-4 py-2.5 text-right">Commission</th>
                <th className="px-4 py-2.5">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/host/bookings/${b.id}`}
                      className="font-medium hover:underline"
                    >
                      {b.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {b.propertyName} · {b.roomName}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {isoDate(b.moveInDate)} · {b.tenureMonths} mo
                  </td>
                  <td className="px-4 py-3 text-right">
                    {format(money(b.monthlyRentAmountMinor, 'INR'))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {b.hostCommissionAmountMinor !== null
                      ? format(money(b.hostCommissionAmountMinor, 'INR'), {
                          showDecimals: true,
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <BookingStateBadge state={b.state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
