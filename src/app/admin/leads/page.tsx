import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  CHANNEL_LABELS,
  LeadStateBadge,
  SlaBadge,
  istDateTime,
} from '@/components/admin/status';
import { requireStaff } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { format, money } from '@/lib/money';
import { type QueueScope, listLeadQueue, queueCounts } from '@/lib/services/leads';
import { isoDate } from '@/lib/time';

export const metadata = {
  title: 'Leads · Sandy Stays ops',
  robots: { index: false, follow: false },
};

export default async function LeadsPage(props: {
  searchParams: Promise<{ scope?: string; state?: string }>;
}) {
  const user = await requireStaff('/admin/leads');
  if (!can(user.roles, 'lead:view_assigned') && !can(user.roles, 'lead:view_all'))
    redirect('/admin/denied');

  const params = await props.searchParams;
  const seeAll = can(user.roles, 'lead:view_all');
  const scope =
    (['mine', 'unassigned', 'all', 'breached', 'follow_up'] as const).find(
      (s) => s === params.scope,
    ) ?? (seeAll ? 'all' : 'mine');

  const [rows, counts] = await Promise.all([
    listLeadQueue(user, { scope: scope as QueueScope, state: params.state ?? 'open' }),
    queueCounts(user),
  ]);

  const tabs: { scope: QueueScope; label: string; count: number; show: boolean }[] = [
    { scope: 'mine', label: 'My leads', count: counts?.mine ?? 0, show: true },
    {
      scope: 'unassigned',
      label: 'Unassigned',
      count: counts?.unassigned ?? 0,
      show: seeAll,
    },
    { scope: 'all', label: 'All open', count: counts?.all ?? 0, show: seeAll },
    {
      scope: 'breached',
      label: 'SLA breached',
      count: counts?.breached ?? 0,
      show: true,
    },
    {
      scope: 'follow_up',
      label: 'Follow-ups due',
      count: counts?.followUp ?? 0,
      show: true,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Leads</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Unworked leads closest to their first-call deadline come first.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {tabs
          .filter((t) => t.show)
          .map((tab) => (
            <Link
              key={tab.scope}
              href={`/admin/leads?scope=${tab.scope}`}
              className={`rounded-md border px-3 py-1.5 text-sm ${scope === tab.scope ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
            >
              {tab.label}{' '}
              <span className="ml-1 tabular-nums opacity-70">{tab.count}</span>
            </Link>
          ))}
        <Link
          href={`/admin/leads?scope=${scope}&state=all`}
          className="px-2 py-1.5 text-sm text-slate-500 underline"
        >
          include closed
        </Link>
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          Nothing in this queue.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Lead</th>
                <th className="px-4 py-2.5">Requirement</th>
                <th className="px-4 py-2.5">Source</th>
                <th className="px-4 py-2.5">State</th>
                <th className="px-4 py-2.5">First call</th>
                <th className="px-4 py-2.5">RM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {lead.contactName ?? 'Unnamed'}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {lead.reference} · {istDateTime(lead.createdAt)}{' '}
                      {!lead.phoneVerified && '· unverified'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{lead.requirementCity ?? 'Any city'}</p>
                    <p className="text-xs text-slate-500">
                      {lead.budgetMaxAmountMinor
                        ? `≤ ${format(money(lead.budgetMaxAmountMinor, 'INR'))}`
                        : 'No budget'}
                      {lead.moveInDate && ` · from ${isoDate(lead.moveInDate)}`}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {CHANNEL_LABELS[lead.channel] ?? lead.channel}
                  </td>
                  <td className="px-4 py-3">
                    <LeadStateBadge state={lead.state} />
                  </td>
                  <td className="px-4 py-3">
                    <SlaBadge status={lead.sla} />
                    <p className="mt-1 text-xs text-slate-500">
                      {lead.firstCallAttemptedAt
                        ? `called ${istDateTime(lead.firstCallAttemptedAt)}`
                        : `due ${istDateTime(lead.slaFirstCallDueAt)}`}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {lead.assignedToName ?? (
                      <span className="text-amber-700">Unassigned</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
