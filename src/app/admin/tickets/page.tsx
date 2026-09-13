import Link from 'next/link';

import { istDateTime } from '@/components/admin/status';
import { Badge } from '@/components/ui/badge';
import { requirePermission } from '@/lib/auth/guard';
import { listTicketQueue, ticketCounts } from '@/lib/services/tickets';

export const metadata = {
  title: 'Support · #HashtagStay ops',
  robots: { index: false, follow: false },
};

const SCOPES = [
  ['safety', 'Safety'],
  ['open', 'Open'],
  ['mine', 'Mine'],
  ['all', 'All'],
] as const;

const isPast = (date: Date | null) => date !== null && date.getTime() < Date.now();

export default async function TicketsPage(props: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const user = await requirePermission('ticket:view', { returnTo: '/admin/tickets' });
  const { scope: raw } = await props.searchParams;
  const scope = SCOPES.find(([s]) => s === raw)?.[0] ?? 'open';
  const [rows, counts] = await Promise.all([
    listTicketQueue({ scope, viewerId: user.id }),
    ticketCounts(),
  ]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Support and safety
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Safety requests have a 15-minute first-response target around the clock.{' '}
          {counts?.open ?? 0} open ·{' '}
          <span className={counts?.safetyOpen ? 'font-medium text-red-700' : ''}>
            {counts?.safetyOpen ?? 0} safety
          </span>{' '}
          ·{' '}
          <span className={counts?.overdue ? 'font-medium text-red-700' : ''}>
            {counts?.overdue ?? 0} overdue
          </span>
        </p>
      </div>
      <nav className="flex gap-2">
        {SCOPES.map(([s, label]) => (
          <Link
            key={s}
            href={`/admin/tickets?scope=${s}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${scope === s ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          Nothing here.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {rows.map((t) => {
            const overdue = !t.firstRespondedAt && isPast(t.respondBy);
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <Link
                    href={`/admin/tickets/${t.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {t.subject}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {t.reference} · {t.category} · {istDateTime(t.createdAt)}
                    {t.propertyName && ` · ${t.propertyName}`}
                    {t.assignedToName && ` · ${t.assignedToName}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {t.priority === 'safety_critical' && (
                    <Badge tone="danger">Safety</Badge>
                  )}
                  {overdue && <Badge tone="danger">Response overdue</Badge>}
                  {!t.firstRespondedAt && !overdue && (
                    <Badge tone="warning">Respond by {istDateTime(t.respondBy)}</Badge>
                  )}
                  <Badge tone="info">{t.state.replaceAll('_', ' ')}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
