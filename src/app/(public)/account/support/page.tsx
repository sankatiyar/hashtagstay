import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ActionForm } from '@/components/ui/action-form';
import { Badge } from '@/components/ui/badge';
import { getCurrentResident } from '@/lib/auth/resident';
import { listBookingsForResident } from '@/lib/services/bookings';
import { TICKET_CATEGORIES, listTicketsForUser } from '@/lib/services/tickets';
import { isoDate } from '@/lib/time';

import { raiseTicketAction } from '../actions';

export const metadata: Metadata = {
  title: 'Help and safety · HashtagStay',
  robots: { index: false, follow: false },
};

export default async function SupportPage() {
  const resident = await getCurrentResident();
  if (!resident) redirect('/account/login?next=/account/support');

  const [tickets, bookings] = await Promise.all([
    listTicketsForUser(resident.id),
    listBookingsForResident(resident.id, resident.phone),
  ]);

  return (
    <main className="container-page max-w-5xl py-10">
      <Link
        href="/account"
        className="text-ink-soft hover:text-ink text-sm font-medium"
      >
        ← Your account
      </Link>
      <h1 className="font-display text-pine-950 mt-3 text-4xl font-semibold tracking-tight">
        Help and safety
      </h1>

      <div className="mt-6 flex flex-col gap-4 rounded-3xl bg-red-50 p-6 ring-1 ring-red-200 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-lg font-bold text-white">
          112
        </span>
        <div className="text-red-900">
          <p className="font-semibold">If you are in immediate danger, call 112.</p>
          <p className="mt-1 text-sm">
            For any safety concern at a stay, raise it below as a safety request. Our
            team responds within 15 minutes, at any hour.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <section className="card p-6">
          <h2 className="font-display text-ink text-xl font-semibold">
            Raise a request
          </h2>
          <ActionForm
            action={raiseTicketAction}
            submitLabel="Send request"
            className="mt-5 space-y-4"
          >
            <div>
              <label htmlFor="category" className="label">
                What is it about?
              </label>
              <select id="category" name="category" className="field">
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {bookings.length > 0 && (
              <div>
                <label htmlFor="bookingId" className="label">
                  Which booking{' '}
                  <span className="text-ink-soft font-normal">(optional)</span>
                </label>
                <select id="bookingId" name="bookingId" className="field">
                  <option value="">Not about a booking</option>
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.propertyName} — {b.reference}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="subject" className="label">
                Summary
              </label>
              <input id="subject" name="subject" className="field" />
            </div>
            <div>
              <label htmlFor="body" className="label">
                Details
              </label>
              <textarea id="body" name="body" rows={5} className="field" />
            </div>
          </ActionForm>
        </section>

        <section>
          <h2 className="font-display text-ink text-xl font-semibold">Your requests</h2>
          {tickets.length === 0 ? (
            <p className="border-line text-ink-soft mt-4 rounded-2xl border border-dashed bg-white/60 px-5 py-6 text-sm">
              None yet.
            </p>
          ) : (
            <ul className="card divide-line mt-4 divide-y">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    href={`/account/support/${ticket.id}`}
                    className="hover:bg-sand/60 flex flex-wrap items-center justify-between gap-2 px-5 py-4 transition"
                  >
                    <div>
                      <p className="text-ink font-semibold">{ticket.subject}</p>
                      <p className="text-ink-soft text-sm">
                        {ticket.reference} · {isoDate(ticket.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {ticket.priority === 'safety_critical' && (
                        <Badge tone="danger">Safety</Badge>
                      )}
                      <Badge
                        tone={
                          ticket.state === 'resolved' || ticket.state === 'closed'
                            ? 'muted'
                            : 'info'
                        }
                      >
                        {ticket.state.replaceAll('_', ' ')}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
