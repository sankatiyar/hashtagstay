import { revalidatePath } from 'next/cache';

import { CHANNEL_LABELS } from '@/components/admin/status';
import { ActionForm } from '@/components/ui/action-form';
import { type ActionResult, runAction } from '@/lib/action-result';
import { requirePermission, requirePermissionForAction } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { format, money } from '@/lib/money';
import {
  addSpend,
  channelReport,
  funnelReport,
  listSpend,
  lostReasonReport,
  periodFromParams,
  revenueReport,
  rmPerformanceReport,
} from '@/lib/services/reports';
import { isoDate } from '@/lib/time';

export const metadata = {
  title: 'Reports · #HashtagStay ops',
  robots: { index: false, follow: false },
};

const inr = (minor: number | null) =>
  minor === null ? '—' : format(money(minor, 'INR'));
const pct = (value: number | null) =>
  value === null ? '—' : `${(value * 100).toFixed(1)}%`;

async function addSpendAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    const user = await requirePermissionForAction('marketing_spend:edit');
    const amount = Number(String(formData.get('amount') ?? '').replace(/[,\s₹]/g, ''));
    await addSpend({
      channel: String(formData.get('channel') ?? 'paid_search') as never,
      utmCampaign: String(formData.get('campaign') ?? '') || null,
      periodStart: new Date(`${formData.get('from')}T00:00:00+05:30`),
      periodEnd: new Date(`${formData.get('to')}T23:59:59+05:30`),
      amountMinor: Math.round(amount * 100),
      notes: String(formData.get('notes') ?? '') || null,
      createdBy: user.id,
    });
    revalidatePath('/admin/reports');
    return { ok: 'Spend recorded.' };
  });
}

