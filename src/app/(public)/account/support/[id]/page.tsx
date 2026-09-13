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
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/account/support" className="text-sm text-slate-500 hover:underline">
        ← Help and safety
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {data.ticket.subject}
          </h1>
          <p className="text-sm text-slate-600">
            {data.ticket.reference}
            {data.propertyName && ` · ${data.propertyName}`}
          </p>
        </div>
        <Badge tone="info">{data.ticket.state.replaceAll('_', ' ')}</Badge>
      </div>

      <ol className="mt-6 space-y-3">
        {data.messages.map((message) => (
          <li
            key={message.id}
            className={`rounded-xl p-4 text-sm ${message.authorKind === 'staff' ? 'border border-slate-200 bg-white' : 'bg-slate-100'}`}
          >
            <p className="text-xs text-slate-500">
              {message.authorKind === 'staff'
                ? `HashtagStay${message.authorName ? ` · ${message.authorName.split(' ')[0]}` : ''}`
                : 'You'}{' '}
              · {message.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-slate-800">{message.body}</p>
          </li>
        ))}
      </ol>

      {data.ticket.state !== 'closed' && (
        <ActionForm
          action={replyTicketAction}
          submitLabel="Send"
          className="mt-6 space-y-3"
        >
          <input type="hidden" name="ticketId" value={id} />
          <textarea
            name="body"
            rows={3}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Add a message"
          />
        </ActionForm>
      )}
    </main>
  );
}
