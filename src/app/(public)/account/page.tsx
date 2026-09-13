import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ListingCover } from '@/components/public/listing-cover';
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
  contacting: 'We’re trying to reach you',
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
    <main>
      <section className="border-line bg-sand/50 border-b">
        <div className="container-page flex flex-wrap items-end justify-between gap-4 py-10">
          <div>
            <p className="eyebrow">Your account</p>
            <h1 className="font-display text-pine-950 mt-2 text-4xl font-semibold tracking-tight">
              {resident.fullName
                ? `Hi, ${resident.fullName.split(' ')[0]}`
                : 'Welcome back'}
            </h1>
            <p className="text-ink-soft mt-1">{formatPhone(resident.phone)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/account/support" className="btn-secondary">
              Help and safety
            </Link>
            <form action={residentSignOut}>
              <button type="submit" className="btn-ghost">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </section>

      <div className="container-page grid gap-10 py-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-10">
          <Block title="Bookings">
            {bookings.length === 0 ? (
              <Empty>
                No bookings yet. When a relationship manager starts one for you, it
                shows up here with every step.
              </Empty>
            ) : (
              <ul className="space-y-4">
                {bookings.map((booking) => {
                  const status = BOOKING_STATUS[booking.state] ?? {
                    label: booking.state,
                    tone: 'muted' as const,
                  };
                  return (
                    <li key={booking.id} className="card flex overflow-hidden">
                      <div className="hidden w-40 shrink-0 sm:block">
                        <ListingCover seed={booking.reference} alt="" />
                      </div>
                      <div className="flex-1 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-display text-ink text-xl font-semibold">
                              {booking.propertyName}
                            </p>
                            <p className="text-ink-soft mt-0.5 text-sm">
                              {booking.roomName ?? 'Room'} · {booking.tenureMonths}{' '}
                              months · move-in {isoDate(booking.moveInDate)}
                            </p>
                          </div>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                        <div className="border-line mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
                          <span className="text-ink font-semibold">
                            {format(money(booking.monthlyRentAmountMinor, 'INR'))}
                            <span className="text-ink-soft font-normal"> / month</span>
                          </span>
                          <span className="text-ink-soft text-xs">
                            {booking.reference}
                          </span>
                          {reviewable.has(booking.id) && (
                            <Link
                              href={`/account/reviews/${booking.id}`}
                              className="btn-accent px-4 py-1.5"
                            >
                              Review your stay
                            </Link>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Block>

          <Block title="Enquiries">
            {enquiries.length === 0 ? (
              <Empty>
                No enquiries yet.{' '}
                <Link href="/enquiry" className="text-pine-700 font-semibold underline">
                  Tell us what you need
                </Link>
                .
              </Empty>
            ) : (
              <ul className="card divide-line divide-y">
                {enquiries.map((lead) => (
                  <li
                    key={lead.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div>
                      <p className="text-ink font-semibold">
                        {lead.requirementCity ?? 'Any city'}{' '}
                        <span className="text-ink-soft font-normal">
                          · {lead.reference}
                        </span>
                      </p>
                      <p className="text-ink-soft text-sm">
                        {isoDate(lead.createdAt)}
                        {lead.assignedToName &&
                          ` · ${lead.assignedToName.split(' ')[0]} is looking after this`}
                      </p>
                    </div>
                    <Badge tone={lead.state === 'won' ? 'success' : 'info'}>
                      {LEAD_STATUS[lead.state] ?? lead.state}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Block>
        </div>

        <aside className="space-y-6">
          <Block title="Saved stays">
            {wishlist.length === 0 ? (
              <Empty>Tap “Save for later” on any listing to keep it here.</Empty>
            ) : (
              <ul className="space-y-3">
                {wishlist.map((item) => (
                  <li
                    key={item.propertyId}
                    className="card flex items-center gap-3 p-3"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                      <ListingCover seed={item.slug} alt="" />
                    </div>
                    <div className="min-w-0">
                      {item.listingState === 'live' ? (
                        <Link
                          href={`/stays/${item.slug}`}
                          className="text-ink block truncate font-semibold hover:underline"
                        >
                          {item.name}
                        </Link>
                      ) : (
                        <p className="text-ink-soft truncate font-semibold">
                          {item.name} (no longer listed)
                        </p>
                      )}
                      <p className="text-ink-soft truncate text-sm">
                        {item.locality ? `${item.locality}, ` : ''}
                        {item.city}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <div className="bg-pine-900 rounded-3xl p-6 text-white">
            <p className="font-display text-xl font-semibold">Need something?</p>
            <p className="text-pine-100/80 mt-2 text-sm">
              Raise a request any time. Safety requests get a response within 15
              minutes, day or night.
            </p>
            <Link href="/account/support" className="btn-accent mt-5">
              Get help
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-pine-950 mb-4 text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="border-line text-ink-soft rounded-2xl border border-dashed bg-white/60 px-5 py-6 text-sm">
      {children}
    </p>
  );
}
