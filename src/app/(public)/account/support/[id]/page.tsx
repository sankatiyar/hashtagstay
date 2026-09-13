import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ActionForm } from '@/components/ui/action-form';
import { Badge } from '@/components/ui/badge';
import { getCurrentResident } from '@/lib/auth/resident';
import { getTicket } from '@/lib/services/tickets';

import { replyTicketAction } from '../../actions';

export const metadata: Metadata = {
  title: 'Request · HashtagStay',
  robots: { index: false, follow: false },
};

export default async function ResidentTicketPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const resident = await getCurrentResident();
  if (!resident) redirect(`/account/login?next=/account/support/${id}`);

  const data = await getTicket(id, { includeInternal: false });
  if (!data || data.ticket.raisedByUserId !== resident.id) notFound();

  return (
    <main className="container-page max-w-3xl py-10">
      <Link
        href="/account/support"
        className="text-ink-soft hover:text-ink text-sm font-medium"
      >
        ← Help and safety
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-pine-950 text-3xl font-semibold tracking-tight">
            {data.ticket.subject}
          </h1>
          <p className="text-ink-soft mt-1 text-sm">
            {data.ticket.reference}
            {data.propertyName && ` · ${data.propertyName}`}
          </p>
        </div>
        <Badge tone="info">{data.ticket.state.replaceAll('_', ' ')}</Badge>
      </div>

      <ol className="mt-8 space-y-4">
        {data.messages.map((message) => {
          const staff = message.authorKind === 'staff';
          return (
            <li
              key={message.id}
              className={`flex ${staff ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[85%] rounded-3xl px-5 py-4 text-sm ${staff ? 'border-line rounded-bl-md border bg-white' : 'bg-pine-800 rounded-br-md text-white'}`}
              >
                <p className={`text-xs ${staff ? 'text-ink-soft' : 'text-pine-200'}`}>
                  {staff
                    ? `HashtagStay${message.authorName ? ` · ${message.authorName.split(' ')[0]}` : ''}`
                    : 'You'}{' '}
                  · {message.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                </p>
                <p className="mt-1.5 leading-relaxed whitespace-pre-wrap">
                  {message.body}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {data.ticket.state !== 'closed' && (
        <ActionForm
          action={replyTicketAction}
          submitLabel="Send"
          className="card mt-8 space-y-3 p-5"
        >
          <input type="hidden" name="ticketId" value={id} />
          <textarea
            name="body"
            rows={3}
            className="field mt-0"
            placeholder="Add a message"
          />
        </ActionForm>
      )}
    </main>
  );
}