export default async function ReportsPage(props: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requirePermission('report:view', { returnTo: '/admin/reports' });
  const params = await props.searchParams;
  const period = periodFromParams(params);

  const [funnel, revenue, channels, lost, rms, spend] = await Promise.all([
    funnelReport(period),
    revenueReport(period),
    channelReport(period),
    lostReasonReport(period),
    rmPerformanceReport(period),
    listSpend(),
  ]);
  const query = `from=${isoDate(period.from)}&to=${isoDate(period.to)}`;
  const maxStep = Math.max(1, ...funnel.steps.map((s) => s.value));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Reports
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {isoDate(period.from)} to {isoDate(period.to)} (IST)
          </p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
          <label className="text-xs text-slate-600">
            From
            <input
              type="date"
              name="from"
              defaultValue={isoDate(period.from) ?? ''}
              className="mt-1 block rounded-md border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="text-xs text-slate-600">
            To
            <input
              type="date"
              name="to"
              defaultValue={isoDate(period.to) ?? ''}
              className="mt-1 block rounded-md border border-slate-300 px-2 py-1"
            />
          </label>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5">
            Apply
          </button>
        </form>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ['Enquiries', String(funnel.steps[0].value)],
            ['Lead → booking', pct(funnel.leadToBooking)],
            ['First call within SLA', pct(funnel.slaAdherence)],
            [
              'Median time to first call',
              funnel.medianMinutesToFirstCall === null
                ? '—'
                : `${funnel.medianMinutesToFirstCall.toFixed(1)} min`,
            ],
            ['Confirmed bookings', String(revenue.confirmedBookings)],
            ['Gross booking value', inr(revenue.gbvMinor)],
            ['Net revenue (fees + commission − refunds)', inr(revenue.netRevenueMinor)],
            ['Take rate', pct(revenue.takeRate)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
              {value}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Conversion funnel</h2>
        <ul className="mt-3 space-y-2">
          {funnel.steps.map((step) => (
            <li
              key={step.key}
              className="grid grid-cols-[180px_1fr_110px] items-center gap-3 text-sm"
            >
              <span className="text-slate-700">{step.label}</span>
              <span className="h-3 rounded bg-slate-100">
                <span
                  className="block h-3 rounded bg-slate-800"
                  style={{ width: `${(step.value / maxStep) * 100}%` }}
                />
              </span>
              <span className="text-right text-slate-900 tabular-nums">
                {step.value} · {pct(step.ofCreated)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Call connect rate {pct(funnel.callConnectRate)} · lost {funnel.lost} ·
          disqualified {funnel.disqualified}
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
          <h2 className="font-semibold text-slate-900">Channels and cost per lead</h2>
          <table className="mt-3 w-full">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th>Channel</th>
                <th className="text-right">Leads</th>
                <th className="text-right">Booked</th>
                <th className="text-right">Spend</th>
                <th className="text-right">CPL</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.channel} className="border-t border-slate-100">
                  <td className="py-1.5">{CHANNEL_LABELS[c.channel] ?? c.channel}</td>
                  <td className="text-right tabular-nums">{c.leads}</td>
                  <td className="text-right tabular-nums">{c.bookings}</td>
                  <td className="text-right tabular-nums">
                    {c.spendMinor ? inr(c.spendMinor) : '—'}
                  </td>
                  <td className="text-right tabular-nums">{inr(c.costPerLeadMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            Cost per lead needs spend entered below; the ad platforms are not connected.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
          <h2 className="font-semibold text-slate-900">Revenue</h2>
          <dl className="mt-3 space-y-1.5">
            {(
              [
                ['Facilitation fees (ex-GST)', inr(revenue.facilitationFeesMinor)],
                ['Host commission accrued (ex-GST)', inr(revenue.hostCommissionMinor)],
                ['Cash collected (incl. GST)', inr(revenue.cashCollectedMinor)],
                ['GST collected', inr(revenue.gstCollectedMinor)],
                ['Refunded', inr(revenue.refundedMinor)],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between border-b border-slate-50 py-1"
              >
                <dt className="text-slate-600">{label}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-4 font-semibold text-slate-900">Why leads were lost</h3>
          <ul className="mt-2 space-y-1">
            {lost.length === 0 ? (
              <li className="text-slate-500">None lost.</li>
            ) : (
              lost.map((l) => (
                <li key={l.reason ?? 'none'} className="flex justify-between">
                  <span>{(l.reason ?? 'unspecified').replaceAll('_', ' ')}</span>
                  <span className="tabular-nums">{l.count}</span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <h2 className="font-semibold text-slate-900">
          Relationship manager performance
        </h2>
        <table className="mt-3 w-full min-w-[640px]">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th>RM</th>
              <th className="text-right">Leads</th>
              <th className="text-right">SLA met</th>
              <th className="text-right">Calls</th>
              <th className="text-right">Connect</th>
              <th className="text-right">Talk min</th>
              <th className="text-right">Bookings</th>
              <th className="text-right">Fees</th>
              <th className="text-right">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {rms.map((r) => (
              <tr key={r.userId} className="border-t border-slate-100">
                <td className="py-1.5">{r.name}</td>
                <td className="text-right tabular-nums">{r.assigned}</td>
                <td className="text-right tabular-nums">{pct(r.slaAdherence)}</td>
                <td className="text-right tabular-nums">{r.calls}</td>
                <td className="text-right tabular-nums">{pct(r.connectRate)}</td>
                <td className="text-right tabular-nums">{r.talkMinutes}</td>
                <td className="text-right tabular-nums">{r.bookings}</td>
                <td className="text-right tabular-nums">{inr(r.feesMinor)}</td>
                <td className="text-right tabular-nums">{pct(r.conversion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
          <h2 className="font-semibold text-slate-900">Exports (CSV)</h2>
          <p className="mt-1 text-xs text-slate-500">
            For the selected period. Every export is recorded in the audit log.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['leads', 'bookings', 'payments', 'invoices'] as const).map((kind) => (
              <a
                key={kind}
                href={`/api/exports?kind=${kind}&${query}`}
                className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
              >
                {kind}
              </a>
            ))}
            {can(user.roles, 'export:pii') && (
              <a
                href={`/api/exports?kind=leads&pii=1&${query}`}
                className="rounded-md border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50"
              >
                leads with full phone numbers
              </a>
            )}
          </div>
        </section>

        {can(user.roles, 'marketing_spend:edit') && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
            <h2 className="font-semibold text-slate-900">Record marketing spend</h2>
            <ActionForm
              action={addSpendAction}
              submitLabel="Add spend"
              className="mt-3 space-y-2"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  name="channel"
                  className="rounded-md border border-slate-300 px-2 py-1.5"
                >
                  {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  name="campaign"
                  placeholder="Campaign (optional)"
                  className="rounded-md border border-slate-300 px-2 py-1.5"
                />
                <input
                  type="date"
                  name="from"
                  className="rounded-md border border-slate-300 px-2 py-1.5"
                />
                <input
                  type="date"
                  name="to"
                  className="rounded-md border border-slate-300 px-2 py-1.5"
                />
                <input
                  name="amount"
                  placeholder="Amount ₹"
                  className="rounded-md border border-slate-300 px-2 py-1.5"
                />
                <input
                  name="notes"
                  placeholder="Notes"
                  className="rounded-md border border-slate-300 px-2 py-1.5"
                />
              </div>
            </ActionForm>
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              {spend.slice(0, 8).map((s) => (
                <li key={s.id}>
                  {CHANNEL_LABELS[s.channel] ?? s.channel} · {isoDate(s.periodStart)}–
                  {isoDate(s.periodEnd)} · {inr(s.amountMinor)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
