import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, ListingStateBadge, VerificationBadge } from '@/components/ui/badge';
import { requirePermission } from '@/lib/auth/guard';
import { SEPARATION_OF_DUTIES, can } from '@/lib/auth/permissions';
import { getPropertyDetail } from '@/lib/services/properties';
import {
  getActiveVerification,
  listVerificationHistory,
} from '@/lib/services/verification';
import { isoDate } from '@/lib/time';
import type { Checklist } from '@/lib/verification/rubric';
import { TIER_LABELS } from '@/lib/verification/rubric';

import { OpenVerificationForm } from './open-form';
import { ReviewForm } from './review-form';

export const metadata = {
  title: 'Verify · Sandy Stays ops',
  robots: { index: false, follow: false },
};

export default async function VerifyPropertyPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  // Gated on reading inventory, not editing it. A verifier deliberately has no
  // `property:edit`, so gating this screen on edit locked out the only role
  // that can actually approve. Recording checks and deciding are gated
  // separately, below.
  const user = await requirePermission('property:view', {
    returnTo: `/admin/properties/${id}/verify`,
  });

  const detail = await getPropertyDetail(id);
  if (!detail) notFound();

  const [active, history] = await Promise.all([
    getActiveVerification(id),
    listVerificationHistory(id),
  ]);

  const isVerifier = can(user.roles, 'verification:approve');

  // Evaluate separation of duties up front so the UI can explain the block
  // rather than letting the reviewer discover it on submit.
  const duties = active
    ? SEPARATION_OF_DUTIES.canApproveVerification({
        actorUserId: user.id,
        actorRoles: user.roles,
        submittedByUserId: active.requestedByUserId ?? detail.property.createdByUserId,
      })
    : { allowed: false, reason: undefined };

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <Link
          href={`/admin/properties/${id}`}
          className="text-sm text-slate-500 hover:text-slate-800 hover:underline"
        >
          ← {detail.property.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Verification
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {detail.property.name} · {detail.property.city} ·{' '}
              {detail.organizationName}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ListingStateBadge state={detail.property.listingState} />
            <VerificationBadge
              tier={detail.property.verificationTier}
              expired={detail.verificationExpired}
            />
          </div>
        </div>
      </div>

      {!active ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">
            No verification in flight
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Open one to start working the checklist. This moves the listing into
            verification.
          </p>
          {can(user.roles, 'verification:request') ? (
            <OpenVerificationForm propertyId={id} />
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Opening a verification needs the <strong>ops</strong> role.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-slate-600">
                  Requested tier <strong>{TIER_LABELS[active.requestedTier]}</strong> ·
                  state <Badge tone="info">{active.state.replaceAll('_', ' ')}</Badge>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Opened {isoDate(active.createdAt)}
                </p>
              </div>
            </div>
          </div>

          <ReviewForm
            propertyId={id}
            verificationId={active.id}
            initialChecklist={(active.checklist ?? {}) as Checklist}
            canReview={can(user.roles, 'verification:review')}
            canApprove={isVerifier && duties.allowed}
            blockedReason={
              !can(user.roles, 'verification:review')
                ? 'Read-only: recording checks and approving both need the verifier role. The split is deliberate — whoever enters a property must not be the person who certifies it. You can see here what is still outstanding.'
                : !duties.allowed
                  ? duties.reason
                  : undefined
            }
          />
        </>
      )}

      {history.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <header className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">History</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Past decisions are kept — a badge is only as trustworthy as the record
              behind it.
            </p>
          </header>
          <ul className="divide-y divide-slate-100 text-sm">
            {history.map((record) => (
              <li
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="text-slate-800">
                    {record.state.replaceAll('_', ' ')}
                    {record.grantedTier && record.grantedTier !== 'none' && (
                      <> · granted {TIER_LABELS[record.grantedTier]}</>
                    )}
                  </p>
                  {record.decisionNote && (
                    <p className="mt-0.5 text-xs text-slate-500 italic">
                      {record.decisionNote}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>Opened {isoDate(record.createdAt)}</p>
                  {record.reviewedAt && <p>Decided {isoDate(record.reviewedAt)}</p>}
                  {record.expiresAt && <p>Expires {isoDate(record.expiresAt)}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
