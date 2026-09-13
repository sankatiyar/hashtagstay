import { desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { istDateTime } from '@/components/admin/status';
import { ActionForm } from '@/components/ui/action-form';
import { Badge } from '@/components/ui/badge';
import { type ActionResult, runAction } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { actorFor, requireStaff, requirePermissionForAction } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { feeRules } from '@/lib/db/schema';
import { format, money } from '@/lib/money';
import {
  generateStatements,
  listStatements,
  markStatementSettled,
  previousMonth,
} from '@/lib/services/statements';
import { isoDate } from '@/lib/time';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Fees and statements · #HashtagStay ops',
  robots: { index: false, follow: false },
};

const inr = (minor: number | null) =>
  minor === null ? '—' : format(money(minor, 'INR'), { showDecimals: true });

async function addRuleAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    const user = await requirePermissionForAction('fee_rule:edit');
    const basis = String(formData.get('basis') ?? 'flat') as
      'flat' | 'percent_of_monthly_rent' | 'percent_of_gbv';
    const amount = Number(String(formData.get('amount') ?? '').replace(/[,\s₹]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0)
      return { error: 'Enter a positive amount or percentage.' };
    const kind = String(formData.get('kind') ?? 'facilitation_fee') as
      'facilitation_fee' | 'renting_commission';
    const [row] = await db
      .insert(feeRules)
      .values({
        kind,
        payer: kind === 'facilitation_fee' ? 'resident' : 'host',
        basis,
        flatAmountMinor: basis === 'flat' ? Math.round(amount * 100) : null,
        flatCurrency: basis === 'flat' ? 'INR' : null,
        rateBps: basis === 'flat' ? null : Math.round(amount * 100),
        city: String(formData.get('city') ?? '') || null,
        propertyType: (String(formData.get('propertyType') ?? '') || null) as never,
        priority: Number(formData.get('priority') ?? 0) || 0,
        taxRateBps: 1800,
        createdBy: user.id,
      })
      .returning({ id: feeRules.id });
    await audit({
      actor: actorFor(user),
      action: 'create',
      entityType: 'fee_rules',
      entityId: row.id,
      after: { kind, basis, amount },
    });
    revalidatePath('/admin/fees');
    return {
      ok: 'Rule added. It applies to bookings created from now on; existing bookings keep their snapshot.',
    };
  });
}

async function generateAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    await requirePermissionForAction('statement:generate');
    const { start, end } = previousMonth();
    const results = await generateStatements({
      periodStart: start,
      periodEnd: end,
      issue: formData.get('issue') === 'on',
    });
    revalidatePath('/admin/fees');
    return {
      ok: `${results.length} statement${results.length === 1 ? '' : 's'} for ${isoDate(start)} generated.`,
    };
  });
}

async function settleAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    await requirePermissionForAction('statement:generate');
    await markStatementSettled(String(formData.get('statementId') ?? ''));
    revalidatePath('/admin/fees');
    return { ok: 'Marked as paid.' };
  });
}

