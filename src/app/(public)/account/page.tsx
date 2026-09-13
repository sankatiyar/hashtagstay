import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { getCurrentResident } from '@/lib/auth/resident';
import { format, money } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { listBookingsForResident } from '@/lib/services/bookings';
import { listLeadsForResident } from '@/lib/services/leads';
import { listWishlist, reviewEligibility } from '@/lib/services/reviews';
import { isoDate } from '@/lib/time';

import { residentSignOut } from './actions';

export const metadata: Metadata = {
  title: 'Your account · HashtagStay',
  robots: { index: false, follow: false },
};

const LEAD_STATUS: Record<string, string> = {
  new: 'Received',
  assigned: 'With a relationship manager',
  contacting: 'We are trying to reach you',
  qualified: 'Finding options',
  shortlist_shared: 'Shortlist sent',
  negotiating: 'In discussion',
  booking_initiated: 'Booking in progress',
  won: 'Booked',
  lost: 'Closed',
  disqualified: 'Closed',
  nurture: 'On hold',
};

const BOOKING_STATUS: Record<
  string,
  { label: string; tone: 'info' | 'success' | 'warning' | 'muted' | 'danger' }
> = {
  initiated: { label: 'Started', tone: 'info' },
  pending_host_confirmation: { label: 'Confirming with the operator', tone: 'warning' },
  fee_pending: { label: 'Awaiting fee payment', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  moved_in: { label: 'Moved in', tone: 'success' },
  completed: { label: 'Completed', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  refunded: { label: 'Cancelled and refunded', tone: 'muted' },
};

export default async function AccountPage() {
  const resident = await getCurrentResident();
  if (!resident) redirect('/account/login?next=/account');

  const [enquiries, bookings, wishlist] = await Promise.all([
    listLeadsForResident(resident.id, resident.phone),
    listBookingsForResident(resident.id, resident.phone),
    listWishlist(resident.id),
  ]);
  const reviewable = new Set<string>();
  for (const booking of bookings) {
    if (['moved_in', 'completed'].includes(booking.state)) {
      const check = await reviewEligibility(booking.id, resident.id, resident.phone);
      if (check.eligible) reviewable.add(booking.id);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {resident.fullName
              ? `Hi ${resident.fullName.split(' ')[0]}`
              : 'Your account'}
          </h1>
          <p className="text-sm text-slate-600">{formatPhone(resident.phone)}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/account/support"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            Help and safety
          </Link>
          <form action={residentSignOut}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Bookings</h2>
        {bookings.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No bookings yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {bookings.map((booking) => {
              const status = BOOKING_STATUS[booking.state] ?? {
                label: booking.state,
                tone: 'muted' as const,
              };
              return (
                <li
                  key={booking.id}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {booking.propertyName}
                      </p>
                      <p className="text-sm text-slate-600">
                        {booking.roomName ?? 'Room'} · move-in{' '}
                        {isoDate(booking.moveInDate)} · {booking.tenureMonths} months ·{' '}
                        {format(money(booking.monthlyRentAmountMinor, 'INR'))}/month
                      </p>
                      <p className="text-xs text-slate-500">{booking.reference}</p>
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  {reviewable.has(booking.id) && (
                    <Link
                      href={`/account/reviews/${booking.id}`}
                      className="mt-3 inline-block text-sm text-slate-700 underline"
                    >
                      Review your stay
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Enquiries</h2>
        {enquiries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            No enquiries yet.{' '}
            <Link href="/enquiry" className="underline">
              Tell us what you need
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {enquiries.map((lead) => (
              <li
                key={lead.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-900">{lead.reference}</p>
                  <p className="text-slate-600">
                    {lead.requirementCity ?? 'Any city'} · {isoDate(lead.createdAt)}
                    {lead.assignedToName &&
                      ` · ${lead.assignedToName.split(' ')[0]} is looking after this`}
                  </p>
                </div>
                <Badge tone="info">{LEAD_STATUS[lead.state] ?? lead.state}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Saved stays</h2>
        {wishlist.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            Tap “Save” on any listing to keep it here.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {wishlist.map((item) => (
              <li
                key={item.propertyId}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                {item.listingState === 'live' ? (
                  <Link
                    href={`/stays/${item.slug}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {item.name}
                  </Link>
                ) : (
                  <p className="font-medium text-slate-500">
                    {item.name} (no longer listed)
                  </p>
                )}
                <p className="text-sm text-slate-600">
                  {item.locality ? `${item.locality}, ` : ''}
                  {item.city}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
