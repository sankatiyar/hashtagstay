import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ListingCover } from '@/components/public/listing-cover';
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
    <main className="container-page max-w-4xl py-12">
      <p className="eyebrow">Booking {booking.reference}</p>
      <h1 className="font-display text-pine-950 mt-2 text-4xl font-semibold tracking-tight">
        {paid ? 'Your booking is confirmed' : 'Secure your room'}
      </h1>
      {!paid && (
        <p className="text-ink-soft mt-3 max-w-2xl">
          The operator has confirmed your bed. Pay HashtagStay’s booking fee to lock it
          in — rent and deposit are paid to the operator directly.
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="card overflow-hidden">
          <div className="h-44">
            <ListingCover seed={booking.reference} alt={page.propertyName} />
          </div>
          <div className="p-6">
            <p className="font-display text-ink text-2xl font-semibold">
              {page.propertyName}
            </p>
            <p className="text-ink-soft mt-1">
              {page.roomName ?? 'Room'} · {page.city}
            </p>
            <dl className="border-line mt-5 grid grid-cols-2 gap-4 border-t pt-5 text-sm sm:grid-cols-4">
              <Detail label="Move-in" value={isoDate(booking.moveInDate) ?? '—'} />
              <Detail label="Stay" value={`${booking.tenureMonths} months`} />
              <Detail
                label="Rent"
                value={`${format(money(booking.monthlyRentAmountMinor, 'INR'))}/mo`}
              />
              <Detail
                label="Deposit"
                value={
                  booking.depositAmountMinor !== null
                    ? format(money(booking.depositAmountMinor, 'INR'))
                    : '—'
                }
              />
            </dl>
            <p className="text-ink-soft mt-4 text-xs">
              Rent and deposit are paid directly to the operator, not to HashtagStay.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="card p-6">
            <h2 className="text-ink font-semibold">HashtagStay booking fee</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <Line label="Fee" value={inr(gst.taxableMinor)} />
              {gst.supplyType === 'intra_state' ? (
                <>
                  <Line
                    label={`CGST (${gst.taxRateBps / 200}%)`}
                    value={inr(gst.cgstMinor)}
                  />
                  <Line
                    label={`SGST (${gst.taxRateBps / 200}%)`}
                    value={inr(gst.sgstMinor)}
                  />
                </>
              ) : (
                <Line
                  label={`IGST (${gst.taxRateBps / 100}%)`}
                  value={inr(gst.igstMinor)}
                />
              )}
              <div className="border-line text-ink flex justify-between border-t pt-3 text-base font-bold">
                <dt>Total</dt>
                <dd>{inr(payment.grossAmountMinor)}</dd>
              </div>
            </dl>
          </div>

          {paid ? (
            <div className="bg-pine-800 rounded-3xl p-6 text-white">
              <p className="font-semibold">
                {payment.state === 'captured' ? 'Paid' : 'Paid and since refunded'} on{' '}
                {isoDate(payment.paidAt)}.
              </p>
              <p className="text-pine-100/85 mt-2 text-sm">
                Your relationship manager will share move-in details. A GST invoice has
                been issued for this fee.
              </p>
              <Link href="/account" className="btn-accent mt-5">
                View your bookings
              </Link>
            </div>
          ) : payment.state === 'failed' ? (
            <div className="bg-marigold-50 text-marigold-700 ring-marigold-200 rounded-3xl p-6 text-sm ring-1">
              This payment link is no longer active
              {payment.failureReason ? ` (${payment.failureReason.toLowerCase()})` : ''}
              . Ask your relationship manager to send a new one.
            </div>
          ) : page.provider === 'razorpay' && payment.paymentLinkUrl ? (
            <a
              href={payment.paymentLinkUrl}
              className="btn-primary w-full py-4 text-base"
            >
              Pay {inr(payment.grossAmountMinor)} securely
            </a>
          ) : page.provider === 'test' ? (
            <div className="border-marigold-300 bg-marigold-50 space-y-4 rounded-3xl border border-dashed p-6">
              <p className="text-marigold-700 text-sm">
                Demo mode — no payment provider is connected, so no money moves. This
                runs the same confirmation, invoicing and notifications a real payment
                would.
              </p>
              <ActionForm
                action={payInTestMode}
                submitLabel={`Pay ${inr(payment.grossAmountMinor)} (demo)`}
                pendingLabel="Processing…"
              >
                <input type="hidden" name="token" value={token} />
              </ActionForm>
            </div>
          ) : (
            <p className="card text-ink-soft p-6 text-sm">
              Online payment isn’t available right now. Please contact your relationship
              manager.
            </p>
          )}

          <p className="text-ink-soft px-2 text-xs">
            Refunds follow the cancellation policy your relationship manager shared.
          </p>
        </section>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-soft text-xs">{label}</dt>
      <dd className="text-ink mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