export default async function FeesPage() {
  const user = await requireStaff('/admin/fees');
  if (!can(user.roles, 'fee_rule:view') && !can(user.roles, 'statement:generate'))
    redirect('/admin/denied');

  const [rules, statements] = await Promise.all([
    db.select().from(feeRules).orderBy(desc(feeRules.createdAt)),
    listStatements(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Fees and statements
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          The facilitation fee is charged to the resident when the operator confirms.
          Commission is invoiced to operators monthly. Every booking snapshots the rule
          that priced it.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <h2 className="font-semibold text-slate-900">Fee rules</h2>
        <table className="mt-3 w-full">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th>Kind</th>
              <th>Basis</th>
              <th>Amount</th>
              <th>Scope</th>
              <th className="text-right">Priority</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-1.5">{r.kind.replaceAll('_', ' ')}</td>
                <td>{r.basis.replaceAll('_', ' ')}</td>
                <td>
                  {r.basis === 'flat'
                    ? inr(r.flatAmountMinor)
                    : `${((r.rateBps ?? 0) / 100).toFixed(2)}%`}{' '}
                  + GST {((r.taxRateBps ?? 0) / 100).toFixed(0)}%
                </td>
                <td>
                  {[
                    r.city,
                    r.propertyType,
                    r.organizationId ? 'operator-specific' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'all'}
                </td>
                <td className="text-right">{r.priority}</td>
                <td>{istDateTime(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {can(user.roles, 'fee_rule:edit') && (
          <details className="mt-4">
            <summary className="cursor-pointer text-slate-700 underline">
              Add a rule
            </summary>
            <ActionForm
              action={addRuleAction}
              submitLabel="Add rule"
              className="mt-3 grid gap-2 sm:grid-cols-3"
            >
              <select
                name="kind"
                className="rounded-md border border-slate-300 px-2 py-1.5"
              >
                <option value="facilitation_fee">Facilitation fee (resident)</option>
                <option value="renting_commission">Commission (operator)</option>
              </select>
              <select
                name="basis"
                className="rounded-md border border-slate-300 px-2 py-1.5"
              >
                <option value="flat">Flat ₹</option>
                <option value="percent_of_monthly_rent">% of monthly rent</option>
                <option value="percent_of_gbv">% of booking value</option>
              </select>
              <input
                name="amount"
                placeholder="₹ or %"
                className="rounded-md border border-slate-300 px-2 py-1.5"
              />
              <input
                name="city"
                placeholder="City (blank = all)"
                className="rounded-md border border-slate-300 px-2 py-1.5"
              />
              <select
                name="propertyType"
                className="rounded-md border border-slate-300 px-2 py-1.5"
              >
                <option value="">All types</option>
                <option value="coliving">Co-living</option>
                <option value="pbsa">Student housing</option>
                <option value="homeshare">Home sharing</option>
              </select>
              <input
                name="priority"
                placeholder="Priority (0)"
                className="rounded-md border border-slate-300 px-2 py-1.5"
              />
            </ActionForm>
          </details>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Operator statements</h2>
          {can(user.roles, 'statement:generate') && (
            <ActionForm
              action={generateAction}
              submitLabel="Generate last month"
              tone="secondary"
              inline
            >
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" name="issue" /> issue GST invoices
              </label>
            </ActionForm>
          )}
        </div>
        {statements.length === 0 ? (
          <p className="mt-3 text-slate-500">
            No statements yet. They are generated monthly from confirmed bookings.
          </p>
        ) : (
          <table className="mt-3 w-full">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th>Operator</th>
                <th>Period</th>
                <th className="text-right">Bookings</th>
                <th className="text-right">Commission</th>
                <th className="text-right">GST</th>
                <th className="text-right">Payable</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {statements.map(({ statement: s, organizationName }) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-1.5">{organizationName}</td>
                  <td>{isoDate(s.periodStart)}</td>
                  <td className="text-right">{s.bookingCount}</td>
                  <td className="text-right">{inr(s.commissionAmountMinor)}</td>
                  <td className="text-right">{inr(s.taxAmountMinor)}</td>
                  <td className="text-right">{inr(s.totalPayableMinor)}</td>
                  <td>
                    {s.settledAt ? (
                      <Badge tone="success">paid</Badge>
                    ) : s.issuedAt ? (
                      <Badge tone="warning">invoiced</Badge>
                    ) : (
                      <Badge tone="muted">draft</Badge>
                    )}
                  </td>
                  <td>
                    {s.issuedAt &&
                      !s.settledAt &&
                      can(user.roles, 'statement:generate') && (
                        <ActionForm
                          action={settleAction}
                          submitLabel="Mark paid"
                          tone="link"
                          inline
                        >
                          <input type="hidden" name="statementId" value={s.id} />
                        </ActionForm>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
