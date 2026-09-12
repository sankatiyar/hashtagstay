import Link from 'next/link';

import { requireStaff } from '@/lib/auth/guard';
import { countPropertiesByState, listStaleInventory } from '@/lib/services/properties';

export const metadata = {
  title: 'Overview · #HashtagStay ops',
  robots: { index: false, follow: false },
};

export default async function AdminOverviewPage() {
  const user = await requireStaff('/admin');

  const [byState, stale] = await Promise.all([
    countPropertiesByState(),
    listStaleInventory(14),
  ]);

  const live = byState.live ?? 0;
  const inFlight =
    (byState.submitted ?? 0) +
    (byState.in_verification ?? 0) +
    (byState.changes_requested ?? 0);
  const draft = byState.draft ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Overview
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Signed in as {user.email}
          {user.roles.length === 0 &&
            ' — no roles assigned, so most screens will be unavailable'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Live listings" value={live} href="/admin/properties?state=live" />
        <Stat
          label="Awaiting verification"
          value={inFlight}
          href="/admin/verification"
          tone={inFlight > 0 ? 'warning' : 'neutral'}
        />
        <Stat label="Drafts" value={draft} href="/admin/properties?state=draft" />
        <Stat
          label="Needs confirming"
          value={stale.length}
          href="/admin/stale"
          tone={stale.length > 0 ? 'danger' : 'neutral'}
          hint="Live inventory whose availability has not been confirmed in 14 days"
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Where things stand</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          This console is the M1 surface: ops enters and verifies inventory here. Below
          ~100 properties, entering inventory centrally is faster and more consistent
          than waiting for operators to self-serve, so the host portal lands later (M5).
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Availability is <strong>advisory</strong>, not authoritative. A bed count is a
          claim with an age and a source, so re-confirm before a booking is promised —
          the booking flow enforces this with an explicit host-confirmation step.
        </p>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: number;
  href: string;
  tone?: 'neutral' | 'warning' | 'danger';
  hint?: string;
}) {
  const valueTone =
    tone === 'danger'
      ? 'text-red-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : 'text-slate-900';

  return (
    <Link
      href={href}
      title={hint}
      className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
    >
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueTone}`}>{value}</p>
    </Link>
  );
}
