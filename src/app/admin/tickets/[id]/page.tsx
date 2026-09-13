import Link from 'next/link';
import { notFound } from 'next/navigation';

import { istDateTime } from '@/components/admin/status';
import { ActionForm } from '@/components/ui/action-form';
import { Badge } from '@/components/ui/badge';
import { requirePermission } from '@/lib/auth/guard';
import { maskPhone } from '@/lib/phone';
import { getTicket } from '@/lib/services/tickets';

import { staffReplyAction } from '../actions';

export const metadata = {
  title: 'Ticket · #HashtagStay ops',
  robots: { index: false, follow: false },
};

export default async function TicketDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  await requirePermission('ticket:view', { returnTo: `/admin/tickets/${id}` });
  const data = await getTicket(id, { includeInternal: true });
  if (!data) notFound();
  const { ticket } = data;

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/admin/tickets" className="text-sm text-slate-500 hover:underline">
        ← Support
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{ticket.subject}</h1>
          <p className="text-sm text-slate-500">
            {ticket.reference} · {ticket.category} · {maskPhone(ticket.contactPhone)} ·
            opened {istDateTime(ticket.createdAt)}
            {data.propertyName && ` · ${data.propertyName}`}
          </p>
        </div>
        <div className="flex gap-2">
          {ticket.priority === 'safety_critical' && <Badge tone="danger">Safety</Badge>}
          <Badge tone="info">{ticket.state.replaceAll('_', ' ')}</Badge>
        </div>
      </div>
      {ticket.priority === 'safety_critical' && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
          Safety incident. Call the resident on a masked line immediately; escalate to
          the operator and, if anyone is in danger, to emergency services (112).
        </p>
      )}

      <ol className="space-y-3">
        {data.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-xl p-4 text-sm ${m.isInternal ? 'border border-amber-200 bg-amber-50' : m.authorKind === 'staff' ? 'border border-slate-200 bg-white' : 'bg-slate-100'}`}
          >
            <p className="text-xs text-slate-500">
              {m.isInternal ? 'Internal note · ' : ''}
              {m.authorKind}
              {m.authorName ? ` · ${m.authorName}` : ''} · {istDateTime(m.createdAt)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-slate-800">{m.body}</p>
          </li>
        ))}
      </ol>

      <ActionForm
        action={staffReplyAction}
        submitLabel="Save reply"
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-5"
      >
        <input type="hidden" name="ticketId" value={id} />
        <textarea
          name="body"
          rows={4}
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Reply to the resident, or an internal note"
        />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isInternal" className="h-4 w-4" /> Internal
            note only
          </label>
          <label className="flex items-center gap-2">
            Set state
            <select
              name="nextState"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue=""
            >
              <option value="">Keep ({ticket.state.replaceAll('_', ' ')})</option>
              <option value="in_progress">In progress</option>
              <option value="waiting_on_resident">Waiting on resident</option>
              <option value="waiting_on_host">Waiting on operator</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </label>
        </div>
      </ActionForm>
    </div>
  );
}
