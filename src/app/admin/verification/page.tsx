import Link from 'next/link';

import { ListingStateBadge, VerificationBadge } from '@/components/ui/badge';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { listProperties } from '@/lib/services/properties';

export const metadata = {
  title: 'Verification · Sandy Stays ops',
  robots: { index: false, follow: false },
};

/**
 * Verification queue.
 *
 * Readable by ops (who need to see what is stuck) but only actionable by a
 * verifier, and the separation-of-duties check refuses approval by whoever
 * submitted the listing. The banner states that plainly rather than letting
 * someone discover it as an error.
 */
export default async function VerificationQueuePage() {
  const user = await requirePermission('property:view', {
    returnTo: '/admin/verification',
  });

  const [submitted, inVerification, changesRequested] = await Promise.all([
    listProperties({ listingState: 'submitted', pageSize: 50 }),
    listProperties({ listingState: 'in_verification', pageSize: 50 }),
    listProperties({ listingState: 'changes_requested', pageSize: 50 }),
  ]);

  const isVerifier = can(user.roles, 'verification:approve');

  const groups = [
    {
      title: 'Awaiting review',
      hint: 'Submitted by ops and not yet picked up.',
      rows: submitted.rows,
    },
    {
      title: 'In verification',
      hint: 'Being checked now. Publishing from here takes the listing live.',
      rows: inVerification.rows,
    },
    {
      title: 'Changes requested',
      hint: 'Sent back to ops. Waiting on the operator or on better documents.',
      rows: changesRequested.rows,
    },
  ];

  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Verification
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {total} {total === 1 ? 'listing' : 'listings'} in flight
        </p>
      </div>

      {!isVerifier && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You can see this queue but not approve from it — that needs the{' '}
          <strong>verifier</strong> role. The split is deliberate: whoever enters a
          property must not be the person who certifies it, or the verification badge is
          self-issued and means nothing to a resident.
        </div>
      )}

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-700">
            Nothing is waiting on verification.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <section
                key={group.title}
                className="rounded-xl border border-slate-200 bg-white"
              >
                <header className="border-b border-slate-100 px-5 py-3">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {group.title}{' '}
                    <span className="font-normal text-slate-400">
                      ({group.rows.length})
                    </span>
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">{group.hint}</p>
                </header>
                <ul className="divide-y divide-slate-100">
                  {group.rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                    >
                      <div>
                        <Link
                          href={`/admin/properties/${row.id}`}
                          className="font-medium text-slate-900 hover:underline"
                        >
                          {row.name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {row.city} · {row.organizationName} · {row.roomTypeCount} room{' '}
                          {row.roomTypeCount === 1 ? 'type' : 'types'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <VerificationBadge tier={row.verificationTier} />
                        <ListingStateBadge state={row.listingState} />
                        <Link
                          href={`/admin/properties/${row.id}/verify`}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Review
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
