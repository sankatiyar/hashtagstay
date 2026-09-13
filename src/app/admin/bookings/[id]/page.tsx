import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { BookingControls } from '@/components/admin/booking-controls';
import {
  BookingStateBadge,
  PaymentStateBadge,
  istDateTime,
} from '@/components/admin/status';
import { requireStaff } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { format, money } from '@/lib/money';
import { BookingError, getBookingDetail } from '@/lib/services/bookings';
import { listTaxDocumentsForBooking } from '@/lib/services/invoices';
import { canViewLead } from '@/lib/services/leads';
import { absoluteUrl } from '@/lib/seo';
import type { BookingState } from '@/lib/state-machines';
import { isoDate } from '@/lib/time';

export const metadata = {
  title: 'Booking · Sandy Stays ops',
  robots: { index: false, follow: false },
};

const inr = (minor: number | null | undefined, decimals = false) =>
  minor === null || minor === undefined
    ? '—'
    : format(money(minor, 'INR'), { showDecimals: decimals });

export default async function BookingDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const user = await requireStaff(`/admin/bookings/${id}`);

  let detail;
  try {
    detail = await getBookingDetail(id);
  } catch (error) {
    if (error instanceof BookingError) notFound();
    throw error;
  }

  const allowed =
    can(user.roles, 'lead:view_all') ||
    can(user.roles, 'payment:view') ||
    (detail.lead ? canViewLead(user, detail.lead) : false);
  if (!allowed) redirect('/admin/denied');

  const { booking } = detail;
  const invoices = await listTaxDocumentsForBooking(id);
  const canAct = can(user.roles, 'booking:create') || can(user.roles, 'booking:cancel');

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/bookings" className="text-sm text-slate-500 hover:underline">
          ← Bookings
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              {booking.reference}
            </h1>
            <p className="text-sm text-slate-500">
              {detail.property.name} · {detail.room?.name ?? 'Room'} ·{' '}
              {detail.organization.name}
            </p>
          </div>
          <BookingStateBadge state={booking.state} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
            <h2 className="font-semibold text-slate-900">
              Terms (snapshotted at booking)
            </h2>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['Resident', detail.lead?.contactName ?? '—'],
                  ['Lead', detail.lead?.reference ?? '—'],
                  ['Move-in', isoDate(booking.moveInDate)],
                  ['Tenure', `${booking.tenureMonths} months`],
                  ['Agreed rent', `${inr(booking.monthlyRentAmountMinor)}/month`],
                  ['Deposit', inr(booking.depositAmountMinor)],
                  ['Gross booking value', inr(booking.grossValueAmountMinor)],
                  [
                    'Facilitation fee (resident, ex-GST)',
                    inr(booking.facilitationFeeAmountMinor, true),
                  ],
                  [
                    'Host commission (ex-GST)',
                    inr(booking.hostCommissionAmountMinor, true),
                  ],
                  ['Closed by', detail.rmName ?? '—'],
                  ['Operator asked', istDateTime(booking.hostConfirmationRequestedAt)],
                  ['Operator confirmed', istDateTime(booking.hostConfirmedAt)],
                  ['Confirmed', istDateTime(booking.confirmedAt)],
                  [
                    'Cancelled',
                    booking.cancelledAt
                      ? `${istDateTime(booking.cancelledAt)} (${booking.cancelReason})`
                      : '—',
                  ],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-3 border-b border-slate-50 py-1"
                >
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
            <h2 className="font-semibold text-slate-900">Payments</h2>
            {detail.payments.length === 0 ? (
              <p className="mt-2 text-slate-500">No payment requested yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {detail.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 p-3"
                  >
                    <div>
                      <p className="text-slate-900">
                        {inr(p.grossAmountMinor, true)} incl. GST{' '}
                        {inr(p.taxAmountMinor, true)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {p.provider} · created {istDateTime(p.createdAt)}
                        {p.paidAt && ` · paid ${istDateTime(p.paidAt)}`}
                        {p.refundedAmountMinor
                          ? ` · refunded ${inr(p.refundedAmountMinor, true)}`
                          : ''}
                      </p>
                      {p.publicToken && ['created', 'pending'].includes(p.state) && (
                        <a
                          href={absoluteUrl(`/pay/${p.publicToken}`)}
                          className="text-xs text-slate-700 underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Payment page
                        </a>
                      )}
                    </div>
                    <PaymentStateBadge state={p.state} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
            <h2 className="font-semibold text-slate-900">GST documents</h2>
            {invoices.length === 0 ? (
              <p className="mt-2 text-slate-500">
                None issued. An invoice is issued automatically when the fee is paid.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {invoices.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap justify-between gap-2 rounded-md border border-slate-100 p-3"
                  >
                    <span>
                      <span className="font-medium text-slate-900">
                        {doc.documentNumber}
                      </span>{' '}
                      <span className="text-slate-500">
                        {doc.documentType.replace('_', ' ')} ·{' '}
                        {doc.supplyType.replace('_', ' ')}
                      </span>
                    </span>
                    <span className="text-slate-700">
                      {inr(doc.taxableAmountMinor, true)} + GST{' '}
                      {inr(
                        (doc.cgstAmountMinor ?? 0) +
                          (doc.sgstAmountMinor ?? 0) +
                          (doc.igstAmountMinor ?? 0),
                        true,
                      )}{' '}
                      = {inr(doc.totalAmountMinor, true)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Next step</h2>
          <div className="mt-3">
            {canAct ? (
              <BookingControls
                bookingId={id}
                leadId={detail.lead?.id ?? null}
                state={booking.state as BookingState}
              />
            ) : (
              <p className="text-sm text-slate-500">
                You can view this booking but not change it.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
