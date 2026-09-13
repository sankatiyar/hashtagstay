import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BookingStateBadge } from '@/components/admin/status';
import { ActionForm } from '@/components/ui/action-form';
import { requireHost } from '@/lib/auth/host';
import { format, money } from '@/lib/money';
import { BookingError, getBookingDetail } from '@/lib/services/bookings';
import { isoDate } from '@/lib/time';

import { hostConfirmBooking, hostDeclineBooking } from '../../actions';

export default async function HostBookingPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const ctx = await requireHost(`/host/bookings/${id}`);
  let detail;
  try {
    detail = await getBookingDetail(id);
  } catch (error) {
    if (error instanceof BookingError) notFound();
    throw error;
  }
  if (detail.booking.organizationId !== ctx.organizationId) notFound();
  const { booking } = detail;
  const firstName = detail.lead?.contactName?.split(' ')[0] ?? 'The resident';

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/host/bookings" className="text-sm text-slate-500 hover:underline">
        ← Bookings
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {booking.reference}
          </h1>
          <p className="text-sm text-slate-500">
            {detail.property.name} · {detail.room?.name}
          </p>
        </div>
        <BookingStateBadge state={booking.state} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <dl className="space-y-1.5">
          {(
            [
              ['Resident', firstName],
              ['Move-in', isoDate(booking.moveInDate)],
              ['Stay', `${booking.tenureMonths} months`],
              [
                'Agreed rent (paid to you)',
                `${format(money(booking.monthlyRentAmountMinor, 'INR'))}/month`,
              ],
              [
                'Deposit (paid to you)',
                booking.depositAmountMinor !== null
                  ? format(money(booking.depositAmountMinor, 'INR'))
                  : '—',
              ],
              [
                'HashtagStay commission',
                booking.hostCommissionAmountMinor !== null
                  ? `${format(money(booking.hostCommissionAmountMinor, 'INR'), { showDecimals: true })} + GST, on your monthly statement`
                  : '—',
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          For everyone’s safety, residents’ and hosts’ phone numbers are not shared.
          Your HashtagStay relationship manager coordinates move-in.
        </p>
      </section>

      {booking.state === 'pending_host_confirmation' && (
        <section className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-900">
            Is this bed genuinely free for {firstName} from{' '}
            {isoDate(booking.moveInDate)}? The resident is only asked to pay once you
            confirm.
          </p>
          <ActionForm action={hostConfirmBooking} submitLabel="Yes, confirm the bed">
            <input type="hidden" name="bookingId" value={id} />
          </ActionForm>
          <ActionForm
            action={hostDeclineBooking}
            submitLabel="No, it is not available"
            tone="danger"
            className="space-y-2"
          >
            <input type="hidden" name="bookingId" value={id} />
            <input
              name="note"
              placeholder="Optional: when it might be free"
              className="block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
