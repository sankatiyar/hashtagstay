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

const input =
  'mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900';

export default async function SupportPage() {
  const resident = await getCurrentResident();
  if (!resident) redirect('/account/login?next=/account/support');

  const [tickets, bookings] = await Promise.all([
    listTicketsForUser(resident.id),
    listBookingsForResident(resident.id, resident.phone),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/account" className="text-sm text-slate-500 hover:underline">
        ← Your account
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Help and safety
      </h1>

      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-semibold">If you are in immediate danger, call 112.</p>
        <p className="mt-1">
          For any safety concern at a stay, raise it below as a safety request. Our team
          responds within 15 minutes, at any hour.
        </p>
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Raise a request</h2>
        <ActionForm
          action={raiseTicketAction}
          submitLabel="Send"
          className="mt-3 space-y-3"
        >
          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-slate-700"
            >
              What is it about?
            </label>
            <select id="category" name="category" className={input}>
              {TICKET_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {bookings.length > 0 && (
            <div>
              <label
                htmlFor="bookingId"
                className="block text-sm font-medium text-slate-700"
              >
                Which booking (optional)
              </label>
              <select id="bookingId" name="bookingId" className={input}>
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
            <label
              htmlFor="subject"
              className="block text-sm font-medium text-slate-700"
            >
              Summary
            </label>
            <input id="subject" name="subject" className={input} />
          </div>
          <div>
            <label htmlFor="body" className="block text-sm font-medium text-slate-700">
              Details
            </label>
            <textarea id="body" name="body" rows={4} className={input} />
          </div>
        </ActionForm>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Your requests</h2>
        {tickets.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {tickets.map((ticket) => (
              <li
                key={ticket.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <Link
                    href={`/account/support/${ticket.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {ticket.subject}
                  </Link>
                  <p className="text-slate-600">
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
