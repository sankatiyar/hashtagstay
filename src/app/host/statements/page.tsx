import { Badge } from '@/components/ui/badge';
import { requireHost } from '@/lib/auth/host';
import { format, money } from '@/lib/money';
import { listStatements, statementLines } from '@/lib/services/statements';
import { isoDate } from '@/lib/time';

const inr = (minor: number | null) =>
  minor === null ? '—' : format(money(minor, 'INR'), { showDecimals: true });

export default async function HostStatementsPage() {
  const ctx = await requireHost('/host/statements');
  const statements = await listStatements(ctx.organizationId);
  const lines = await Promise.all(
    statements.map(({ statement }) =>
      statementLines(ctx.organizationId, statement.periodStart, statement.periodEnd),
    ),
  );

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Statements
        </h1>
        <p className="text-sm text-slate-500">
          Commission on bookings confirmed each month, with GST. Sandy Stays never holds
          your rent or deposits.
        </p>
      </div>
      {statements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          No statements yet. Your first appears the month after your first confirmed
          booking.
        </div>
      ) : (
        statements.map(({ statement: s }, index) => (
          <section
            key={s.id}
            className="rounded-xl border border-slate-200 bg-white p-5 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">
                Month from {isoDate(s.periodStart)}
              </h2>
              {s.settledAt ? (
                <Badge tone="success">paid</Badge>
              ) : s.issuedAt ? (
                <Badge tone="warning">due</Badge>
              ) : (
                <Badge tone="muted">draft</Badge>
              )}
            </div>
            <table className="mt-3 w-full">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th>Booking</th>
                  <th>Property</th>
                  <th>Confirmed</th>
                  <th className="text-right">Commission</th>
                </tr>
              </thead>
              <tbody>
                {lines[index].map((line) => (
                  <tr key={line.reference} className="border-t border-slate-100">
                    <td className="py-1.5">{line.reference}</td>
                    <td>{line.propertyName}</td>
                    <td>{isoDate(line.confirmedAt)}</td>
                    <td className="text-right">
                      {inr(line.hostCommissionAmountMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3">
              <div className="flex justify-between">
                <dt>Commission</dt>
                <dd>{inr(s.commissionAmountMinor)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>GST</dt>
                <dd>{inr(s.taxAmountMinor)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Total payable</dt>
                <dd>{inr(s.totalPayableMinor)}</dd>
              </div>
            </dl>
          </section>
        ))
      )}
    </div>
  );
}
