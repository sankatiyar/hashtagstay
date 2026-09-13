import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ActionForm } from '@/components/ui/action-form';
import { format, money } from '@/lib/money';
import { getPaymentPage } from '@/lib/services/payments';
import { isoDate } from '@/lib/time';

import { payInTestMode } from './actions';

export const metadata: Metadata = {
  title: 'Pay facilitation fee · HashtagStay',
  robots: { index: false, follow: false },
};

const inr = (minor: number) => format(money(minor, 'INR'), { showDecimals: true });

export default async function PayPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const page = await getPaymentPage(token);
  if (!page) notFound();

  const { payment, booking, gst } = page;
  const paid = ['captured', 'refunded', 'partially_refunded'].includes(payment.state);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {paid ? 'Booking confirmed' : 'Secure your room'}
      </h1>
      <p className="mt-1 text-sm text-slate-600">Booking {booking.reference}</p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="font-medium text-slate-900">{page.propertyName}</p>
        <p className="text-sm text-slate-600">
          {page.roomName ?? 'Room'} · {page.city} · move-in{' '}
          {isoDate(booking.moveInDate)} · {booking.tenureMonths} months
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Agreed rent {format(money(booking.monthlyRentAmountMinor, 'INR'))}/month
          {booking.depositAmountMinor !== null && (
            <>, deposit {format(money(booking.depositAmountMinor, 'INR'))}</>
          )}
          . Rent and deposit are paid directly to the operator, not to HashtagStay.
        </p>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          HashtagStay facilitation fee
        </h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">Fee</dt>
            <dd className="text-slate-900">{inr(gst.taxableMinor)}</dd>
          </div>
          {gst.supplyType === 'intra_state' ? (
            <>
              <div className="flex justify-between">
                <dt className="text-slate-600">CGST ({gst.taxRateBps / 200}%)</dt>
                <dd className="text-slate-900">{inr(gst.cgstMinor)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">SGST ({gst.taxRateBps / 200}%)</dt>
                <dd className="text-slate-900">{inr(gst.sgstMinor)}</dd>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <dt className="text-slate-600">IGST ({gst.taxRateBps / 100}%)</dt>
              <dd className="text-slate-900">{inr(gst.igstMinor)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold">
            <dt className="text-slate-900">Total</dt>
            <dd className="text-slate-900">{inr(payment.grossAmountMinor)}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-6">
        {paid ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
            <p className="font-medium">
              {payment.state === 'captured' ? 'Paid' : 'Paid and since refunded'} on{' '}
              {isoDate(payment.paidAt)}.
            </p>
            <p className="mt-1">
              Your relationship manager will share move-in details. A GST invoice has
              been issued for this fee.
            </p>
            <Link href="/account" className="mt-3 inline-block underline">
              View your bookings
            </Link>
          </div>
        ) : payment.state === 'failed' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            This payment link is no longer active
            {payment.failureReason ? ` (${payment.failureReason.toLowerCase()})` : ''}.
            Ask your relationship manager to send a new one.
          </div>
        ) : page.provider === 'razorpay' && payment.paymentLinkUrl ? (
          <a
            href={payment.paymentLinkUrl}
            className="block rounded-md bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-slate-800"
          >
            Pay {inr(payment.grossAmountMinor)} securely
          </a>
        ) : page.provider === 'test' ? (
          <div className="space-y-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-5">
            <p className="text-sm text-amber-900">
              Test mode — no payment provider is configured, so no money moves. This
              button runs the same confirmation, invoicing and notifications a real
              payment would.
            </p>
            <ActionForm
              action={payInTestMode}
              submitLabel={`Pay ${inr(payment.grossAmountMinor)} (test)`}
              pendingLabel="Processing…"
            >
              <input type="hidden" name="token" value={token} />
            </ActionForm>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Online payment is not available right now. Please contact your relationship
            manager.
          </p>
        )}
      </div>
    </main>
  );
}
